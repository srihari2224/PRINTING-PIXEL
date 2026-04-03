const express = require("express")
const multer  = require("multer")
const { uploadFiles, confirmPayment } = require("../controllers/upload.controller")
const { rateLimiter, fileGuard } = require("../middlewares/uploadLimiter")

const router = express.Router()

// 50 MB hard cap at multer level too (belt-and-suspenders)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,   // 50 MB per file
    files: 30,                     // absolute max files (10 PDFs + 20 images)
  }
})

// Upload: rate-limit → multer parse → file guard → controller
router.post(
  "/",
  rateLimiter,
  upload.array("files"),
  fileGuard,
  uploadFiles
)

router.post("/:uploadId/confirm-payment", express.json(), confirmPayment)

module.exports = router
