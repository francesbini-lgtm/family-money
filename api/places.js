// Vercel Serverless Function — proxy per Google Places API
const https = require('https')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(404).json({})

  let query, key
  try {
    ;({ query, key } = req.body)
    if (!query && !key) {
      const raw = await getRawBody(req)
      ;({ query, key } = JSON.parse(raw))
    }
  } catch(e) {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  if (!key) return res.status(400).json({ error: 'No key' })

  try {
    const result = await callPlaces(query, key)
    return res.status(200).json(result)
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', c => data += c)
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function callPlaces(query, key) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(query)
    const path = `/maps/api/place/textsearch/json?query=${encoded}&key=${encodeURIComponent(key)}&language=it`
    const req = https.request({
      hostname: 'maps.googleapis.com',
      path,
      method: 'GET',
    }, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          const place = json.results?.[0]
          if (!place) return resolve({ city: null, address: null, placeId: null })
          const comps = place.address_components || []
          const city = (
            comps.find(c => c.types.includes('locality'))?.long_name ||
            comps.find(c => c.types.includes('administrative_area_level_3'))?.long_name ||
            null
          )
          resolve({
            name:    place.name || null,
            city,
            address: place.formatted_address || null,
            placeId: place.place_id || null,
            lat:     place.geometry?.location?.lat || null,
            lng:     place.geometry?.location?.lng || null,
          })
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}
