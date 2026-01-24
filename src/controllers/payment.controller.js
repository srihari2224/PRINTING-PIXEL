const Razorpay = require('razorpay')

// Initialize Razorpay only if keys are present
let razorpay = null

const initRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret) {
    console.error('❌ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not found in environment')
    console.error('   RAZORPAY_KEY_ID:', keyId ? '✅ Present' : '❌ Missing')
    console.error('   RAZORPAY_KEY_SECRET:', keySecret ? '✅ Present' : '❌ Missing')
    return null
  }

  try {
    razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    })
    console.log('✅ Razorpay initialized successfully')
    return razorpay
  } catch (error) {
    console.error('❌ Failed to initialize Razorpay:', error.message)
    return null
  }
}

// Initialize on module load
initRazorpay()

// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    // Re-initialize if not already done (in case env vars were added after startup)
    if (!razorpay) {
      razorpay = initRazorpay()
    }

    // Check if Razorpay is initialized
    if (!razorpay) {
      console.error('❌ Razorpay not configured - Keys missing')
      return res.status(500).json({ 
        error: 'Payment gateway not configured',
        details: 'Razorpay API keys are missing. Please contact administrator.'
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