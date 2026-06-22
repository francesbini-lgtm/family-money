// ── WebAuthn / Face ID helpers ─────────────────────────────────────────────

export function isBiometricSupported() {
  return (
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === 'function'
  )
}

export function hasBiometricRegistered(userId) {
  return !!localStorage.getItem(`biometric_${userId}`)
}

export async function registerBiometric(userId, userEmail, displayName) {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    // userId must be a BufferSource (max 64 bytes)
    const encoder = new TextEncoder()
    const userIdBytes = encoder.encode(userId).slice(0, 64)

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Family Money',
          id: window.location.hostname,
        },
        user: {
          id: userIdBytes,
          name: userEmail || userId,
          displayName: displayName || userEmail || 'Utente',
        },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    })

    if (!credential) return false
    const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)))
    localStorage.setItem(`biometric_${userId}`, credId)
    return true
  } catch (e) {
    console.warn('Biometric registration failed:', e.message)
    return false
  }
}

export async function authenticateBiometric(userId) {
  try {
    const credIdStr = localStorage.getItem(`biometric_${userId}`)
    if (!credIdStr) return false

    const credId = Uint8Array.from(atob(credIdStr), c => c.charCodeAt(0))
    const challenge = crypto.getRandomValues(new Uint8Array(32))

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: [{
          id: credId,
          type: 'public-key',
          transports: ['internal'],
        }],
      },
    })

    return !!assertion
  } catch (e) {
    console.warn('Biometric authentication failed:', e.message)
    return false
  }
}

export function clearBiometric(userId) {
  localStorage.removeItem(`biometric_${userId}`)
}

// ── Last login time ──────────────────────────────────────────────────────────

export function saveLastLogin(userId) {
  localStorage.setItem(`lastLogin_${userId}`, new Date().toISOString())
}

export function getLastLogin(userId) {
  const raw = localStorage.getItem(`lastLogin_${userId}`)
  if (!raw) return null
  try {
    const d = new Date(raw)
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return null
  }
}
