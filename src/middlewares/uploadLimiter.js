/**
 * uploadLimiter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware stack applied BEFORE the upload route:
 *   1. IP-based rate limiter   – max 5 uploads per IP per 10 min window
 *   2. File count guard        – max 10 PDFs + 20 images per request
 *   3. File type whitelist     – only application/pdf, image/jpeg, image/png,
 *                                image/webp, image/gif
 *   4. Per-file size limit     – max 50 MB per file
 *
 * No external rate-limit library needed — uses a simple in-memory Map.
 * For multi-instance production deploy, swap the Map for Redis.
 */

const MAX_PDFS    = 10
const MAX_IMAGES  = 20
const MAX_FILE_MB = 50
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

// ── Rate limiter state (in-memory) ──────────────────────────────────────────
const RATE_WINDOW_MS = 10 * 60 * 1000   // 10-minute sliding window
const MAX_UPLOADS_PER_WINDOW = 5        // max upload requests per IP

const ipLog = new Map()  // Map<ip, { count, windowStart }>

function rateLimiter(req, res, next) {
  // Grab real IP (works behind Vercel/Nginx with X-Forwarded-For)
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim()

  const now = Date.now()
  const entry = ipLog.get(ip)

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    // Fresh window
    ipLog.set(ip, { count: 1, windowStart: now })
    return next()
  }

  entry.count++
  if (entry.count > MAX_UPLOADS_PER_WINDOW) {
    console.warn(`🚫 Rate limit hit for IP: ${ip} (${entry.count} uploads in 10 min)`)
    return res.status(429).json({
      error: 'Too many upload requests. Please wait a few minutes before trying again.',
      retryAfterMs: RATE_WINDOW_MS - (now - entry.windowStart)
    })
  }

  next()
}

// ── File count + type + size guard ──────────────────────────────────────────
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
])

function fileGuard(req, res, next) {
  const files = req.files || []

  if (files.length === 0) return next()          // let controller handle empty

  let pdfCount   = 0
  let imageCount = 0
  const violations = []

  for (const file of files) {
    const mime = (file.mimetype || '').toLowerCase()

    // ── type check ──────────────────────────────────────────────────────────
    if (!ALLOWED_TYPES.has(mime)) {
      violations.push(`"${file.originalname}" has unsupported type (${mime || 'unknown'})`)
      continue
    }

    // ── size check ──────────────────────────────────────────────────────────
    if (file.size > MAX_FILE_BYTES) {
      violations.push(`"${file.originalname}" exceeds ${MAX_FILE_MB} MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`)
      continue
    }

    // ── count ────────────────────────────────────────────────────────────────
    if (mime === 'application/pdf') pdfCount++
    else imageCount++
  }

  if (violations.length) {
    return res.status(400).json({
      error: 'Some files were rejected',
      details: violations
    })
  }

  if (pdfCount > MAX_PDFS) {
    return res.status(400).json({
      error: `Too many PDFs. Maximum allowed is ${MAX_PDFS} PDF files per upload. You sent ${pdfCount}.`
    })
  }

  if (imageCount > MAX_IMAGES) {
    return res.status(400).json({
      error: `Too many images. Maximum allowed is ${MAX_IMAGES} image files per upload. You sent ${imageCount}.`
    })
  }

  next()
}

module.exports = { rateLimiter, fileGuard }
