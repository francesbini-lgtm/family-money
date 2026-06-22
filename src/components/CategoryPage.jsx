import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { useFinancials, ymLabel, getLast6Months, getYM } from '../hooks/useFinancials'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { CATS } from '../data/categories'
import './CategoryPage.css'
import { fmtIT } from '../utils/format'

// ── Small sparkline ───────────────────────────────────────
function Sparkline({ data, color }) {
  if (!data || !data.length) return null
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2}
          fill={`url(#sg-${color.replace('#','')})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Transaction row ───────────────────────────────────────
function TxRow({ tx, cat1Ctx, onCatChange }) {
  const hasSplits  = tx.splits && tx.splits.length > 0
  const isMixCat   = tx.cat1 === 'MIX' && tx.mixCats?.length > 0
  // For MIX transactions, show the split amount for this category context
  const displayAmt = isMixCat && cat1Ctx
    ? tx.mixCats.filter(sp=>sp.cat1===cat1Ctx).reduce((s,sp)=>s+(parseFloat(sp.amount)||0),0)
    : Math.abs(tx.amount)
  const isInc = tx.amount > 0

  return (
    <tr className="cat-tx-row">
      <td className="cat-tx-date">{(tx._effDate||tx.date).slice(5).replace('-','/')}</td>
      <td className="cat-tx-desc">
        <div className="cat-tx-ai">{tx.descAI || tx.description.slice(0,40)}</div>
        <div className="cat-tx-orig">{tx.description.slice(0,50)}</div>
        {hasSplits && (
          <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:3}}>
            {tx.splits.slice(0,5).map((s,i)=>(
              <span key={i} style={{fontSize:9,padding:'1px 5px',borderRadius:8,background:'var(--accent-l)',
                color:'var(--accent)',fontWeight:600,whiteSpace:'nowrap'}}>
                {s.cat1} › {s.cat2} €{fmtIT(s.amount,0)}
              </span>
            ))}
            {tx.splits.length > 5 && <span style={{fontSize:9,color:'var(--text3)'}}>+{tx.splits.length-5}</span>}
          </div>
        )}
        {isMixCat && (
          <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:3}}>
            {tx.mixCats.filter(sp=>sp.cat1===cat1Ctx).map((s,i)=>(
              <span key={i} style={{fontSize:9,padding:'1px 5px',borderRadius:8,
                background:'rgba(139,92,246,.12)',color:'#8b5cf6',fontWeight:600,whiteSpace:'nowrap'}}>
                ⊕ {s.cat2||s.cat1} €{fmtIT(s.amount,0)}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="cat-tx-sub">
        {hasSplits
          ? <span style={{fontSize:10,padding:'1px 5px',borderRadius:8,background:'var(--accent-l)',
              color:'var(--accent)',fontWeight:600}}>🔗 Satispay</span>
          : isMixCat
            ? <span style={{fontSize:10,padding:'1px 5px',borderRadius:8,
                background:'rgba(139,92,246,.12)',color:'#8b5cf6',fontWeight:600}}>⊕ Split</span>
            : (tx.cat2 || '—')}
      </td>
      <td className="cat-tx-acct">{tx.account}</td>
      <td className={'cat-tx-amt ' + (isInc ? 'inc' : 'exp')}>
        {isInc ? '+' : '−'}€ {fmtIT(displayAmt, 2)}
        {isMixCat && <span style={{fontSize:9,opacity:.5,marginLeft:2}}>/{fmtIT(Math.abs(tx.amount),0)}</span>}
      </td>
    </tr>
  )
}

// ── Sub-category breakdown ────────────────────────────────
function SubBreakdown({ txs, color, cat1Ctx }) {
  const breakdown = {}
  txs.forEach(t => {
    if (t.cat1 === 'MIX' && t.mixCats && cat1Ctx) {
      // Distribute each mix split into its sub-category
      t.mixCats.filter(sp=>sp.cat1===cat1Ctx).forEach(sp => {
        const k = sp.cat2 || 'Altro'
        breakdown[k] = (breakdown[k] || 0) + (parseFloat(sp.amount)||0)
      })
    } else {
      const k = t.cat2 || 'Altro'
      breakdown[k] = (breakdown[k] || 0) + Math.abs(t.amount)
    }
  })
  const items = Object.entries(breakdown)
    .sort((a,b) => b[1]-a[1])
    .slice(0,8)
  const total = items.reduce((s,[,v]) => s+v, 0)
  if (!items.length) return null
  return (
    <div className="sub-breakdown">
      {items.map(([name, val]) => (
        <div key={name} className="sub-row">
          <div className="sub-bar-wrap">
            <div className="sub-label">{name}</div>
            <div className="sub-bar">
              <div className="sub-bar-fill" style={{ width: (val/total*100)+'%', background: color }} />
            </div>
          </div>
          <div className="sub-amount">€ {fmtIT(val, 0)}</div>
        </div>
      ))}
    </div>
  )
}

// ── L2 Annual averages ────────────────────────────────────
function L2AnnualAverages({ catTxs, cat1Ctx, color, effectiveAmountFn }) {
  const now = new Date()
  // Last 12 full months (exclude current month)
  const last12 = []
  for (let i = 12; i >= 1; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
    last12.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  const txsIn12 = catTxs.filter(t => {
    const ym = ((t._effDate||t.date||'')).slice(0, 7)
    return last12.includes(ym) && effectiveAmountFn(t) < 0
  })

  // Aggregate by L2
  const byL2 = {}
  txsIn12.forEach(t => {
    let entries = []
    if (t.cat1 === 'MIX' && t.mixCats) {
      entries = t.mixCats.filter(sp => sp.cat1 === cat1Ctx).map(sp => ({
        key: sp.cat2 || 'Altro',
        amt: parseFloat(sp.amount) || 0,
      }))
    } else {
      entries = [{ key: t.cat2 || 'Altro', amt: Math.abs(t.amount) }]
    }
    entries.forEach(({ key, amt }) => {
      if (!byL2[key]) byL2[key] = { total: 0, months: new Set() }
      byL2[key].total += amt
      byL2[key].months.add(((t._effDate||t.date||'')).slice(0, 7))
    })
  })

  const rows = Object.entries(byL2)
    .map(([name, { total, months }]) => ({
      name,
      total:    Math.round(total),
      monthAvg: Math.round(total / 12),            // fixed /12 = true monthly avg on annual basis
      annualApprox: Math.round(total),
      months:   months.size,
    }))
    .sort((a, b) => b.total - a.total)

  if (!rows.length) return null

  const grandTotal = rows.reduce((s, r) => s + r.total, 0)

  return (
    <div className="card cat-l2-avg-card">
      <div className="card-title-row" style={{ marginBottom: 16 }}>
        <span className="card-title">📅 Medie mensili per voce</span>
        <span className="card-sub-label">Ultimi 12 mesi · escluso mese corrente</span>
      </div>
      <div className="cat-l2-avg-grid">
        {rows.map(r => {
          const pct = grandTotal > 0 ? r.total / grandTotal : 0
          return (
            <div key={r.name} className="cat-l2-avg-row">
              <div className="cat-l2-avg-left">
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:color, opacity: 0.5 + pct * 0.5, flexShrink:0 }}/>
                  <span className="cat-l2-avg-name">{r.name}</span>
                  {r.months < 6 && (
                    <span style={{ fontSize:9, color:'var(--text3)', padding:'1px 4px', background:'var(--surface2)', borderRadius:4 }}>
                      {r.months} mesi
                    </span>
                  )}
                </div>
                <div className="cat-l2-avg-bar-wrap">
                  <div className="cat-l2-avg-bar" style={{ width: `${Math.round(pct * 100)}%`, background: color }}/>
                </div>
              </div>
              <div className="cat-l2-avg-right">
                <div className="cat-l2-avg-monthly">€ {fmtIT(r.monthAvg, 0)}<span style={{fontSize:9,fontWeight:400,opacity:.6}}>/m</span></div>
                <div className="cat-l2-avg-annual">€ {fmtIT(r.annualApprox, 0)} / anno</div>
              </div>
            </div>
          )
        })}
        {/* Total row */}
        <div className="cat-l2-avg-row cat-l2-avg-total">
          <div className="cat-l2-avg-left">
            <span className="cat-l2-avg-name" style={{fontWeight:700}}>Totale {cat1Ctx}</span>
          </div>
          <div className="cat-l2-avg-right">
            <div className="cat-l2-avg-monthly" style={{color}}>
              € {fmtIT(Math.round(grandTotal / 12), 0)}<span style={{fontSize:9,fontWeight:400,opacity:.6}}>/m</span>
            </div>
            <div className="cat-l2-avg-annual">€ {fmtIT(grandTotal, 0)} / anno</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────
export default function CategoryPage({ cat1, icon, title, description }) {
  const transactions = useStore(s => s.transactions)
  const [period, setPeriod] = useState('month') // 'month' | '3m' | 'year'
  const [selectedBar, setSelectedBar] = useState(null)

  const catInfo = CATS[cat1] || { color: '#888', sub: [] }
  const color   = catInfo.color

  const now       = new Date()
  const thisYM    = getYM(now)
  const last6     = getLast6Months()

  // Filter transactions for this category (direct match OR via mixCats split)
  const catTxs = useMemo(() =>
    transactions.filter(t => {
      if (t.excluded) return false
      if (t.cat1 === cat1) return true
      // Include MIX transactions that have a split in this category
      if (t.cat1 === 'MIX' && t.mixCats?.some(sp => sp.cat1 === cat1)) return true
      return false
    }),
    [transactions, cat1]
  )

  // For a MIX tx, get the effective amount for this category
  function effectiveAmount(tx) {
    if (tx.cat1 === 'MIX' && tx.mixCats) {
      return tx.mixCats
        .filter(sp => sp.cat1 === cat1)
        .reduce((s,sp) => s + (parseFloat(sp.amount)||0), 0) * (tx.amount < 0 ? -1 : 1)
    }
    return tx.amount
  }

  // Period filter
  const periodTxs = useMemo(() => {
    if (period === 'month') return catTxs.filter(t => (t._effDate||t.date).startsWith(thisYM))
    if (period === '3m') {
      const cutoff = last6[3]
      return catTxs.filter(t => (t._effDate||t.date) >= cutoff)
    }
    return catTxs.filter(t => (t._effDate||t.date).startsWith(now.getFullYear().toString()))
  }, [catTxs, period])

  // Monthly chart data (use effectiveAmount for MIX transactions)
  const chartData = last6.map(ym => ({
    label: ymLabel(ym),
    ym,
    v: Math.abs(catTxs.filter(t => (t._effDate||t.date).startsWith(ym) && effectiveAmount(t) < 0)
               .reduce((s,t) => s+effectiveAmount(t), 0)),
  }))

  const total   = Math.abs(periodTxs.filter(t => effectiveAmount(t) < 0).reduce((s,t) => s+effectiveAmount(t), 0))
  const count   = periodTxs.filter(t => effectiveAmount(t) < 0).length
  const avg     = count > 0 ? total / count : 0
  const maxMonth = Math.max(...chartData.map(d => d.v), 0)
  const thisMonthTotal = chartData[chartData.length - 1]?.v || 0
  const prevMonthTotal = chartData[chartData.length - 2]?.v || 0
  const delta = prevMonthTotal > 0
    ? Math.round((thisMonthTotal - prevMonthTotal) / prevMonthTotal * 100)
    : null

  const isEmpty = catTxs.length === 0

  return (
    <div className="cat-page">
      {/* Header */}
      <div className="cat-header">
        <div className="cat-header-left">
          <div className="cat-icon-big" style={{ background: color+'18', color }}>
            {icon}
          </div>
          <div>
            <h1 className="cat-title">{title}</h1>
            {description && <div className="cat-desc">{description}</div>}
          </div>
        </div>
        <div className="period-tabs">
          {[['month','Mese'],['3m','3 Mesi'],['year','Anno']].map(([v,l]) => (
            <button
              key={v}
              className={'period-tab' + (period===v ? ' active' : '')}
              onClick={() => setPeriod(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <div className="cat-empty">
          <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nessuna transazione in {title}</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Le transazioni categorizzate come "{cat1}" appariranno qui.
          </div>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="cat-kpi-row">
            <div className="card cat-kpi">
              <div className="cat-kpi-label">Totale periodo</div>
              <div className="cat-kpi-value" style={{ color }}>
                € {fmtIT(total, 0)}
              </div>
              {delta !== null && period === 'month' && (
                <div className={'cat-kpi-delta ' + (delta > 0 ? 'up' : 'down')}>
                  {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}% vs mese scorso
                </div>
              )}
            </div>

            <div className="card cat-kpi">
              <div className="cat-kpi-label">N° transazioni</div>
              <div className="cat-kpi-value">{count}</div>
              <div className="cat-kpi-sub">nel periodo selezionato</div>
            </div>

            <div className="card cat-kpi">
              <div className="cat-kpi-label">Media per transazione</div>
              <div className="cat-kpi-value">€ {fmtIT(avg, 0)}</div>
              <div className="cat-kpi-sub">spesa media</div>
            </div>

            <div className="card cat-kpi">
              <div className="cat-kpi-label">Mese più alto</div>
              <div className="cat-kpi-value">€ {fmtIT(maxMonth, 0)}</div>
              <div className="cat-kpi-sub">ultimi 6 mesi</div>
            </div>
          </div>

          {/* Chart + breakdown */}
          <div className="cat-charts-row">
            <div className="card cat-chart-card">
              <div className="card-title-row" style={{ marginBottom: 16 }}>
                <span className="card-title">Andamento mensile</span>
                <span className="card-sub-label">Ultimi 6 mesi</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={50}
                    tickFormatter={v => v >= 1000 ? `€${(v/1000).toFixed(1)}K` : `€${v}`} />
                  <Tooltip
                    formatter={v => [`€ ${fmtIT(v, 0)}`, cat1]}
                    contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                  <Bar dataKey="v" name={cat1} radius={[4,4,0,0]}
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={(data) => setSelectedBar(selectedBar === data.ym ? null : data.ym)}
                  >
                    {chartData.map((d,i) => (
                      <Cell key={i}
                        fill={selectedBar === d.ym ? color : color+'aa'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {catInfo.sub.length > 0 && (
              <div className="card cat-chart-card">
                <div className="card-title-row" style={{ marginBottom: 16 }}>
                  <span className="card-title">{selectedBar ? `${ymLabel(selectedBar)} — dettaglio` : 'Per sottocategoria'}</span>
                  <span className="card-sub-label">{selectedBar ? 'Mese selezionato' : 'Periodo selezionato'}</span>
                </div>
                {selectedBar ? (
                  <SubBreakdown
                    txs={catTxs.filter(t => (t._effDate||t.date).startsWith(selectedBar) && effectiveAmount(t) < 0)}
                    color={color} cat1Ctx={cat1}
                  />
                ) : (
                  <SubBreakdown txs={periodTxs.filter(t => effectiveAmount(t) < 0)} color={color} cat1Ctx={cat1} />
                )}
              </div>
            )}
          </div>

          {/* L2 annual averages */}
          <L2AnnualAverages
            catTxs={catTxs}
            cat1Ctx={cat1}
            color={color}
            effectiveAmountFn={effectiveAmount}
          />

          {/* Transaction table */}
          <div className="card cat-table-wrap">
            <div className="card-title-row" style={{ marginBottom: 0, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <span className="card-title">Transazioni — {title}</span>
              <span className="card-sub-label">{periodTxs.length} nel periodo</span>
            </div>
            {periodTxs.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Nessuna transazione nel periodo selezionato
              </div>
            ) : (
              <table className="cat-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrizione</th>
                    <th>Sotto-cat</th>
                    <th>Conto</th>
                    <th style={{ textAlign: 'right' }}>Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {periodTxs.map(tx => <TxRow key={tx.txId} tx={tx} cat1Ctx={cat1} />)}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
