// Netlify Function — proxy per Google Places API

const https = require('https')

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 404, headers, body: '{}' }

  let query, key
  try {
    ;({ query, key } = JSON.parse(event.body))
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No key' }) }

  try {
    const result = await callPlaces(query, key)
    return { statusCode: 200, headers, body: JSON.stringify(result) }
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }
  }
}

function callPlaces(query, key) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(query)
    const path = `/maps/api/place/textsearch/json?query=${encoded}&key=${key}&language=it`
    const req = https.request({
      hostname: 'maps.googleapis.com',
      path,
      method: 'GET',
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const r = JSON.parse(data)
          const place = r.results?.[0]
          if (!place) return resolve({ city: null, address: null, placeId: null })
          const comps = place.address_components || []
          const city = (
            comps.find(c => c.types.includes('locality'))?.long_name ||
            comps.find(c => c.types.includes('administrative_area_level_3'))?.long_name ||
            null
          )
          resolve({ city, address: place.formatted_address || null, placeId: place.place_id || null })
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}
