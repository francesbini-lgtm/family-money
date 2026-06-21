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
      const { prompt, key } = JSON.parse(body)
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
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 2048,
  })

  const options = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
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

  proxyReq.on('error', e => { res.writeHead(500); res.end(JSON.stringify({error: e.message})) })
  proxyReq.write(postData)
  proxyReq.end()
}

function callGemini(prompt, key, res) {
  const postData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
  })

  const isOAuth = key.startsWith('AQ.') || key.startsWith('ya29.')
  const path = isOAuth
    ? '/v1beta/models/gemini-1.5-flash:generateContent'
    : `/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path,
    method: 'POST',
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
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' })
      res.end(data)
    })
  })

  proxyReq.on('error', e => { res.writeHead(500); res.end(JSON.stringify({error: e.message})) })
  proxyReq.write(postData)
  proxyReq.end()
}

server.listen(PORT, () => {
  console.log(`✓ AI Proxy running on http://localhost:${PORT}`)
  console.log(`  Supports: OpenAI (sk-...) and Gemini (AIzaSy... / AQ.)`)
  console.log(`  App: http://localhost:3002`)
  console.log(`  Premi Ctrl+C per fermare`)
})
