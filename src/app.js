// src/app.js
const express = require("express")
const cors = require("cors")
const connectDB = require("./config/db")

const app = express()

connectDB()

app.use(cors())
app.use(express.json())

app.get("/", (req, res) => {
  res.send("API running")
})

app.use("/api/upload", require("./routes/upload.routes"))
app.use("/api/otp", require("./routes/otp.routes"))
app.use("/api/payment", require("./routes/payment.routes"))
app.use("/api/transactions", require("./routes/transaction.routes")) // Add transaction routes

module.exports = app