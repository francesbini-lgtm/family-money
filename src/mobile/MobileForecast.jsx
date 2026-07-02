import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { useFinancials } from '../hooks/useFinancials'
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { fmtIT } from '../utils/format'

const fmtK = n => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (a >= 1_000)     return `€${(n / 1_000).toFixed(0)}K`
  return `€${fmtIT(n, 0)}`
}

const HORIZONS = [
  { id: '1',  label: '1A',   years: 1  },
  { id: '2',  label: '2A',   years: 2  },
  { id: '5',  label: '5A',   years: 5  },
  { id: '10', label: '10A',  years: 10 },
  { id: '20', label: '20A',  years: 20 },
  { id: '30', label: '30A',  years: 30 },
]

const GROWTH     = 2   // salary growth %/y
const INFLATION  = 2   // expense growth %/y

function buildForecast(income, expense, years, startSav = 0) {
  const points = []
  let sav = startSav
  let inc = income
  let exp = expense
  const now = new Date()

  for (let y = 0; y <= years; y++) {
    // Push first (year 0 = current savings), then accumulate for the next year
    points.push({
      year:    String(now.getFullYear() + y),
      savings: Math.round(sav),
      monthly: Math.round(inc - exp),
      annInc:  Math.round(inc * 12),
      annExp:  Math.round(exp * 12),
    })
    sav += (inc - exp) * 12
    inc *= (1 + GROWTH / 100)
    exp *= (1 + INFLATION / 100)
  }
  return points
}

export default function MobileForecast() {
  const { thisIncome, thisExpense } = useFinancials()
  const transactions = useStore(s => s.transactions)
  const [horizon, setHorizon] = useState('10')

  const years = HORIZONS.find(h => h.id === horizon)?.years || 10

  // Current saldo as starting point
  const startSav = useMemo(() =>
    transactions.filter(t => !t.excluded).reduce((s, t) => s + t.amount, 0)
  , [transactions])

  const income  = Math.round(thisIncome)  || 5300
  const expense = Math.round(thisExpense) || 4200
  const monthly = income - expense

  const data = useMemo(() =>
    buildForecast(income, expense, years, startSav)
  , [income, expense, years, startSav])

  // Key milestone rows
  const tableData = useMemo(() => {
    const target = [1, 2, 5, 10, 20, 30].filter(y => y <= years + 1)
    return data.filter(d => target.includes(parseInt(d.year) - new Date().getFullYear()))
  }, [data, years])

  const chartData = data

  return (
    <div className="m-content">
      {/* Summary KPIs */}
      <div className="m-kpi-grid">
        <div className="m-kpi">
          <div className="m-kpi-label">Risparmio/Mese</div>
          <div className={'m-kpi-value ' + (monthly >= 0 ? 'green' : 'red')}>
            {monthly >= 0 ? '+' : '−'}{fmtK(Math.abs(monthly))}
          </div>
        </div>
        <div className="m-kpi">
          <div className="m-kpi-label">Tasso Risparmio</div>
          <div className="m-kpi-value blue">
            {income > 0 ? Math.round((income - expense) / income * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Horizon selector */}
      <div className="m-period-row">
        {HORIZONS.map(h => (
          <button key={h.id}
            className={'m-period-btn' + (horizon === h.id ? ' active' : '')}
            onClick={() => setHorizon(h.id)}>
            {h.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="m-card">
        <div className="m-card-header">Patrimonio Previsto</div>
        <div style={{ padding: '12px 4px 4px' }}>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="mfc-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text3)' }}
                axisLine={false} tickLine={false}
                interval={years <= 5 ? 0 : Math.floor(years / 5)} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false}
                width={48} tickFormatter={fmtK} />
              <Tooltip
                formatter={(v, n) => [fmtK(v), n === 'savings' ? 'Patrimonio' : 'Risparmio/Anno']}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }} />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="savings" stroke="var(--accent)" strokeWidth={2}
                fill="url(#mfc-grad)" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Projections table */}
      <div className="m-card">
        <div className="m-card-header">Proiezioni</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="m-fc-table">
            <thead>
              <tr>
                <th>Anno</th>
                <th>Patrimonio</th>
                <th>Risp/Mese</th>
                <th>Entrate/A</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((r, i) => (
                <tr key={r.year} className={i === tableData.length - 1 ? 'highlight' : ''}>
                  <td>{r.year}</td>
                  <td style={{ color: r.savings >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                    {fmtK(r.savings)}
                  </td>
                  <td style={{ color: r.monthly >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fmtK(r.monthly)}
                  </td>
                  <td>{fmtK(r.annInc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ padding: '12px 16px', fontSize: 10, color: 'var(--text3)', lineHeight: 1.5 }}>
        Proiezioni basate su reddito/spese medie attuali con crescita {GROWTH}% e inflazione {INFLATION}%/anno.
        Solo consultazione — per simulazioni personalizzate usa il Forecast sul desktop.
      </div>
    </div>
  )
}
