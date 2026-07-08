// ── Family Money — AI Proxy Server ───────────────────────
// Avvia con: node proxy-server.js
// Gira su http://localhost:3001

const http  = require('http')
const https = require('https')

const PORT = 3001

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body)

      // ── Google Places endpoint ─────────────────────────────
      if (req.url === '/places') {
        const { query, key } = parsed
        if (!key) { res.writeHead(400); res.end(JSON.stringify({error:'No key'})); return }
        callGooglePlaces(query, key, res)
        return
      }

      // ── AI endpoint (default) ──────────────────────────────
      const { prompt, key } = parsed
      if (!key) { res.writeHead(400); res.end(JSON.stringify({error:'No key'})); return }

      // Detect key type
      if (key.startsWith('sk-')) {
        // OpenAI
        callOpenAI(prompt, key, res)
      } else {
        // Gemini (AQ. or AIzaSy)
        callGemini(prompt, key, res)
      }
    } catch(e) {
      res.writeHead(400); res.end(JSON.stringify({error: e.message}))
    }
  })
})

function callOpenAI(prompt, key, res) {
  const postData = JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  })

  console.log(`[proxy] OpenAI request — prompt: ${prompt.length} chars, key: ${key.slice(0,8)}...`)

  const options = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    timeout: 25000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'Content-Length': Buffer.byteLength(postData),
    }
  }

  const proxyReq = https.request(options, proxyRes => {
    let data = ''
    proxyRes.on('data', chunk => data += chunk)
    proxyRes.on('end', () => {
      console.log(`[proxy] OpenAI response — HTTP ${proxyRes.statusCode}, body: ${data.slice(0,120)}`)
      // Convert OpenAI response to Gemini-compatible format
      try {
        const openaiResp = JSON.parse(data)
        const text = openaiResp.choices?.[0]?.message?.content || ''
        // Return in Gemini format so app code doesnt need to change
        const geminiFormat = {
          candidates: [{ content: { parts: [{ text }] } }]
        }
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(geminiFormat))
      } catch(e) {
        res.writeHead(500); res.end(data)
      }
    })
  })

  proxyReq.on('timeout', () => {
    console.error('[proxy] OpenAI timeout after 55s')
    proxyReq.destroy()
    res.writeHead(504); res.end(JSON.stringify({error:'OpenAI API timeout'}))
  })
  proxyReq.on('error', e => {
    console.error('[proxy] OpenAI error:', e.message)
    res.writeHead(500); res.end(JSON.stringify({error: e.message}))
  })
  proxyReq.write(postData)
  proxyReq.end()
}

function callGemini(prompt, key, res) {
  const postData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
  })

  const isOAuth = key.startsWith('AQ.') || key.startsWith('ya29.')
  const path = isOAuth
    ? '/v1beta/models/gemini-1.5-flash:generateContent'
    : `/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`

  console.log(`[proxy] Gemini request — prompt: ${prompt.length} chars, key: ${key.slice(0,8)}...`)

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path,
    method: 'POST',
    timeout: 55000, // 55s
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      ...(isOAuth ? { 'Authorization': `Bearer ${key}` } : {})
    }
  }

  const proxyReq = https.request(options, proxyRes => {
    let data = ''
    proxyRes.on('data', chunk => data += chunk)
    proxyRes.on('end', () => {
      console.log(`[proxy] Gemini response — HTTP ${proxyRes.statusCode}, body: ${data.slice(0,120)}`)
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' })
      res.end(data)
    })
  })

  proxyReq.on('timeout', () => {
    console.error('[proxy] Gemini timeout after 25s')
    proxyReq.destroy()
    res.writeHead(504); res.end(JSON.stringify({error:'Gemini API timeout'}))
  })
  proxyReq.on('error', e => {
    console.error('[proxy] Gemini error:', e.message)
    res.writeHead(500); res.end(JSON.stringify({error: e.message}))
  })
  proxyReq.write(postData)
  proxyReq.end()
}

function callGooglePlaces(query, key, res) {
  const path = `/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}&language=it&region=it`
  const options = {
    hostname: 'maps.googleapis.com',
    path,
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  }

  const proxyReq = https.request(options, proxyRes => {
    let data = ''
    proxyRes.on('data', chunk => data += chunk)
    proxyRes.on('end', () => {
      try {
        const json = JSON.parse(data)
        if (json.status !== 'OK' || !json.results?.length) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ city: null, address: null }))
          return
        }
        // Extract city from address_components
        const components = json.results[0].address_components || []
        const address    = json.results[0].formatted_address || null
        const placeId    = json.results[0].place_id || null

        // Try component types in order of preference
        const typePriority = ['locality','sublocality_level_1','sublocality','administrative_area_level_3','administrative_area_level_2']
        let city = null
        for (const type of typePriority) {
          const comp = components.find(c => c.types.includes(type))
          if (comp?.long_name && !/provin|district|città metropolit/i.test(comp.long_name)) {
            city = comp.long_name
            break
          }
        }

        // Fallback: extract city from formatted_address string
        // Italian: "22100 Como CO" — 5-digit CAP + city + 2-letter province
        // Swiss:   "6855 Stabio, Svizzera" — 4-digit CAP + city + comma
        if (!city && address) {
          // Italian format: NNNNN City XY (2-letter province, end or comma follows)
          let m = address.match(/\b(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)\s+([A-Z]{2})(?=[,\s]|$)/)
          if (m) {
            city = m[2].trim()
          } else {
            // Swiss/other: NNNN City, Country
            m = address.match(/\b(\d{4})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)(?=\s*,|\s*$)/)
            if (m) city = m[2].trim()
          }
        }

        console.log(`[places] query="${query}" → city="${city}" address="${address}"`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ city, address, placeId }))
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
      }
    })
  })

  proxyReq.on('error', e => { res.writeHead(500); res.end(JSON.stringify({ error: e.message })) })
  proxyReq.end()
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ AI Proxy running on http://localhost:${PORT}`)
  console.log(`  Supports: OpenAI (sk-...) and Gemini (AIzaSy... / AQ.)`)
  console.log(`  App: http://localhost:3002`)
  console.log(`  Premi Ctrl+C per fermare`)
})
