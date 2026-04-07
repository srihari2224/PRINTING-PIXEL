const OTP = require("../models/OTP")
const Upload = require("../models/Upload")
const PrintJob = require("../models/PrintJob")
const s3 = require("../config/s3")
const { emitPrintJob, isAgentOnline } = require("../socket/socketHandler")

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

    // Generate signed URLs for each file (15 min expiry)
    const filesForJob = upload.files.map((file) => {
      const url = s3.getSignedUrl("getObject", {
        Bucket: process.env.AWS_BUCKET,
        Key: file.key,
        Expires: 900    // 15 minutes
      })
      
      return {
        url,
        s3Key: file.key,
        originalName: file.originalName,
        pageCount: file.pageCount,
        printOptions: file.printOptions
      }
    })

    console.log('✅ Generated signed URLs for all files')

    // ── Create PrintJob ──────────────────────────────────────────────────
    const printJob = await PrintJob.create({
      uploadId: upload.uploadId,
      kioskId,
      files: filesForJob,
      totalPages: upload.totalPages,
      status: "QUEUED"
    })

    console.log(`📋 PrintJob created: ${printJob._id}`)

    // ── Update upload status ─────────────────────────────────────────────
    upload.status = "PRINTING"
    await upload.save()

    // ── Emit to agent via Socket.IO ──────────────────────────────────────
    const agentOnline = isAgentOnline(kioskId)
    
    if (agentOnline) {
      const delivered = emitPrintJob(kioskId, printJob)
      if (delivered) {
        console.log(`📨 Print job sent to agent: ${kioskId}`)
      }
    } else {
      // Agent offline — job stays QUEUED, will be delivered when agent reconnects
      printJob.status = "AGENT_OFFLINE"
      await printJob.save()
      console.warn(`⚠️  Agent offline for ${kioskId} — job queued for later delivery`)
    }

    // ── Return printJobId to kiosk-app for polling ───────────────────────
    res.json({
      success: true,
      printJobId: printJob._id.toString(),
      uploadId: upload.uploadId,
      totalPages: upload.totalPages,
      fileCount: upload.files.length,
      agentOnline
    })
  } catch (err) {
    console.error('❌ OTP verification failed:', err)
    res.status(500).json({ error: "OTP verification failed", details: err.message })
  }
}