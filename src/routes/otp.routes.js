const express = require("express")
const router = express.Router()
const { verifyOTP } = require("../controllers/otp.controller")

router.post("/verify", verifyOTP)

module.exports = router
