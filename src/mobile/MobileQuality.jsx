import { useMemo } from 'react'
import { useStore } from '../store/useStore'

/* ─── small inline stat ─── */
function MiniStat({ label, value, warn, neutral }) {
  const isProb = warn && value > 0
  const col = neutral ? 'var(--text2)'
            : isProb  ? 'var(--red, #ef4444)'
            : warn     ? 'var(--green, #22c55e)'
            : 'var(--text)'
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '11px 14px',
      background: 'var(--surface)',
      border: `1px solid ${isProb ? 'rgba(220,50,50,.25)' : 'var(--border)'}`,
      borderRadius: 10,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: col }}>
        {value}
        {warn && value === 0 && <span style={{ fontSize: 12, marginLeft: 5 }}>✅</span>}
      </span>
    </div>
  )
}

/* ─── Split stat (two values in one row) ─── */
function SplitStat({ icon, label, leftLabel, leftVal, rightLabel, rightVal }) {
  const anyProb = leftVal > 0 || rightVal > 0
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${anyProb ? 'rgba(220,50,50,.25)' : 'var(--border)'}`,
      borderRadius: 10, padding: '11px 14px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
        {icon} {label}
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ flex: 1, borderRight: '1px solid var(--border)', paddingRight: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
            {leftLabel}
          </div>
          <div style={{
            fontSize: 20, fontWeight: 800,
            color: leftVal > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)',
          }}>
            {leftVal}{leftVal === 0 && <span style={{ fontSize: 11, marginLeft: 4 }}>✅</span>}
          </div>
        </div>
        <div style={{ flex: 1, paddingLeft: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
            {rightLabel}
          </div>
          <div style={{
            fontSize: 20, fontWeight: 800,
            color: rightVal > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)',
          }}>
            {rightVal}{rightVal === 0 && <span style={{ fontSize: 11, marginLeft: 4 }}>✅</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Accuracy ring (small) ─── */
function Ring({ pct }) {
  const r = 38
  const circ = 2 * Math.PI * r
  const color = pct >= 90 ? 'var(--green, #22c55e)'
              : pct >= 70 ? 'var(--gold, #f59e0b)'
              : 'var(--red, #ef4444)'
  return (
    <svg width={90} height={90} viewBox="0 0 90 90">
      <circle cx={45} cy={45} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
      <circle cx={45} cy={45} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ transition: 'stroke-dashoffset .6s ease' }}
      />
      <text x={45} y={50} textAnchor="middle"
        style={{ fontSize: 14, fontWeight: 800, fill: color, fontFamily: 'var(--font-sans)' }}>
        {pct.toFixed(1)}%
      </text>
    </svg>
  )
}

/* ─── Section header ─── */
function SectionHead({ title }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '.08em', color: 'var(--text3)',
      padding: '16px 0 6px',
    }}>
      {title}
    </div>
  )
}

/* ─── Main component ─── */
export default function MobileQuality() {
  const transactions = useStore(s => s.transactions)
  const aiRules      = useStore(s => s.aiRules)
  const appPrefs     = useStore(s => s.appPrefs)

  const nicknames = useMemo(() => {
    const nicks = []
    if (appPrefs?.ownerNickname) nicks.push(appPrefs.ownerNickname)
    ;(appPrefs?.family || []).forEach(m => { if (m.nickname) nicks.push(m.nickname) })
    return nicks.map(n => n.toLowerCase())
  }, [appPrefs])

  const stats = useMemo(() => {
    const txs = transactions.filter(t => !t.excluded && !t._forcedBalance)
    const total = txs.length
    const totalValue = txs.reduce((s, t) => s + Math.abs(t.amount || 0), 0)

    const noCat2     = txs.filter(t => !t.cat2)
    const altroAltro = txs.filter(t => t.cat1 === 'Altro' && t.cat2 === 'Altro')
    const cardTxs    = txs.filter(t => t.card && t.card !== 'null' && t.card !== 'undefined')

    // Satispay
    const satiMatches = appPrefs?.satiMatches || {}
    const satiAddebitiNonAbb = Object.values(satiMatches).filter(m => m.status !== 'matched').length
    const matchedIncomeIds = new Set(
      Object.values(satiMatches)
        .filter(m => m.status === 'matched' && m.incomeTxId)
        .map(m => m.incomeTxId)
    )
    const satiAccreditiNonAbb = transactions.filter(t =>
      t.cat1 === 'Entrate' &&
      (t.cat2 || '').toLowerCase() === 'satispay' &&
      !matchedIncomeIds.has(t.txId)
    ).length

    // PayPal
    const paypalImports = appPrefs?.paypalImports || []
    const ppUnmatched   = paypalImports.filter(i => i.status === 'unmatched').length
    const ppPending     = paypalImports.filter(i => i.status === 'pending_approval').length

    // Altre Entrate non abbinate
    const compLinks = appPrefs?.compLinks || {}
    const EXCL_L2   = ['satispay', ...nicknames]
    const altreEntrateNonAbb = transactions.filter(t =>
      t.amount > 0 && !t._forcedBalance &&
      (t.cat1 === 'Entrate' || t.cat2 === 'Prestiti') &&
      !EXCL_L2.includes((t.cat2 || '').toLowerCase()) &&
      !compLinks[t.txId]
    ).length

    // Veicoli senza veicolo assegnato (excl. Carburante + Parcheggio)
    const vehTxVehicles = appPrefs?.vehTxVehicles || {}
    const VEH_EXCL = ['Carburante', 'Parcheggio']
    const veicNonAbb = txs.filter(t =>
      t.cat1 === 'Veicoli' &&
      !VEH_EXCL.includes(t.cat2) &&
      !vehTxVehicles[t.txId]
    ).length

    // Accuracy
    const problemSet = new Set([
      ...noCat2.map(t => t.txId),
      ...altroAltro.map(t => t.txId),
    ])
    const problemValue = txs
      .filter(t => problemSet.has(t.txId))
      .reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const accuracy = totalValue > 0
      ? ((totalValue - problemValue) / totalValue) * 100
      : 100

    const rules = aiRules || []
    return {
      total, noCat2: noCat2.length, altroAltro: altroAltro.length, cardTxs: cardTxs.length,
      satiAddebitiNonAbb, satiAccreditiNonAbb, ppUnmatched, ppPending,
      altreEntrateNonAbb, veicNonAbb,
      accuracy, problematic: problemSet.size,
      totalRules: rules.length, kingRules: rules.filter(r => r.isKing).length,
    }
  }, [transactions, aiRules, appPrefs, nicknames])

  const accLabel = stats.accuracy >= 90 ? 'Ottimo' : stats.accuracy >= 70 ? 'Da migliorare' : 'Critico'
  const accColor = stats.accuracy >= 90 ? 'var(--green, #22c55e)'
                 : stats.accuracy >= 70 ? 'var(--gold, #f59e0b)'
                 : 'var(--red, #ef4444)'

  return (
    <div style={{ padding: '12px 14px 80px' }}>

      {/* Accuracy hero */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '18px 16px', marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <Ring pct={stats.accuracy} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Accuracy Score</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
            Ponderato sul valore. Errori: senza L2 + Altro › Altro.
          </div>
          <div style={{
            marginTop: 10, display: 'inline-block',
            padding: '4px 10px', borderRadius: 6,
            background: `${accColor}20`,
            border: `1px solid ${accColor}`,
            fontSize: 11, fontWeight: 700, color: accColor,
          }}>
            {accLabel}
          </div>
        </div>
      </div>

      {/* Quick totals row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {[
          { l: 'Totali',   v: stats.total,                       c: 'var(--accent)' },
          { l: 'Accurate', v: stats.total - stats.problematic,   c: 'var(--green, #22c55e)' },
          { l: 'Problemi', v: stats.problematic,                 c: stats.problematic > 0 ? 'var(--red, #ef4444)' : 'var(--text3)' },
        ].map(({ l, v, c }) => (
          <div key={l} style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Categorizzazione */}
      <SectionHead title="Categorizzazione" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <MiniStat label="🏷️ Non cat. L2"    value={stats.noCat2}     warn />
        <MiniStat label="🔄 ALTRO › ALTRO"   value={stats.altroAltro} warn />
      </div>

      {/* Abbinamenti */}
      <SectionHead title="Abbinamenti" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SplitStat
          icon="💚" label="Satispay non abbinate"
          leftLabel="Addebiti" leftVal={stats.satiAddebitiNonAbb}
          rightLabel="Accrediti" rightVal={stats.satiAccreditiNonAbb}
        />
        <div>
          <MiniStat label="💙 PayPal non abbinate" value={stats.ppUnmatched} warn />
          {stats.ppPending > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', paddingLeft: 14, marginTop: 3 }}>
              + {stats.ppPending} in attesa approvazione
            </div>
          )}
        </div>
        <MiniStat label="💸 Altre Entrate non abbinate" value={stats.altreEntrateNonAbb} warn />
        <MiniStat label="🚗 Veicoli senza veicolo"      value={stats.veicNonAbb}          warn />
        <MiniStat label="💳 Carta di credito"            value={stats.cardTxs}             neutral />
      </div>

      {/* Regole */}
      <SectionHead title="Regole AI" />
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '14px 16px',
        display: 'flex',
      }}>
        {[
          { l: 'Totali',    v: stats.totalRules,                        c: 'var(--text)' },
          { l: '👑 King',   v: stats.kingRules,                         c: 'var(--gold, #f59e0b)' },
          { l: 'Standard',  v: stats.totalRules - stats.kingRules,      c: 'var(--text2)' },
        ].map(({ l, v, c }, i) => (
          <div key={l} style={{
            flex: 1, textAlign: 'center',
            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {stats.totalRules > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
            {((stats.kingRules / stats.totalRules) * 100).toFixed(0)}% king rules
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'var(--gold, #f59e0b)',
              width: `${(stats.kingRules / stats.totalRules) * 100}%`,
            }} />
          </div>
        </div>
      )}
    </div>
  )
}
