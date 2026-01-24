const Razorpay = require('razorpay')

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
})

// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    const { amount, currency, receipt, notes } = req.body

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' })
    }

    // Validate Razorpay keys
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('❌ Razorpay keys not configured')
      return res.status(500).json({ error: 'Payment gateway not configured' })
    }

    const options = {
      amount: amount, // amount in paise
      currency: currency || 'INR',
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {}
    }

    console.log('📤 Creating Razorpay order:', {
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt
    })

    const order = await razorpay.orders.create(options)
    
    console.log('✅ Razorpay order created:', order.id)

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    })
  } catch (error) {
    console.error('❌ Razorpay order creation failed:', error)
    res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    })
  }
}