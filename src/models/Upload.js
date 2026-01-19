// src/models/Upload.js
const mongoose = require("mongoose")

const uploadSchema = new mongoose.Schema({
  uploadId: String,
  kioskId: String,
  files: [String],
  printOptions: Object,
  status: String,
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model("Upload", uploadSchema)
