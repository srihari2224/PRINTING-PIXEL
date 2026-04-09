const express = require("express")
const router = express.Router()
const { verifyOTP, reactivateOTP } = require("../controllers/otp.controller")

router.post("/verify", verifyOTP)
router.post("/reactivate", reactivateOTP)

module.exports = router
