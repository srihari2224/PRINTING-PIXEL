const crypto = require('crypto')
const Upload = require("../models/Upload")
const { uploadToS3 } = require("../services/s3.service")
const { createOTP } = require("../services/otp.service")
const { v4: uuid } = require("uuid")
const countPages = require("../utils/countPages")

// Accept multiple files and per-file print options. Do NOT create OTP yet.
exports.uploadFiles = async (req, res) => {
  try {
    const files = req.files || []
    let printOptions = []

    // printOptions can be sent as JSON string or as object/array
    if (req.body.printOptions) {
      try {
        printOptions = typeof req.body.printOptions === "string" 
          ? JSON.parse(req.body.printOptions) 
          : req.body.printOptions
      } catch (e) {
        console.warn('Invalid printOptions JSON, ignoring')
        printOptions = []
      }
    }

    const { kioskId } = req.body
    if (!kioskId) return res.status(400).json({ error: "kioskId missing" })
    if (!files.length) return res.status(400).json({ error: "No files uploaded" })

    const uploadId = uuid()
    const savedFiles = []
    let totalPages = 0

    console.log(`📤 Processing ${files.length} files for kiosk: ${kioskId}`)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const opts = (printOptions && printOptions[i]) || {}

      console.log(`📄 Uploading file ${i + 1}: ${file.originalname}`)
      const s3Key = await uploadToS3(file, kioskId)
      const pageCount = await countPages(file.buffer)

      const copies = opts.copies ? Number(opts.copies) : 1
      totalPages += pageCount * copies

      savedFiles.push({
        key: s3Key,
        originalName: file.originalname,
        pageCount,
        printOptions: {
          copies: copies,
          colorMode: opts.colorMode || opts.color || "color",
          duplex: opts.duplex || "single",
          pageRange: opts.pageRange || "all"
        }
      })

      console.log(`✅ File uploaded: ${file.originalname} (${pageCount} pages × ${copies} copies)`)
    }

    await Upload.create({
      uploadId,
      kioskId,
      files: savedFiles,
      totalPages,
      status: "PENDING_PAYMENT"
    })

    console.log(`✅ Upload created: ${uploadId} | Total pages: ${totalPages}`)

    // Return uploadId and summary so frontend can open payment window
    res.json({ 
      success: true, 
      uploadId, 
      totalPages, 
      files: savedFiles.map(f => ({ 
        originalName: f.originalName, 
        pageCount: f.pageCount, 
        printOptions: f.printOptions 
      })) 
    })
  } catch (err) {
    console.error('❌ Upload failed:', err)
    res.status(500).json({ error: "Upload failed", details: err.message })
  }
}

// Verify Razorpay payment and generate OTP
exports.confirmPayment = async (req, res) => {
  try {
    const { uploadId } = req.params
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

    console.log(`🔍 Verifying payment for upload: ${uploadId}`)

    if (!uploadId) {
      return res.status(400).json({ error: "uploadId missing" })
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Payment details missing" })
    }

    // Check if RAZORPAY_KEY_SECRET exists
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('❌ RAZORPAY_KEY_SECRET not set in environment')
      return res.status(500).json({ error: "Server configuration error" })
    }

    // Verify Razorpay payment signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex")

    if (razorpay_signature !== expectedSign) {
      console.error('❌ Invalid payment signature')
      console.error('Expected:', expectedSign)
      console.error('Received:', razorpay_signature)
      return res.status(400).json({ error: "Invalid payment signature" })
    }

    console.log('✅ Payment signature verified')

    // Find upload record
    const upload = await Upload.findOne({ uploadId })
    if (!upload) {
      return res.status(404).json({ error: "Upload not found" })
    }

    // Check if already paid
    if (upload.status === "PAID") {
      console.log('⚠️ Upload already marked as paid')
      // Still generate OTP if needed
      const otp = await createOTP({ uploadId, kioskId: upload.kioskId })
      return res.json({ success: true, otp, message: "Already paid" })
    }

    // Update upload with payment details
    upload.status = "PAID"
    upload.paymentId = razorpay_payment_id
    upload.orderId = razorpay_order_id
    upload.paidAt = new Date()
    await upload.save()

    console.log(`💾 Upload status updated to PAID`)

    // Generate OTP
    const otp = await createOTP({ uploadId, kioskId: upload.kioskId })

    console.log(`🎫 OTP generated: ${otp}`)

    res.json({ success: true, otp })
  } catch (err) {
    console.error('❌ Payment confirmation failed:', err)
    res.status(500).json({ 
      error: "Payment confirmation failed", 
      details: err.message 
    })
  }
}