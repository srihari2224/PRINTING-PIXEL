const s3 = require("../config/s3")
const { v4: uuid } = require("uuid")

exports.uploadToS3 = async (file, kioskId) => {
  const key = `uploads/${kioskId}/${uuid()}-${file.originalname}`

  const params = {
    Bucket: process.env.AWS_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }

  await s3.upload(params).promise()

  return key
}
