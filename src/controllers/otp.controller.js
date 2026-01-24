exports.verifyOTP = async (req, res) => {
  try {
    const { otp, kioskId } = req.body
    if (!otp || !kioskId) {
      return res.status(400).json({ error: "OTP and kioskId required" })
    }

    const record = await OTP.findOne({ otp, kioskId })
    if (!record) {
      return res.status(404).json({ error: "Invalid OTP" })
    }
    if (record.used) {
      return res.status(400).json({ error: "OTP already used" })
    }
    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: "OTP expired" })
    }

    // Lock OTP
    record.used = true
    await record.save()

    // Get upload data
    const upload = await Upload.findOne({ uploadId: record.uploadId })
    if (!upload) {
      return res.status(404).json({ error: "Upload not found" })
    }

    // Generate signed URLs for each file
    const filesWithUrls = upload.files.map((file) => ({
      url: s3.getSignedUrl("getObject", {
        Bucket: process.env.AWS_BUCKET,
        Key: file.key,
        Expires: 300 // 5 min
      }),
      originalName: file.originalName,
      pageCount: file.pageCount,
      printOptions: file.printOptions
    }))

    res.json({
      success: true,
      uploadId: upload.uploadId,
      files: filesWithUrls,
      totalPages: upload.totalPages
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "OTP verification failed" })
  }
}