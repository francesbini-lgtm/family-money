import { useState, useEffect } from 'react'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    let timer = null
    function handleOnline()  {
      setIsOnline(true)
      // Keep wasOffline true briefly so the "Connessione ripristinata" banner shows
      clearTimeout(timer)
      timer = setTimeout(() => setWasOffline(false), 3000)
    }
    function handleOffline() {
      clearTimeout(timer)
      setIsOnline(false)
      setWasOffline(true)
    }
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline, wasOffline }
}

// ── Banner component ──────────────────────────────────────
export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus()

  if (isOnline && !wasOffline) return null

  if (!isOnline) return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, zIndex:9998,
      background:'var(--red)', color:'#fff',
      textAlign:'center', padding:'8px 16px',
      fontSize:13, fontWeight:600,
      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
    }}>
      <span>⚠️</span>
      <span>Sei offline — le modifiche verranno sincronizzate al ripristino della connessione</span>
    </div>
  )

  // Was offline, now back online
  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, zIndex:9998,
      background:'var(--green)', color:'#fff',
      textAlign:'center', padding:'8px 16px',
      fontSize:13, fontWeight:600,
      animation:'slideDown .3s ease',
    }}>
      ✓ Connessione ripristinata — dati sincronizzati
    </div>
  )
}
