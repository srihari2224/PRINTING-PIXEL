const mongoose = require("mongoose")

const transactionSchema = new mongoose.Schema({
  transactionId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  kioskId: { 
    type: String, 
    required: true,
    index: true  // Index for faster queries by kiosk
  },
  uploadId: { 
    type: String, 
    required: true
  },
  
  // Payment Details
  razorpayOrderId: { 
    type: String, 
    required: true 
  },
  razorpayPaymentId: { 
    type: String, 
    required: true 
  },
  razorpaySignature: { 
    type: String, 
    required: true 
  },
  
  // Amount Details
  amount: { 
    type: Number, 
    required: true  // Amount in paise (smallest currency unit)
  },
  currency: { 
    type: String, 
    default: "INR" 
  },
  
  // Print Job Details
  totalPages: { 
    type: Number, 
    required: true 
  },
  filesCount: { 
    type: Number, 
    required: true 
  },
  printDetails: [{
    fileName: String,
    pageCount: Number,
    copies: Number,
    colorMode: String,
    duplex: String
  }],
  
  // Status and Timestamps
  status: { 
    type: String, 
    enum: ["SUCCESS", "FAILED", "PENDING", "REFUNDED"],
    default: "SUCCESS" 
  },
  paymentMethod: { 
    type: String,  // upi, card, netbanking, wallet, etc.
    default: "unknown"
  },
  
  // OTP Details
  otpGenerated: { 
    type: String  // The OTP that was generated after payment
  },
  
  // Additional Info
  customerEmail: String,
  customerPhone: String,
  
  // Metadata
  metadata: {
    type: Map,
    of: String
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true  // Index for date-based queries
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
})

// Compound index for efficient kiosk-specific queries with date range
transactionSchema.index({ kioskId: 1, createdAt: -1 })

// Update the updatedAt timestamp before saving
transactionSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

module.exports = mongoose.model("Transaction", transactionSchema)