const express = require("express")
const router = express.Router()
const { verifyOTP, reactivateOTP, syncOTPStatus } = require("../controllers/otp.controller")

router.post("/verify", verifyOTP)
router.post("/reactivate", reactivateOTP)
router.post("/sync-status", syncOTPStatus)

module.exports = router
