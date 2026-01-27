const express = require('express')
const router = express.Router()
const Transaction = require('../models/Transaction')

router.post('/test-transaction', async (req, res) => {
  try {
    const txn = await Transaction.create({
      transactionId: 'TEST_123',
      kioskId: 'srihari',
      uploadId: 'test_upload',
      razorpayOrderId: 'order_test',
      razorpayPaymentId: 'pay_test',
      razorpaySignature: 'sig_test',
      amount: 1000,
      totalPages: 10,
      filesCount: 1,
      status: 'SUCCESS'
    })
    res.json({ success: true, transaction: txn })
  } catch (err) {
    res.json({ error: err.message })
  }
})

module.exports = router