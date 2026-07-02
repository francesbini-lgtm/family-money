import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, Cell
} from 'recharts'
import { CATS } from '../data/categories'
import './UscitePage.css'

// ── Months ────────────────────────────────────────────────────────────────────
const MONTH_LABELS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function getLast6Months() {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const label = MONTH_LABELS[d.getMonth()]
    return { key, label, year: d.getFullYear(), month: d.getMonth() }
  })
}

// ── Category colors ───────────────────────────────────────────────────────────
function catColor(cat1) {
  return CATS[cat1]?.color || '#888888'
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtEur(n) {
  if (!n) return '—'
  return new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(n)
}
function fmtEurSmall(n) {
  if (!n || n < 1) return ''
  return new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(n)
}
function fmtDate(dateStr) {
  const m = (dateStr||'').match(/\d{4}-(\d{2})-(\d{2})/)
  if (!m) return dateStr || '—'
  return `${parseInt(m[2])} ${MONTH_LABELS[parseInt(m[1])-1]}`
}

// ── isComm ────────────────────────────────────────────────────────────────────
const isComm = t => t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'

// ── Custom tooltip for chart ──────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="uscite-tooltip">
      <div className="uscite-tooltip-title">{label}</div>
      <div className="uscite-tooltip-total">{fmtEur(total)}</div>
      <div className="uscite-tooltip-rows">
        {[...payload].reverse().map(p => p.value > 0 ? (
          <div key={p.dataKey} className="uscite-tooltip-row">
            <span className="uscite-tooltip-dot" style={{ background: p.fill }}/>
            <span className="uscite-tooltip-cat">{p.dataKey}</span>
            <span className="uscite-tooltip-val">{fmtEur(p.value)}</span>
          </div>
        ) : null)}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UscitePage() {
  const transactions = useStore(s => s.transactions)
  const months = useMemo(() => getLast6Months(), [])
  const [expandedCats, setExpandedCats] = useState(new Set())
  const [selected, setSelected] = useState(null) // { cat1, cat2|null, monthKey }

  // ── Filter expenses ───────────────────────────────────────────────────────
  const expenses = useMemo(() => transactions.filter(t =>
    !t.excluded &&
    t.amount < 0 &&
    !isComm(t) &&
    t.cat1 !== 'Entrate' &&
    t.cat1 !== 'Non Categorizzato' || (t.cat1 === 'Non Categorizzato' && !isComm(t) && t.amount < 0)
  ), [transactions])

  // ── Build data map: cat1 → monthKey → { total, l2Map, txs } ──────────────
  const dataMap = useMemo(() => {
    const monthKeys = new Set(months.map(m => m.key))
    const map = {}
    expenses.forEach(t => {
      const ym = (t._effDate || t.competenza || t.date || '').slice(0, 7)
      if (!monthKeys.has(ym)) return
      const cat1 = t.cat1 || 'Non Categorizzato'
      const cat2 = t.cat2 || '(altro)'
      const val = Math.abs(t.amount)

      if (!map[cat1]) map[cat1] = {}
      if (!map[cat1][ym]) map[cat1][ym] = { total: 0, l2: {}, txs: [] }
      map[cat1][ym].total += val
      map[cat1][ym].txs.push(t)

      if (!map[cat1][ym].l2[cat2]) map[cat1][ym].l2[cat2] = { total: 0, txs: [] }
      map[cat1][ym].l2[cat2].total += val
      map[cat1][ym].l2[cat2].txs.push(t)
    })
    return map
  }, [expenses, months])

  // ── L1 categories sorted by total spend (all months) ─────────────────────
  const cat1List = useMemo(() => {
    return Object.keys(dataMap).sort((a, b) => {
      const totalA = months.reduce((s, m) => s + (dataMap[a][m.key]?.total || 0), 0)
      const totalB = months.reduce((s, m) => s + (dataMap[b][m.key]?.total || 0), 0)
      return totalB - totalA
    })
  }, [dataMap, months])

  // ── Bar chart data ────────────────────────────────────────────────────────
  const chartData = useMemo(() => months.map(m => {
    const row = { month: m.label }
    cat1List.forEach(cat1 => {
      row[cat1] = Math.round((dataMap[cat1]?.[m.key]?.total || 0))
    })
    return row
  }), [months, cat1List, dataMap])

  // ── Detail panel transactions ─────────────────────────────────────────────
  const detailTxs = useMemo(() => {
    if (!selected) return []
    const { cat1, cat2, monthKey } = selected
    let txs
    if (cat2) {
      txs = dataMap[cat1]?.[monthKey]?.l2[cat2]?.txs || []
    } else {
      txs = dataMap[cat1]?.[monthKey]?.txs || []
    }
    return [...txs].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  }, [selected, dataMap])

  // ── Toggle expand ─────────────────────────────────────────────────────────
  function toggleCat(cat1) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(cat1) ? next.delete(cat1) : next.add(cat1)
      return next
    })
  }

  function selectCell(cat1, cat2, monthKey) {
    if (selected?.cat1 === cat1 && selected?.cat2 === cat2 && selected?.monthKey === monthKey) {
      setSelected(null)
    } else {
      setSelected({ cat1, cat2, monthKey })
    }
  }

  // ── Grand totals per month ────────────────────────────────────────────────
  const monthTotals = useMemo(() => {
    const totals = {}
    months.forEach(m => {
      totals[m.key] = cat1List.reduce((s, cat1) => s + (dataMap[cat1]?.[m.key]?.total || 0), 0)
    })
    return totals
  }, [months, cat1List, dataMap])

  // ── Row total (all months) for a cat1 ────────────────────────────────────
  function rowTotal(cat1, cat2=null) {
    return months.reduce((s, m) => {
      const base = cat2
        ? (dataMap[cat1]?.[m.key]?.l2[cat2]?.total || 0)
        : (dataMap[cat1]?.[m.key]?.total || 0)
      return s + base
    }, 0)
  }

  return (
    <div className="uscite-page">
      <div className="uscite-header">
        <h1 className="uscite-title">📉 Uscite</h1>
        <p className="uscite-subtitle">Ultimi 6 mesi per categoria di spesa</p>
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div className="uscite-chart-card">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            barCategoryGap="28%">
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text2)' }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              width={38}
            />
            <Tooltip content={<CustomTooltip/>} cursor={{ fill: 'rgba(255,255,255,.04)' }}/>
            {cat1List.map(cat1 => (
              <Bar key={cat1} dataKey={cat1} stackId="a"
                fill={catColor(cat1)} radius={cat1List.indexOf(cat1) === cat1List.length-1 ? [4,4,0,0] : [0,0,0,0]}/>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Table + Detail ─────────────────────────────────────────────────── */}
      <div className="uscite-body">
        {/* Table */}
        <div className="uscite-table-wrap">
          <table className="uscite-table">
            <thead>
              <tr>
                <th className="uscite-th-cat">Categoria</th>
                {months.map(m => (
                  <th key={m.key} className="uscite-th-month">{m.label}</th>
                ))}
                <th className="uscite-th-total">Totale</th>
              </tr>
            </thead>
            <tbody>
              {/* Grand total row */}
              <tr className="uscite-tr-grand">
                <td className="uscite-td-cat">Totale uscite</td>
                {months.map(m => (
                  <td key={m.key} className="uscite-td-val grand">
                    {monthTotals[m.key] > 0 ? fmtEurSmall(monthTotals[m.key]) : '—'}
                  </td>
                ))}
                <td className="uscite-td-val grand">
                  {fmtEurSmall(Object.values(monthTotals).reduce((s, v) => s + v, 0))}
                </td>
              </tr>

              {/* Category rows */}
              {cat1List.map(cat1 => {
                const expanded = expandedCats.has(cat1)
                const allL2 = new Set()
                months.forEach(m => {
                  Object.keys(dataMap[cat1]?.[m.key]?.l2 || {}).forEach(l2 => allL2.add(l2))
                })
                const l2List = [...allL2].sort((a, b) => rowTotal(cat1, b) - rowTotal(cat1, a))
                const hasL2 = l2List.length > 1 || (l2List.length === 1 && l2List[0] !== '(altro)')

                return [
                  /* L1 row */
                  <tr key={cat1} className={'uscite-tr-l1' + (expanded ? ' expanded' : '')}>
                    <td className="uscite-td-cat l1" onClick={() => hasL2 && toggleCat(cat1)}>
                      <span className="uscite-cat-dot" style={{ background: catColor(cat1) }}/>
                      <span className="uscite-cat-name">{cat1}</span>
                      {hasL2 && <span className="uscite-expand-icon">{expanded ? '▾' : '▸'}</span>}
                    </td>
                    {months.map(m => {
                      const val = dataMap[cat1]?.[m.key]?.total || 0
                      const isSelected = selected?.cat1 === cat1 && !selected?.cat2 && selected?.monthKey === m.key
                      return (
                        <td key={m.key}
                          className={'uscite-td-val l1' + (val > 0 ? ' clickable' : '') + (isSelected ? ' selected' : '')}
                          onClick={() => val > 0 && selectCell(cat1, null, m.key)}
                        >
                          {val > 0 ? fmtEurSmall(val) : '—'}
                        </td>
                      )
                    })}
                    <td className="uscite-td-val l1 row-total">{fmtEurSmall(rowTotal(cat1))}</td>
                  </tr>,

                  /* L2 rows (when expanded) */
                  ...(expanded ? l2List.map(cat2 => (
                    <tr key={`${cat1}/${cat2}`} className="uscite-tr-l2">
                      <td className="uscite-td-cat l2">
                        <span className="uscite-l2-label">{cat2}</span>
                      </td>
                      {months.map(m => {
                        const val = dataMap[cat1]?.[m.key]?.l2[cat2]?.total || 0
                        const isSelected = selected?.cat1 === cat1 && selected?.cat2 === cat2 && selected?.monthKey === m.key
                        return (
                          <td key={m.key}
                            className={'uscite-td-val l2' + (val > 0 ? ' clickable' : '') + (isSelected ? ' selected' : '')}
                            onClick={() => val > 0 && selectCell(cat1, cat2, m.key)}
                          >
                            {val > 0 ? fmtEurSmall(val) : '—'}
                          </td>
                        )
                      })}
                      <td className="uscite-td-val l2 row-total">{fmtEurSmall(rowTotal(cat1, cat2)) || '—'}</td>
                    </tr>
                  )) : [])
                ]
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        <div className={'uscite-detail' + (selected ? ' open' : '')}>
          {!selected ? (
            <div className="uscite-detail-empty">
              <div className="uscite-detail-empty-icon">👆</div>
              <div>Clicca su una cella per vedere le transazioni</div>
            </div>
          ) : (
            <>
              <div className="uscite-detail-header">
                <span className="uscite-detail-dot" style={{ background: catColor(selected.cat1) }}/>
                <div>
                  <div className="uscite-detail-cat">{selected.cat2 || selected.cat1}</div>
                  {selected.cat2 && <div className="uscite-detail-sub">{selected.cat1}</div>}
                  <div className="uscite-detail-month">
                    {months.find(m => m.key === selected.monthKey)?.label}&nbsp;
                    {selected.monthKey?.slice(0,4)}
                  </div>
                </div>
                <button className="uscite-detail-close" onClick={() => setSelected(null)}>✕</button>
              </div>
              <div className="uscite-detail-total">
                {fmtEur(detailTxs.reduce((s, t) => s + Math.abs(t.amount), 0))}
                <span className="uscite-detail-count">{detailTxs.length} transazioni</span>
              </div>
              <div className="uscite-detail-list">
                {detailTxs.map((t, i) => (
                  <div key={t.id || i} className="uscite-detail-row">
                    <div className="uscite-detail-date">{fmtDate(t._effDate || t.competenza || t.date)}</div>
                    <div className="uscite-detail-desc">{t.descAI || t.description || t.desc || '—'}</div>
                    <div className="uscite-detail-amount">{fmtEur(Math.abs(t.amount))}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
