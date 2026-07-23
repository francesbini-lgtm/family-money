import { useState, useRef, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { generateSecret, validateToken, qrCodeUrl, formatSecret } from '../services/totp'
import { saveTotpSecret } from '../services/firestore'
import { getLastLogin, isBiometricSupported } from '../services/biometric'
import './LoginScreen.css'

export const APP_VERSION = '20260723-2100'
export const BUILD_TIME  = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '—'

// ── Digit input (6 boxes) ─────────────────────────────────────────────────────
function CodeInput({ onComplete, onSubmit, disabled, error, label, autoFocus: af = false }) {
  const [digits, setDigits] = useState(['','','','','',''])
  const refs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()]

  useEffect(() => { if (af) refs[0].current?.focus() }, [])
  useEffect(() => { if (error) { setDigits(['','','','','','']); refs[0].current?.focus() } }, [error])

  function handleChange(i, val) {
    const d = [...digits]
    d[i] = val.slice(-1)
    setDigits(d)
    if (val && i < 5) refs[i+1].current?.focus()
    if (d.every(x => x)) onComplete(d.join(''))
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs[i-1].current?.focus()
      const d = [...digits]; d[i-1] = ''; setDigits(d)
    }
    if (e.key === 'Enter') onSubmit?.()
  }

  return (
    <div>
      {label && <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginBottom:8, letterSpacing:'.05em', textTransform:'uppercase' }}>{label}</div>}
      <div className="code-wrap">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            className={'code-digit' + (error ? ' error' : '')}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            disabled={disabled}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Shared footer ─────────────────────────────────────────────────────────────
function VerifyFooter() {
  return (
    <div className="verify-footer">
      <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', fontWeight:500, letterSpacing:'.04em' }}>
        Family Money Tracker
      </div>
      <div className="verify-build">
        <span style={{ fontFamily:'var(--font-mono)' }}>v{APP_VERSION}</span>
        <span style={{ opacity:.4 }}>·</span>
        <span>{BUILD_TIME}</span>
      </div>
    </div>
  )
}

// ── Shared user row ───────────────────────────────────────────────────────────
function UserRow({ user, showLastLogin = true }) {
  const lastLogin = user ? getLastLogin(user.uid) : null
  return (
    <div className="verify-user-row">
      {user?.photoURL
        ? <img src={user.photoURL} className="verify-avatar" alt="" referrerPolicy="no-referrer"/>
        : <div className="verify-avatar-placeholder">{(user?.displayName || user?.email || '?')[0].toUpperCase()}</div>
      }
      <div>
        <div className="verify-name">{user?.displayName || user?.email}</div>
        <div className="verify-email">{user?.email}</div>
        {showLastLogin && lastLogin && (
          <div className="verify-last-login">Ultimo accesso: {lastLogin}</div>
        )}
      </div>
    </div>
  )
}

// ── Google login step ─────────────────────────────────────────────────────────
function GoogleStep() {
  const { signInWithGoogle, authError } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleGoogle() {
    setLoading(true); setError(null)
    try { await signInWithGoogle() }
    catch(e) { setError(e.message) }
    setLoading(false)
  }

  const displayError = authError || error

  return (
    <div className="login-card">
      <div className="login-gem">💎</div>
      <h2 className="login-title">Family Money</h2>
      <p className="login-sub">Il tuo tracker finanziario di famiglia</p>
      <button className="google-btn" onClick={handleGoogle} disabled={loading}>
        {loading ? '…' : (
          <>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Accedi con Google
          </>
        )}
      </button>
      {displayError && <p className="login-error">{displayError}</p>}
    </div>
  )
}

// ── Combined verify step: PIN + TOTP insieme, un solo tasto ──────────────────
function VerifyStep() {
  const { user, totpSecret, isMobile, verifyAndLogin } = useAuth()
  const [pin,     setPin]     = useState('')
  const [totp,    setTotp]    = useState('')
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  const needTotp  = false // TOTP temporaneamente disabilitato
  const canSubmit = pin.length === 6 && (!needTotp || totp.length === 6)

  async function handleSubmit() {
    if (!canSubmit || loading) return
    setError(null); setLoading(true)
    try {
      await verifyAndLogin(pin, totp)
    } catch(e) {
      setError(e.message)
      setPin(''); setTotp('')
    }
    setLoading(false)
  }

  return (
    <div className="login-card verify-card">
      <UserRow user={user}/>
      <div className="verify-divider"/>

      <CodeInput
        label="Codice accesso"
        onComplete={val => setPin(val)}
        onSubmit={handleSubmit}
        disabled={loading}
        error={error && !needTotp ? error : null}
        autoFocus
      />

      {needTotp && (
        <div style={{ marginTop: 20 }}>
          <CodeInput
            label="Codice Authenticator"
            onComplete={val => setTotp(val)}
            onSubmit={handleSubmit}
            disabled={loading}
            error={null}
          />
        </div>
      )}

      <button
        className="login-btn"
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        style={{ marginTop: 20 }}
      >
        {loading
          ? <span className="spinner" style={{width:16,height:16,borderWidth:2,display:'inline-block'}}/>
          : 'Accedi'}
      </button>

      {error && (
        <div className="code-error" style={{ marginTop: 10 }}>
          {error}
          <button className="code-retry" onClick={() => { setError(null); setPin(''); setTotp('') }}>
            Riprova
          </button>
        </div>
      )}

      <VerifyFooter/>
    </div>
  )
}

// ── Biometric (Face ID) step ──────────────────────────────────────────────────
function BiometricStep() {
  const { user, loginWithBiometric, fallbackToPin } = useAuth()
  const [status, setStatus] = useState('idle')
  const [error,  setError]  = useState(null)

  useEffect(() => { triggerBiometric() }, [])

  async function triggerBiometric() {
    setStatus('scanning'); setError(null)
    try {
      await loginWithBiometric()
    } catch(e) {
      setStatus('error')
      setError(e.message || 'Face ID non riuscito')
    }
  }

  return (
    <div className="login-card verify-card">
      <UserRow user={user}/>
      <div className="verify-divider"/>

      <div className="biometric-center">
        <button
          className={'biometric-icon' + (status === 'scanning' ? ' scanning' : status === 'error' ? ' error' : '')}
          onClick={triggerBiometric}
          title="Tocca per usare Face ID"
        >
          {status === 'error' ? '🔒' : '🔓'}
        </button>
        <div className="biometric-label">
          {status === 'scanning' ? 'Verifica in corso…' :
           status === 'error'    ? 'Tocca per riprovare' :
                                   'Face ID'}
        </div>
        {error && <div className="login-error" style={{ marginTop:8 }}>{error}</div>}
      </div>

      <button onClick={fallbackToPin} className="setup-link" style={{ marginTop:20 }}>
        Usa codice
      </button>

      <VerifyFooter/>
    </div>
  )
}

// ── Biometric setup offer (after first PIN login on mobile) ───────────────────
function BiometricSetupStep() {
  const { user, setupBiometricAndLogin, skipBiometricAndLogin } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleEnable() {
    setLoading(true)
    await setupBiometricAndLogin()
    setLoading(false)
  }

  async function handleSkip() {
    setLoading(true)
    await skipBiometricAndLogin()
    setLoading(false)
  }

  return (
    <div className="login-card verify-card">
      <UserRow user={user} showLastLogin={false}/>
      <div className="verify-divider"/>

      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:14 }}>🔓</div>
        <div style={{ fontSize:16, fontWeight:700, color:'#F0EDE9', marginBottom:8 }}>
          Abilita Face ID
        </div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.45)', lineHeight:1.6, marginBottom:22 }}>
          Accedi più velocemente la prossima volta.<br/>
          Il codice resta sempre disponibile.
        </div>
      </div>

      <button className="login-btn" onClick={handleEnable} disabled={loading}>
        {loading ? '…' : '🔓  Abilita Face ID'}
      </button>
      <button onClick={handleSkip} disabled={loading} className="setup-link" style={{ marginTop:14, display:'block', width:'100%', textAlign:'center' }}>
        Non ora
      </button>

      <VerifyFooter/>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { authStep, loading } = useAuth()

  if (loading) return (
    <div className="login-screen">
      <div className="login-loading">
        <div className="spinner"/>
        <div>Caricamento…</div>
      </div>
    </div>
  )

  return (
    <div className="login-screen">
      <div className="login-bg"/>
      {(authStep === 'google')                        && <GoogleStep/>}
      {(authStep === 'verify' || authStep === 'totp' || authStep === 'pin') && <VerifyStep/>}
      {authStep === 'biometric'                       && <BiometricStep/>}
      {authStep === 'biometric-setup'                 && <BiometricSetupStep/>}
    </div>
  )
}
