const Razorpay = require('razorpay')

// DON'T initialize here - do it inside the function instead

// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    console.log('📥 Received create-order request')
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2))

    // Check if credentials exist
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

    // Initialize Razorpay INSIDE the route handler (just like your working project)
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    })

    console.log('✅ Razorpay initialized successfully')

    const { amount, currency, receipt, notes } = req.body

    // Validate input
    if (!amount || !currency || !receipt) {
      console.error('❌ Missing required fields')
      return res.status(400).json({ 
        error: 'Missing required fields: amount, currency, receipt' 
      })
    }

    // Validate amount
    if (amount <= 0) {
      console.error('❌ Invalid amount:', amount)
      return res.status(400).json({ error: 'Invalid amount' })
    }

    const options = {
      amount: parseInt(amount), // Ensure it's an integer
      currency: currency,
      receipt: receipt,
      notes: notes || {},
      payment_capture: 1  // AUTO-CAPTURE ENABLED (just like your working project)
    }

    console.log('📤 Creating Razorpay order with options:', JSON.stringify(options, null, 2))

    const order = await razorpay.orders.create(options)
    
    console.log('✅ Order created successfully:', order.id)
    console.log('📋 Order details:', JSON.stringify(order, null, 2))

    res.json({
      id: order.id,           // Return 'id' instead of 'orderId' to match Razorpay response
      orderId: order.id,      // Keep this for backward compatibility
      amount: order.amount,
      currency: order.currency,
      status: order.status
    })
  } catch (error) {
    console.error('❌ Order creation FAILED')
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    
    // Log Razorpay-specific error details
    if (error.error) {
      console.error('Razorpay error details:', JSON.stringify(error.error, null, 2))
    }
    
    res.status(500).json({ 
      error: error.message,
      details: error.error ? error.error.description : 'Order creation failed',
      statusCode: error.statusCode
    })
  }
}