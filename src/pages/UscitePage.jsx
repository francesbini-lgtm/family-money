import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Customized
} from 'recharts'
import { CATS } from '../data/categories'
import { fmtIT } from '../utils/format'
import './UscitePage.css'

// ── Months ────────────────────────────────────────────────────────────────────
const MONTH_LABELS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function getLast6Months() {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const label = MONTH_LABELS[d.getMonth()]
    return { key, label }
  })
}

// ── Colors ────────────────────────────────────────────────────────────────────
function catColor(cat1) { return CATS[cat1]?.color || '#888888' }

// ── Formatters ────────────────────────────────────────────────────────────────
function eur(n) {
  if (!n || n < 1) return '—'
  return fmtIT(Math.round(n)) + ' €'
}
function fmtDate(dateStr) {
  const m = (dateStr||'').match(/\d{4}-(\d{2})-(\d{2})/)
  if (!m) return dateStr || '—'
  return `${parseInt(m[2])} ${MONTH_LABELS[parseInt(m[1])-1]}`
}

const isComm = t => t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'
const isSatiLinked = t => !!(t._satiLinked && t.splits?.length > 0)

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="uscite-tooltip">
      <div className="uscite-tooltip-title">{label}</div>
      <div className="uscite-tooltip-total">{fmtIT(Math.round(total))} €</div>
      <div className="uscite-tooltip-rows">
        {[...payload].reverse().map(p => p.value > 0 ? (
          <div key={p.dataKey} className="uscite-tooltip-row">
            <span className="uscite-tooltip-dot" style={{ background: p.fill }}/>
            <span className="uscite-tooltip-cat">{p.dataKey}</span>
            <span className="uscite-tooltip-val">{fmtIT(Math.round(p.value))} €</span>
          </div>
        ) : null)}
      </div>
    </div>
  )
}

// ── Bar total labels (rendered on top of each stacked column) ─────────────────
function BarTotalLabels({ formattedGraphicalItems, chartData }) {
  if (!formattedGraphicalItems?.length || !chartData?.length) return null
  return chartData.map((d, i) => {
    const total = Object.keys(d).filter(k => k !== 'month').reduce((s, k) => s + (d[k] || 0), 0)
    if (!total) return null

    let topY = Infinity
    let x0 = 0, w0 = 40
    formattedGraphicalItems.forEach(item => {
      const entry = item.props.data?.[i]
      if (!entry) return
      if (entry.y !== undefined && entry.y < topY) topY = entry.y
      if (entry.x !== undefined) { x0 = entry.x; w0 = entry.width || 40 }
    })
    if (!isFinite(topY)) return null

    return (
      <text key={i} x={x0 + w0 / 2} y={topY - 5}
        textAnchor="middle" fontSize={10} fontWeight={600}
        fill="var(--text2)" style={{ pointerEvents: 'none' }}>
        {fmtIT(Math.round(total))}
      </text>
    )
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function UscitePage() {
  const transactions = useStore(s => s.transactions)
  const months = useMemo(() => getLast6Months(), [])
  const [expandedCats, setExpandedCats] = useState(new Set())
  const [selected, setSelected] = useState(null) // { cat1, cat2|null, monthKey }
  const [withSati, setWithSati] = useState(false) // toggle accantonamenti

  // ── Build expense list ────────────────────────────────────────────────────
  const expenses = useMemo(() => {
    const monthKeys = new Set(months.map(m => m.key))
    const result = []

    transactions.forEach(t => {
      if (t.excluded || t.amount >= 0 || isComm(t) || t.cat1 === 'Entrate') return
      const ym = (t._effDate || t.competenza || t.date || '').slice(0, 7)
      if (!monthKeys.has(ym)) return

      if (isSatiLinked(t)) {
        if (!withSati) return // senza accantonamenti: escludi
        // con accantonamenti: esplodi negli splits
        t.splits.forEach(sp => {
          if (sp.amount > 0) {
            result.push({
              _virtual: true,
              _parentId: t.txId,
              txId: `${t.txId}_${sp.cat1}_${sp.cat2}`,
              date: t._effDate || t.competenza || t.date,
              _effDate: t._effDate || t.competenza || t.date,
              amount: -sp.amount,
              cat1: sp.cat1 || 'Non Categorizzato',
              cat2: sp.cat2 || '(altro)',
              descAI: sp.cat2 || sp.cat1,
            })
          }
        })
        return
      }

      result.push(t)
    })
    return result
  }, [transactions, months, withSati])

  // ── Build data map: cat1 → monthKey → { total, l2Map, txs } ──────────────
  const dataMap = useMemo(() => {
    const map = {}
    expenses.forEach(t => {
      const ym = (t._effDate || t.competenza || t.date || '').slice(0, 7)
      const cat1 = t.cat1 || 'Non Categorizzato'
      const cat2 = t.cat2 || '(altro)'
      const val = Math.abs(t.amount)

      if (!map[cat1]) map[cat1] = {}
      if (!map[cat1][ym]) map[cat1][ym] = { total: 0, l2: {}, txs: [] }
      map[cat1][ym].total += val
      if (!t._virtual) map[cat1][ym].txs.push(t)

      if (!map[cat1][ym].l2[cat2]) map[cat1][ym].l2[cat2] = { total: 0, txs: [] }
      map[cat1][ym].l2[cat2].total += val
      if (!t._virtual) map[cat1][ym].l2[cat2].txs.push(t)
    })
    return map
  }, [expenses, months])

  // ── cat1 list: sorted by total desc, "Altro" penultimate ─────────────────
  const cat1List = useMemo(() => {
    const all = Object.keys(dataMap).sort((a, b) => {
      const tA = months.reduce((s, m) => s + (dataMap[a][m.key]?.total || 0), 0)
      const tB = months.reduce((s, m) => s + (dataMap[b][m.key]?.total || 0), 0)
      return tB - tA
    })
    // Move "Altro" to second-to-last
    const altroIdx = all.indexOf('Altro')
    if (altroIdx > -1 && altroIdx < all.length - 1) {
      all.splice(altroIdx, 1)
      all.push('Altro')
    }
    return all
  }, [dataMap, months])

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => months.map(m => {
    const row = { month: m.label }
    cat1List.forEach(cat1 => {
      row[cat1] = Math.round(dataMap[cat1]?.[m.key]?.total || 0)
    })
    return row
  }), [months, cat1List, dataMap])

  // ── Detail transactions ───────────────────────────────────────────────────
  const detailTxs = useMemo(() => {
    if (!selected) return []
    const { cat1, cat2, monthKey } = selected
    let txs = cat2
      ? (dataMap[cat1]?.[monthKey]?.l2[cat2]?.txs || [])
      : (dataMap[cat1]?.[monthKey]?.txs || [])
    return [...txs].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  }, [selected, dataMap])

  // ── Helpers ───────────────────────────────────────────────────────────────
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

  function rowTotal(cat1, cat2 = null) {
    return months.reduce((s, m) => {
      return s + (cat2
        ? (dataMap[cat1]?.[m.key]?.l2[cat2]?.total || 0)
        : (dataMap[cat1]?.[m.key]?.total || 0))
    }, 0)
  }

  function rowAvg(cat1, cat2 = null) {
    const total = rowTotal(cat1, cat2)
    const activeMonths = months.filter(m =>
      cat2 ? (dataMap[cat1]?.[m.key]?.l2[cat2]?.total || 0) > 0
            : (dataMap[cat1]?.[m.key]?.total || 0) > 0
    ).length
    return activeMonths > 0 ? total / activeMonths : 0
  }

  const monthTotals = useMemo(() => {
    const t = {}
    months.forEach(m => {
      t[m.key] = cat1List.reduce((s, cat1) => s + (dataMap[cat1]?.[m.key]?.total || 0), 0)
    })
    return t
  }, [months, cat1List, dataMap])

  const grandTotal = Object.values(monthTotals).reduce((s, v) => s + v, 0)
  const grandAvg = (() => {
    const active = months.filter(m => monthTotals[m.key] > 0).length
    return active > 0 ? grandTotal / active : 0
  })()

  return (
    <div className="uscite-page">
      {/* Header */}
      <div className="uscite-header">
        <div>
          <h1 className="uscite-title">📉 Uscite</h1>
          <p className="uscite-subtitle">Ultimi 6 mesi per categoria di spesa</p>
        </div>
        <button
          className={'uscite-sati-toggle' + (withSati ? ' active' : '')}
          onClick={() => setWithSati(v => !v)}
          title="Includi/escludi accantonamenti Satispay spalmate per categoria"
        >
          <span className="uscite-sati-dot"/>
          {withSati ? 'Con accantonamenti' : 'Senza accantonamenti'}
        </button>
      </div>

      {/* Chart */}
      <div className="uscite-chart-card">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 22, right: 16, left: 0, bottom: 0 }}
            barCategoryGap="28%">
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text2)' }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              width={38}
            />
            <Tooltip content={<CustomTooltip/>} cursor={{ fill: 'rgba(255,255,255,.04)' }}/>
            {cat1List.map((cat1, idx) => (
              <Bar key={cat1} dataKey={cat1} stackId="a"
                fill={catColor(cat1)}
                radius={idx === cat1List.length-1 ? [4,4,0,0] : [0,0,0,0]}
              />
            ))}
            <Customized component={(props) => <BarTotalLabels {...props} chartData={chartData}/>}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table + Detail */}
      <div className="uscite-body">
        <div className="uscite-table-wrap">
          <table className="uscite-table">
            <thead>
              <tr>
                <th className="uscite-th-cat">Categoria</th>
                {months.map(m => <th key={m.key} className="uscite-th-month">{m.label}</th>)}
                <th className="uscite-th-total">Media/mese</th>
              </tr>
            </thead>
            <tbody>
              {/* Category rows */}
              {cat1List.map(cat1 => {
                const expanded = expandedCats.has(cat1)
                const allL2 = new Set()
                months.forEach(m => Object.keys(dataMap[cat1]?.[m.key]?.l2 || {}).forEach(l2 => allL2.add(l2)))
                const l2List = [...allL2].sort((a, b) => rowTotal(cat1, b) - rowTotal(cat1, a))
                const hasL2 = l2List.length > 1 || (l2List.length === 1 && l2List[0] !== '(altro)')

                return [
                  <tr key={cat1} className={'uscite-tr-l1' + (expanded ? ' expanded' : '')}>
                    <td className="uscite-td-cat l1" onClick={() => hasL2 && toggleCat(cat1)}>
                      <span className="uscite-cat-dot" style={{ background: catColor(cat1) }}/>
                      <span className="uscite-cat-name">{cat1}</span>
                      {hasL2 && <span className="uscite-expand-icon">{expanded ? '▾' : '▸'}</span>}
                    </td>
                    {months.map(m => {
                      const val = dataMap[cat1]?.[m.key]?.total || 0
                      const isSel = selected?.cat1 === cat1 && !selected?.cat2 && selected?.monthKey === m.key
                      return (
                        <td key={m.key}
                          className={'uscite-td-val l1' + (val > 0 ? ' clickable' : '') + (isSel ? ' selected' : '')}
                          onClick={() => val > 0 && selectCell(cat1, null, m.key)}
                        >
                          {eur(val)}
                        </td>
                      )
                    })}
                    <td className="uscite-td-val l1 row-total">{eur(rowAvg(cat1))}</td>
                  </tr>,

                  ...(expanded ? l2List.map(cat2 => (
                    <tr key={`${cat1}/${cat2}`} className="uscite-tr-l2">
                      <td className="uscite-td-cat l2">
                        <span className="uscite-l2-label">{cat2}</span>
                      </td>
                      {months.map(m => {
                        const val = dataMap[cat1]?.[m.key]?.l2[cat2]?.total || 0
                        const isSel = selected?.cat1 === cat1 && selected?.cat2 === cat2 && selected?.monthKey === m.key
                        return (
                          <td key={m.key}
                            className={'uscite-td-val l2' + (val > 0 ? ' clickable' : '') + (isSel ? ' selected' : '')}
                            onClick={() => val > 0 && selectCell(cat1, cat2, m.key)}
                          >
                            {eur(val)}
                          </td>
                        )
                      })}
                      <td className="uscite-td-val l2 row-total">{eur(rowAvg(cat1, cat2))}</td>
                    </tr>
                  )) : [])
                ]
              })}

              {/* Grand total — last row */}
              <tr className="uscite-tr-grand">
                <td className="uscite-td-cat">Totale uscite</td>
                {months.map(m => (
                  <td key={m.key} className="uscite-td-val grand">
                    {eur(monthTotals[m.key])}
                  </td>
                ))}
                <td className="uscite-td-val grand">{eur(grandAvg)}</td>
              </tr>
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
                {fmtIT(Math.round(detailTxs.reduce((s, t) => s + Math.abs(t.amount), 0)))} €
                <span className="uscite-detail-count">{detailTxs.length} transazioni</span>
              </div>
              <div className="uscite-detail-list">
                {detailTxs.map((t, i) => (
                  <div key={t.id || t.txId || i} className="uscite-detail-row">
                    <div className="uscite-detail-date">{fmtDate(t._effDate || t.competenza || t.date)}</div>
                    <div className="uscite-detail-desc">{t.descAI || t.description || t.desc || '—'}</div>
                    <div className="uscite-detail-amount">{fmtIT(Math.round(Math.abs(t.amount)))} €</div>
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
