const express = require("express")
const router = express.Router()
const Ticket = require("../models/Ticket")

// POST /api/tickets — raise a new support ticket
router.post("/", async (req, res) => {
  try {
    const { kioskId, email, mobile, query } = req.body
    if (!kioskId || !email || !mobile || !query) {
      return res.status(400).json({ error: "kioskId, email, mobile, and query are required" })
    }
    const ticket = new Ticket({ kioskId, email, mobile, query })
    await ticket.save()
    res.status(201).json({ success: true, ticketId: ticket._id })
  } catch (err) {
    console.error("Ticket error:", err)
    res.status(500).json({ error: "Failed to create ticket" })
  }
})

// GET /api/tickets — list all tickets (for admin)
router.get("/", async (req, res) => {
  try {
    const { kioskId } = req.query
    const filter = kioskId ? { kioskId } : {}
    const tickets = await Ticket.find(filter).sort({ createdAt: -1 })
    res.json(tickets)
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tickets" })
  }
})

module.exports = router
