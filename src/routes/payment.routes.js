const express = require('express')
const router = express.Router()
const paymentController = require('../controllers/payment.controller')

// Create Razorpay order
router.post('/create-order', paymentController.createOrder)


router.get('/test', (req, res) => {
  res.json({
    razorpay_configured: !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,
    key_id_present: !!process.env.RAZORPAY_KEY_ID,
    key_secret_present: !!process.env.RAZORPAY_KEY_SECRET,
    key_id_preview: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.substring(0, 8) + '...' : 'missing'
  })
})


module.exports = router