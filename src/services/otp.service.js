const OTP = require("../models/OTP")
const generateOTP = require("../utils/generateOTP")

exports.createOTP = async ({ uploadId, kioskId }) => {
  const otp = generateOTP()

  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days

  await OTP.create({
    otp,
    uploadId,
    kioskId,
    expiresAt
  })

  return otp
}
