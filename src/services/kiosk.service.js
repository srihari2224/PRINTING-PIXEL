const Kiosk = require("../models/Kiosk")
const Transaction = require("../models/Transaction")
const { v4: uuid } = require("uuid")

/**
 * Register a new kiosk
 */
exports.registerKiosk = async ({
  username,
  locationName,
  address,
  ownerEmail,
  ownerPhone,
  deviceId,
  printerModel,
  pricing
}) => {
  try {
    // Generate unique kiosk ID
    const kioskId = `KIOSK_${uuid()}`

    // Check if email already exists
    const existingKiosk = await Kiosk.findOne({ ownerEmail })
    if (existingKiosk) {
      throw new Error("A kiosk with this email already exists")
    }

    // Create kiosk
    const kiosk = await Kiosk.create({
      kioskId,
      username,
      locationName,
      address,
      ownerEmail,
      ownerPhone,
      deviceId,
      printerModel,
      status: "PENDING", // Admin needs to approve
      pricing: pricing || {
        colorPerPage: 500,
        bwPerPage: 200
      }
    })

    console.log(`✅ Kiosk registered: ${kioskId}`)
    return kiosk
  } catch (error) {
    console.error("❌ Kiosk registration failed:", error)
    throw error
  }
}

/**
 * Get all kiosks with optional filtering
 */
exports.getAllKiosks = async (filters = {}) => {
  try {
    const { status, search, page = 1, limit = 50 } = filters

    // Build query
    const query = {}
    
    if (status && status !== 'all') {
      query.status = status
    }

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { locationName: { $regex: search, $options: 'i' } },
        { kioskId: { $regex: search, $options: 'i' } },
        { ownerEmail: { $regex: search, $options: 'i' } }
      ]
    }

    // Calculate pagination
    const skip = (page - 1) * limit

    // Execute query
    const [kiosks, total] = await Promise.all([
      Kiosk.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Kiosk.countDocuments(query)
    ])

    return {
      kiosks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }
  } catch (error) {
    console.error("❌ Failed to fetch kiosks:", error)
    throw error
  }
}

/**
 * Get a single kiosk by ID
 */
exports.getKioskById = async (kioskId) => {
  try {
    const kiosk = await Kiosk.findOne({ kioskId }).lean()
    
    if (!kiosk) {
      throw new Error("Kiosk not found")
    }

    // Also fetch recent transaction stats
    const stats = await Transaction.aggregate([
      { $match: { kioskId } },
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

    return {
      ...kiosk,
      liveStats: stats[0] || {
        totalRevenue: 0,
        totalTransactions: 0,
        totalPages: 0,
        successfulTransactions: 0
      }
    }
  } catch (error) {
    console.error("❌ Failed to fetch kiosk:", error)
    throw error
  }
}

/**
 * Update kiosk details
 */
exports.updateKiosk = async (kioskId, updateData) => {
  try {
    const kiosk = await Kiosk.findOne({ kioskId })
    
    if (!kiosk) {
      throw new Error("Kiosk not found")
    }

    // Update allowed fields
    const allowedUpdates = [
      'username',
      'locationName',
      'address',
      'ownerEmail',
      'ownerPhone',
      'status',
      'printerModel',
      'printerStatus',
      'pricing',
      'deviceId'
    ]

    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field === 'pricing' && typeof updateData[field] === 'object') {
          kiosk.pricing = { ...kiosk.pricing, ...updateData[field] }
        } else {
          kiosk[field] = updateData[field]
        }
      }
    })

    await kiosk.save()
    console.log(`✅ Kiosk updated: ${kioskId}`)
    
    return kiosk
  } catch (error) {
    console.error("❌ Kiosk update failed:", error)
    throw error
  }
}

/**
 * Delete/deactivate a kiosk
 */
exports.deleteKiosk = async (kioskId) => {
  try {
    const kiosk = await Kiosk.findOne({ kioskId })
    
    if (!kiosk) {
      throw new Error("Kiosk not found")
    }

    // Soft delete - just mark as INACTIVE
    kiosk.status = "INACTIVE"
    await kiosk.save()

    console.log(`✅ Kiosk deactivated: ${kioskId}`)
    return kiosk
  } catch (error) {
    console.error("❌ Kiosk deletion failed:", error)
    throw error
  }
}

/**
 * Update kiosk statistics (called periodically or after transactions)
 */
exports.updateKioskStats = async (kioskId) => {
  try {
    const stats = await Transaction.aggregate([
      { $match: { kioskId, status: "SUCCESS" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          totalPages: { $sum: "$totalPages" }
        }
      }
    ])

    const lastTransaction = await Transaction.findOne({ kioskId })
      .sort({ createdAt: -1 })
      .lean()

    const kiosk = await Kiosk.findOne({ kioskId })
    if (!kiosk) return

    kiosk.stats = {
      totalRevenue: stats[0]?.totalRevenue || 0,
      totalTransactions: stats[0]?.totalTransactions || 0,
      totalPages: stats[0]?.totalPages || 0,
      lastTransactionAt: lastTransaction?.createdAt
    }

    await kiosk.save()
    console.log(`✅ Stats updated for kiosk: ${kioskId}`)
  } catch (error) {
    console.error("❌ Failed to update kiosk stats:", error)
  }
}

/**
 * Get kiosk statistics summary
 */
exports.getKioskStatsSummary = async () => {
  try {
    const summary = await Kiosk.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ])

    const result = {
      total: 0,
      active: 0,
      inactive: 0,
      pending: 0
    }

    summary.forEach(item => {
      result.total += item.count
      if (item._id === 'ACTIVE') result.active = item.count
      if (item._id === 'INACTIVE') result.inactive = item.count
      if (item._id === 'PENDING') result.pending = item.count
    })

    return result
  } catch (error) {
    console.error("❌ Failed to get kiosk summary:", error)
    throw error
  }
}