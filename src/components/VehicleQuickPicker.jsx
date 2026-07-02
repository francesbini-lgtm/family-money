import { useStore } from '../store/useStore'

/**
 * VehicleQuickPicker — mostra pulsanti veicolo quando cat1 === 'Veicoli'.
 * Si auto-salva su appPrefs.vehTxVehicles[txId] al click.
 * Props: txId (string), cat1 (string)
 */
export default function VehicleQuickPicker({ txId, cat1 }) {
  const vehicles   = useStore(s => s.vehicles)
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)

  if (cat1 !== 'Veicoli') return null
  if (!vehicles?.length) return null

  const current = appPrefs?.vehTxVehicles?.[txId] || ''

  function pick(vehicleId) {
    const map = { ...(appPrefs?.vehTxVehicles || {}) }
    if (vehicleId && vehicleId !== current) {
      map[txId] = vehicleId
    } else {
      delete map[txId] // deseleziona se clicca lo stesso
    }
    setAppPref('vehTxVehicles', map)
  }

  return (
    <div style={{
      marginTop: 8,
      padding: '10px 14px',
      borderRadius: 10,
      background: 'rgba(59,130,246,.05)',
      border: '1px solid rgba(59,130,246,.18)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.07em',
        textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8,
      }}>
        🚗 Veicolo (opzionale)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {vehicles.map(v => {
          const isActive = current === v.id
          return (
            <button key={v.id} onClick={() => pick(v.id)}
              style={{
                padding: '5px 12px', borderRadius: 16, cursor: 'pointer',
                border: `1.5px solid ${isActive ? 'var(--blue)' : 'var(--border)'}`,
                background: isActive ? 'rgba(59,130,246,.12)' : 'var(--surface)',
                color: isActive ? 'var(--blue)' : 'var(--text2)',
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all .12s',
              }}>
              {v.icon && <span>{v.icon}</span>}
              <span>{v.name}</span>
              {isActive && <span style={{ fontSize: 10, opacity: .7 }}>✓</span>}
            </button>
          )
        })}
        {current && (
          <button onClick={() => pick(current)}
            style={{
              padding: '5px 10px', borderRadius: 16, cursor: 'pointer',
              border: '1px dashed rgba(200,50,50,.3)',
              background: 'none', color: 'var(--text3)',
              fontSize: 11, fontFamily: 'var(--font-sans)',
            }}>
            ✕ Nessuno
          </button>
        )}
      </div>
    </div>
  )
}
