const {
  registerKiosk,
  getAllKiosks,
  getKioskById,
  updateKiosk,
  deleteKiosk,
  updateKioskStats,
  getKioskStatsSummary
} = require("../services/kiosk.service")

/**
 * Register a new kiosk
 * POST /api/kiosks
 */
exports.createKiosk = async (req, res) => {
  try {
    const {
      username,
      locationName,
      address,
      ownerEmail,
      ownerPhone,
      deviceId,
      printerModel,
      pricing
    } = req.body

    console.log(`📝 Registering new kiosk: ${username}`)

    // Validate required fields
    if (!username || !locationName || !address || !ownerEmail) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["username", "locationName", "address", "ownerEmail"]
      })
    }

    const kiosk = await registerKiosk({
      username,
      locationName,
      address,
      ownerEmail,
      ownerPhone,
      deviceId,
      printerModel,
      pricing
    })

    res.status(201).json({
      success: true,
      message: "Kiosk registered successfully",
      kiosk: {
        kioskId: kiosk.kioskId,
        username: kiosk.username,
        locationName: kiosk.locationName,
        status: kiosk.status,
        createdAt: kiosk.createdAt
      }
    })
  } catch (error) {
    console.error("❌ Kiosk registration failed:", error)
    res.status(500).json({
      error: "Failed to register kiosk",
      details: error.message
    })
  }
}

/**
 * Get all kiosks with optional filtering
 * GET /api/kiosks?status=ACTIVE&search=xyz&page=1&limit=50
 */
exports.listKiosks = async (req, res) => {
  try {
    const {
      status,
      search,
      page = 1,
      limit = 50
    } = req.query

    console.log(`📋 Fetching kiosks - Status: ${status || 'all'}, Search: ${search || 'none'}`)

    const result = await getAllKiosks({
      status,
      search,
      page: parseInt(page),
      limit: parseInt(limit)
    })

    res.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error("❌ Failed to fetch kiosks:", error)
    res.status(500).json({
      error: "Failed to fetch kiosks",
      details: error.message
    })
  }
}

/**
 * Get a single kiosk by ID
 * GET /api/kiosks/:kioskId
 */
exports.getKiosk = async (req, res) => {
  try {
    const { kioskId } = req.params

    console.log(`🔍 Fetching kiosk: ${kioskId}`)

    const kiosk = await getKioskById(kioskId)

    res.json({
      success: true,
      kiosk
    })
  } catch (error) {
    console.error("❌ Failed to fetch kiosk:", error)
    res.status(404).json({
      error: "Kiosk not found",
      details: error.message
    })
  }
}

/**
 * Update kiosk details
 * PATCH /api/kiosks/:kioskId
 */
exports.updateKioskDetails = async (req, res) => {
  try {
    const { kioskId } = req.params
    const updateData = req.body

    console.log(`📝 Updating kiosk: ${kioskId}`)

    const kiosk = await updateKiosk(kioskId, updateData)

    res.json({
      success: true,
      message: "Kiosk updated successfully",
      kiosk
    })
  } catch (error) {
    console.error("❌ Kiosk update failed:", error)
    res.status(500).json({
      error: "Failed to update kiosk",
      details: error.message
    })
  }
}

/**
 * Delete/deactivate a kiosk
 * DELETE /api/kiosks/:kioskId
 */
exports.removeKiosk = async (req, res) => {
  try {
    const { kioskId } = req.params

    console.log(`🗑️ Deactivating kiosk: ${kioskId}`)

    const kiosk = await deleteKiosk(kioskId)

    res.json({
      success: true,
      message: "Kiosk deactivated successfully",
      kiosk
    })
  } catch (error) {
    console.error("❌ Kiosk deletion failed:", error)
    res.status(500).json({
      error: "Failed to deactivate kiosk",
      details: error.message
    })
  }
}

/**
 * Update kiosk printer status
 * PATCH /api/kiosks/:kioskId/printer-status
 */
exports.updatePrinterStatus = async (req, res) => {
  try {
    const { kioskId } = req.params
    const { printerStatus } = req.body

    if (!["ONLINE", "OFFLINE", "ERROR", "MAINTENANCE"].includes(printerStatus)) {
      return res.status(400).json({
        error: "Invalid printer status",
        allowed: ["ONLINE", "OFFLINE", "ERROR", "MAINTENANCE"]
      })
    }

    console.log(`🖨️ Updating printer status for ${kioskId}: ${printerStatus}`)

    const kiosk = await updateKiosk(kioskId, { printerStatus })

    res.json({
      success: true,
      message: "Printer status updated",
      printerStatus: kiosk.printerStatus
    })
  } catch (error) {
    console.error("❌ Printer status update failed:", error)
    res.status(500).json({
      error: "Failed to update printer status",
      details: error.message
    })
  }
}

/**
 * Refresh kiosk statistics
 * POST /api/kiosks/:kioskId/refresh-stats
 */
exports.refreshStats = async (req, res) => {
  try {
    const { kioskId } = req.params

    console.log(`📊 Refreshing stats for kiosk: ${kioskId}`)

    await updateKioskStats(kioskId)
    const kiosk = await getKioskById(kioskId)

    res.json({
      success: true,
      message: "Statistics refreshed",
      stats: kiosk.stats,
      liveStats: kiosk.liveStats
    })
  } catch (error) {
    console.error("❌ Stats refresh failed:", error)
    res.status(500).json({
      error: "Failed to refresh statistics",
      details: error.message
    })
  }
}

/**
 * Get overall kiosk statistics summary
 * GET /api/kiosks/stats/summary
 */
exports.getStatsSummary = async (req, res) => {
  try {
    console.log(`📈 Fetching kiosk statistics summary`)

    const summary = await getKioskStatsSummary()

    res.json({
      success: true,
      summary
    })
  } catch (error) {
    console.error("❌ Failed to fetch summary:", error)
    res.status(500).json({
      error: "Failed to fetch statistics summary",
      details: error.message
    })
  }
}