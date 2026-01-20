const pdf = require('pdf-parse')

module.exports = async function countPages(buffer) {
  if (!buffer) return 0
  try {
    const data = await pdf(buffer)
    return data.numpages || 0
  } catch (err) {
    console.error('countPages error:', err)
    return 0
  }
}
