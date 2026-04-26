/**
 * socketHandler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages Socket.IO connections from kiosk print agents.
 *
 * Each kiosk agent connects and joins a room named after its kioskId.
 * The backend pushes print jobs to the appropriate room.
 * Agents report heartbeats and print results back.
 */

const PrintJob = require("../models/PrintJob")

let io = null

// Track connected agents: Map<kioskId, { socketId, connectedAt, lastHeartbeat }>
const connectedAgents = new Map()

/**
 * Initialize Socket.IO on the given HTTP server.
 */
function initSocket(server) {
  const { Server } = require("socket.io")

  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingTimeout: 30000,
    pingInterval: 15000
  })

  // ── Authentication middleware ────────────────────────────────────────────
  io.use((socket, next) => {
    const { kioskId, secret } = socket.handshake.auth || {}

    if (!kioskId) {
      return next(new Error("Missing kioskId in auth"))
    }

    // Simple shared secret check
    const expectedSecret = process.env.AGENT_SECRET || "pixelprint-agent-2026"
    if (secret !== expectedSecret) {
      console.warn(`🚫 Agent auth failed for kioskId: ${kioskId}`)
      return next(new Error("Invalid agent secret"))
    }

    socket.kioskId = kioskId
    next()
  })

  // ── Connection handler ──────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const kioskId = socket.kioskId
    console.log(`🟢 Agent connected: ${kioskId} (socket: ${socket.id})`)

    // Join a room named after the kiosk
    socket.join(kioskId)

    // Register agent
    connectedAgents.set(kioskId, {
      socketId: socket.id,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      version: null
    })

    // ── kiosk:register ──────────────────────────────────────────────────
    socket.on("kiosk:register", (data) => {
      console.log(`📋 Agent registered: ${kioskId} | version: ${data?.version}`)
      const agent = connectedAgents.get(kioskId)
      if (agent) agent.version = data?.version

      // Check for any QUEUED jobs that were created while agent was offline
      deliverPendingJobs(kioskId)
    })

    // ── kiosk:heartbeat ─────────────────────────────────────────────────
    socket.on("kiosk:heartbeat", (data) => {
      const agent = connectedAgents.get(kioskId)
      if (agent) agent.lastHeartbeat = new Date()
    })

    // ── print:ack — agent received the job ──────────────────────────────
    socket.on("print:ack", async (data) => {
      try {
        const { printJobId } = data
        await PrintJob.findByIdAndUpdate(printJobId, {
          status: "SENT_TO_AGENT",
          agentReceivedAt: new Date()
        })
        console.log(`📨 Job ${printJobId} acknowledged by ${kioskId}`)
      } catch (err) {
        console.error("print:ack error:", err.message)
      }
    })

    // ── print:progress — agent reports overall progress ─────────────────
    socket.on("print:progress", async (data) => {
      try {
        const { printJobId, status } = data
        const validStatuses = ["DOWNLOADING", "PROCESSING", "PRINTING"]
        if (validStatuses.includes(status)) {
          await PrintJob.findByIdAndUpdate(printJobId, { status })
        }
      } catch (err) {
        console.error("print:progress error:", err.message)
      }
    })

    // ── print:printer_progress ─ agent reports per-printer live status ──────────────
    // Uses two atomic operations to avoid Mongoose optimistic-concurrency
    // conflicts (VersionError) when many page-tick events arrive in rapid
    // succession for the same document.
    socket.on("print:printer_progress", async (data) => {
      try {
        const {
          printJobId, printer, printerName, status,
          filesDone, filesTotal, pagesDone, pagesTotal,
          currentFile, error
        } = data

        const setFields = {}
        if (printerName  !== undefined) setFields["printerProgress.$.printerName"]  = printerName
        if (status       !== undefined) setFields["printerProgress.$.status"]       = status
        if (filesDone    !== undefined) setFields["printerProgress.$.filesDone"]    = filesDone
        if (filesTotal   !== undefined) setFields["printerProgress.$.filesTotal"]   = filesTotal
        if (pagesDone    !== undefined) setFields["printerProgress.$.pagesDone"]    = pagesDone
        if (pagesTotal   !== undefined) setFields["printerProgress.$.pagesTotal"]   = pagesTotal
        if (currentFile  !== undefined) setFields["printerProgress.$.currentFile"]  = currentFile
        if (error        !== undefined) setFields["printerProgress.$.error"]        = error

        // Try to update an existing entry for this printer slot atomically
        const updated = await PrintJob.findOneAndUpdate(
          { _id: printJobId, "printerProgress.printer": printer },
          { $set: setFields },
          { new: false }
        )

        if (!updated) {
          // No entry yet for this printer — push a new one atomically
          await PrintJob.findByIdAndUpdate(
            printJobId,
            {
              $push: {
                printerProgress: {
                  printer, printerName, status,
                  filesDone: filesDone ?? 0,
                  filesTotal: filesTotal ?? 0,
                  pagesDone: pagesDone ?? 0,
                  pagesTotal: pagesTotal ?? 0,
                  currentFile: currentFile ?? null,
                  error: error ?? null
                }
              }
            }
          )
        }
      } catch (err) {
        console.error("print:printer_progress error:", err.message)
      }
    })

    // ── print:result — agent finished printing ──────────────────────────
    socket.on("print:result", async (data) => {
      try {
        const { printJobId, success, results, error, failureReason } = data

        const allSuccess = results?.every(r => r.success) ?? success
        const anySuccess = results?.some(r => r.success) ?? success

        let finalStatus = "COMPLETED"
        if (!anySuccess) finalStatus = "FAILED"
        else if (!allSuccess) finalStatus = "PARTIAL_FAILURE"

        // Build a human-readable failure reason if not provided by agent
        let reason = failureReason || error || null
        if (!reason && finalStatus !== "COMPLETED") {
          const failedFiles = (results || []).filter(r => !r.success)
          if (failedFiles.length > 0) {
            reason = failedFiles.map(r => `${r.filename}: ${r.error || 'Unknown error'}`).join(" | ")
          }
        }

        await PrintJob.findByIdAndUpdate(printJobId, {
          status:          finalStatus,
          results:         results || [],
          failureReason:   reason,
          completedAt:     new Date(),
          error:           error || null
        })

        // Also update Upload status
        const job = await PrintJob.findById(printJobId)
        if (job) {
          const Upload = require("../models/Upload")
          await Upload.findOneAndUpdate(
            { uploadId: job.uploadId },
            { status: finalStatus === "COMPLETED" ? "COMPLETED" : finalStatus === "FAILED" ? "PAID" : "COMPLETED" }
          )

          // ── OTP: finalize based on job outcome ──────────────────────────
          const OTP = require("../models/OTP")
          if (finalStatus === "FAILED") {
            // Reset OTP so user can retry without admin intervention
            await OTP.updateOne(
              { uploadId: job.uploadId, kioskId: job.kioskId },
              { $set: { used: false, inProgress: false } }
            )
            console.log(`🔁 OTP reset (job FAILED) — user can retry: ${job.uploadId}`)
          } else {
            // Permanently mark OTP as used (job succeeded / partially succeeded)
            await OTP.updateOne(
              { uploadId: job.uploadId, kioskId: job.kioskId },
              { $set: { inProgress: false } }
            )
          }
        }

        console.log(`✅ Job ${printJobId} completed: ${finalStatus}`)
      } catch (err) {
        console.error("print:result error:", err.message)
      }
    })


    // ── update:started — agent acknowledged OTA command ─────────────────
    socket.on("update:started", (data) => {
      console.log(`🔄 OTA update started on ${kioskId} (current: ${data?.version})`)
      const agent = connectedAgents.get(kioskId)
      if (agent) agent.updating = true
    })

    // ── update:done — agent finished self-update ─────────────────────────
    socket.on("update:done", (data) => {
      const agent = connectedAgents.get(kioskId)
      if (agent) agent.updating = false
      if (data?.success) {
        console.log(`✅ OTA done on ${kioskId} | was v${data.previousVersion} | ${data.output}`)
      } else {
        console.error(`❌ OTA FAILED on ${kioskId}: ${data?.error}`)
      }
    })

    // ── disconnect ──────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.log(`🔴 Agent disconnected: ${kioskId} (${reason})`)
      connectedAgents.delete(kioskId)
    })
  })

  console.log("🔌 Socket.IO initialized")
  return io
}

/**
 * Deliver any QUEUED jobs that accumulated while agent was offline.
 */
async function deliverPendingJobs(kioskId) {
  try {
    const pending = await PrintJob.find({ kioskId, status: "QUEUED" })
      .sort({ createdAt: 1 })
      .limit(10)

    for (const job of pending) {
      emitPrintJob(kioskId, job)
    }

    if (pending.length > 0) {
      console.log(`📦 Delivered ${pending.length} pending jobs to ${kioskId}`)
    }
  } catch (err) {
    console.error("deliverPendingJobs error:", err.message)
  }
}

/**
 * Emit a print job to the specified kiosk's agent.
 * Returns true if agent is connected, false otherwise.
 */
function emitPrintJob(kioskId, job) {
  if (!io) return false

  const room = io.sockets.adapter.rooms.get(kioskId)
  if (!room || room.size === 0) {
    console.warn(`⚠️  No agent connected for kiosk: ${kioskId}`)
    return false
  }

  io.to(kioskId).emit("print:job", {
    printJobId: job._id.toString(),
    uploadId: job.uploadId,
    kioskId: job.kioskId,
    files: job.files,
    totalPages: job.totalPages
  })

  return true
}

/**
 * Check if a kiosk agent is currently connected.
 */
function isAgentOnline(kioskId) {
  if (!io) return false
  const room = io.sockets.adapter.rooms.get(kioskId)
  return room && room.size > 0
}

/**
 * Get the Socket.IO instance (for use in controllers).
 */
function getIO() {
  return io
}

/**
 * Get info about all connected agents.
 */
function getConnectedAgents() {
  const agents = []
  for (const [kioskId, info] of connectedAgents) {
    agents.push({ kioskId, ...info })
  }
  return agents
}

/**
 * Push OTA update command to ALL connected agents.
 * Each agent runs git pull + npm install + pm2 restart.
 * Returns count of agents that received the command.
 */
function pushUpdateToAll(version) {
  if (!io) return 0
  let count = 0
  for (const [kioskId] of connectedAgents) {
    const room = io.sockets.adapter.rooms.get(kioskId)
    if (room && room.size > 0) {
      io.to(kioskId).emit("agent:update", { version: version || "latest" })
      count++
      console.log(`📡 Sent OTA update command to: ${kioskId}`)
    }
  }
  console.log(`🚀 OTA update broadcast sent to ${count} agents`)
  return count
}

/**
 * Push OTA update to a single kiosk.
 */
function pushUpdateToKiosk(kioskId, version) {
  if (!io) return false
  const room = io.sockets.adapter.rooms.get(kioskId)
  if (!room || room.size === 0) return false
  io.to(kioskId).emit("agent:update", { version: version || "latest" })
  console.log(`📡 OTA update sent to: ${kioskId}`)
  return true
}

module.exports = {
  initSocket,
  getIO,
  emitPrintJob,
  isAgentOnline,
  getConnectedAgents,
  pushUpdateToAll,
  pushUpdateToKiosk
}
