import { useMemo } from 'react'
import { useStore } from '../store/useStore'

/* ─── formatters ────────────────────────────────────────────────── */
function fmtEur(v) {
  if (v === 0) return '€ 0'
  if (v >= 1000) return `€ ${(v / 1000).toFixed(1)}k`
  return `€ ${Math.round(v).toLocaleString('it-IT')}`
}

/* ─── KPI card ─────────────────────────────────────────────────── */
function KpiCard({ icon, label, count, euros, sub, warn, color, neutral }) {
  const isProb = warn && count > 0
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
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em',
        color: 'var(--text3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span>{icon}</span><span>{label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>n.</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: numCol, lineHeight: 1 }}>
            {count}
          </div>
        </div>
        <div style={{ flex: 1, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>valore</div>
          <div style={{
            fontSize: 16, fontWeight: 700,
            color: neutral ? 'var(--text2)' : isProb ? 'var(--red, #ef4444)' : 'var(--text2)',
            lineHeight: 1,
          }}>
            {fmtEur(euros)}
          </div>
        </div>
      </div>

      {warn && count === 0 && (
        <div style={{ fontSize: 11, color: 'var(--green, #22c55e)', marginTop: 6 }}>✅ OK</div>
      )}
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>{sub}</div>
      )}
    </div>
  )
}

/* ─── Split KPI card (Satispay) ─────────────────────────────────── */
function SplitKpiCard({ icon, label, leftLabel, leftCount, leftEuros, rightLabel, rightCount, rightEuros }) {
  const anyProb = leftCount > 0 || rightCount > 0
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${anyProb ? 'rgba(220,50,50,.3)' : 'var(--border)'}`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em',
        color: 'var(--text3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        {[
          { l: leftLabel,  cnt: leftCount,  eur: leftEuros },
          { l: rightLabel, cnt: rightCount, eur: rightEuros },
        ].map(({ l, cnt, eur }, i) => (
          <div key={l} style={{
            flex: 1,
            borderRight: i === 0 ? '1px solid var(--border)' : 'none',
            paddingRight: i === 0 ? 12 : 0,
            paddingLeft:  i === 1 ? 12 : 0,
          }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              {l}
            </div>
            <div style={{
              fontSize: 22, fontWeight: 800, lineHeight: 1,
              color: cnt > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)',
            }}>
              {cnt}
              {cnt === 0 && <span style={{ fontSize: 13, marginLeft: 4 }}>✅</span>}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginTop: 3 }}>
              {fmtEur(eur)}
            </div>
          </div>
        ))}
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

  const nicknames = useMemo(() => {
    const nicks = []
    if (appPrefs?.ownerNickname) nicks.push(appPrefs.ownerNickname)
    ;(appPrefs?.family || []).forEach(m => { if (m.nickname) nicks.push(m.nickname) })
    return nicks.map(n => n.toLowerCase())
  }, [appPrefs])

  const stats = useMemo(() => {
    const txMap = new Map(transactions.map(t => [t.txId, t]))
    const txs   = transactions.filter(t => !t.excluded && !t._forcedBalance)
    const total  = txs.length
    const totalValue = txs.reduce((s, t) => s + Math.abs(t.amount || 0), 0)

    // Non cat L2
    const noCat2List = txs.filter(t => !t.cat2 && t.cat1 !== 'Entrate')
    const noCat2Val  = noCat2List.reduce((s, t) => s + Math.abs(t.amount || 0), 0)

    // Altro > Altro
    const altroAltroList = txs.filter(t => t.cat1 === 'Altro' && t.cat2 === 'Altro')
    const altroAltroVal  = altroAltroList.reduce((s, t) => s + Math.abs(t.amount || 0), 0)

    // Carta di credito
    const cardList = txs.filter(t => t.card && t.card !== 'null' && t.card !== 'undefined')
    const cardVal  = cardList.reduce((s, t) => s + Math.abs(t.amount || 0), 0)

    // ── Satispay ──
    const satiMatches = appPrefs?.satiMatches || {}

    // Only count entries whose expense tx still exists — skips deleted txs and synthetic IDs (e.g. veh-*)
    const satiAddEntries = Object.entries(satiMatches).filter(([txId, m]) =>
      m.status !== 'matched' && txMap.has(txId)
    )
    const satiAddebitiCount = satiAddEntries.length
    const satiAddebitiVal   = satiAddEntries.reduce((s, [txId]) => {
      const t = txMap.get(txId)
      return s + (t ? Math.abs(t.amount || 0) : 0)
    }, 0)

    const matchedIncomeIds = new Set(
      Object.values(satiMatches)
        .filter(m => m.status === 'matched' && m.incomeTxId)
        .map(m => m.incomeTxId)
    )
    const satiAccList  = transactions.filter(t =>
      t.cat1 === 'Entrate' &&
      (t.cat2 || '').toLowerCase() === 'satispay' &&
      !matchedIncomeIds.has(t.txId)
    )
    const satiAccCount = satiAccList.length
    const satiAccVal   = satiAccList.reduce((s, t) => s + Math.abs(t.amount || 0), 0)

    // ── PayPal ──
    const paypalImports = appPrefs?.paypalImports || []
    const ppList    = paypalImports.filter(i => i.status === 'unmatched')
    const ppPending = paypalImports.filter(i => i.status === 'pending_approval').length
    const ppCount   = ppList.length
    const ppVal     = ppList.reduce((s, i) => s + Math.abs(i.amount || 0), 0)

    // ── Altre Entrate non abbinate ──
    const compLinks = appPrefs?.compLinks || {}
    const EXCL_L2   = ['satispay', ...nicknames]
    const aeList    = transactions.filter(t =>
      t.amount > 0 && !t._forcedBalance &&
      (t.cat1 === 'Entrate' || t.cat2 === 'Prestiti') &&
      !EXCL_L2.includes((t.cat2 || '').toLowerCase()) &&
      !compLinks[t.txId]
    )
    const aeCount = aeList.length
    const aeVal   = aeList.reduce((s, t) => s + (t.amount || 0), 0)

    // ── Veicoli senza veicolo assegnato ──
    const vehTxVehicles = appPrefs?.vehTxVehicles || {}
    const VEH_EXCL = ['Carburante', 'Parcheggio']
    const veicList  = txs.filter(t =>
      t.cat1 === 'Veicoli' && !VEH_EXCL.includes(t.cat2) && !vehTxVehicles[t.txId]
    )
    const veicCount = veicList.length
    const veicVal   = veicList.reduce((s, t) => s + Math.abs(t.amount || 0), 0)

    // ── Accuracy ──
    const problemSet = new Set([
      ...noCat2List.map(t => t.txId),
      ...altroAltroList.map(t => t.txId),
    ])
    const problemValue = txs
      .filter(t => problemSet.has(t.txId))
      .reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const accuracy = totalValue > 0
      ? ((totalValue - problemValue) / totalValue) * 100
      : 100

    const rules = aiRules || []

    return {
      total, totalValue,
      noCat2Count: noCat2List.length, noCat2Val,
      altroAltroCount: altroAltroList.length, altroAltroVal,
      cardCount: cardList.length, cardVal,
      satiAddebitiCount, satiAddebitiVal,
      satiAccCount, satiAccVal,
      ppCount, ppVal, ppPending,
      aeCount, aeVal,
      veicCount, veicVal,
      accuracy, problematic: problemSet.size,
      totalRules: rules.length, kingRules: rules.filter(r => r.isKing).length,
    }
  }, [transactions, aiRules, appPrefs, nicknames])

  const accColor = stats.accuracy >= 90 ? 'var(--green, #22c55e)'
                 : stats.accuracy >= 70 ? 'var(--gold, #f59e0b)'
                 : 'var(--red, #ef4444)'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
          📊 Dashboard
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
          Qualità dati · categorizzazione · abbinamenti
        </div>
      </div>

      {/* Accuracy hero */}
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
            <Stat label="Totali"        val={stats.total}                       sub={fmtEur(stats.totalValue)} />
            <Stat label="Accurate"      val={stats.total - stats.problematic}   color="var(--green, #22c55e)" />
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
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        <KpiCard icon="🔢" label="Transazioni totali"
          count={stats.total} euros={stats.totalValue} color="var(--accent)" />

        <KpiCard icon="🏷️" label="Non cat. L2"
          count={stats.noCat2Count} euros={stats.noCat2Val} warn />

        <KpiCard icon="🔄" label="ALTRO › ALTRO"
          count={stats.altroAltroCount} euros={stats.altroAltroVal} warn />

        <SplitKpiCard
          icon="💚" label="Satispay non abbinate"
          leftLabel="Addebiti" leftCount={stats.satiAddebitiCount} leftEuros={stats.satiAddebitiVal}
          rightLabel="Accrediti" rightCount={stats.satiAccCount} rightEuros={stats.satiAccVal}
        />

        <KpiCard icon="💙" label="PayPal non abbinate"
          count={stats.ppCount} euros={stats.ppVal}
          sub={stats.ppPending > 0 ? `+ ${stats.ppPending} in attesa` : null}
          warn />

        <KpiCard icon="💸" label="Altre Entrate non abbinate"
          count={stats.aeCount} euros={stats.aeVal} warn />

        <KpiCard icon="🚗" label="Veicoli senza veicolo assegnato"
          count={stats.veicCount} euros={stats.veicVal}
          sub="Excl. carburante e parcheggi"
          warn />

        <KpiCard icon="💳" label="Da carta di credito"
          count={stats.cardCount} euros={stats.cardVal}
          sub="Rendiconto carta (coming soon)"
          neutral />
      </div>

      {/* Rules */}
      <RulesBar total={stats.totalRules} king={stats.kingRules} />
    </div>
  )
}

function Stat({ label, val, sub, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text)' }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>}
    </div>
  )
}
