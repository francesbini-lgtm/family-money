import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import VehicleQuickPicker from '../components/VehicleQuickPicker'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LabelList,
  PieChart, Pie, Cell
} from 'recharts'
import { CATS, getMergedCats } from '../data/categories'
import { fmtIT } from '../utils/format'
import './UscitePage.css'
import CategoryPage from '../components/CategoryPage'
import VeicoliRegistroPage from './VeicoliRegistroPage'
import WeekendVacanzeV2Page from './WeekendVacanzeV2Page'
import UtenzePage from './UtenzePage'
import AltroPage from './AltroPage'
import CeciliaPage from './CeciliaPage'
import { NannyPage, ColfPage } from './NannyColfPage'

// ── Net amount after compensation ──────────────────────────
// Consolidamento 2026-07-12: si usa il modulo condiviso (compensation.js) —
// la copia locale divergeva per gli importi POSITIVI (non sottraeva
// _compensatedAmt), mostrando residui fantasma sulle entrate compensate.
import { netAmt } from '../data/compensation'


function TabPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'8px 16px',borderRadius:20,border:'none',cursor:'pointer',
      fontFamily:'var(--font-sans)',fontSize:13,fontWeight:active?700:500,
      background:active?'var(--accent)':'var(--surface)',
      color:active?'#fff':'var(--text2)',
      transition:'all .15s',
    }}>{label}</button>
  )
}

const FIXED_CATS = ['Casa', 'Spesa e Alimentari', 'Veicoli', 'Salute e Cura', 'Figli']

// ── Months ────────────────────────────────────────────────────────────────────
const MONTH_LABELS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function getMonthsWithOffset(offset = 0) {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i + offset, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const label = `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    return { key, label }
  })
}

// ── Colors ────────────────────────────────────────────────────────────────────
function catColor(cat1) { return CATS[cat1]?.color || '#888888' }

// ── Formatters ────────────────────────────────────────────────────────────────
function eur(n) {
  if (!n || n < 1) return '—'
  return fmtIT(Math.round(n))
}
function fmtDate(dateStr) {
  const m = (dateStr||'').match(/\d{4}-(\d{2})-(\d{2})/)
  if (!m) return dateStr || '—'
  return `${parseInt(m[2])} ${MONTH_LABELS[parseInt(m[1])-1]}`
}

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

// ── Transaction Detail Modal ──────────────────────────────────────────────────
function TxDetailModal({ tx, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats = useStore(s => s.customCats)
  const [editCat1, setEditCat1] = useState(tx.cat1 || '')
  const [editCat2, setEditCat2] = useState(tx.cat2 || '')
  const [editDescAI, setEditDescAI] = useState(tx?.descAI || '')
  const [saved, setSaved] = useState(false)
  const [toReview, setToReview] = useState(tx?._flagged || false)
  function toggleReview() { const n=!toReview; setToReview(n); updateTransaction(tx.txId,{_flagged:n}) }
  const [nonRecurring, setNonRecurring] = useState(tx?._nonRecurring || false)
  function toggleNonRecurring() { const n=!nonRecurring; setNonRecurring(n); updateTransaction(tx.txId,{_nonRecurring:n}) }
  const _allCats = getMergedCats(customCats)
  const cat1Subs = _allCats[editCat1]?.sub || []

  function fmtDateFull(d) {
    const m = (d||'').match(/(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return d || '—'
    return `${m[3]}/${m[2]}/${m[1]}`
  }

  function handleSave() {
    updateTransaction(tx.txId, { cat1: editCat1, cat2: editCat2, conf: 100 })
    setSaved(true)
    setTimeout(onClose, 1000)
  }

  return (
    <div className="uscite-modal-overlay" onClick={onClose}>
      <div className="uscite-modal" onClick={e => e.stopPropagation()}>
        <button className="uscite-modal-close" onClick={onClose}>✕</button>
        <div className="uscite-modal-title">{tx.descAI || tx.description || '—'}</div>
        <div className="uscite-modal-amount" style={{color: tx.amount < 0 ? 'var(--red)' : 'var(--green)'}}>
          {tx.amount < 0 ? '−' : '+'}€ {fmtIT(Math.abs(netAmt(tx)), 2)}{tx._compensatedAmt>0&&tx.amount<0?' *':''}
        </div>
        <div className="uscite-modal-grid">
          {[
            ['Data contabile', fmtDateFull(tx.date)],
            ['Data valuta', fmtDateFull(tx.effectiveDate || tx._effDate)],
            ['Merchant', tx.merchant && tx.merchant !== 'null' ? tx.merchant : '—'],
            ['Controparte', tx.counterpart || tx.counterparty || '—'],
            ['Città', tx.city || '—'],
            ['Categoria', tx.cat1 ? (tx.cat1 + (tx.cat2 ? ' › ' + tx.cat2 : '')) : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="uscite-modal-label">{label}</div>
              <div className="uscite-modal-value">{value}</div>
            </div>
          ))}
          <div style={{gridColumn:'1 / -1'}}>
            <div className="uscite-modal-label">Descrizione originale</div>
            <div className="uscite-modal-value" style={{fontSize:11,color:'var(--text2)',wordBreak:'break-word'}}>{tx.description || '—'}</div>
          </div>
        </div>
        <div onClick={toggleReview}
          style={{marginBottom:8,display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'10px 14px',borderRadius:8,cursor:'pointer',userSelect:'none',
            background:toReview?'rgba(245,158,11,.08)':'var(--surface2)',
            border:`1px solid ${toReview?'#f59e0b':'var(--border)'}`}}>
          <span style={{fontSize:13,fontWeight:600,color:toReview?'#92400e':'var(--text2)'}}>
            🔍 Da rivedere
          </span>
          <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,fontWeight:700,
            background:toReview?'#f59e0b':'var(--border)',
            color:toReview?'#fff':'var(--text3)'}}>
            {toReview ? 'Attivo' : 'Off'}
          </span>
        </div>
        <div onClick={toggleNonRecurring}
          style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'10px 14px',borderRadius:8,cursor:'pointer',userSelect:'none',
            background:nonRecurring?'rgba(99,102,241,.08)':'var(--surface2)',
            border:`1px solid ${nonRecurring?'#6366f1':'var(--border)'}`}}>
          <span style={{fontSize:13,fontWeight:600,color:nonRecurring?'#4338ca':'var(--text2)'}}>
            ⚡ Non ricorrente
          </span>
          <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,fontWeight:700,
            background:nonRecurring?'#6366f1':'var(--border)',
            color:nonRecurring?'#fff':'var(--text3)'}}>
            {nonRecurring ? 'Attivo' : 'Off'}
          </span>
        </div>
        {/* AI Descr */}
        <div style={{padding:'12px 16px',background:'var(--surface2)',borderRadius:10,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
            color:'var(--text3)',marginBottom:6}}>✏️ Descrizione AI</div>
          <input
            value={editDescAI}
            onChange={e=>setEditDescAI(e.target.value)}
            onBlur={()=>{ if(editDescAI.trim()!==tx.descAI) updateTransaction(tx.txId,{descAI:editDescAI.trim()}) }}
            placeholder="Descrizione AI personalizzata..."
            style={{width:'100%',boxSizing:'border-box',padding:'7px 10px',borderRadius:7,
              border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',
              fontSize:13,fontFamily:'var(--font-sans)',outline:'none'}}
          />
        </div>
        <div className="uscite-modal-edit">
          <div className="uscite-modal-edit-title">Modifica Categoria</div>
          <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:140}}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Categoria</div>
              <select value={editCat1} onChange={e=>{setEditCat1(e.target.value);setEditCat2('')}} className="uscite-modal-select">

                <option value="">— Nessuna —</option>
                {Object.keys(_allCats).filter(n=>n!=='Non Categorizzato').map(n=>(
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            {cat1Subs.length > 0 && (
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Sottocategoria</div>
                <select value={editCat2} onChange={e=>setEditCat2(e.target.value)} className="uscite-modal-select">
                  <option value="">— Nessuna —</option>
                  {cat1Subs.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <button onClick={handleSave} className={'uscite-modal-save' + (saved ? ' saved' : '')}>
              {saved ? '✓ Salvato' : 'Salva'}
            </button>
          </div>
          <VehicleQuickPicker txId={tx.txId} cat1={editCat1} />
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function UscitePage() {
  const [activeTab, setActiveTab] = useState('overview')
  const transactions = useStore(s => s.transactions)
  const appPrefs = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const customCats = useStore(s => s.customCats)
  const [monthOffset, setMonthOffset] = useState(0)
  const months = useMemo(() => getMonthsWithOffset(monthOffset), [monthOffset])
  const [expandedCats, setExpandedCats] = useState(new Set())

  const allCatNames = useMemo(
    () => Object.keys(getMergedCats(customCats)).filter(n => n !== 'Non Categorizzato' && n !== 'Entrate'),
    [customCats]
  )

  const rowOrder = useMemo(() => {
    const saved = appPrefs?.usciteRowOrder
    const base = saved ? { core: [...(saved.core || [])], other: [...(saved.other || [])] }
                       : { core: [...FIXED_CATS], other: [] }
    const allSet = new Set(allCatNames)
    // filter out names no longer in allCatNames
    const filteredCore = base.core.filter(n => allSet.has(n))
    const filteredOther = base.other.filter(n => allSet.has(n))
    // find new names not already placed
    const placed = new Set([...filteredCore, ...filteredOther])
    const newNames = allCatNames.filter(n => !placed.has(n))
    return { core: filteredCore, other: [...filteredOther, ...newNames] }
  }, [appPrefs?.usciteRowOrder, allCatNames])

  const prevRowOrderRef = useRef(null)
  useEffect(() => {
    const json = JSON.stringify(rowOrder)
    if (json === JSON.stringify(appPrefs?.usciteRowOrder)) return
    if (json === prevRowOrderRef.current) return
    prevRowOrderRef.current = json
    setAppPref('usciteRowOrder', rowOrder)
  }, [rowOrder, setAppPref])

  const [selected, setSelected] = useState(null) // { cat1, cat2|null, monthKey } | { _nonRecurring: true, monthKey }
  const [showNonRecurring, setShowNonRecurring] = useState(false) // toggle riga non ricorrenti
  const [adjVacanze, setAdjVacanze] = useState(true) // toggle: netto carburante/autostrada imputati manualmente nelle vacanze — sempre attivo di default
  const [openTx, setOpenTx] = useState(null)

  // ── Build expense list ────────────────────────────────────────────────────
  const expenses = useMemo(() => {
    const monthKeys = new Set(months.map(m => m.key))
    const result = []

    transactions.forEach(t => {
      if (t.excluded || t.amount >= 0 || t.cat1 === 'Entrate') return
      const ym = (t._effDate || t.competenza || t.date || '').slice(0, 7)
      if (!monthKeys.has(ym)) return

      if (isSatiLinked(t)) {
        // sempre esplodi negli splits
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
  }, [transactions, months])

  // ── Build data map: cat1 → monthKey → { total, l2Map, txs } ──────────────
  const rawDataMap = useMemo(() => {
    const map = {}
    expenses.forEach(t => {
      const ym = (t._effDate || t.competenza || t.date || '').slice(0, 7)
      const cat1 = t.cat1 || 'Non Categorizzato'
      const cat2 = t.cat2 || '(altro)'
      const val = Math.abs(netAmt(t))

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

  // ── Adj vacanze: sposta il carburante/autostrada imputato manualmente nel
  // drill-down di una vacanza (Weekend e Vacanze v2) da Veicoli a Weekend e
  // Vacanze, così il totale "Weekend e Vacanze" qui coincide col costo vacanza
  // mostrato in quella pagina (vacationTotalCost) — riallocazione a somma zero,
  // quindi il "Totale uscite" non cambia. Attribuita al mese di inizio vacanza
  // (semplificazione per vacanze a cavallo di due mesi).
  // NB: i vani "txs" delle celle rettificate (Veicoli/Carburante-Autostrade e
  // Weekend e Vacanze) non sommeranno esattamente al totale mostrato, perché
  // l'aggiustamento manuale non è una transazione reale — è un effetto atteso,
  // non un bug, del riportare un importo dichiarato a mano.
  const vacationsForAdj = appPrefs?.calendarVacations || []
  const dataMap = useMemo(() => {
    if (!adjVacanze) return rawDataMap
    const map = { ...rawDataMap }
    const monthKeys = new Set(months.map(m => m.key))

    function cloneCat1Month(cat1, ym) {
      map[cat1] = { ...(map[cat1] || {}) }
      const cur = map[cat1][ym] || { total: 0, l2: {}, txs: [] }
      map[cat1][ym] = { total: cur.total, l2: { ...cur.l2 }, txs: cur.txs }
      return map[cat1][ym]
    }

    vacationsForAdj.forEach(v => {
      const manualFuel = Number(v.manualCarburante) || 0
      const manualHwy  = Number(v.manualAutostrada) || 0
      if (!manualFuel && !manualHwy) return
      const ym = (v.from || '').slice(0, 7)
      if (!monthKeys.has(ym)) return // vacanza fuori dal periodo mostrato

      if (manualFuel > 0) {
        const veicoli = cloneCat1Month('Veicoli', ym)
        veicoli.total = Math.max(0, veicoli.total - manualFuel)
        const carb = veicoli.l2['Carburante']
        if (carb) veicoli.l2['Carburante'] = { ...carb, total: Math.max(0, carb.total - manualFuel) }
      }
      if (manualHwy > 0) {
        const veicoli = cloneCat1Month('Veicoli', ym)
        veicoli.total = Math.max(0, veicoli.total - manualHwy)
        const aut = veicoli.l2['Autostrade']
        if (aut) veicoli.l2['Autostrade'] = { ...aut, total: Math.max(0, aut.total - manualHwy) }
      }

      const extra = manualFuel + manualHwy
      if (extra > 0) {
        const wv = cloneCat1Month('Weekend e Vacanze', ym)
        wv.total += extra
        const key = 'Carburante/Autostrada'
        wv.l2[key] = { total: (wv.l2[key]?.total || 0) + extra, txs: wv.l2[key]?.txs || [] }
      }
    })
    return map
  }, [rawDataMap, adjVacanze, vacationsForAdj, months])

  // ── Stable category order (from ALL transactions, ignoring withSati toggle) ─
  const stableOrder = useMemo(() => {
    const monthKeys = new Set(months.map(m => m.key))
    const totals = {}
    transactions.forEach(t => {
      if (t.excluded || t.amount >= 0 || t.cat1 === 'Entrate') return
      const ym = (t._effDate || t.competenza || t.date || '').slice(0, 7)
      if (!monthKeys.has(ym)) return
      const cat1 = t.cat1 || 'Non Categorizzato'
      totals[cat1] = (totals[cat1] || 0) + Math.abs(netAmt(t))
    })
    const sorted = Object.keys(totals).sort((a, b) => totals[b] - totals[a])
    // Move "Altro" to second-to-last
    const altroIdx = sorted.indexOf('Altro')
    if (altroIdx > -1 && altroIdx < sorted.length - 1) {
      sorted.splice(altroIdx, 1)
      sorted.push('Altro')
    }
    return sorted
  }, [transactions, months])

  // ── cat1List: stableOrder filtered to cats present in current dataMap ─────
  const cat1List = useMemo(() => {
    const present = new Set(stableOrder.filter(cat1 => !!dataMap[cat1]))
    const fixedPresent = FIXED_CATS.filter(c => present.has(c))
    const remaining = stableOrder.filter(c => !FIXED_CATS.includes(c) && present.has(c))
    return [...fixedPresent, ...remaining]
  }, [stableOrder, dataMap])

  const fixedCatList = rowOrder.core
  const remainingCatList = rowOrder.other

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => months.map(m => {
    const row = { month: m.label }
    cat1List.forEach(cat1 => {
      row[cat1] = Math.round(dataMap[cat1]?.[m.key]?.total || 0)
    })
    return row
  }), [months, cat1List, dataMap])

  // ── Pie data ──────────────────────────────────────────────────────────────
  const pieData = useMemo(() => cat1List.map(cat1 => ({
    name: cat1,
    value: months.reduce((s, m) => s + (dataMap[cat1]?.[m.key]?.total || 0), 0)
  })).filter(d => d.value > 0), [cat1List, months, dataMap])

  // ── Detail transactions ───────────────────────────────────────────────────
  const detailTxs = useMemo(() => {
    if (!selected) return []
    if (selected._nonRecurring) {
      return expenses.filter(t =>
        t._nonRecurring &&
        (t._effDate || t.competenza || t.date || '').slice(0,7) === selected.monthKey
      ).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    }
    const { cat1, cat2, monthKey } = selected
    let txs = cat2
      ? (dataMap[cat1]?.[monthKey]?.l2[cat2]?.txs || [])
      : (dataMap[cat1]?.[monthKey]?.txs || [])
    return [...txs].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  }, [selected, dataMap, expenses])

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

  function selectNonRecurringCell(monthKey) {
    if (selected?._nonRecurring && selected.monthKey === monthKey) setSelected(null)
    else setSelected({ _nonRecurring: true, monthKey })
  }

  function rowTotal(cat1, cat2 = null) {
    return months.reduce((s, m) => {
      return s + (cat2
        ? (dataMap[cat1]?.[m.key]?.l2[cat2]?.total || 0)
        : (dataMap[cat1]?.[m.key]?.total || 0))
    }, 0)
  }

  function rowAvg(cat1, cat2 = null) {
    return rowTotal(cat1, cat2) / 6
  }

  function displayVal(cat1, cat2, ym) {
    const total = cat2
      ? (dataMap[cat1]?.[ym]?.l2[cat2]?.total || 0)
      : (dataMap[cat1]?.[ym]?.total || 0)
    if (!showNonRecurring) return total
    const nr = cat2
      ? (nonRecurringDataMap[cat1]?.[ym]?.l2[cat2]?.total || 0)
      : (nonRecurringDataMap[cat1]?.[ym]?.total || 0)
    return Math.max(0, total - nr)
  }

  function displayRowAvg(cat1, cat2 = null) {
    const total = months.reduce((s, m) => s + displayVal(cat1, cat2, m.key), 0)
    return total / 6
  }

  const monthTotals = useMemo(() => {
    const t = {}
    months.forEach(m => {
      t[m.key] = cat1List.reduce((s, cat1) => s + (dataMap[cat1]?.[m.key]?.total || 0), 0)
    })
    return t
  }, [months, cat1List, dataMap])

  const nonRecurringByMonth = useMemo(() => {
    const t = {}
    months.forEach(m => {
      t[m.key] = expenses.filter(tx =>
        tx._nonRecurring &&
        (tx._effDate || tx.competenza || tx.date || '').slice(0,7) === m.key
      ).reduce((s, tx) => s + Math.abs(tx.amount), 0)
    })
    return t
  }, [expenses, months])

  const nonRecurringDataMap = useMemo(() => {
    const map = {}
    expenses.filter(t => t._nonRecurring).forEach(t => {
      const ym = (t._effDate || t.competenza || t.date || '').slice(0, 7)
      const cat1 = t.cat1 || 'Non Categorizzato'
      const cat2 = t.cat2 || '(altro)'
      const val = Math.abs(netAmt(t))
      if (!map[cat1]) map[cat1] = {}
      if (!map[cat1][ym]) map[cat1][ym] = { total: 0, l2: {} }
      map[cat1][ym].total += val
      if (!map[cat1][ym].l2[cat2]) map[cat1][ym].l2[cat2] = { total: 0 }
      map[cat1][ym].l2[cat2].total += val
    })
    return map
  }, [expenses])

  const subTotalByMonth = useMemo(() => {
    const t = {}
    months.forEach(m => {
      t[m.key] = rowOrder.core.reduce((s, cat1) => s + (dataMap[cat1]?.[m.key]?.total || 0), 0)
    })
    return t
  }, [months, rowOrder.core, dataMap])

  const subTotalAvg = Object.values(subTotalByMonth).reduce((s, v) => s + v, 0) / 6

  const grandTotal = Object.values(monthTotals).reduce((s, v) => s + v, 0)
  const grandAvg = grandTotal / 6

  // ── KPI values ────────────────────────────────────────────────────────────
  const kpiTotale6m = grandTotal
  const kpiMediaMensile = grandAvg
  const kpiMesePeggiore = useMemo(() => {
    let maxKey = null, maxVal = 0
    months.forEach(m => {
      if ((monthTotals[m.key] || 0) > maxVal) {
        maxVal = monthTotals[m.key]
        maxKey = m.label
      }
    })
    return maxKey || '—'
  }, [months, monthTotals])
  const kpiCategoriaTop = useMemo(() => {
    let topCat = '—', topVal = 0
    cat1List.forEach(cat1 => {
      const t = months.reduce((s, m) => s + (dataMap[cat1]?.[m.key]?.total || 0), 0)
      if (t > topVal) { topVal = t; topCat = cat1 }
    })
    return topCat
  }, [cat1List, months, dataMap])

  // ── Drag & drop state and handlers ───────────────────────────────────────
  const [dragSrc, setDragSrc] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  function saveRowOrder(newOrder) { setAppPref('usciteRowOrder', newOrder) }

  function handleDragStart(cat1) { setDragSrc(cat1) }
  function handleDragOver(e, targetId) { e.preventDefault(); setDragOver(targetId) }
  function handleDragEnd() { setDragSrc(null); setDragOver(null) }
  function handleDrop(e, targetId) {
    e.preventDefault()
    if (!dragSrc || dragSrc === targetId) { setDragSrc(null); setDragOver(null); return }
    const flat = [...rowOrder.core, '__SUBTOTAL__', ...rowOrder.other]
    const withoutSrc = flat.filter(x => x !== dragSrc)
    const targetIdx = withoutSrc.indexOf(targetId)
    if (targetIdx === -1) { setDragSrc(null); setDragOver(null); return }
    withoutSrc.splice(targetIdx, 0, dragSrc)
    const sepIdx = withoutSrc.indexOf('__SUBTOTAL__')
    const core = withoutSrc.slice(0, sepIdx)
    const other = withoutSrc.slice(sepIdx + 1)
    saveRowOrder({ core, other })
    setDragSrc(null)
    setDragOver(null)
  }

  // ── LabelList content for bar totals (last bar in stack) ─────────────────
  function BarTotalLabel({ x, y, width, index }) {
    if (index == null || !chartData[index]) return null
    const total = cat1List.reduce((s, cat1) => s + (chartData[index][cat1] || 0), 0)
    if (!total) return null
    return (
      <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={10}
        fontWeight={600} fill="var(--text2)" style={{ pointerEvents: 'none' }}>
        {fmtIT(Math.round(total))}
      </text>
    )
  }

  // ── LabelList content for segment values inside bars ─────────────────────
  // NON usare la prop `value` di Recharts: per le barre in stack è il valore
  // CUMULATIVO (fine del range dello stack), non quello del singolo segmento —
  // bug reale segnalato (feb26: totale 5.989 ma label 1889/4336/5324, i progressivi).
  // Il valore vero del segmento si legge direttamente da chartData con la chiave
  // della categoria (catKey), passata da chi renderizza la LabelList.
  function SegmentLabel({ x, y, width, height, index, catKey }) {
    const v = (index != null && chartData[index]) ? (chartData[index][catKey] || 0) : 0
    if (!v || v <= 1000 || height <= 18) return null
    return (
      <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle"
        fontSize={9} fill="rgba(255,255,255,0.85)" style={{ pointerEvents: 'none' }}>
        {fmtIT(Math.round(v))}
      </text>
    )
  }

  return (
    <div className="uscite-page">
      {/* Header — sempre visibile sopra le tab, stesso ordine di Satispay (richiesta utente 2026-07-14) */}
      <div className="uscite-header">
        <div>
          <h1 className="uscite-title">📉 Uscite</h1>
          <p className="uscite-subtitle">
            {months[0].label} — {months[5].label}
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
        <TabPill label="📉 Overview"          active={activeTab==='overview'}  onClick={()=>setActiveTab('overview')}/>
        <TabPill label="🏡 Casa"               active={activeTab==='casa'}       onClick={()=>setActiveTab('casa')}/>
        <TabPill label="🚗 Veicoli"            active={activeTab==='veicoli'}    onClick={()=>setActiveTab('veicoli')}/>
        <TabPill label="🛒 Spesa"              active={activeTab==='spesa'}      onClick={()=>setActiveTab('spesa')}/>
        <TabPill label="👧 Cecilia"            active={activeTab==='cecilia'}    onClick={()=>setActiveTab('cecilia')}/>
        <TabPill label="👩 Nanny"              active={activeTab==='nanny'}      onClick={()=>setActiveTab('nanny')}/>
        <TabPill label="🧹 Colf"               active={activeTab==='colf'}       onClick={()=>setActiveTab('colf')}/>
        {/* Tab "Weekend e Vacanze" v1 rimossa su richiesta utente (2026-07-12) — resta solo la v2 */}
        <TabPill label="✈️ Weekend e Vacanze" active={activeTab==='weekendv2'} onClick={()=>setActiveTab('weekendv2')}/>
        <TabPill label="⚡ Utenze"             active={activeTab==='utenze'}     onClick={()=>setActiveTab('utenze')}/>
        <TabPill label="📦 Altro"             active={activeTab==='altro'}      onClick={()=>setActiveTab('altro')}/>
      </div>

      {/* Tab content */}
      {activeTab === 'casa'    && <CategoryPage cat1="Casa" icon="🏡" title="Casa" description="Affitto, utenze, condominio e spese domestiche"/>}
      {activeTab === 'veicoli' && <VeicoliRegistroPage/>}
      {activeTab === 'spesa'   && <CategoryPage cat1="Spesa e Alimentari" icon="🛒" title="Spesa e Alimentari" description="Spesa supermercato e pasti di lavoro"/>}
      {activeTab === 'cecilia' && <CeciliaPage/>}
      {activeTab === 'nanny'   && <NannyPage/>}
      {activeTab === 'colf'    && <ColfPage/>}
      {activeTab === 'weekendv2' && <WeekendVacanzeV2Page/>}
      {activeTab === 'utenze'  && <UtenzePage/>}
      {activeTab === 'altro'   && <AltroPage/>}

      {activeTab === 'overview' && <>
      {/* KPI bar */}
      <div className="uscite-kpis">
        <div className="uscite-kpi">
          <div className="uscite-kpi-label">{months[0].label} – {months[5].label}</div>
          <div className="uscite-kpi-value">{fmtIT(Math.round(kpiTotale6m))} €</div>
        </div>
        <div className="uscite-kpi">
          <div className="uscite-kpi-label">Media mensile</div>
          <div className="uscite-kpi-value">{fmtIT(Math.round(kpiMediaMensile))} €</div>
        </div>
        <div className="uscite-kpi">
          <div className="uscite-kpi-label">Mese peggiore</div>
          <div className="uscite-kpi-value">{kpiMesePeggiore}</div>
        </div>
        <div className="uscite-kpi">
          <div className="uscite-kpi-label">Categoria top</div>
          <div className="uscite-kpi-value">{kpiCategoriaTop}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="uscite-chart-card">
        {/* Pie chart */}
        <div className="uscite-pie-wrap">
          <div className="uscite-chart-title">Per categoria</div>
          <PieChart width={240} height={220}>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx={120}
              cy={110}
              innerRadius={52}
              outerRadius={88}
              isAnimationActive={false}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) => {
                if (percent < 0.05) return null
                const RADIAN = Math.PI / 180
                const r = (innerRadius + outerRadius) / 2
                const x = cx + r * Math.cos(-midAngle * RADIAN)
                const y = cy + r * Math.sin(-midAngle * RADIAN)
                const short = name.split(' ')[0].slice(0, 7)
                return (
                  <text x={x} y={y} fill="rgba(255,255,255,.9)" textAnchor="middle"
                    dominantBaseline="central" fontSize={8} fontWeight={700}>
                    {short}
                  </text>
                )
              }}
              labelLine={false}
            >
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={catColor(entry.name)} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => fmtIT(Math.round(value)) + ' €'} />
          </PieChart>
        </div>
        {/* Bar chart */}
        <div className="uscite-bar-wrap">
          <div className="uscite-chart-title">Andamento mensile</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}
              barCategoryGap="28%">
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text2)' }}
                axisLine={{ stroke: '#e0dcd8' }} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                width={38}
              />
              <Tooltip content={<CustomTooltip/>} cursor={{ fill: 'rgba(0,0,0,.04)' }}/>
              {cat1List.map((cat1, idx) => {
                const isLast = idx === cat1List.length - 1
                return (
                  <Bar key={cat1} dataKey={cat1} stackId="a"
                    fill={catColor(cat1)}
                    radius={isLast ? [4,4,0,0] : [0,0,0,0]}
                    isAnimationActive={false}
                  >
                    <LabelList content={<SegmentLabel catKey={cat1} />} />
                    {isLast && <LabelList content={<BarTotalLabel />} />}
                  </Bar>
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Controls bar — between chart and table */}
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}>
        {/* Period navigator */}
        <div style={{display:'flex',alignItems:'center',gap:4,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'3px 6px'}}>
          <button onClick={() => setMonthOffset(o => o - 1)}
            style={{border:'none',background:'none',cursor:'pointer',fontSize:16,color:'var(--text2)',padding:'0 4px',lineHeight:1}}>‹</button>
          <span style={{fontSize:11,fontWeight:600,color:'var(--text3)',minWidth:90,textAlign:'center'}}>
            {monthOffset === 0 ? 'ultimi 6 mesi' : `${Math.abs(monthOffset)} mes${Math.abs(monthOffset)===1?'e':'i'} fa`}
          </span>
          <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
            disabled={monthOffset === 0}
            style={{border:'none',background:'none',cursor:monthOffset===0?'default':'pointer',fontSize:16,
              color:monthOffset===0?'var(--border)':'var(--text2)',padding:'0 4px',lineHeight:1}}>›</button>
        </div>
        <button
          className={'uscite-sati-toggle' + (showNonRecurring ? ' active' : '')}
          onClick={() => setShowNonRecurring(v => !v)}
          title="Mostra/nascondi riga delle spese non ricorrenti"
        >
          <span className="uscite-sati-dot" style={{background: showNonRecurring ? '#6366f1' : undefined}}/>
          {showNonRecurring ? 'Non ricorrenti visibili' : 'Separa non ricorrenti'}
        </button>
        <button
          className={'uscite-sati-toggle' + (adjVacanze ? ' active' : '')}
          onClick={() => setAdjVacanze(v => !v)}
          title="Sposta carburante/autostrada imputati manualmente nelle vacanze da Veicoli a Weekend e Vacanze"
        >
          <span className="uscite-sati-dot" style={{background: adjVacanze ? '#6366f1' : undefined}}/>
          Adj vacanze
        </button>
      </div>

      {/* Table + Detail */}
      <div className="uscite-body">
        <div className="uscite-table-wrap">
          <table className="uscite-table">
            <thead>
              <tr>
                <th className="uscite-th-cat">Categoria (€)</th>
                {months.map(m => <th key={m.key} className="uscite-th-month">{m.label}</th>)}
                <th className="uscite-th-total">Media/mese *</th>
                <th className="uscite-th-total">%</th>
              </tr>
            </thead>
            <tbody>
              {/* Category rows — renderCatRow helper */}
              {(() => {
                function renderCatRow(cat1) {
                  const expanded = expandedCats.has(cat1)
                  const allL2 = new Set()
                  months.forEach(m => Object.keys(dataMap[cat1]?.[m.key]?.l2 || {}).forEach(l2 => allL2.add(l2)))
                  // Nasconde anche le sottocategorie (L2) a zero in tutti i mesi — non solo le
                  // righe L1 (chiarimento utente 2026-07-13: "intendevo se un'intera riga è
                  // zero", vale per qualunque riga della tabella, non solo la categoria madre)
                  const l2List = [...allL2]
                    .filter(cat2 => rowTotal(cat1, cat2) !== 0)
                    .sort((a, b) => rowTotal(cat1, b) - rowTotal(cat1, a))
                  const hasL2 = l2List.length > 1 || (l2List.length === 1 && l2List[0] !== '(altro)')

                  return [
                    <tr key={cat1}
                      className={'uscite-tr-l1' + (expanded ? ' expanded' : '')}
                      draggable={true}
                      onDragStart={() => handleDragStart(cat1)}
                      onDragOver={e => handleDragOver(e, cat1)}
                      onDrop={e => handleDrop(e, cat1)}
                      onDragEnd={handleDragEnd}
                      style={{ ...(dragOver === cat1 ? { borderTop: '2px solid var(--accent)' } : {}) }}
                    >
                      <td className="uscite-td-cat l1" onClick={() => hasL2 && toggleCat(cat1)}>
                        <span style={{cursor:'grab',color:'var(--text3)',marginRight:4,fontSize:13,userSelect:'none',flexShrink:0}} title="Trascina per riordinare">⠿</span>
                        <span className="uscite-cat-dot" style={{ background: catColor(cat1) }}/>
                        <span className="uscite-cat-name">{cat1}</span>
                        {hasL2 && <span className="uscite-expand-icon">{expanded ? '▾' : '▸'}</span>}
                      </td>
                      {months.map(m => {
                        const rawVal = dataMap[cat1]?.[m.key]?.total || 0
                        const isSel = selected?.cat1 === cat1 && !selected?.cat2 && selected?.monthKey === m.key
                        return (
                          <td key={m.key}
                            className={'uscite-td-val l1' + (rawVal > 0 ? ' clickable' : '') + (isSel ? ' selected' : '')}
                            onClick={() => rawVal > 0 && selectCell(cat1, null, m.key)}
                          >
                            {eur(displayVal(cat1, null, m.key))}
                          </td>
                        )
                      })}
                      <td className="uscite-td-val l1 row-total">{eur(displayRowAvg(cat1))}</td>
                      <td className="uscite-td-pct">{grandAvg > 0 ? Math.round(displayRowAvg(cat1) / grandAvg * 100) + '%' : '—'}</td>
                    </tr>,

                    ...(expanded ? l2List.map(cat2 => (
                      <tr key={`${cat1}/${cat2}`} className="uscite-tr-l2">
                        <td className="uscite-td-cat l2">
                          <span className="uscite-l2-label">
                            {cat2}{adjVacanze && cat1 === 'Veicoli' && (cat2 === 'Carburante' || cat2 === 'Autostrade') ? ' (**)' : ''}
                          </span>
                        </td>
                        {months.map(m => {
                          const rawVal = dataMap[cat1]?.[m.key]?.l2[cat2]?.total || 0
                          const isSel = selected?.cat1 === cat1 && selected?.cat2 === cat2 && selected?.monthKey === m.key
                          return (
                            <td key={m.key}
                              className={'uscite-td-val l2' + (rawVal > 0 ? ' clickable' : '') + (isSel ? ' selected' : '')}
                              onClick={() => rawVal > 0 && selectCell(cat1, cat2, m.key)}
                            >
                              {eur(displayVal(cat1, cat2, m.key))}
                            </td>
                          )
                        })}
                        <td className="uscite-td-val l2 row-total">{eur(displayRowAvg(cat1, cat2))}</td>
                        <td className="uscite-td-pct">{grandAvg > 0 ? Math.round(displayRowAvg(cat1, cat2) / grandAvg * 100) + '%' : '—'}</td>
                      </tr>
                    )) : [])
                  ]
                }

                return (
                  <>
                    {/* Fixed cats group — nascoste le categorie a zero in tutti i mesi
                        visibili (richiesta utente 2026-07-13: righe tutte a €0,00 non
                        vanno mostrate) */}
                    {fixedCatList.filter(cat1 => rowTotal(cat1) !== 0).map(cat1 => renderCatRow(cat1))}

                    {/* Subtotale core */}
                    {(
                      <tr
                        onDragOver={e => handleDragOver(e, '__SUBTOTAL__')}
                        onDrop={e => handleDrop(e, '__SUBTOTAL__')}
                        style={{ background:'var(--surface2,rgba(0,0,0,.03))', ...(dragOver === '__SUBTOTAL__' ? { borderTop: '2px solid var(--accent)' } : {}) }}
                      >
                        <td className="uscite-td-cat" style={{fontWeight:700,fontSize:12,paddingLeft:14,color:'var(--text2)'}}>
                          Subtotale core
                        </td>
                        {months.map(m => (
                          <td key={m.key} className="uscite-td-val grand" style={{fontSize:12,fontWeight:700,borderTop:'1px solid var(--border)'}}>
                            {eur(subTotalByMonth[m.key])}
                          </td>
                        ))}
                        <td className="uscite-td-val grand" style={{fontSize:12,fontWeight:700,borderTop:'1px solid var(--border)'}}>
                          {eur(subTotalAvg)}
                        </td>
                        <td className="uscite-td-pct" style={{fontWeight:700,borderTop:'1px solid var(--border)'}}>
                          {grandAvg > 0 ? Math.round(subTotalAvg/grandAvg*100)+'%' : '—'}
                        </td>
                      </tr>
                    )}

                    {/* Remaining cats — stessa regola: nasconde le righe a zero */}
                    {remainingCatList.filter(cat1 => rowTotal(cat1) !== 0).map(cat1 => renderCatRow(cat1))}
                  </>
                )
              })()}

              {/* Totale uscite (netto se showNonRecurring, altrimenti originale) */}
              <tr className="uscite-tr-grand">
                <td className="uscite-td-cat">{showNonRecurring ? 'Totale ricorrenti' : 'Totale uscite'}</td>
                {months.map(m => {
                  const val = showNonRecurring
                    ? Math.max(0, (monthTotals[m.key]||0) - (nonRecurringByMonth[m.key]||0))
                    : (monthTotals[m.key]||0)
                  return <td key={m.key} className="uscite-td-val grand">{eur(val)}</td>
                })}
                <td className="uscite-td-val grand">
                  {eur(showNonRecurring
                    ? (() => { const vals=months.map(m=>Math.max(0,(monthTotals[m.key]||0)-(nonRecurringByMonth[m.key]||0))).filter(v=>v>0); return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:0 })()
                    : grandAvg)}
                </td>
                <td className="uscite-td-pct">{showNonRecurring ? '—' : '100%'}</td>
              </tr>

              {/* Spese non ricorrenti + Totale (solo quando showNonRecurring) */}
              {showNonRecurring && Object.values(nonRecurringByMonth).some(v=>v>0) && (
                <>
                  <tr>
                    <td className="uscite-td-cat" style={{fontStyle:'italic',fontWeight:400,color:'#6366f1',paddingLeft:20}}>
                      ⚡ Spese non ricorrenti
                    </td>
                    {months.map(m => {
                      const val = nonRecurringByMonth[m.key] || 0
                      const isSel = selected?._nonRecurring && selected.monthKey === m.key
                      return (
                        <td key={m.key}
                          className={'uscite-td-val'+(val>0?' clickable':'')+(isSel?' selected':'')}
                          style={{fontStyle:'italic',fontWeight:400,color:val>0?'#6366f1':'var(--text3)'}}
                          onClick={() => val>0 && selectNonRecurringCell(m.key)}>
                          {eur(val)}
                        </td>
                      )
                    })}
                    <td className="uscite-td-val" style={{fontStyle:'italic',fontWeight:400,color:'#6366f1'}}>
                      {eur((() => {
                        const vals = months.map(m=>nonRecurringByMonth[m.key]||0).filter(v=>v>0)
                        return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:0
                      })())}
                    </td>
                    <td className="uscite-td-pct" style={{fontStyle:'italic'}}>—</td>
                  </tr>
                  <tr className="uscite-tr-grand">
                    <td className="uscite-td-cat">Totale uscite</td>
                    {months.map(m => (
                      <td key={m.key} className="uscite-td-val grand">{eur(monthTotals[m.key])}</td>
                    ))}
                    <td className="uscite-td-val grand">{eur(grandAvg)}</td>
                    <td className="uscite-td-pct">100%</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          <div style={{padding:'6px 14px 10px',fontSize:11,color:'var(--text3)',borderTop:'1px solid var(--border)'}}>
            * Media/mese = totale periodo ÷ 6
            {adjVacanze && <><br/>Nota (**): Carburante e Autostrada sono al netto delle vacanze</>}
          </div>
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
                <span className="uscite-detail-dot" style={{ background: selected._nonRecurring ? '#6366f1' : catColor(selected.cat1) }}/>
                <div>
                  <div className="uscite-detail-cat">{selected._nonRecurring ? '⚡ Non ricorrenti' : (selected.cat2 || selected.cat1)}</div>
                  {!selected._nonRecurring && selected.cat2 && <div className="uscite-detail-sub">{selected.cat1}</div>}
                  <div className="uscite-detail-month">
                    {months.find(m => m.key === selected.monthKey)?.label}&nbsp;
                    {selected.monthKey?.slice(0,4)}
                  </div>
                </div>
                <button className="uscite-detail-close" onClick={() => setSelected(null)}>✕</button>
              </div>
              <div className="uscite-detail-total">
                {fmtIT(Math.round(detailTxs.reduce((s, t) => s + Math.abs(netAmt(t)), 0)))} €
                <span className="uscite-detail-count">{detailTxs.filter(t => netAmt(t) < 0).length} transazioni</span>
              </div>
              <div className="uscite-detail-list">
                {detailTxs.filter(t => netAmt(t) < 0).map((t, i) => (
                  <div key={t.id || t.txId || i} className="uscite-detail-row"
                    style={{ cursor: t._virtual ? 'default' : 'pointer', opacity: t._virtual ? 0.7 : 1 }}
                    onClick={() => !t._virtual && setOpenTx(t)}>
                    <div className="uscite-detail-date">{fmtDate(t._effDate || t.competenza || t.date)}</div>
                    <div className="uscite-detail-desc" style={t._virtual ? {fontStyle:'italic',color:'var(--text3)'} : undefined}>
                      {t._virtual ? `⚙ Fondo: ${t.descAI || '—'}` : (t.descAI || t.description || t.desc || '—')}
                    </div>
                    <div className="uscite-detail-amount">{fmtIT(Math.round(Math.abs(netAmt(t))))} €</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Transaction detail modal */}
      {openTx && <TxDetailModal tx={openTx} onClose={() => setOpenTx(null)}/>}
      </>}
    </div>
  )
}
