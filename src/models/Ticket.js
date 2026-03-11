const mongoose = require("mongoose")

const ticketSchema = new mongoose.Schema({
  kioskId: { type: String, required: true },
  email: { type: String, required: true },
  mobile: { type: String, required: true },
  query: { type: String, required: true },
  status: {
    type: String,
    enum: ["open", "in-progress", "resolved"],
    default: "open",
  },
  createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model("Ticket", ticketSchema)
