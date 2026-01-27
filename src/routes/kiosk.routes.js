const express = require("express")
const router = express.Router()
const {
  createKiosk,
  listKiosks,
  getKiosk,
  updateKioskDetails,
  removeKiosk,
  updatePrinterStatus,
  refreshStats,
  getStatsSummary
} = require("../controllers/kiosk.controller")

// ✅ Specific routes FIRST (before parameterized routes)
router.get("/stats/summary", getStatsSummary)

// Standard CRUD operations
router.post("/", createKiosk)                          // Create new kiosk
router.get("/", listKiosks)                            // List all kiosks
router.get("/:kioskId", getKiosk)                      // Get single kiosk
router.patch("/:kioskId", updateKioskDetails)          // Update kiosk
router.delete("/:kioskId", removeKiosk)                // Delete/deactivate kiosk

// Specific kiosk operations
router.patch("/:kioskId/printer-status", updatePrinterStatus)  // Update printer status
router.post("/:kioskId/refresh-stats", refreshStats)           // Refresh statistics

module.exports = router