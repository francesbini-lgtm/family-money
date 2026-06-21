// ── TOTP — implementazione inline, nessuna dipendenza CDN ─

function b32decode(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  s = s.toUpperCase().replace(/=+$/, '')
  let bits = 0, val = 0
  const out = []
  for (const ch of s) {
    val = (val << 5) | alpha.indexOf(ch)
    bits += 5
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 255) }
  }
  return new Uint8Array(out)
}

function b32encode(bytes) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, val = 0, out = ''
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8
    while (bits >= 5) { bits -= 5; out += alpha[(val >> bits) & 31] }
  }
  if (bits > 0) out += alpha[(val << (5 - bits)) & 31]
  return out
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes))
}

async function totpToken(secretB32, counter) {
  const key = b32decode(secretB32)
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c >>= 8 }
  const hmac = await hmacSha1(key, msg)
  const offset = hmac[19] & 0xf
  const code = (
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) <<  8) |
     (hmac[offset + 3] & 0xff)
  )
  return String(code % 1_000_000).padStart(6, '0')
}

// ── Public API ────────────────────────────────────────────
export function generateSecret() {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return b32encode(bytes)
}

export async function generateToken(secretB32) {
  const counter = Math.floor(Date.now() / 1000 / 30)
  return totpToken(secretB32, counter)
}

export async function validateToken(secretB32, token) {
  const counter = Math.floor(Date.now() / 1000 / 30)
  // Check current window ±1 (±30 seconds tolerance)
  for (const delta of [-1, 0, 1]) {
    const expected = await totpToken(secretB32, counter + delta)
    if (expected === token) return true
  }
  return false
}

export function qrCodeUrl(secretB32, email) {
  const label = encodeURIComponent(`FamilyMoney:${email}`)
  const uri = `otpauth://totp/${label}?secret=${secretB32}&issuer=FamilyMoney&algorithm=SHA1&digits=6&period=30`
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`
}

export function formatSecret(secretB32) {
  return secretB32.match(/.{1,4}/g)?.join(' ') || secretB32
}
