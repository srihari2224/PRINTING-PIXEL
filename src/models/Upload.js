// src/models/Upload.js
const mongoose = require("mongoose")

const uploadSchema = new mongoose.Schema({
  uploadId: { type: String, required: true, unique: true },
  kioskId: { type: String, required: true },
  // files is an array of objects describing each uploaded PDF
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
  status: { type: String, default: "PENDING_PAYMENT" },
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model("Upload", uploadSchema)
