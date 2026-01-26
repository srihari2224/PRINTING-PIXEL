const express = require("express")
const router = express.Router()
const {
  createTransactionRecord,
  getKioskTransactionHistory,
  getTransaction,
  getKioskStatistics,
  getRecentTransactions
} = require("../controllers/transaction.controller")

// Create a new transaction
router.post("/", createTransactionRecord)

// Get a specific transaction by ID
router.get("/:transactionId", getTransaction)

// Get all transactions for a specific kiosk with pagination and filters
router.get("/kiosk/:kioskId", getKioskTransactionHistory)

// Get recent transactions for a kiosk
router.get("/kiosk/:kioskId/recent", getRecentTransactions)

// Get statistics for a specific kiosk
router.get("/kiosk/:kioskId/stats", getKioskStatistics)

module.exports = router