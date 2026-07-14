// ── Icone brand ricreate (Satispay, PayPal) ──────────────────────────────────
// Usate al posto delle emoji generiche 💚/💙 sia in sidebar (SidebarNav.jsx)
// sia negli header delle rispettive pagine, su richiesta esplicita dell'utente
// ("solo simbolo, non la scritta"). Non sono asset ufficiali del brand — sono
// una ricreazione vettoriale semplificata (l'immagine originale allegata
// dall'utente non è risultata accessibile come file nella sandbox).

export function SatispayIcon({ size = 15, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style}>
      <polygon points="12,2 22,12 12,22 2,12" fill="#FF4438"/>
      <polygon points="12,2 22,12 12,12" fill="#FF7A6E"/>
    </svg>
  )
}

export function PaypalIcon({ size = 15, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style}>
      <text x="4" y="19" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="21" fill="#1F2670">P</text>
      <text x="7.5" y="20" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="21" fill="#139AD6">P</text>
    </svg>
  )
}
