// src/config/db.js
const mongoose = require("mongoose")

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL
    if (!uri || typeof uri !== "string") {
      console.error("❌ MongoDB connection string is missing. Set MONGO_URI (or MONGODB_URI / DATABASE_URL) in environment.")
      // Exit early with non-zero so deploys fail fast and clearly
      process.exit(1)
    }

    await mongoose.connect(uri)
    console.log("✅ MongoDB connected")
  } catch (err) {
    console.error("❌ MongoDB error", err)
    process.exit(1)
  }
}

module.exports = connectDB


