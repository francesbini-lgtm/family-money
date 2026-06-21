import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { CATS } from '../data/categories'
import { useFinancials } from '../hooks/useFinancials'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ComposedChart, Area, ReferenceLine,
} from 'recharts'
import { fmtIT } from '../utils/format'

const fmt  = n => '€ ' + fmtIT(Math.abs(n), 0)
const fmtK = n => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${n < 0 ? '-' : ''}€ ${fmtIT(a / 1_000_000, 1)}M`
  if (a >= 1_000)     return `${n < 0 ? '-' : ''}€ ${fmtIT(a / 1_000, 1)}K`
  return fmt(n)
}

const PERIOD_OPTS = [
  { id:'1M',  label:'1 Mese',   months: 1 },
  { id:'3M',  label:'3 Mesi',   months: 3 },
  { id:'1A',  label:'1 Anno',   months: 12 },
  { id:'5A',  label:'5 Anni',   months: 60 },
]
const HORIZONS = [
  { id:'1',  label:'1A',  years:1  },
  { id:'5',  label:'5A',  years:5  },
  { id:'10', label:'10A', years:10 },
  { id:'20', label:'20A', years:20 },
  { id:'30', label:'30A', years:30 },
]
const MON = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
const GROWTH = 2; const INFLATION = 2

function getMonthsList(n) {
  const out = []; const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function buildForecast(income, expense, years, startSav) {
  const pts = []; let sav = startSav, inc = income, exp = expense
  const now = new Date()
  for (let y = 0; y <= years; y++) {
    sav += (inc - exp) * 12
    pts.push({ year: String(now.getFullYear() + y), savings: Math.round(sav) })
    inc *= 1 + GROWTH / 100; exp *= 1 + INFLATION / 100
  }
  return pts
}

function PieLegend({ data, total }) {
  return (
    <div style={{ marginTop: 10 }}>
      {data.slice(0, 6).map(d => (
        <div key={d.name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:d.color, flexShrink:0 }}/>
          <div style={{ flex:1, fontSize:12, color:'var(--text2)', fontWeight:600, overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{d.name}</div>
          <div style={{ fontSize:12, fontFamily:'var(--font-mono,monospace)', color:'var(--text3)', flexShrink:0 }}>
            {fmtK(d.value)}
          </div>
          <div style={{ fontSize:10, color:'var(--text3)', width:30, textAlign:'right', flexShrink:0 }}>
            {total > 0 ? Math.round(d.value / total * 100) + '%' : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MobileOverview() {
  const [period,  setPeriod]  = useState('1M')
  const [horizon, setHorizon] = useState('10')
  const [fcOpen,  setFcOpen]  = useState(false)

  const transactions = useStore(s => s.transactions)
  const portfolios   = useStore(s => s.portfolios)
  const loans        = useStore(s => s.loans)
  const { thisIncome, thisExpense } = useFinancials()

  const periodCfg  = PERIOD_OPTS.find(p => p.id === period)
  const horizonYrs = HORIZONS.find(h => h.id === horizon)?.years || 10

  const stats = useMemo(() => {
    const n        = periodCfg.months
    const months   = getMonthsList(n)
    const fromDate = months[0]
    // include _forcedBalance tappo (same as TransactionsPage)
    const active   = transactions.filter(t => !t.excluded || t._forcedBalance)
    const inPeriod = transactions.filter(t => !t.excluded && ((t._effDate||t.date||'')) >= fromDate)

    const income  = inPeriod.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expense = Math.abs(inPeriod.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))

    // Running saldo — exactly as DashboardPage: sum of ALL active txs (including tappo)
    const saldo = active.reduce((s, t) => s + t.amount, 0)

    // Patrimonio = saldo + portfolios - loans
    const invTotal  = (portfolios || []).reduce((s, p) =>
      s + (p.positions || []).reduce((ps, pos) => ps + (pos.currentValue || pos.shares * pos.price || 0), 0), 0)
    const loanTotal = (loans || []).filter(l => l.active !== false)
      .reduce((s, l) => s + (l.residualBalance || l.amount || 0), 0)
    const netWorth = saldo + invTotal - loanTotal

    // Cat breakdown
    const catMap = {}
    inPeriod.filter(t => t.amount < 0).forEach(t => {
      const k = t.cat1 || 'Non Categorizzato'
      if (k !== 'Entrate') catMap[k] = (catMap[k] || 0) + Math.abs(t.amount)
    })
    const catData = Object.entries(catMap)
      .map(([name, value]) => ({ name, value, color: CATS[name]?.color || '#888' }))
      .sort((a, b) => b.value - a.value).slice(0, 8)

    // Monthly bars
    const monthBars = months.map(ym => {
      const mTxs = transactions.filter(t => !t.excluded && ((t._effDate||t.date||'')).startsWith(ym))
      return {
        label: MON[parseInt(ym.slice(5, 7)) - 1],
        entrate: mTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
        spese:   Math.abs(mTxs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
      }
    })

    return { income, expense, saldo, netWorth, catData, monthBars, balance: income - expense }
  }, [transactions, portfolios, loans, period])

  // Forecast data
  const income  = Math.round(thisIncome)  || 5300
  const expense = Math.round(thisExpense) || 4200
  const monthly = income - expense

  const fcData = useMemo(() =>
    buildForecast(income, expense, horizonYrs, stats.saldo)
  , [income, expense, horizonYrs, stats.saldo])

  const fcTable = useMemo(() => {
    const targets = [1, 2, 5, 10, 20, 30].filter(y => y <= horizonYrs)
    const now = new Date().getFullYear()
    return fcData.filter(d => targets.includes(parseInt(d.year) - now))
  }, [fcData, horizonYrs])

  const totalSpese = stats.catData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="m-content">
      {/* Period selector */}
      <div className="m-period-row">
        {PERIOD_OPTS.map(p => (
          <button key={p.id}
            className={'m-period-btn' + (period === p.id ? ' active' : '')}
            onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {/* KPI grid */}
      <div className="m-kpi-grid">
        <div className="m-kpi full">
          <div className="m-kpi-label">Patrimonio Netto</div>
          <div className={'m-kpi-value ' + (stats.netWorth >= 0 ? 'green' : 'red')}>
            {stats.netWorth >= 0 ? '+' : '−'}{fmtK(Math.abs(stats.netWorth))}
          </div>
          <div className="m-kpi-delta" style={{ color:'var(--text3)' }}>
            Saldo conti: {fmtK(stats.saldo)}
          </div>
        </div>
        <div className="m-kpi">
          <div className="m-kpi-label">Entrate</div>
          <div className="m-kpi-value green">{fmtK(stats.income)}</div>
          <div className="m-kpi-delta" style={{ color:'var(--text3)', fontSize:10 }}>{periodCfg.label}</div>
        </div>
        <div className="m-kpi">
          <div className="m-kpi-label">Spese</div>
          <div className="m-kpi-value red">{fmtK(stats.expense)}</div>
          <div className="m-kpi-delta"
            style={{ color: stats.balance >= 0 ? 'var(--green)' : 'var(--red)', fontSize:11 }}>
            {stats.balance >= 0 ? '▲' : '▼'} {fmtK(Math.abs(stats.balance))}
          </div>
        </div>
      </div>

      {/* Pie chart */}
      {stats.catData.length > 0 && (
        <div className="m-card">
          <div className="m-card-header">Distribuzione Spese</div>
          <div className="m-card-body">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={stats.catData} cx="50%" cy="50%"
                  innerRadius={45} outerRadius={72} paddingAngle={2} dataKey="value">
                  {stats.catData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={v => [`€ ${fmtIT(v, 0)}`, '']}
                  contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid var(--border)' }}/>
              </PieChart>
            </ResponsiveContainer>
            <PieLegend data={stats.catData} total={totalSpese} />
          </div>
        </div>
      )}

      {/* Monthly bars */}
      {periodCfg.months > 1 && stats.monthBars.length > 1 && (
        <div className="m-card">
          <div className="m-card-header">Entrate vs Spese</div>
          <div style={{ padding:'12px 4px 4px' }}>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={stats.monthBars} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="label" tick={{ fontSize:10, fill:'var(--text3)' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:10, fill:'var(--text3)' }} axisLine={false} tickLine={false} width={38}
                  tickFormatter={v => Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}K` : v}/>
                <Tooltip formatter={(v, n) => [`€ ${fmtIT(v, 0)}`, n === 'entrate' ? 'Entrate' : 'Spese']}
                  contentStyle={{ fontSize:11, borderRadius:8, border:'1px solid var(--border)' }}/>
                <Bar dataKey="entrate" fill="var(--green)" radius={[3,3,0,0]}/>
                <Bar dataKey="spese"   fill="var(--red)"   radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Forecast section ─────────────────────────────── */}
      <button
        onClick={() => setFcOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          width:'calc(100% - 28px)', margin:'10px 14px 0', padding:'12px 14px',
          background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14,
          cursor:'pointer', fontFamily:'var(--font-sans)', color:'var(--text1)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>📊</span>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontSize:14, fontWeight:700 }}>Forecast</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>
              Risparmio/mese: <strong style={{ color: monthly >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {monthly >= 0 ? '+' : ''}{fmtK(monthly)}
              </strong>
            </div>
          </div>
        </div>
        <span style={{ fontSize:18, color:'var(--text3)', transition:'transform .2s',
          display:'inline-block', transform: fcOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {fcOpen && (
        <>
          {/* Horizon selector */}
          <div className="m-period-row" style={{ paddingTop:8 }}>
            {HORIZONS.map(h => (
              <button key={h.id}
                className={'m-period-btn' + (horizon === h.id ? ' active' : '')}
                onClick={() => setHorizon(h.id)}>{h.label}</button>
            ))}
          </div>

          {/* Chart */}
          <div className="m-card">
            <div style={{ padding:'12px 4px 4px' }}>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={fcData} margin={{ top:4, right:8, bottom:0, left:0 }}>
                  <defs>
                    <linearGradient id="mfc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="year" tick={{ fontSize:10, fill:'var(--text3)' }}
                    axisLine={false} tickLine={false}
                    interval={horizonYrs <= 5 ? 0 : Math.floor(horizonYrs / 5)}/>
                  <YAxis tick={{ fontSize:10, fill:'var(--text3)' }} axisLine={false} tickLine={false}
                    width={46} tickFormatter={fmtK}/>
                  <Tooltip formatter={v => [fmtK(v), 'Patrimonio']}
                    contentStyle={{ fontSize:11, borderRadius:8, border:'1px solid var(--border)' }}/>
                  <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 2"/>
                  <Area type="monotone" dataKey="savings" stroke="var(--accent)" strokeWidth={2}
                    fill="url(#mfc)" dot={false}/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="m-card">
            <table className="m-fc-table">
              <thead>
                <tr>
                  <th>Anno</th>
                  <th>Patrimonio</th>
                  <th>Risparmio/Mese</th>
                </tr>
              </thead>
              <tbody>
                {fcTable.map((r, i) => {
                  const y = parseInt(r.year) - new Date().getFullYear()
                  let inc2 = income, exp2 = expense
                  for (let j = 0; j < y; j++) { inc2 *= 1 + GROWTH/100; exp2 *= 1 + INFLATION/100 }
                  const mon2 = Math.round(inc2 - exp2)
                  return (
                    <tr key={r.year} className={i === fcTable.length - 1 ? 'highlight' : ''}>
                      <td>{r.year}</td>
                      <td style={{ color: r.savings >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:700 }}>
                        {fmtK(r.savings)}
                      </td>
                      <td style={{ color: mon2 >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {mon2 >= 0 ? '+' : ''}{fmtK(mon2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ height:12 }}/>
    </div>
  )
}
