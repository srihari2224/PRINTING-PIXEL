const Transaction = require("../models/Transaction")
const Upload = require("../models/Upload")
const { v4: uuid } = require("uuid")

/**
 * Create a new transaction record after payment attempt
 * ✅ Now supports both SUCCESS and FAILED statuses
 */
exports.createTransaction = async ({
  kioskId,
  uploadId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  amount,
  currency = "INR",
  status = "SUCCESS",  // ✅ Allow setting status
  otpGenerated,
  customerEmail,
  customerPhone,
  paymentMethod,
  metadata = {}
}) => {
  try {
    // Fetch upload details to get print job information
    const upload = await Upload.findOne({ uploadId })
    if (!upload) {
      throw new Error("Upload not found for transaction")
    }

    // Prepare print details from upload files
    const printDetails = upload.files.map(file => ({
      fileName: file.originalName,
      pageCount: file.pageCount,
      copies: file.printOptions.copies || 1,
      colorMode: file.printOptions.colorMode || "color",
      duplex: file.printOptions.duplex || "single"
    }))

    // Generate unique transaction ID
    const transactionId = `TXN_${uuid()}`

    // Create transaction record
    const transaction = await Transaction.create({
      transactionId,
      kioskId,
      uploadId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount,
      currency,
      totalPages: upload.totalPages,
      filesCount: upload.files.length,
      printDetails,
      status: status,  // ✅ Use provided status
      otpGenerated,
      customerEmail,
      customerPhone,
      paymentMethod,
      metadata
    })

    console.log(`✅ Transaction created: ${transactionId} for kiosk: ${kioskId} (Status: ${status})`)
    return transaction
  } catch (error) {
    console.error("❌ Transaction creation failed:", error)
    throw error
  }
}

/**
 * Get all transactions for a specific kiosk
 */
exports.getKioskTransactions = async (kioskId, options = {}) => {
  try {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options

    // Build query
    const query = { kioskId }

    // Add date range filter if provided
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    // Add status filter if provided
    if (status) {
      query.status = status
    }

    // Calculate pagination
    const skip = (page - 1) * limit
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 }

    // Execute query with pagination
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .lean(),
      Transaction.countDocuments(query)
    ])

    // Calculate summary statistics
    const stats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          totalPages: { $sum: "$totalPages" },
          successfulTransactions: {
            $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] }
          }
        }
      }
    ])

    const summary = stats[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      totalPages: 0,
      successfulTransactions: 0
    }

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        totalRevenue: summary.totalRevenue,
        totalTransactions: summary.totalTransactions,
        totalPages: summary.totalPages,
        successfulTransactions: summary.successfulTransactions,
        successRate: summary.totalTransactions > 0 
          ? ((summary.successfulTransactions / summary.totalTransactions) * 100).toFixed(2)
          : 0
      }
    }
  } catch (error) {
    console.error("❌ Failed to fetch kiosk transactions:", error)
    throw error
  }
}

/**
 * Get a single transaction by ID
 */
exports.getTransactionById = async (transactionId) => {
  try {
    const transaction = await Transaction.findOne({ transactionId })
      .lean()
    
    if (!transaction) {
      throw new Error("Transaction not found")
    }

    return transaction
  } catch (error) {
    console.error("❌ Failed to fetch transaction:", error)
    throw error
  }
}

/**
 * Get transaction statistics for a kiosk (dashboard summary)
 */
exports.getKioskStats = async (kioskId, timeRange = 'all') => {
  try {
    const query = { kioskId }

    // Add time range filter
    if (timeRange !== 'all') {
      const now = new Date()
      let startDate

      switch (timeRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0))
          break
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7))
          break
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1))
          break
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1))
          break
        default:
          startDate = null
      }

      if (startDate) {
        query.createdAt = { $gte: startDate }
      }
    }

    const stats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          totalPages: { $sum: "$totalPages" },
          avgTransactionValue: { $avg: "$amount" },
          successfulTransactions: {
            $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] }
          },
          failedTransactions: {
            $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] }
          }
        }
      }
    ])

    return stats[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      totalPages: 0,
      avgTransactionValue: 0,
      successfulTransactions: 0,
      failedTransactions: 0
    }
  } catch (error) {
    console.error("❌ Failed to fetch kiosk stats:", error)
    throw error
  }
}