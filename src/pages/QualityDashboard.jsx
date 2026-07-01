import { useMemo } from 'react'
import { useStore } from '../store/useStore'

/* ─── KPI card ─────────────────────────────────────────────────── */
function KpiCard({ icon, label, value, sub, warn, color, neutral }) {
  const isProb = warn && value > 0
  const numCol = neutral
    ? 'var(--text2)'
    : isProb
      ? 'var(--red, #ef4444)'
      : warn
        ? 'var(--green, #22c55e)'
        : (color || 'var(--accent)')

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isProb ? 'rgba(220,50,50,.3)' : 'var(--border)'}`,
      borderRadius: 12, padding: '16px 18px',
    }}>
      <div style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em',
        color: 'var(--text3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: numCol, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>{sub}</div>
      )}
      {warn && value === 0 && (
        <div style={{ fontSize: 11, color: 'var(--green, #22c55e)', marginTop: 5 }}>✅ OK</div>
      )}
    </div>
  )
}

/* ─── Split KPI card (two values side by side) ──────────────────── */
function SplitKpiCard({ icon, label, leftLabel, leftValue, rightLabel, rightValue, warn }) {
  const anyProb = warn && (leftValue > 0 || rightValue > 0)
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${anyProb ? 'rgba(220,50,50,.3)' : 'var(--border)'}`,
      borderRadius: 12, padding: '16px 18px',
    }}>
      <div style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em',
        color: 'var(--text3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ flex: 1, borderRight: '1px solid var(--border)', paddingRight: 12 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            {leftLabel}
          </div>
          <div style={{
            fontSize: 26, fontWeight: 800,
            color: leftValue > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)',
          }}>
            {leftValue}
            {leftValue === 0 && <span style={{ fontSize: 14, marginLeft: 4 }}>✅</span>}
          </div>
        </div>
        <div style={{ flex: 1, paddingLeft: 12 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            {rightLabel}
          </div>
          <div style={{
            fontSize: 26, fontWeight: 800,
            color: rightValue > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)',
          }}>
            {rightValue}
            {rightValue === 0 && <span style={{ fontSize: 14, marginLeft: 4 }}>✅</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Accuracy ring ─────────────────────────────────────────────── */
function AccuracyRing({ pct }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const color = pct >= 90 ? 'var(--green, #22c55e)'
              : pct >= 70 ? 'var(--gold, #f59e0b)'
              : 'var(--red, #ef4444)'
  return (
    <svg width={120} height={120} viewBox="0 0 120 120">
      <circle cx={60} cy={60} r={r} fill="none" stroke="var(--border)" strokeWidth={10} />
      <circle cx={60} cy={60} r={r} fill="none"
        stroke={color} strokeWidth={10}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset .7s ease' }}
      />
      <text x={60} y={64} textAnchor="middle"
        style={{ fontSize: 18, fontWeight: 800, fill: color, fontFamily: 'var(--font-sans)' }}>
        {pct.toFixed(1)}%
      </text>
    </svg>
  )
}

/* ─── Rules bar ─────────────────────────────────────────────────── */
function RulesBar({ total, king }) {
  const kingPct = total > 0 ? (king / total) * 100 : 0
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 22px',
      display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text3)', marginBottom: 4 }}>
          Regole AI totali
        </div>
        <div style={{ fontSize: 30, fontWeight: 800 }}>{total}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text3)', marginBottom: 4 }}>
          👑 Di cui King
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--gold, #f59e0b)' }}>{king}</div>
      </div>
      {total > 0 && (
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            {kingPct.toFixed(0)}% king
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'var(--gold, #f59e0b)',
              width: `${kingPct}%`,
              transition: 'width .6s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function QualityDashboard() {
  const transactions = useStore(s => s.transactions)
  const aiRules      = useStore(s => s.aiRules)
  const appPrefs     = useStore(s => s.appPrefs)

  // nicknames used to exclude salary entries from Altre Entrate
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

    // Non cat L2 = every tx missing cat2 (includes both no-L1 and has-L1-but-no-L2)
    const noCat2 = txs.filter(t => !t.cat2)

    // Altro > Altro
    const altroAltro = txs.filter(t => t.cat1 === 'Altro' && t.cat2 === 'Altro')

    // Carta di credito (has card field)
    const cardTxs = txs.filter(t => t.card && t.card !== 'null' && t.card !== 'undefined')

    // ── Satispay ──
    const satiMatches = appPrefs?.satiMatches || {}

    // Addebiti non abbinati: expenses in satiMatches that are not matched
    const satiAddebitiNonAbb = Object.values(satiMatches).filter(m => m.status !== 'matched').length

    // Accrediti non abbinati: income txs (cat1=Entrate, cat2=SATISPAY) not referenced as matched incomeTxId
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

    // ── PayPal ──
    const paypalImports = appPrefs?.paypalImports || []
    const ppUnmatched = paypalImports.filter(i => i.status === 'unmatched').length
    const ppPending   = paypalImports.filter(i => i.status === 'pending_approval').length

    // ── Altre Entrate non abbinate ──
    const compLinks = appPrefs?.compLinks || {}
    const EXCL_L2   = ['satispay', ...nicknames]
    const altreEntrateNonAbb = transactions.filter(t =>
      t.amount > 0 &&
      !t._forcedBalance &&
      (t.cat1 === 'Entrate' || t.cat2 === 'Prestiti') &&
      !EXCL_L2.includes((t.cat2 || '').toLowerCase()) &&
      !compLinks[t.txId]
    ).length

    // ── Veicoli non abbinate (excl. Carburante + Parcheggio) ──
    const vehTxVehicles = appPrefs?.vehTxVehicles || {}
    const VEH_EXCL = ['Carburante', 'Parcheggio']
    const veicNonAbb = txs.filter(t =>
      t.cat1 === 'Veicoli' &&
      !VEH_EXCL.includes(t.cat2) &&
      !vehTxVehicles[t.txId]
    ).length

    // ── Accuracy: problematic = noCat2 ∪ altroAltro ──
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
      total,
      noCat2:               noCat2.length,
      altroAltro:           altroAltro.length,
      cardTxs:              cardTxs.length,
      satiAddebitiNonAbb,
      satiAccreditiNonAbb,
      ppUnmatched,
      ppPending,
      altreEntrateNonAbb,
      accuracy,
      problematic:          problemSet.size,
      veicNonAbb,
      totalRules:           rules.length,
      kingRules:            rules.filter(r => r.isKing).length,
    }
  }, [transactions, aiRules, appPrefs, nicknames])

  const accColor = stats.accuracy >= 90 ? 'var(--green, #22c55e)'
                 : stats.accuracy >= 70 ? 'var(--gold, #f59e0b)'
                 : 'var(--red, #ef4444)'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
          📊 Dashboard Qualità
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
          Stato della categorizzazione e completezza dei dati
        </div>
      </div>

      {/* Accuracy hero card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 36, flexWrap: 'wrap',
      }}>
        <AccuracyRing pct={stats.accuracy} />

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Accuracy Score</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.65, maxWidth: 440 }}>
            Rapporto ponderato sul valore transazione. Problematiche: senza L2 + Altro › Altro.
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Stat label="Totali"       val={stats.total} />
            <Stat label="Accurate"     val={stats.total - stats.problematic} color="var(--green, #22c55e)" />
            <Stat label="Problematiche" val={stats.problematic}
              color={stats.problematic > 0 ? 'var(--red, #ef4444)' : undefined} />
          </div>
        </div>

        <div style={{
          flexShrink: 0, textAlign: 'center',
          padding: '12px 20px', borderRadius: 10,
          background: stats.accuracy >= 90 ? 'rgba(34,197,94,.1)' : stats.accuracy >= 70 ? 'rgba(245,158,11,.1)' : 'rgba(239,68,68,.1)',
          border: `1px solid ${accColor}`,
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: accColor, fontWeight: 700 }}>
            {stats.accuracy >= 90 ? 'Ottimo' : stats.accuracy >= 70 ? 'Da migliorare' : 'Critico'}
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <KpiCard icon="🔢" label="Transazioni totali"
          value={stats.total} color="var(--accent)" />

        <KpiCard icon="🏷️" label="Non cat. L2"
          value={stats.noCat2} warn />

        <KpiCard icon="🔄" label="ALTRO › ALTRO"
          value={stats.altroAltro} warn />

        <SplitKpiCard
          icon="💚" label="Satispay non abbinate"
          leftLabel="Addebiti" leftValue={stats.satiAddebitiNonAbb}
          rightLabel="Accrediti" rightValue={stats.satiAccreditiNonAbb}
          warn
        />

        <KpiCard icon="💙" label="PayPal non abbinate"
          value={stats.ppUnmatched}
          sub={stats.ppPending > 0 ? `+ ${stats.ppPending} in attesa approvazione` : null}
          warn />

        <KpiCard icon="💸" label="Altre Entrate non abbinate"
          value={stats.altreEntrateNonAbb} warn />

        <KpiCard icon="🚗" label="Veicoli senza veicolo"
          value={stats.veicNonAbb}
          sub="Esclusi carburante e parcheggi"
          warn />

        <KpiCard icon="💳" label="Da carta di credito"
          value={stats.cardTxs}
          sub="Rendiconto carta (coming soon)"
          neutral />
      </div>

      {/* Rules section */}
      <RulesBar total={stats.totalRules} king={stats.kingRules} />
    </div>
  )
}

/* ─── inline stat helper ─── */
function Stat({ label, val, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text)' }}>
        {val}
      </div>
    </div>
  )
}
