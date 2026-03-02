const crypto = require('crypto')
const Razorpay = require('razorpay')
const Upload = require('../models/Upload')
const OTP = require('../models/OTP')
const { createOTP } = require('../services/otp.service')
const { createTransaction } = require('../services/transaction.service')
const { v4: uuid } = require('uuid')

/* ── Shop item catalogue (pre-uploaded to S3) ── */
const SHOP_ITEMS = {
    a4_sheet: {
        name: 'A4 Sheet',
        key: 'SHOP ITEMS/graph_A4.pdf',
        colorMode: 'color',
        duplex: 'single',
        pagesPerItem: 1,
        pricePerItem: 10, // color, single → ₹10
    },
    graph_sheet: {
        name: 'Graph Sheet',
        key: 'SHOP ITEMS/hoi_letter_sure_internship.pdf',
        colorMode: 'color',
        duplex: 'single',
        pagesPerItem: 1,
        pricePerItem: 10,
    },
    margin_lined: {
        name: 'Margin Lined Sheet',
        key: 'SHOP ITEMS/printit-invoice-INV-20260301-81261.pdf',
        colorMode: 'bw',
        duplex: 'double',
        pagesPerItem: 1,
        pricePerItem: 2, // b&w, single page
    },
}

/**
 * POST /api/shop/checkout
 * Body: { kioskId, items: [{ itemId, qty }], amountInPaise }
 * Creates an Upload record from pre-uploaded S3 keys and a Razorpay order.
 */
exports.checkout = async (req, res) => {
    try {
        const { kioskId, items, amountInPaise } = req.body
        if (!kioskId) return res.status(400).json({ error: 'kioskId missing' })
        if (!items || !items.length) return res.status(400).json({ error: 'No items provided' })

        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json({ error: 'Razorpay credentials not configured' })
        }

        const uploadId = uuid()
        const savedFiles = []
        let totalPages = 0
        let calculatedAmount = 0

        for (const { itemId, qty } of items) {
            const shopItem = SHOP_ITEMS[itemId]
            if (!shopItem) continue
            const quantity = Math.max(1, Math.floor(qty || 1))

            savedFiles.push({
                key: shopItem.key,
                originalName: shopItem.name,
                pageCount: shopItem.pagesPerItem,
                printOptions: {
                    copies: quantity,
                    colorMode: shopItem.colorMode,
                    duplex: shopItem.duplex,
                    pageRange: 'all',
                },
                source: 'shop',
            })

            totalPages += shopItem.pagesPerItem * quantity
            calculatedAmount += shopItem.pricePerItem * quantity
        }

        if (!savedFiles.length) return res.status(400).json({ error: 'No valid shop items' })

        // Use client amount if provided, fall back to calculated
        const finalAmount = amountInPaise || calculatedAmount * 100

        await Upload.create({
            uploadId,
            kioskId,
            files: savedFiles,
            totalPages,
            status: 'PENDING_PAYMENT',
        })

        console.log(`🛒 Shop order created: ${uploadId} | Items: ${savedFiles.length} | Amount: ₹${calculatedAmount}`)

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        })

        const order = await razorpay.orders.create({
            amount: finalAmount,
            currency: 'INR',
            receipt: `shop_${Date.now()}`,
            notes: { uploadId, kioskId, source: 'paper_shop' },
            payment_capture: 1,
        })

        console.log(`✅ Razorpay order created: ${order.id} for shop upload: ${uploadId}`)

        res.json({
            success: true,
            uploadId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            calculatedAmount,
        })
    } catch (err) {
        console.error('❌ Shop checkout failed:', err)
        res.status(500).json({ error: 'Shop checkout failed', details: err.message })
    }
}

/**
 * POST /api/shop/confirm-payment
 * Same signature verification as normal upload confirm-payment.
 * Returns { otp } on success.
 */
exports.confirmPayment = async (req, res) => {
    try {
        const {
            uploadId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount,
            currency = 'INR',
            customerPhone,
            customerEmail,
            paymentMethod,
        } = req.body

        if (!uploadId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing payment details' })
        }

        // Verify signature
        const sign = razorpay_order_id + '|' + razorpay_payment_id
        const expectedSign = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(sign)
            .digest('hex')

        if (razorpay_signature !== expectedSign) {
            console.error('❌ Invalid shop payment signature')
            return res.status(400).json({ error: 'Invalid payment signature' })
        }

        console.log('✅ Shop payment signature verified')

        const upload = await Upload.findOne({ uploadId })
        if (!upload) return res.status(404).json({ error: 'Upload not found' })

        if (upload.status === 'PAID') {
            const existingOTP = await OTP.findOne({
                uploadId,
                kioskId: upload.kioskId,
                used: false,
                expiresAt: { $gt: new Date() },
            }).sort({ createdAt: -1 })

            if (existingOTP) {
                return res.json({ success: true, otp: existingOTP.otp })
            }
            const newOTP = await createOTP({ uploadId, kioskId: upload.kioskId })
            return res.json({ success: true, otp: newOTP })
        }

        upload.status = 'PAID'
        upload.paymentId = razorpay_payment_id
        upload.orderId = razorpay_order_id
        upload.paidAt = new Date()
        await upload.save()

        const otp = await createOTP({ uploadId, kioskId: upload.kioskId })
        console.log(`🎫 Shop OTP generated: ${otp}`)

        try {
            await createTransaction({
                kioskId: upload.kioskId,
                uploadId,
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                amount,
                currency,
                status: 'SUCCESS',
                otpGenerated: otp,
                customerEmail: customerEmail || '',
                customerPhone: customerPhone || '',
                paymentMethod: paymentMethod || 'unknown',
                metadata: { source: 'paper_shop' },
            })
        } catch (txErr) {
            console.error('⚠️ Shop transaction record failed:', txErr.message)
        }

        res.json({ success: true, otp })
    } catch (err) {
        console.error('❌ Shop confirm-payment failed:', err)
        res.status(500).json({ error: 'Payment confirmation failed', details: err.message })
    }
}
