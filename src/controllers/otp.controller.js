const OTP = require("../models/OTP")
const Upload = require("../models/Upload")
const PrintJob = require("../models/PrintJob")
const Transaction = require("../models/Transaction")
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

    // Mark OTP as in-progress (temporarily lock it to prevent double-use)
    // It will be permanently marked 'used' only if the print job succeeds.
    // If job FAILS, the OTP is reset to unused so the user can retry.
    record.used = true
    record.inProgress = true
    await record.save()
    console.log('✅ OTP marked as used (pending job completion)')

    // Sync otpUsed on Transaction — try uploadId first, fallback to otpGenerated
    const txUpdate = await Transaction.updateOne(
      { uploadId: record.uploadId, kioskId },
      { $set: { otpUsed: true } }
    )
    if (txUpdate.modifiedCount === 0) {
      // Fallback: match by the OTP value itself in case uploadId is stale/missing
      await Transaction.updateOne(
        { otpGenerated: otp, kioskId },
        { $set: { otpUsed: true } }
      )
      console.log('⚠️ Used fallback OTP string match for otpUsed sync')
    }

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

/**
 * Reactivate an already-used OTP so it can be used again.
 * POST /api/otp/reactivate
 * Body: { uploadId, kioskId }
 */
exports.reactivateOTP = async (req, res) => {
  try {
    const { uploadId, kioskId } = req.body
    if (!uploadId || !kioskId) {
      return res.status(400).json({ error: "uploadId and kioskId are required" })
    }

    const record = await OTP.findOne({ uploadId, kioskId })
    if (!record) {
      return res.status(404).json({ error: "OTP record not found" })
    }

    record.used = false
    // Extend expiry by 3 days from now
    record.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    await record.save()

    // Sync otpUsed = false in Transaction
    const reactivateTxUpdate = await Transaction.updateOne(
      { uploadId, kioskId },
      { $set: { otpUsed: false } }
    )
    if (reactivateTxUpdate.modifiedCount === 0) {
      await Transaction.updateOne(
        { otpGenerated: record.otp, kioskId },
        { $set: { otpUsed: false } }
      )
    }

    console.log(`✅ OTP reactivated for uploadId: ${uploadId}`)
    res.json({ success: true, otp: record.otp, message: "OTP reactivated successfully" })
  } catch (err) {
    console.error('❌ OTP reactivation failed:', err)
    res.status(500).json({ error: "OTP reactivation failed", details: err.message })
  }
}

/**
 * Sync OTP used status to all transactions for a kiosk.
 * POST /api/otp/sync-status
 * Body: { kioskId }  (optional — if omitted, syncs all)
 */
exports.syncOTPStatus = async (req, res) => {
  try {
    const { kioskId } = req.body
    const query = kioskId ? { kioskId, used: true } : { used: true }
    const usedOTPs = await OTP.find(query)

    let synced = 0
    for (const otpRecord of usedOTPs) {
      // Try uploadId match first
      const result = await Transaction.updateOne(
        { uploadId: otpRecord.uploadId, kioskId: otpRecord.kioskId, otpUsed: { $ne: true } },
        { $set: { otpUsed: true } }
      )
      if (result.modifiedCount === 0) {
        // Fallback: match by OTP string
        await Transaction.updateOne(
          { otpGenerated: otpRecord.otp, kioskId: otpRecord.kioskId, otpUsed: { $ne: true } },
          { $set: { otpUsed: true } }
        )
      }
      synced++
    }

    console.log(`✅ OTP status sync complete: ${synced} records processed`)
    res.json({ success: true, processed: synced })
  } catch (err) {
    console.error('❌ OTP sync failed:', err)
    res.status(500).json({ error: "Sync failed", details: err.message })
  }
}