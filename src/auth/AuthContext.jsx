import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, gProvider } from '../firebase'
import { getOrCreateHousehold, loadTotpSecret } from '../services/firestore'
import { getInviteTokenFromUrl, acceptInvite } from '../services/invite'

const AuthContext = createContext(null)

// ── Whitelist: only these Google accounts can log in ──────────────────────────
const ALLOWED_EMAILS = [
  'francesco.bini@lastminute.com',
  'sofi.vergallo@gmail.com',
]

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [loading,     setLoading]     = useState(true)  // initial Firebase check
  const [totpSecret,  setTotpSecret]  = useState(null)  // cached after Google login
  const [authStep,    setAuthStep]    = useState('google') // 'google' | 'totp' | 'pin' | 'mode' | 'done'
  const [householdId, setHouseholdId] = useState(null)
  const [authError,   setAuthError]   = useState(null)

  // ── Detect returning user ─────────────────────────────
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
          // TOTP disabled — to re-enable: restore loadTotpSecret + setAuthStep('totp')
          setAuthStep('pin')
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

  // ── Google sign in ────────────────────────────────────
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
    // TOTP disabled — to re-enable: restore loadTotpSecret + setAuthStep('totp')
    setAuthStep('pin')
    return fbUser
  }

  // ── Complete login (after PIN) ────────────────────────
  async function completeLogin(mode) {
    if (!user) return
    // Check if joining via invite link
    const inviteToken = getInviteTokenFromUrl()
    let hhId
    if (inviteToken) {
      try {
        hhId = await acceptInvite(inviteToken, user.uid, user.displayName || user.email, user.email)
        // Clear the invite token from URL
        window.history.replaceState({}, '', window.location.pathname)
      } catch(e) {
        console.warn('Invite accept failed:', e.message)
        hhId = await getOrCreateHousehold(user.uid, user.displayName || user.email, user.email)
      }
    } else {
      hhId = await getOrCreateHousehold(user.uid, user.displayName || user.email, user.email)
    }
    setHouseholdId(hhId)
    setAuthStep('done')
    return { mode, householdId: hhId }
  }

  // ── Sign out ──────────────────────────────────────────
  async function logOut() {
    await signOut(auth)
    setUser(null)
    setTotpSecret(null)
    setHouseholdId(null)
    setAuthStep('google')
  }

  // ── TOTP setup complete ───────────────────────────────
  function onTotpSetupDone(secret) {
    setTotpSecret(secret)
    setAuthStep('pin')
  }

  // ── TOTP verified ─────────────────────────────────────
  function onTotpVerified() {
    setAuthStep('pin')
  }

  return (
    <AuthContext.Provider value={{
      user, loading, totpSecret, authStep, householdId, authError,
      signInWithGoogle, completeLogin, logOut,
      onTotpSetupDone, onTotpVerified,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
