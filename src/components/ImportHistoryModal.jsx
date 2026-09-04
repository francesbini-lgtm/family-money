import { useStore } from '../store/useStore'
import { fmtIT } from '../utils/format'

// ── Storico degli import (appPrefs.importLog) ──────────────────────────────────
// Tabella con tutti gli import effettuati: data, tipo (Conto/Carte/PayPal), somma e
// numero transazioni, vecchio saldo, nuovo saldo post-import, tappo inserito a mano.
// Aperta dalla prima schermata dell'import (richiesta utente 2026-09).
const TYPE_META = {
  conto:  { label: '🏦 Conto',  color: 'var(--accent)' },
  carta:  { label: '💳 Carte',  color: 'var(--blue)' },
  paypal: { label: '🅿️ PayPal', color: 'var(--blue)' },
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso).slice(0, 16).replace('T', ' ')
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const eur = (n) => n == null ? '—' : `${n < 0 ? '−' : ''}€ ${fmtIT(Math.abs(n), 2)}`

export default function ImportHistoryModal({ onClose }) {
  const importLog = useStore(s => s.appPrefs?.importLog) || []

  const th = { padding: '9px 12px', fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase',
    color: 'var(--text3)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1, whiteSpace: 'nowrap' }
  const tdBase = { padding: '8px 12px', fontSize: 12.5, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
  const mono = { fontFamily: 'var(--font-mono)' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        width: 960, maxWidth: '96vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', padding: '22px 24px', position: 'relative' }}>
        <button onClick={onClose} title="Chiudi"
          style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)' }}>✕</button>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2, flexShrink: 0 }}>🕘 Storico import</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, flexShrink: 0 }}>
          Tutti gli import effettuati e come hanno modificato il saldo. {importLog.length} import registrati.
        </div>

        {importLog.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Nessun import registrato finora. Lo storico si popola dai prossimi import.
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Data</th>
                  <th style={{ ...th, textAlign: 'left' }}>Tipo</th>
                  <th style={{ ...th, textAlign: 'right' }}>Somma</th>
                  <th style={{ ...th, textAlign: 'right' }}>N. tx</th>
                  <th style={{ ...th, textAlign: 'right' }}>Vecchio saldo</th>
                  <th style={{ ...th, textAlign: 'right' }}>Nuovo saldo</th>
                  <th style={{ ...th, textAlign: 'right' }}>Tappo</th>
                </tr>
              </thead>
              <tbody>
                {importLog.map(r => {
                  const meta = TYPE_META[r.type] || { label: r.type, color: 'var(--text)' }
                  return (
                    <tr key={r.id}>
                      <td style={{ ...tdBase, ...mono, color: 'var(--text3)' }}>{fmtDateTime(r.at)}</td>
                      <td style={{ ...tdBase, fontWeight: 700, color: meta.color }}>
                        {meta.label}{r.card4 ? <span style={mono}> *{r.card4}</span> : ''}
                      </td>
                      <td style={{ ...tdBase, ...mono, textAlign: 'right', fontWeight: 700, color: (r.sum ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{eur(r.sum)}</td>
                      <td style={{ ...tdBase, ...mono, textAlign: 'right' }}>{r.count ?? '—'}</td>
                      <td style={{ ...tdBase, ...mono, textAlign: 'right', color: 'var(--text2)' }}>{eur(r.oldSaldo)}</td>
                      <td style={{ ...tdBase, ...mono, textAlign: 'right', fontWeight: 700 }}>{eur(r.newSaldo)}</td>
                      <td style={{ ...tdBase, ...mono, textAlign: 'right', color: r.tappo ? 'var(--gold)' : 'var(--text3)' }}>
                        {r.tappo ? eur(r.tappo) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, flexShrink: 0 }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 14, padding: '10px 24px', fontWeight: 700 }}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}
