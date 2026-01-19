
const mongoose = require("mongoose")

const otpSchema = new mongoose.Schema({
  otp: String,
  uploadId: String,
  kioskId: String,
  expiresAt: Date,
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model("OTP", otpSchema)
