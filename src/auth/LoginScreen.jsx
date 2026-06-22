import { useState, useRef, useEffect } from 'react'
import { useAuth } from './AuthContext'
import './LoginScreen.css'

export const APP_VERSION = '3.5.1'
export const BUILD_TIME  = '20/06 17:30'

// ── PIN digit input ───────────────────────────────────────
function CodeInput({ onComplete, disabled, error, onReset }) {
  const [digits, setDigits] = useState(['','','','','',''])
  const refs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()]

  useEffect(() => { refs[0].current?.focus() }, [])
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
  }

  return (
    <div className="code-wrap">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          className={`code-digit${error ? ' error' : ''}`}
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
  )
}

// ── Google login step ─────────────────────────────────────
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

// ── PIN step ──────────────────────────────────────────────
const VALID_PINS = ['182218', '000000']

function PinStep() {
  const { completeLogin } = useAuth()
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleComplete(pin) {
    if (!VALID_PINS.includes(pin)) { setError('PIN errato'); return }
    setError(null); setLoading(true)
    try { await completeLogin('full') }
    catch(e) { setError(e.message); setLoading(false) }
  }

  return (
    <div className="login-card">
      <div className="login-icon">🔐</div>
      <h2 className="login-title">Codice di sicurezza</h2>
      <p className="login-sub">Inserisci il PIN a 6 cifre</p>
      <CodeInput onComplete={handleComplete} disabled={loading} error={error} onReset={() => setError(null)}/>
      {error && (
        <div className="code-error">
          {error}
          <button className="code-retry" onClick={() => setError(null)}>Riprova</button>
        </div>
      )}
      <p className="login-hint">Codice demo: <code>000000</code></p>
      <div style={{marginTop:24,paddingTop:16,borderTop:'1px solid rgba(255,255,255,0.1)',textAlign:'center'}}>
        <div style={{fontSize:12,color:'rgba(255,255,255,0.35)',fontWeight:500,letterSpacing:'.04em'}}>
          Family Money Tracker
        </div>
        <div style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:4,padding:'3px 10px',borderRadius:20,border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.06)'}}>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.5)',fontFamily:'var(--font-mono)'}}>v{APP_VERSION}</span>
          <span style={{fontSize:9,color:'rgba(255,255,255,0.2)'}}>·</span>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{BUILD_TIME}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main LoginScreen ──────────────────────────────────────
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
      {authStep === 'google' && <GoogleStep/>}
      {authStep === 'pin'    && <PinStep/>}
    </div>
  )
}
