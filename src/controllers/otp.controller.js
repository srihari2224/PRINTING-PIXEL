const OTP = require("../models/OTP")
const Upload = require("../models/Upload")
const s3 = require("../config/s3")

exports.verifyOTP = async (req, res) => {
  try {
    const { otp, kioskId } = req.body
    
    console.log(`🔍 Verifying OTP: ${otp} for kiosk: ${kioskId}`)
    
    if (!otp || !kioskId) {
      return res.status(400).json({ error: "OTP and kioskId required" })
    }

    const record = await OTP.findOne({ otp, kioskId })
    if (!record) {
      console.error('❌ Invalid OTP')
      return res.status(404).json({ error: "Invalid OTP" })
    }
    if (record.used) {
      console.error('❌ OTP already used')
      return res.status(400).json({ error: "OTP already used" })
    }
    if (record.expiresAt < new Date()) {
      console.error('❌ OTP expired')
      return res.status(400).json({ error: "OTP expired" })
    }

    // Mark OTP as used
    record.used = true
    await record.save()
    console.log('✅ OTP marked as used')

    // Get upload data
    const upload = await Upload.findOne({ uploadId: record.uploadId })
    if (!upload) {
      return res.status(404).json({ error: "Upload not found" })
    }

    console.log(`📦 Found upload: ${upload.uploadId} with ${upload.files.length} files`)

    // Generate signed URLs for each file
    const filesWithUrls = upload.files.map((file) => {
      const url = s3.getSignedUrl("getObject", {
        Bucket: process.env.AWS_BUCKET,
        Key: file.key,
        Expires: 600 // 10 minutes
      })
      
      return {
        url: url,
        originalName: file.originalName,
        pageCount: file.pageCount,
        printOptions: file.printOptions
      }
    })

    console.log('✅ Generated signed URLs for all files')

    res.json({
      success: true,
      uploadId: upload.uploadId,
      files: filesWithUrls,
      totalPages: upload.totalPages
    })
  } catch (err) {
    console.error('❌ OTP verification failed:', err)
    res.status(500).json({ error: "OTP verification failed", details: err.message })
  }
}