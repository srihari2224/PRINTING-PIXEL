const Razorpay = require('razorpay')

exports.createOrder = async (req, res) => {
  try {
    console.log('🔥 Received create-order request')
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2))

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('❌ Missing Razorpay credentials')
      return res.status(500).json({ 
        error: 'Razorpay credentials not configured',
        debug: {
          hasKeyId: !!process.env.RAZORPAY_KEY_ID,
          hasSecret: !!process.env.RAZORPAY_KEY_SECRET
        }
      })
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    })

    const { amount, currency, receipt, notes } = req.body

    if (!amount || !currency || !receipt) {
      console.error('❌ Missing required fields')
      return res.status(400).json({ 
        error: 'Missing required fields: amount, currency, receipt' 
      })
    }

const parsedAmount = typeof amount === 'string' ? parseInt(amount) : amount
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
      console.error('❌ Invalid amount:', amount)
      return res.status(400).json({ error: 'Invalid amount' })
    }

    const options = {
      amount: parsedAmount,
      currency: currency,
      receipt: receipt,
      notes: notes || {},
      payment_capture: 1
    }

    console.log('📤 Creating Razorpay order:', JSON.stringify(options, null, 2))

    const order = await razorpay.orders.create(options)
    
    console.log('✅ Order created:', order.id)

    res.json({
      id: order.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status
    })
  } catch (error) {
    console.error('❌ Order creation FAILED:', error.message)
    console.error('Stack:', error.stack)
    
    res.status(500).json({ 
      error: error.message || 'Order creation failed',
      details: error.error ? error.error.description : 'Unknown error'
    })
  }
}