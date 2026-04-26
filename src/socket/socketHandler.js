/**
 * socketHandler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages two categories of Socket.IO clients:
 *
 *   1. AGENTS  — kiosk print agents (Ubuntu thin clients)
 *      Auth: { kioskId, secret }
 *      Join room: kioskId
 *
 *   2. FRONTENDS — kiosk-app browsers watching a print job
 *      Auth: { role: "frontend" }
 *      Subscribe event: { printJobId } → joins room `job:${printJobId}`
 *
 * Flow:
 *   Agent emits print:printer_progress
 *     → backend saves to DB
 *     → backend forwards to room `job:${printJobId}` (frontend receives live)
 */

const PrintJob = require("../models/PrintJob")

let io = null

// Track connected agents
const connectedAgents = new Map()

// ── Init ─────────────────────────────────────────────────────────────────────

function initSocket(server) {
  const { Server } = require("socket.io")

  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout:  30000,
    pingInterval: 15000
  })

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const { kioskId, secret, role } = socket.handshake.auth || {}

    // Frontend connections (kiosk-app browsers) — no secret required
    if (role === "frontend") {
      socket.role = "frontend"
      return next()
    }

    // Agent connections — require kioskId + matching secret
    if (!kioskId) return next(new Error("Missing kioskId in auth"))

    const expectedSecret = process.env.AGENT_SECRET || "pixelprint-agent-2026"
    if (secret !== expectedSecret) {
      console.warn(`🚫 Agent auth failed for kioskId: ${kioskId}`)
      return next(new Error("Invalid agent secret"))
    }

    socket.role    = "agent"
    socket.kioskId = kioskId
    next()
  })

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    if (socket.role === "frontend") {
      handleFrontendConnection(socket)
    } else {
      handleAgentConnection(socket)
    }
  })

  console.log("🔌 Socket.IO initialized (agents + frontends)")
  return io
}

// ── Frontend connection ───────────────────────────────────────────────────────

function handleFrontendConnection(socket) {
  console.log(`🖥️  Frontend connected: ${socket.id}`)

  // Frontend subscribes to a specific print job's live events
  socket.on("job:subscribe", ({ printJobId }) => {
    if (!printJobId) return
    const room = `job:${printJobId}`
    socket.join(room)
    console.log(`🖥️  Frontend ${socket.id} subscribed to ${room}`)

    // Immediately send the current DB state as a snapshot
    PrintJob.findById(printJobId)
      .then(job => {
        if (job) {
          socket.emit("job:snapshot", {
            printJobId,
            status:          job.status,
            printerProgress: job.printerProgress || [],
            results:         job.results || [],
            failureReason:   job.failureReason || null
          })
        }
      })
      .catch(err => console.error("job:snapshot error:", err.message))
  })

  socket.on("job:unsubscribe", ({ printJobId }) => {
    if (printJobId) socket.leave(`job:${printJobId}`)
  })

  socket.on("disconnect", () => {
    console.log(`🖥️  Frontend disconnected: ${socket.id}`)
  })
}

// ── Agent connection ──────────────────────────────────────────────────────────

function handleAgentConnection(socket) {
  const kioskId = socket.kioskId
  console.log(`🟢 Agent connected: ${kioskId} (socket: ${socket.id})`)

  socket.join(kioskId)

  connectedAgents.set(kioskId, {
    socketId:      socket.id,
    connectedAt:   new Date(),
    lastHeartbeat: new Date(),
    version:       null
  })

  // ── kiosk:register ─────────────────────────────────────────────────────────
  socket.on("kiosk:register", (data) => {
    console.log(`📋 Agent registered: ${kioskId} | version: ${data?.version}`)
    const agent = connectedAgents.get(kioskId)
    if (agent) agent.version = data?.version
    deliverPendingJobs(kioskId)
  })

  // ── kiosk:heartbeat ────────────────────────────────────────────────────────
  socket.on("kiosk:heartbeat", () => {
    const agent = connectedAgents.get(kioskId)
    if (agent) agent.lastHeartbeat = new Date()
  })

  // ── print:ack ──────────────────────────────────────────────────────────────
  socket.on("print:ack", async ({ printJobId }) => {
    try {
      await PrintJob.findByIdAndUpdate(printJobId, {
        status: "SENT_TO_AGENT", agentReceivedAt: new Date()
      })
      console.log(`📨 Job ${printJobId} acknowledged by ${kioskId}`)

      // Forward to frontend watchers
      forwardToFrontend(printJobId, "print:ack", { printJobId, status: "SENT_TO_AGENT" })
    } catch (err) {
      console.error("print:ack error:", err.message)
    }
  })

  // ── print:progress (overall job status) ────────────────────────────────────
  socket.on("print:progress", async ({ printJobId, status }) => {
    try {
      const validStatuses = ["DOWNLOADING", "PROCESSING", "PRINTING"]
      if (validStatuses.includes(status)) {
        await PrintJob.findByIdAndUpdate(printJobId, { status })
        forwardToFrontend(printJobId, "print:progress", { printJobId, status })
      }
    } catch (err) {
      console.error("print:progress error:", err.message)
    }
  })

  // ── print:printer_progress (per-printer live status) ───────────────────────
  socket.on("print:printer_progress", async (data) => {
    try {
      const {
        printJobId, printer, printerName, status,
        filesDone, filesTotal, pagesDone, pagesTotal,
        currentFile, error, cupsJobId, cupsState
      } = data

      const setFields = {}
      if (printerName  !== undefined) setFields["printerProgress.$.printerName"]  = printerName
      if (status       !== undefined) setFields["printerProgress.$.status"]        = status
      if (filesDone    !== undefined) setFields["printerProgress.$.filesDone"]     = filesDone
      if (filesTotal   !== undefined) setFields["printerProgress.$.filesTotal"]    = filesTotal
      if (pagesDone    !== undefined) setFields["printerProgress.$.pagesDone"]     = pagesDone
      if (pagesTotal   !== undefined) setFields["printerProgress.$.pagesTotal"]    = pagesTotal
      if (currentFile  !== undefined) setFields["printerProgress.$.currentFile"]   = currentFile
      if (error        !== undefined) setFields["printerProgress.$.error"]         = error
      if (cupsJobId    !== undefined) setFields["printerProgress.$.cupsJobId"]     = cupsJobId
      if (cupsState    !== undefined) setFields["printerProgress.$.cupsState"]     = cupsState

      // Atomic upsert: try to update existing entry, else push new one
      const updated = await PrintJob.findOneAndUpdate(
        { _id: printJobId, "printerProgress.printer": printer },
        { $set: setFields },
        { new: false }
      )
      if (!updated) {
        await PrintJob.findByIdAndUpdate(printJobId, {
          $push: {
            printerProgress: {
              printer, printerName, status,
              filesDone:   filesDone   ?? 0,
              filesTotal:  filesTotal  ?? 0,
              pagesDone:   pagesDone   ?? 0,
              pagesTotal:  pagesTotal  ?? 0,
              currentFile: currentFile ?? null,
              error:       error       ?? null,
              cupsJobId:   cupsJobId   ?? null,
              cupsState:   cupsState   ?? null
            }
          }
        })
      }

      // ── Forward live to frontend watchers immediately ─────────────────────
      forwardToFrontend(printJobId, "print:printer_progress", data)

    } catch (err) {
      console.error("print:printer_progress error:", err.message)
    }
  })

  // ── print:result (job finished) ────────────────────────────────────────────
  socket.on("print:result", async (data) => {
    try {
      const { printJobId, success, results, error, failureReason } = data

      const allSuccess = results?.every(r => r.success) ?? success
      const anySuccess = results?.some(r => r.success)  ?? success

      let finalStatus = "COMPLETED"
      if (!anySuccess) finalStatus = "FAILED"
      else if (!allSuccess) finalStatus = "PARTIAL_FAILURE"

      let reason = failureReason || error || null
      if (!reason && finalStatus !== "COMPLETED") {
        const failedFiles = (results || []).filter(r => !r.success)
        if (failedFiles.length > 0)
          reason = failedFiles.map(r => `${r.filename}: ${r.error || 'Unknown error'}`).join(" | ")
      }

      await PrintJob.findByIdAndUpdate(printJobId, {
        status:        finalStatus,
        results:       results || [],
        failureReason: reason,
        completedAt:   new Date(),
        error:         error || null
      })

      // Forward final status to frontend
      forwardToFrontend(printJobId, "print:result", {
        printJobId, status: finalStatus, results: results || [],
        failureReason: reason, success: allSuccess
      })

      // Update Upload and OTP
      const job = await PrintJob.findById(printJobId)
      if (job) {
        const Upload = require("../models/Upload")
        await Upload.findOneAndUpdate(
          { uploadId: job.uploadId },
          { status: finalStatus === "COMPLETED" ? "COMPLETED" : finalStatus === "FAILED" ? "PAID" : "COMPLETED" }
        )

        const OTP = require("../models/OTP")
        if (finalStatus === "FAILED") {
          await OTP.updateOne(
            { uploadId: job.uploadId, kioskId: job.kioskId },
            { $set: { used: false, inProgress: false } }
          )
          console.log(`🔁 OTP reset (job FAILED): ${job.uploadId}`)
        } else {
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

  // ── OTA events ─────────────────────────────────────────────────────────────
  socket.on("update:started", (data) => {
    console.log(`🔄 OTA update started on ${kioskId} (current: ${data?.version})`)
    const agent = connectedAgents.get(kioskId)
    if (agent) agent.updating = true
  })

  socket.on("update:done", (data) => {
    const agent = connectedAgents.get(kioskId)
    if (agent) agent.updating = false
    if (data?.success)
      console.log(`✅ OTA done on ${kioskId} | was v${data.previousVersion}`)
    else
      console.error(`❌ OTA FAILED on ${kioskId}: ${data?.error}`)
  })

  // ── Disconnect ──────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    console.log(`🔴 Agent disconnected: ${kioskId} (${reason})`)
    connectedAgents.delete(kioskId)
  })
}

// ── Forward helper ────────────────────────────────────────────────────────────
/**
 * Emit an event to all frontend sockets watching a specific print job.
 */
function forwardToFrontend(printJobId, event, payload) {
  if (!io || !printJobId) return
  const room = `job:${printJobId}`
  io.to(room).emit(event, payload)
}

// ── Deliver pending jobs to reconnected agent ─────────────────────────────────

async function deliverPendingJobs(kioskId) {
  try {
    const pending = await PrintJob.find({ kioskId, status: "QUEUED" })
      .sort({ createdAt: 1 }).limit(10)

    for (const job of pending) emitPrintJob(kioskId, job)

    if (pending.length > 0)
      console.log(`📦 Delivered ${pending.length} pending jobs to ${kioskId}`)
  } catch (err) {
    console.error("deliverPendingJobs error:", err.message)
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

function emitPrintJob(kioskId, job) {
  if (!io) return false
  const room = io.sockets.adapter.rooms.get(kioskId)
  if (!room || room.size === 0) {
    console.warn(`⚠️  No agent connected for kiosk: ${kioskId}`)
    return false
  }
  io.to(kioskId).emit("print:job", {
    printJobId: job._id.toString(),
    uploadId:   job.uploadId,
    kioskId:    job.kioskId,
    files:      job.files,
    totalPages: job.totalPages
  })
  return true
}

function isAgentOnline(kioskId) {
  if (!io) return false
  const room = io.sockets.adapter.rooms.get(kioskId)
  return room && room.size > 0
}

function getIO() { return io }

function getConnectedAgents() {
  return Array.from(connectedAgents.entries()).map(([kioskId, info]) => ({ kioskId, ...info }))
}

function pushUpdateToAll(version) {
  if (!io) return 0
  let count = 0
  for (const [kioskId] of connectedAgents) {
    const room = io.sockets.adapter.rooms.get(kioskId)
    if (room && room.size > 0) {
      io.to(kioskId).emit("agent:update", { version: version || "latest" })
      count++
      console.log(`📡 Sent OTA update to: ${kioskId}`)
    }
  }
  return count
}

function pushUpdateToKiosk(kioskId, version) {
  if (!io) return false
  const room = io.sockets.adapter.rooms.get(kioskId)
  if (!room || room.size === 0) return false
  io.to(kioskId).emit("agent:update", { version: version || "latest" })
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
