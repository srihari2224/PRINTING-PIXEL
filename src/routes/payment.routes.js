const express = require('express')
const router = express.Router()
const paymentController = require('../controllers/payment.controller')

// Create Razorpay order
router.post('/create-order', paymentController.createOrder)

module.exports = router