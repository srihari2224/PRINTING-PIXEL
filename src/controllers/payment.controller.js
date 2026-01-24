const Razorpay = require('razorpay')

// Initialize Razorpay only if keys are present
let razorpay = null

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  })
  console.log('✅ Razorpay initialized')
} else {
  console.warn('⚠️  Razorpay keys not found in environment variables')
}

// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    // Check if Razorpay is initialized
    if (!razorpay) {
      console.error('❌ Razorpay not configured')
      return res.status(500).json({ 
        error: 'Payment gateway not configured. Please contact administrator.' 
      })
    }

    const { amount, currency, receipt, notes } = req.body

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' })
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