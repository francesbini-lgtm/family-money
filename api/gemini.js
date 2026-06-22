// Vercel Serverless Function — proxy per Gemini e OpenAI
const https = require('https')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(404).json({})

  let prompt, key
  try {
    ;({ prompt, key } = req.body)
    if (!prompt && !key) {
      // fallback: parse raw body string
      const raw = await getRawBody(req)
      ;({ prompt, key } = JSON.parse(raw))
    }
  } catch(e) {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  if (!key) return res.status(400).json({ error: 'No key' })

  try {
    const result = key.startsWith('sk-') ? await callOpenAI(prompt, key) : await callGemini(prompt, key)
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

function callOpenAI(prompt, key) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    })
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Content-Length': Buffer.byteLength(postData),
      }
    }, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          const text = json.choices?.[0]?.message?.content || ''
          resolve({ candidates: [{ content: { parts: [{ text }] } }] })
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

function callGemini(prompt, key) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    })
    const isOAuth = key.startsWith('AQ.') || key.startsWith('ya29.')
    const path = isOAuth
      ? '/v1beta/models/gemini-1.5-flash:generateContent'
      : `/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(isOAuth ? { 'Authorization': `Bearer ${key}` } : {})
      }
    }, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try { resolve(JSON.parse(data)) } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}
