const express = require('express')
const router = express.Router()
const { checkout, confirmPayment } = require('../controllers/shop.controller')

router.post('/checkout', checkout)
router.post('/confirm-payment', confirmPayment)

module.exports = router
