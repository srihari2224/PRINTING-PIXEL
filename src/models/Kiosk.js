const mongoose = require("mongoose")

const kioskSchema = new mongoose.Schema({
  kioskId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  username: { 
    type: String, 
    required: true 
  },
  locationName: { 
    type: String, 
    required: true 
  },
  address: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["ACTIVE", "INACTIVE", "PENDING"],
    default: "PENDING",
    index: true
  },
  ownerEmail: { 
    type: String, 
    required: true 
  },
  ownerPhone: { 
    type: String 
  },
  deviceId: { 
    type: String,
    unique: true,
    sparse: true // Allows multiple null values
  },
  
  // Additional fields
  printerModel: String,
  printerStatus: {
    type: String,
    enum: ["ONLINE", "OFFLINE", "ERROR", "MAINTENANCE"],
    default: "OFFLINE"
  },
  
  // Pricing configuration
  pricing: {
    colorPerPage: { type: Number, default: 500 }, // in paise (₹5)
    bwPerPage: { type: Number, default: 200 }     // in paise (₹2)
  },
  
  // Statistics (can be updated periodically)
  stats: {
    totalRevenue: { type: Number, default: 0 },
    totalTransactions: { type: Number, default: 0 },
    totalPages: { type: Number, default: 0 },
    lastTransactionAt: Date
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
})

// Update the updatedAt timestamp before saving
kioskSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

// Index for efficient queries
kioskSchema.index({ status: 1, createdAt: -1 })

module.exports = mongoose.model("Kiosk", kioskSchema)