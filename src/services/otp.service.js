const OTP = require("../models/OTP")
const generateOTP = require("../utils/generateOTP")

exports.createOTP = async ({ uploadId, kioskId }) => {
  const otp = generateOTP()

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 min

  await OTP.create({
    otp,
    uploadId,
    kioskId,
    expiresAt
  })

  return otp
}
