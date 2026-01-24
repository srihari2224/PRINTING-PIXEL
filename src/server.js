require("dotenv").config()
const app = require("./app")

// Debug environment variables
console.log('🔍 Environment Variables Check:')
console.log('PORT:', process.env.PORT || '5000')
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? '✅ Set' : '❌ Missing')
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? '✅ Set' : '❌ Missing')
console.log('MONGO_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Missing')

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`)
})

