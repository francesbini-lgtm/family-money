import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, gProvider } from '../firebase'
import { getOrCreateHousehold, loadTotpSecret } from '../services/firestore'
import { getInviteTokenFromUrl, acceptInvite } from '../services/invite'
import { validateToken } from '../services/totp'
import {
  isBiometricSupported, hasBiometricRegistered,
  registerBiometric, authenticateBiometric,
  saveLastLogin,
} from '../services/biometric'

const AuthContext = createContext(null)

// ── Whitelist: only these Google accounts can log in ──────────────────────────
const ALLOWED_EMAILS = [
  'francesco.bini@lastminute.com',
  'frances.bini@gmail.com',
  'sofi.vergallo@gmail.com',
]

const VALID_PINS = ['182218', '000000']

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [totpSecret,  setTotpSecret]  = useState(null)
  const [authStep,    setAuthStep]    = useState('google')
  // 'google' | 'verify' | 'biometric' | 'biometric-setup' | 'done'
  const [householdId, setHouseholdId] = useState(null)
  const [authError,   setAuthError]   = useState(null)

  const isMobile = () => window.location.pathname.startsWith('/mobile')

  // ── Detect returning user ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        if (!ALLOWED_EMAILS.includes(fbUser.email)) {
          await signOut(auth)
          setAuthError(`Accesso negato: ${fbUser.email} non è autorizzato.`)
          setUser(null)
          setAuthStep('google')
        } else {
          setAuthError(null)
          setUser(fbUser)
          const secret = await loadTotpSecret(fbUser.uid)
          setTotpSecret(secret)
          _nextStep(fbUser, secret)
        }
      } else {
        setUser(null)
        setTotpSecret(null)
        setAuthStep('google')
      }
      setLoading(false)
    })
    return unsub
  }, [])

  function _nextStep(fbUser, secret) {
    const mobile = isMobile()
    if (mobile && isBiometricSupported() && hasBiometricRegistered(fbUser.uid)) {
      setAuthStep('biometric')
    } else {
      setAuthStep('verify')
    }
  }

  // ── Google sign in ────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    setAuthError(null)
    const result = await signInWithPopup(auth, gProvider)
    const fbUser = result.user
    if (!ALLOWED_EMAILS.includes(fbUser.email)) {
      await signOut(auth)
      setAuthError(`Accesso negato: ${fbUser.email} non è autorizzato.`)
      return null
    }
    setUser(fbUser)
    const secret = await loadTotpSecret(fbUser.uid)
    setTotpSecret(secret)
    _nextStep(fbUser, secret)
    return fbUser
  }

  // ── Combined PIN + TOTP verify ────────────────────────────────────────────
  async function verifyAndLogin(pin, totpCode) {
    if (!VALID_PINS.includes(pin)) throw new Error('PIN errato')

    // TOTP required on desktop when configured
    if (totpSecret && !isMobile()) {
      const ok = await validateToken(totpSecret, (totpCode || '').trim())
      if (!ok) throw new Error('Codice authenticator non valido')
    }

    // Offer biometric setup on mobile (first time)
    if (isMobile() && isBiometricSupported() && !hasBiometricRegistered(user?.uid)) {
      setAuthStep('biometric-setup')
      return
    }

    saveLastLogin(user?.uid)
    return _completeLogin()
  }

  // ── Biometric authenticate (existing credential) ──────────────────────────
  async function loginWithBiometric() {
    const ok = await authenticateBiometric(user?.uid)
    if (!ok) throw new Error('Biometria non riuscita')
    saveLastLogin(user?.uid)
    return _completeLogin()
  }

  // ── Biometric setup (after first PIN login on mobile) ────────────────────
  async function setupBiometricAndLogin() {
    await registerBiometric(user?.uid, user?.email, user?.displayName)
    saveLastLogin(user?.uid)
    return _completeLogin()
  }

  async function skipBiometricAndLogin() {
    saveLastLogin(user?.uid)
    return _completeLogin()
  }

  // ── Fallback: go back to verify from biometric screen ────────────────────
  function fallbackToPin() {
    setAuthStep('verify')
  }

  // ── Internal: finish auth ─────────────────────────────────────────────────
  async function _completeLogin() {
    if (!user) return
    const inviteToken = getInviteTokenFromUrl()
    let hhId
    if (inviteToken) {
      try {
        hhId = await acceptInvite(inviteToken, user.uid, user.displayName || user.email, user.email)
        window.history.replaceState({}, '', window.location.pathname)
      } catch (e) {
        console.warn('Invite accept failed:', e.message)
        hhId = await getOrCreateHousehold(user.uid, user.displayName || user.email, user.email)
      }
    } else {
      hhId = await getOrCreateHousehold(user.uid, user.displayName || user.email, user.email)
    }
    setHouseholdId(hhId)
    setAuthStep('done')
    return { householdId: hhId }
  }

  // ── Legacy completeLogin kept for SettingsPage etc. ───────────────────────
  async function completeLogin(mode) {
    return _completeLogin()
  }

  // ── Sign out ──────────────────────────────────────────────────────────────
  async function logOut() {
    await signOut(auth)
    setUser(null)
    setTotpSecret(null)
    setHouseholdId(null)
    setAuthStep('google')
  }

  // ── TOTP setup/remove (called from SettingsPage) ──────────────────────────
  function onTotpSetupDone(secret) {
    setTotpSecret(secret)
  }

  // ── Legacy TOTP verified (kept for compatibility) ─────────────────────────
  function onTotpVerified() {
    setAuthStep('verify')
  }

  return (
    <AuthContext.Provider value={{
      user, loading, totpSecret, authStep, householdId, authError,
      signInWithGoogle, completeLogin, logOut,
      onTotpSetupDone, onTotpVerified,
      verifyAndLogin, loginWithBiometric,
      setupBiometricAndLogin, skipBiometricAndLogin,
      fallbackToPin,
      isMobile: isMobile(),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
