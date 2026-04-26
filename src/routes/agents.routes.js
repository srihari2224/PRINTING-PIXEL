const express = require("express")
const router = express.Router()
const { pushUpdateToAll, pushUpdateToKiosk, getConnectedAgents, isAgentOnline } = require("../socket/socketHandler")

/**
 * POST /api/agents/update-all
 * Push OTA update to ALL connected kiosk agents.
 * They will run: git pull + npm install + pm2 restart
 */
router.post("/update-all", (req, res) => {
  try {
    const version = req.body?.version
    const count = pushUpdateToAll(version)

    res.json({
      success: true,
      message: `OTA update command sent to ${count} online agent(s)`,
      agentsUpdated: count
    })
  } catch (err) {
    console.error("update-all error:", err.message)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/agents/:kioskId/update
 * Push OTA update to a single kiosk agent.
 */
router.post("/:kioskId/update", (req, res) => {
  try {
    const { kioskId } = req.params
    const version = req.body?.version

    const sent = pushUpdateToKiosk(kioskId, version)
    if (!sent) {
      return res.status(404).json({ error: `Agent ${kioskId} is not connected` })
    }

    res.json({
      success: true,
      message: `OTA update sent to ${kioskId}`
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/agents/:kioskId/restart
 * Restart a single kiosk agent remotely.
 */
router.post("/:kioskId/restart", (req, res) => {
  try {
    const { kioskId } = req.params
    const { getIO } = require("../socket/socketHandler")
    const io = getIO()
    if (!io) return res.status(503).json({ error: "Socket.IO not initialized" })

    const online = isAgentOnline(kioskId)
    if (!online) return res.status(404).json({ error: `Agent ${kioskId} is not connected` })

    io.to(kioskId).emit("agent:restart")
    res.json({ success: true, message: `Restart command sent to ${kioskId}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/agents/status
 * Get all connected agents (re-exported here too for clarity).
 */
router.get("/status", (req, res) => {
  res.json({ success: true, agents: getConnectedAgents() })
})

module.exports = router
