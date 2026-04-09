const crypto = require('crypto')
const pdf   = require('pdf-parse')
const Razorpay = require('razorpay')
const Upload = require("../models/Upload")
const { uploadToS3 } = require("../services/s3.service")
const { createOTP } = require("../services/otp.service")
const { createTransaction } = require("../services/transaction.service")
const { v4: uuid } = require("uuid")
const countPages = require("../utils/countPages")
const OTP = require("../models/OTP")

// ── Validate a PDF buffer: detects corrupt / encrypted files ─────────────────
async function validatePdf(buffer, filename) {
  try {
    await pdf(buffer, { max: 1 })   // parse just 1 page — enough to validate
  } catch (err) {
    const msg = err.message || ''
    if (msg.includes('encrypt') || msg.includes('password')) {
      throw new Error(`"${filename}" is password-protected. Please remove the password before uploading.`)
    }
    throw new Error(`"${filename}" appears to be corrupted or is an invalid PDF.`)
  }
}

// ── Magic-byte check for images (guards against renamed executables) ──────────
const IMAGE_SIGNATURES = [
  { bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },
  { bytes: [0x47, 0x49, 0x46], mime: 'image/gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' },
]

function validateImageMagicBytes(buffer, filename) {
  const header = Array.from(buffer.slice(0, 8))
  const valid = IMAGE_SIGNATURES.some(sig =>
    sig.bytes.every((b, i) => header[i] === b)
  )
  if (!valid) {
    throw new Error(`"${filename}" does not appear to be a valid image file.`)
  }
}

exports.uploadFiles = async (req, res) => {
  try {
    const files = req.files || []
    let printOptions = []

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

      console.log(`📄 Validating file ${i + 1}: ${file.originalname}`)

      // ── Validate before touching S3 ─────────────────────────────────────
      if (file.mimetype === 'application/pdf') {
        await validatePdf(file.buffer, file.originalname)
      } else if (file.mimetype && file.mimetype.startsWith('image/')) {
        validateImageMagicBytes(file.buffer, file.originalname)
      }

      console.log(`📤 Uploading file ${i + 1}: ${file.originalname}`)
      const s3Key = await uploadToS3(file, kioskId)
      const pageCount = file.mimetype === 'application/pdf'
        ? await countPages(file.buffer)
        : 1   // images count as 1 page

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
    // Validation errors should return 400, not 500
    const is400 = err.message && (
      err.message.includes('password') ||
      err.message.includes('corrupted') ||
      err.message.includes('invalid') ||
      err.message.includes('does not appear')
    )
    res.status(is400 ? 400 : 500).json({ error: err.message || "Upload failed" })
  }
}

exports.confirmPayment = async (req, res) => {
  try {
    const { uploadId } = req.params
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      amount,
      currency = "INR",
      customerEmail,
      customerPhone,
      paymentMethod
    } = req.body

    console.log(`🔐 Verifying payment for upload: ${uploadId}`)

    // ✅ Validation
    if (!uploadId) {
      return res.status(400).json({ error: "uploadId missing" })
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Payment details missing" })
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('❌ RAZORPAY_KEY_SECRET not set')
      return res.status(500).json({ error: "Server configuration error" })
    }

    // ✅ Verify signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex")

    if (razorpay_signature !== expectedSign) {
      console.error('❌ Invalid payment signature')
      
      // ✅ Create failed transaction record
      const upload = await Upload.findOne({ uploadId })
      if (upload) {
        try {
          await createTransaction({
            kioskId: upload.kioskId,
            uploadId: uploadId,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            amount: amount || 0,
            currency: currency,
            status: "FAILED",
            metadata: {
              source: 'kiosk_payment',
              failureReason: 'Invalid signature'
            }
          })
        } catch (txnError) {
          console.error('⚠️ Failed to create failed transaction record:', txnError.message)
        }
      }
      
      return res.status(400).json({ error: "Invalid payment signature" })
    }

    console.log('✅ Payment signature verified')

    // ✅ Get upload details
    const upload = await Upload.findOne({ uploadId })
    if (!upload) {
      return res.status(404).json({ error: "Upload not found" })
    }

    // ✅ Check if already paid - return existing OTP
    if (upload.status === "PAID") {
      console.log('⚠️ Already paid, checking for existing OTP')
      
      // Try to find existing OTP
      const existingOTP = await OTP.findOne({ 
        uploadId, 
        kioskId: upload.kioskId,
        used: false,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 })
      
      if (existingOTP) {
        console.log('✅ Returning existing valid OTP')
        return res.json({ 
          success: true, 
          otp: existingOTP.otp, 
          message: "Payment already processed" 
        })
      }
      
      // If no valid OTP exists, create a new one
      const newOTP = await createOTP({ uploadId, kioskId: upload.kioskId })
      console.log('✅ Created new OTP for existing payment')
      return res.json({ 
        success: true, 
        otp: newOTP, 
        message: "Payment already processed, new OTP generated" 
      })
    }

    // ✅ Fetch phone number from Razorpay API (response.contact not available client-side)
    let resolvedPhone = customerPhone || ''
    let resolvedEmail = customerEmail || ''
    let resolvedMethod = paymentMethod || ''
    try {
      if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
        const payment = await rzp.payments.fetch(razorpay_payment_id)
        if (payment.contact) resolvedPhone = payment.contact
        if (payment.email) resolvedEmail = payment.email
        if (payment.method) resolvedMethod = payment.method
        console.log(`📱 Resolved phone from Razorpay: ${resolvedPhone}`)
      }
    } catch (rzpErr) {
      console.warn('⚠️ Could not fetch Razorpay payment details:', rzpErr.message)
    }

    // ✅ Update upload status
    upload.status = "PAID"
    upload.paymentId = razorpay_payment_id
    upload.orderId = razorpay_order_id
    upload.paidAt = new Date()
    await upload.save()

    console.log(`💾 Upload status updated to PAID`)

    // ✅ Generate OTP
    const otp = await createOTP({ uploadId, kioskId: upload.kioskId })
    console.log(`🎫 OTP generated: ${otp}`)

    // ✅ Create transaction record - this is CRITICAL, don't silently fail
    try {
      await createTransaction({
        kioskId: upload.kioskId,
        uploadId: uploadId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        amount: amount,
        currency: currency,
        status: "SUCCESS",
        otpGenerated: otp,
        customerEmail: resolvedEmail,
        customerPhone: resolvedPhone,
        paymentMethod: resolvedMethod,
        metadata: {
          source: 'kiosk_payment',
          uploadDate: upload.createdAt.toISOString()
        }
      })
      console.log(`✅ Transaction record created for ${uploadId}`)
    } catch (txnError) {
      // ⚠️ Log error prominently - this is a data integrity issue
      console.error('🚨 CRITICAL: Failed to create transaction record:', txnError.message)
      console.error('Upload ID:', uploadId, 'Payment ID:', razorpay_payment_id)
      
      // Still return success to user since payment went through
      // but flag for manual reconciliation
      return res.json({ 
        success: true, 
        otp,
        warning: "Payment successful but transaction record may be incomplete. Contact support if issues arise."
      })
    }

    res.json({ success: true, otp })
  } catch (err) {
    console.error('❌ Payment confirmation failed:', err)
    res.status(500).json({ 
      error: "Payment confirmation failed", 
      details: err.message 
    })
  }
}