require("dotenv").config()
const http = require("http")
const app = require("./app")
const { initSocket } = require("./socket/socketHandler")

// Debug environment variables
console.log('🔍 Environment Variables Check:')
console.log('PORT:', process.env.PORT || '5000')
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? '✅ Set' : '❌ Missing')
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? '✅ Set' : '❌ Missing')
console.log('MONGO_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Missing')
console.log('AGENT_SECRET:', process.env.AGENT_SECRET ? '✅ Set' : '⚠️  Using default')

const PORT = process.env.PORT || 5000

// Create HTTP server (shared by Express + Socket.IO)
const server = http.createServer(app)

// Initialize Socket.IO on the same server
initSocket(server)

server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`)
  console.log(`🔌 Socket.IO ready for agent connections`)
})
