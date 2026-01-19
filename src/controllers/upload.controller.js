const Upload = require("../models/Upload")
const { uploadToS3 } = require("../services/s3.service")
const { createOTP } = require("../services/otp.service")
const { v4: uuid } = require("uuid")

exports.uploadFile = async (req, res) => {
  try {
    const file = req.file
    const { copies, duplex, pageRange } = req.body

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const uploadId = uuid()
    const kioskId = "TEST_KIOSK"

    const s3Key = await uploadToS3(file, kioskId)

    await Upload.create({
      uploadId,
      kioskId,
      files: [s3Key],
      printOptions: { copies, duplex, pageRange },
      status: "UPLOADED"
    })

    // ✅ CREATE OTP HERE
    const otp = await createOTP({
      uploadId,
      kioskId
    })

    // ✅ RETURN OTP TO USER
    res.json({
      success: true,
      uploadId,
      otp,
      file: s3Key
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Upload failed" })
  }
}
