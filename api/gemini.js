// Vercel Serverless Function — proxy per Gemini e OpenAI
const https = require('https')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(404).json({})

  let prompt, key, images
  try {
    ;({ prompt, key, images } = req.body)
    if (!prompt && !key) {
      // fallback: parse raw body string
      const raw = await getRawBody(req)
      ;({ prompt, key, images } = JSON.parse(raw))
    }
  } catch(e) {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  if (!key) return res.status(400).json({ error: 'No key' })

  try {
    const result = key.startsWith('sk-') ? await callOpenAI(prompt, key, images) : await callGemini(prompt, key)
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

function callOpenAI(prompt, key, images) {
  return new Promise((resolve, reject) => {
    const hasImages = Array.isArray(images) && images.length > 0
    const model = hasImages ? 'gpt-4o' : 'gpt-4o-mini'
    const messageContent = hasImages
      ? [
          { type: 'text', text: prompt },
          ...images.map(b64 => ({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'high' }
          }))
        ]
      : prompt
    const postData = JSON.stringify({
      model,
      messages: [{ role: 'user', content: messageContent }],
      temperature: 0.1,
      max_tokens: hasImages ? 4096 : 1500,  // 1500 is plenty for any enrichBatch response
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
          if (r.statusCode >= 400) {
            // OpenAI returned an error — propagate the real message
            const msg = json?.error?.message || `OpenAI HTTP ${r.statusCode}`
            console.error('[gemini proxy] OpenAI error:', r.statusCode, msg)
            return reject(new Error(msg))
          }
          resolve(json)
        } catch(e) { reject(new Error(`OpenAI parse error (status ${r.statusCode}): ${data.slice(0,200)}`)) }
      })
    })
    req.setTimeout(9000, () => {
      req.destroy(new Error('OpenAI request timed out (9s)'))
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
    const model = 'gemini-2.0-flash'
    const path = isOAuth
      ? `/v1beta/models/${model}:generateContent`
      : `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
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
        try {
          const json = JSON.parse(data)
          if (r.statusCode >= 400) {
            // Gemini returned an error — propagate it clearly
            const msg = json?.error?.message || `Gemini HTTP ${r.statusCode}`
            return reject(new Error(msg))
          }
          resolve(json)
        } catch(e) {
          reject(new Error(`Gemini parse error (status ${r.statusCode}): ${data.slice(0,200)}`))
        }
      })
    })
    req.setTimeout(9000, () => {
      req.destroy(new Error('Gemini request timed out (9s)'))
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}
