const express = require("express")
const router = express.Router()
const PrintJob = require("../models/PrintJob")
const { isAgentOnline, getConnectedAgents } = require("../socket/socketHandler")

// ── IMPORTANT: Specific routes MUST come before /:printJobId to avoid conflicts ──

/**
 * GET /api/printjobs/agents/status
 * Get live connected agents (for admin dashboard).
 */
router.get("/agents/status", (req, res) => {
  try {
    const agents = getConnectedAgents()
    res.json({ success: true, agents })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/printjobs/kiosk/:kioskId
 * List recent print jobs for a kiosk (admin dashboard).
 */
router.get("/kiosk/:kioskId", async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [jobs, total] = await Promise.all([
      PrintJob.find({ kioskId: req.params.kioskId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-files.url")   // don't expose presigned URLs
        .lean(),
      PrintJob.countDocuments({ kioskId: req.params.kioskId })
    ])

    res.json({
      success: true,
      jobs,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) }
    })
  } catch (err) {
    console.error("List print jobs error:", err.message)
    res.status(500).json({ error: "Failed to list print jobs" })
  }
})

/**
 * GET /api/printjobs/:printJobId
 * Poll for print job status (called every 2s by kiosk-app frontend).
 */
router.get("/:printJobId", async (req, res) => {
  try {
    const job = await PrintJob.findById(req.params.printJobId).lean()
    if (!job) {
      return res.status(404).json({ error: "Print job not found" })
    }

    res.json({
      success: true,
      printJob: {
        _id:             job._id,
        uploadId:        job.uploadId,
        kioskId:         job.kioskId,
        status:          job.status,
        totalPages:      job.totalPages,
        results:         job.results,
        printerProgress: job.printerProgress,
        failureReason:   job.failureReason,
        error:           job.error,
        createdAt:       job.createdAt,
        agentReceivedAt: job.agentReceivedAt,
        completedAt:     job.completedAt,
        fileCount:       job.files?.length || 0
      }
    })
  } catch (err) {
    console.error("Get print job error:", err.message)
    res.status(500).json({ error: "Failed to get print job" })
  }
})

module.exports = router
