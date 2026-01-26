const express = require("express")
const router = express.Router()
const {
  createTransactionRecord,
  getKioskTransactionHistory,
  getTransaction,
  getKioskStatistics,
  getRecentTransactions
} = require("../controllers/transaction.controller")

// ✅ CRITICAL: Specific routes MUST come before generic parameterized routes
// Create a new transaction
router.post("/", createTransactionRecord)

// ✅ Specific routes first (these have literal path segments)
router.get("/kiosk/:kioskId/recent", getRecentTransactions)
router.get("/kiosk/:kioskId/stats", getKioskStatistics)

// ✅ Generic routes last (these only have parameters)
router.get("/kiosk/:kioskId", getKioskTransactionHistory)
router.get("/:transactionId", getTransaction)

module.exports = router