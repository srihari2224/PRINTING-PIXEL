const {
  createTransaction,
  getKioskTransactions,
  getTransactionById,
  getKioskStats
} = require("../services/transaction.service")

/**
 * Create a new transaction
 * POST /api/transactions
 */
exports.createTransactionRecord = async (req, res) => {
  try {
    const {
      kioskId,
      uploadId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount,
      currency,
      otpGenerated,
      customerEmail,
      customerPhone,
      paymentMethod,
      metadata
    } = req.body

    console.log(`📝 Creating transaction for kiosk: ${kioskId}`)

    // Validate required fields
    if (!kioskId || !uploadId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !amount) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["kioskId", "uploadId", "razorpayOrderId", "razorpayPaymentId", "razorpaySignature", "amount"]
      })
    }

    const transaction = await createTransaction({
      kioskId,
      uploadId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount,
      currency,
      otpGenerated,
      customerEmail,
      customerPhone,
      paymentMethod,
      metadata
    })

    res.status(201).json({
      success: true,
      transaction: {
        transactionId: transaction.transactionId,
        kioskId: transaction.kioskId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        createdAt: transaction.createdAt
      }
    })
  } catch (error) {
    console.error("❌ Transaction creation failed:", error)
    res.status(500).json({
      error: "Failed to create transaction",
      details: error.message
    })
  }
}

/**
 * Get all transactions for a specific kiosk
 * GET /api/transactions/kiosk/:kioskId
 */
exports.getKioskTransactionHistory = async (req, res) => {
  try {
    const { kioskId } = req.params
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    console.log(`📊 Fetching transactions for kiosk: ${kioskId}`)

    const result = await getKioskTransactions(kioskId, {
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate,
      status,
      sortBy,
      sortOrder
    })

    res.json({
      success: true,
      kioskId,
      ...result
    })
  } catch (error) {
    console.error("❌ Failed to fetch transactions:", error)
    res.status(500).json({
      error: "Failed to fetch transactions",
      details: error.message
    })
  }
}

/**
 * Get a single transaction by ID
 * GET /api/transactions/:transactionId
 */
exports.getTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params

    console.log(`🔍 Fetching transaction: ${transactionId}`)

    const transaction = await getTransactionById(transactionId)

    res.json({
      success: true,
      transaction
    })
  } catch (error) {
    console.error("❌ Failed to fetch transaction:", error)
    res.status(404).json({
      error: "Transaction not found",
      details: error.message
    })
  }
}

/**
 * Get kiosk statistics
 * GET /api/transactions/kiosk/:kioskId/stats
 */
exports.getKioskStatistics = async (req, res) => {
  try {
    const { kioskId } = req.params
    const { timeRange = 'all' } = req.query // all, today, week, month, year

    console.log(`📈 Fetching stats for kiosk: ${kioskId} (${timeRange})`)

    const stats = await getKioskStats(kioskId, timeRange)

    res.json({
      success: true,
      kioskId,
      timeRange,
      stats: {
        totalRevenue: stats.totalRevenue,
        totalRevenueInRupees: (stats.totalRevenue / 100).toFixed(2), // Convert paise to rupees
        totalTransactions: stats.totalTransactions,
        totalPages: stats.totalPages,
        avgTransactionValue: stats.avgTransactionValue,
        avgTransactionValueInRupees: (stats.avgTransactionValue / 100).toFixed(2),
        successfulTransactions: stats.successfulTransactions,
        failedTransactions: stats.failedTransactions,
        successRate: stats.totalTransactions > 0
          ? ((stats.successfulTransactions / stats.totalTransactions) * 100).toFixed(2)
          : 0
      }
    })
  } catch (error) {
    console.error("❌ Failed to fetch kiosk stats:", error)
    res.status(500).json({
      error: "Failed to fetch statistics",
      details: error.message
    })
  }
}

/**
 * Get recent transactions for a kiosk (simplified endpoint)
 * GET /api/transactions/kiosk/:kioskId/recent
 */
exports.getRecentTransactions = async (req, res) => {
  try {
    const { kioskId } = req.params
    const { limit = 10 } = req.query

    console.log(`📋 Fetching recent ${limit} transactions for kiosk: ${kioskId}`)

    const result = await getKioskTransactions(kioskId, {
      page: 1,
      limit: parseInt(limit),
      sortBy: 'createdAt',
      sortOrder: 'desc'
    })

    res.json({
      success: true,
      kioskId,
      transactions: result.transactions,
      total: result.pagination.total
    })
  } catch (error) {
    console.error("❌ Failed to fetch recent transactions:", error)
    res.status(500).json({
      error: "Failed to fetch recent transactions",
      details: error.message
    })
  }
}