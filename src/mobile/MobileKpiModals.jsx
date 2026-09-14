import { fmtIT } from '../utils/format'

// Popup di drill-down dei KPI overview mobile (richiesta utente 2026-09-14).

const MON = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const fmtK = n => Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${Math.round(n)}`

function Overlay({ title, onClose, children }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 4000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 560, height: '92vh',
        borderTopLeftRadius: 18, borderTopRightRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Entrate: split Fra / Sofi / Bonus per mese (o per anno se 5Y) ───────────────
export function EntrateBreakdownModal({ transactions, appPrefs, period, monthSet, onClose }) {
  const bonusMap = appPrefs?.bonusMap || {}
  const now = new Date(); const y = now.getFullYear()

  // Righe da mostrare: 5Y → 5 anni; FY.. → i 12 mesi di quell'anno; YTD → anno
  // corrente; 1M/2M/3M → ultimi 12 mesi. Le righe nel periodo di analisi (monthSet /
  // 5 anni) sono evidenziate, le altre attenuate.
  const isYear = period === '5Y'
  let rows
  if (isYear) {
    rows = Array.from({ length: 5 }, (_, i) => String(y - 4 + i))
  } else if (period.startsWith('FY')) {
    const fy = 2000 + parseInt(period.slice(2))
    rows = Array.from({ length: 12 }, (_, i) => `${fy}-${String(i + 1).padStart(2, '0')}`)
  } else if (period === 'YTD') {
    rows = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  } else {
    rows = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }

  const inKey = t => {
    const d = (t._effDate || t.competenza || t.date || '')
    return isYear ? d.slice(0, 4) : d.slice(0, 7)
  }
  const data = rows.map(key => {
    let fra = 0, fraB = 0, sofi = 0, sofiB = 0
    transactions.forEach(t => {
      if (t.excluded || t.amount <= 0) return
      if (inKey(t) !== key) return
      const b = bonusMap[t.txId]?.amt || 0
      if (t.cat2 === 'Fra')  { fra += (t.amount - b); fraB += b }
      else if (t.cat2 === 'Sofi') { sofi += (t.amount - b); sofiB += b }
    })
    const total = fra + fraB + sofi + sofiB
    const hi = isYear ? true : monthSet.has(key)
    const label = isYear ? key : `${MON[parseInt(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`
    return { key, label, fra, fraB, sofi, sofiB, total, hi }
  })
  const maxTotal = Math.max(1, ...data.map(d => d.total))

  const SEG = [
    ['fra', 'Fra', '#2a5c8a'], ['fraB', 'Fra bonus', '#7aa5c8'],
    ['sofi', 'Sofi', '#b5407e'], ['sofiB', 'Sofi bonus', '#e0a0c4'],
  ]

  return (
    <Overlay title="Entrate — Fra / Sofi / Bonus" onClose={onClose}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 14, fontSize: 11, color: 'var(--text3)' }}>
        {SEG.map(([, name, c]) => (
          <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: c, display: 'inline-block' }} />{name}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map(d => (
          <div key={d.key} style={{ opacity: d.hi ? 1 : 0.4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ fontWeight: d.hi ? 800 : 600, fontFamily: 'var(--font-mono,monospace)' }}>{d.label}</span>
              <span style={{ fontFamily: 'var(--font-mono,monospace)', color: 'var(--text3)' }}>€ {fmtK(d.total)}</span>
            </div>
            <div style={{ display: 'flex', height: 16, borderRadius: 5, overflow: 'hidden', background: 'var(--surface2)', width: `${(d.total / maxTotal) * 100}%`, minWidth: d.total > 0 ? 3 : 0 }}>
              {SEG.map(([k, , c]) => d[k] > 0 && (
                <div key={k} title={`${k}: €${fmtIT(Math.round(d[k]), 0)}`} style={{ width: `${(d[k] / d.total) * 100}%`, background: c }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Overlay>
  )
}

// ── Patrimonio: breakdown visuale attivi / passività ───────────────────────────
export function PatrimonioBreakdownModal({ nw, onClose }) {
  const { netWorth, totalAssets, totalLiabilities, assets = [], liabilities = [] } = nw || {}
  const maxRef = Math.max(1, totalAssets)
  const Row = ({ name, value, color, denom }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{name}</span>
        <span style={{ fontFamily: 'var(--font-mono,monospace)', fontWeight: 700 }}>
          € {fmtK(value)} <span style={{ color: 'var(--text3)', fontSize: 11 }}>· {denom > 0 ? Math.round(value / denom * 100) : 0}%</span>
        </span>
      </div>
      <div style={{ height: 12, borderRadius: 6, background: 'var(--surface2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / maxRef) * 100}%`, background: color, borderRadius: 6 }} />
      </div>
    </div>
  )
  return (
    <Overlay title="💎 Patrimonio Netto" onClose={onClose}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: netWorth >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono,monospace)' }}>
          {netWorth < 0 ? '−' : ''}€ {fmtK(Math.abs(netWorth))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
          Attivi € {fmtK(totalAssets)} − Passività € {fmtK(totalLiabilities)}
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--green)', marginBottom: 10 }}>Attivi</div>
      {assets.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Nessun attivo.</div>
        : assets.map(a => <Row key={a.name} name={a.name} value={a.value} color={a.color} denom={totalAssets} />)}

      {liabilities.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--red)', margin: '18px 0 10px' }}>Passività</div>
          {liabilities.map(l => <Row key={l.name} name={l.name} value={l.value} color={l.color} denom={totalAssets} />)}
        </>
      )}
    </Overlay>
  )
}
