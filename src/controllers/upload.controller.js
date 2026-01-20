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
        printOptions = typeof req.body.printOptions === "string" ? JSON.parse(req.body.printOptions) : req.body.printOptions
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

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const opts = (printOptions && printOptions[i]) || {}

      const s3Key = await uploadToS3(file, kioskId)
      const pageCount = await countPages(file.buffer)

      totalPages += pageCount * (opts.copies ? Number(opts.copies) : 1)

      savedFiles.push({
        key: s3Key,
        originalName: file.originalname,
        pageCount,
        printOptions: {
          copies: opts.copies ? Number(opts.copies) : 1,
          colorMode: opts.colorMode || opts.color || "color",
          duplex: opts.duplex || "single",
          pageRange: opts.pageRange || "all"
        }
      })
    }

    await Upload.create({
      uploadId,
      kioskId,
      files: savedFiles,
      totalPages,
      status: "PENDING_PAYMENT"
    })

    // Return uploadId and summary so frontend can open payment window
    res.json({ success: true, uploadId, totalPages, files: savedFiles.map(f => ({ originalName: f.originalName, pageCount: f.pageCount, printOptions: f.printOptions })) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Upload failed" })
  }
}

// Confirm payment for an upload, then create and return OTP
exports.confirmPayment = async (req, res) => {
  try {
    const { uploadId } = req.params
    if (!uploadId) return res.status(400).json({ error: "uploadId missing" })

    // TODO: verify payment details in req.body as needed

    const upload = await Upload.findOne({ uploadId })
    if (!upload) return res.status(404).json({ error: "Upload not found" })

    upload.status = "PAID"
    await upload.save()

    const otp = await createOTP({ uploadId, kioskId: upload.kioskId })

    res.json({ success: true, otp })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Payment confirmation failed" })
  }
}