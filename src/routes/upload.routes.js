const express = require("express")
const multer = require("multer")
const { uploadFiles, confirmPayment } = require("../controllers/upload.controller")

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

router.post("/", upload.array("files"), uploadFiles)
router.post("/:uploadId/confirm-payment", express.json(), confirmPayment)

module.exports = router


