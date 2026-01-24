const mongoose = require("mongoose")

const uploadSchema = new mongoose.Schema({
  uploadId: { type: String, required: true, unique: true },
  kioskId: { type: String, required: true },
  files: [
    {
      key: String,
      originalName: String,
      pageCount: Number,
      printOptions: {
        copies: { type: Number, default: 1 },
        colorMode: { type: String, enum: ["color", "bw"], default: "color" },
        duplex: { type: String, enum: ["single", "double"], default: "single" },
        pageRange: { type: String, default: "all" }
      }
    }
  ],
  totalPages: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ["PENDING_PAYMENT", "PAID", "PRINTING", "COMPLETED", "FAILED"],
    default: "PENDING_PAYMENT" 
  },
  paymentId: { type: String },
  orderId: { type: String },
  paidAt: { type: Date },  // Add this field
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model("Upload", uploadSchema)