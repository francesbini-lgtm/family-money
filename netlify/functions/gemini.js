// Netlify Function — proxy per Gemini e OpenAI
// Sostituisce il proxy locale (proxy-server.js porta 3001)

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

  let prompt, key
  try {
    ;({ prompt, key } = JSON.parse(event.body))
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No key' }) }

  try {
    const result = key.startsWith('sk-') ? await callOpenAI(prompt, key) : await callGemini(prompt, key)
    return { statusCode: 200, headers, body: JSON.stringify(result) }
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }
  }
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
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const r = JSON.parse(data)
          const text = r.choices?.[0]?.message?.content || ''
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
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}
