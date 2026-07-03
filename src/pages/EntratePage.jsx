import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { useFinancials, getYM, ymLabel } from '../hooks/useFinancials'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line, Legend
} from 'recharts'
import './EntratePage.css'
import { fmtIT, fmtDate } from '../utils/format'
import AltreEntratePage from './AltreEntratePage'

const INCOME_CATS = ['Fra', 'Sofi', 'Fra-Bonus', 'Sofi-Bonus']
const COLORS = {
  Fra: '#2a5c8a', Sofi: '#c8628a',
  'Fra-Bonus': '#6a9cca', 'Sofi-Bonus': '#e892b8',
}

// ── RAL default data (representative, from Jan 2022) ─────
const DEFAULT_RAL_DATA = {
  Fra: [
    { year: 2022, ral: 64000, netto: 42000 },
    { year: 2023, ral: 66000, netto: 43500 },
    { year: 2024, ral: 68500, netto: 45000 },
    { year: 2025, ral: 71000, netto: 46500 },
    { year: 2026, ral: 73000, netto: 48000 },
  ],
  Sofi: [
    { year: 2022, ral: 52000, netto: 34500 },
    { year: 2023, ral: 54000, netto: 35800 },
    { year: 2024, ral: 56000, netto: 37200 },
    { year: 2025, ral: 58500, netto: 38800 },
    { year: 2026, ral: 60000, netto: 40000 },
  ],
}

// ── RAL edit modal ────────────────────────────────────────
// Normalize: ensure effectiveDate exists (backward compat with year-only rows)
function normalizeRalRow(r) {
  return { ...r, effectiveDate: r.effectiveDate || (r.year ? `${r.year}-01` : '') }
}

function RalEditModal({ person, data, onSave, onClose }) {
  const [rows, setRows] = useState(() =>
    [...(data[person] || [])].map(normalizeRalRow)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  )
  const [newDate, setNewDate]               = useState('')
  const [newRal, setNewRal]                 = useState('')
  const [newNetto, setNewNetto]             = useState('')
  const [newBonusLordo, setNewBonusLordo]   = useState('')
  const [newBonusNetto, setNewBonusNetto]   = useState('')

  function updateRow(i, field, val) {
    setRows(prev => prev.map((r, idx) => idx === i
      ? { ...r, [field]: field === 'effectiveDate' ? val : (parseFloat(val)||0) }
      : r
    ))
  }
  function deleteRow(i) { setRows(prev => prev.filter((_, idx) => idx !== i)) }
  function addRow() {
    if (!newDate) return
    if (rows.find(r => r.effectiveDate === newDate)) return
    setRows(prev => [...prev, {
      effectiveDate: newDate,
      year: parseInt(newDate.slice(0, 4)),  // keep for chart compat
      ral: parseFloat(newRal)||0, netto: parseFloat(newNetto)||0,
      bonusLordo: parseFloat(newBonusLordo)||0, bonusNetto: parseFloat(newBonusNetto)||0,
    }].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)))
    setNewDate(''); setNewRal(''); setNewNetto(''); setNewBonusLordo(''); setNewBonusNetto('')
  }
  function handleSave() { onSave({ ...data, [person]: rows }); onClose() }
  const color = COLORS[person] || '#888'
  return (
    <div className="en-ral-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="en-ral-modal">
        <button className="en-ral-close" onClick={onClose}>✕</button>
        <div className="en-ral-title" style={{ color }}>📊 RAL / Netto — {person}</div>
        <table className="en-ral-table">
          <thead>
            <tr>
              <th>Data inizio</th>
              <th>RAL</th>
              <th style={{color:'var(--gold,#b8942a)'}}>+ Lordo Bonus</th>
              <th>Netto annuo</th>
              <th style={{color:'var(--gold,#b8942a)'}}>+ Netto Bonus</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.effectiveDate}>
                <td>
                  <input className="en-ral-input" type="month"
                    value={r.effectiveDate}
                    onChange={e => updateRow(i, 'effectiveDate', e.target.value)}
                    style={{fontFamily:'var(--font-sans)',minWidth:130}} />
                </td>
                <td>
                  <input className="en-ral-input" type="number" value={r.ral}
                    onChange={e => updateRow(i, 'ral', e.target.value)} />
                </td>
                <td>
                  <input className="en-ral-input" type="number" value={r.bonusLordo||0}
                    onChange={e => updateRow(i, 'bonusLordo', e.target.value)}
                    style={{borderColor:'rgba(184,148,42,.4)'}} />
                </td>
                <td>
                  <input className="en-ral-input" type="number" value={r.netto}
                    onChange={e => updateRow(i, 'netto', e.target.value)} />
                </td>
                <td>
                  <input className="en-ral-input" type="number" value={r.bonusNetto||0}
                    onChange={e => updateRow(i, 'bonusNetto', e.target.value)}
                    style={{borderColor:'rgba(184,148,42,.4)'}} />
                </td>
                <td>
                  <button className="en-ral-del" onClick={() => deleteRow(i)} title="Elimina">✕</button>
                </td>
              </tr>
            ))}
            <tr className="en-ral-add-row">
              <td>
                <input className="en-ral-input" type="month" value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  style={{fontFamily:'var(--font-sans)',minWidth:130}} />
              </td>
              <td>
                <input className="en-ral-input" type="number" placeholder="RAL" value={newRal}
                  onChange={e => setNewRal(e.target.value)} />
              </td>
              <td>
                <input className="en-ral-input" type="number" placeholder="Bonus lordo" value={newBonusLordo}
                  onChange={e => setNewBonusLordo(e.target.value)}
                  style={{borderColor:'rgba(184,148,42,.4)'}} />
              </td>
              <td>
                <input className="en-ral-input" type="number" placeholder="Netto" value={newNetto}
                  onChange={e => setNewNetto(e.target.value)} />
              </td>
              <td>
                <input className="en-ral-input" type="number" placeholder="Bonus netto" value={newBonusNetto}
                  onChange={e => setNewBonusNetto(e.target.value)}
                  style={{borderColor:'rgba(184,148,42,.4)'}} />
              </td>
              <td>
                <button className="en-ral-add-btn" onClick={addRow} disabled={!newDate}>+</button>
              </td>
            </tr>
          </tbody>
        </table>
        <button className="en-ral-save-btn" onClick={handleSave}>✓ Salva</button>
      </div>
    </div>
  )
}

// ── Get most recent RAL row active for a given year ───────
function getActiveRalForYear(rows, year) {
  const endDate = `${year}-12`
  const candidates = rows
    .map(r => ({ ...r, _d: r.effectiveDate || `${r.year || 1900}-01` }))
    .filter(r => r._d <= endDate)
    .sort((a, b) => a._d.localeCompare(b._d))
  return candidates.length ? candidates[candidates.length - 1] : null
}

// ── RAL settings gear panel ───────────────────────────────
function RalSettingsPanel({ settings, onChange, onClose }) {
  const s = settings || { fraValuta: 'EUR', sofiValuta: 'EUR', fxRate: '' }
  const currencies = ['EUR','CHF','USD','GBP','SEK']
  const hasNonEur = (s.fraValuta||'EUR') !== 'EUR' || (s.sofiValuta||'EUR') !== 'EUR'
  const inp = {
    width:'100%', padding:'5px 7px', border:'1px solid var(--border)', borderRadius:6,
    background:'var(--bg)', color:'var(--text)', fontSize:12, boxSizing:'border-box',
  }
  return (
    <div style={{
      position:'absolute', top:34, right:0, zIndex:200, width:190,
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:10, padding:'12px 14px',
      boxShadow:'0 8px 24px rgba(0,0,0,.18)',
    }} onClick={e => e.stopPropagation()}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:700,color:'var(--text2)'}}>⚙️ Valuta & Cambio</span>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'var(--text3)',padding:0,lineHeight:1}}>✕</button>
      </div>
      {[['Fra','fraValuta'],['Sofi','sofiValuta']].map(([label, key]) => (
        <div key={key} style={{marginBottom:8}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:3}}>{label}</div>
          <select value={s[key]||'EUR'} onChange={e=>onChange({...s,[key]:e.target.value})}
            style={{...inp,fontFamily:'var(--font-sans)'}}>
            {currencies.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      ))}
      <div style={{marginBottom:4}}>
        <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:3}}>Cambio → EUR</div>
        <input type="number" step="0.0001" placeholder={hasNonEur?'es. 0.9500':'—'}
          value={hasNonEur ? (s.fxRate||'') : ''}
          disabled={!hasNonEur}
          onChange={e=>onChange({...s,fxRate:parseFloat(e.target.value)||1})}
          style={{...inp,fontFamily:'var(--font-mono)',opacity:hasNonEur?1:0.4}}/>
      </div>
      <div style={{fontSize:9,color:'var(--text3)',marginTop:6,fontStyle:'italic'}}>1 unità valuta estera = x EUR</div>
    </div>
  )
}

// ── Date helpers ──────────────────────────────────────────
function getLastNMonths(n, now = new Date()) {
  const months = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// Returns last N quarters as { year, q, label } objects
function getLastNQuarters(n, now = new Date()) {
  const quarters = []
  const curYear = now.getFullYear()
  const curQ    = Math.ceil((now.getMonth() + 1) / 3) // 1–4
  const curAbs  = curYear * 4 + (curQ - 1)            // absolute quarter index
  for (let i = n - 1; i >= 0; i--) {
    const abs  = curAbs - i
    const year = Math.floor(abs / 4)
    const q    = (abs % 4) + 1
    quarters.push({ year, q, label: `Q${q} ${String(year).slice(2)}` })
  }
  return quarters
}

// Returns the three YYYY-MM strings belonging to a quarter
function qMonths(year, q) {
  const startM = (q - 1) * 3 + 1
  return [startM, startM + 1, startM + 2].map(m =>
    `${year}-${String(m).padStart(2, '0')}`
  )
}

const MON_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function shortDate(dateStr) {
  const [yr, mo] = dateStr.split('-')
  return `${MON_IT[parseInt(mo) - 1]} ${yr.slice(2)}`
}

// ── Chart subtitle helper ─────────────────────────────────
function chartSubLabel(period) {
  if (period === 'month') return 'Ultimi 12 mesi'
  if (period === '3m')    return 'Ultimi 12 trimestri'
  return 'Per anno (tutti)'
}

// ── KPI card ──────────────────────────────────────────────
function KPICard({ label, value, sub, color = 'var(--text)' }) {
  return (
    <div className="card en-kpi">
      <div className="en-kpi-label">{label}</div>
      <div className="en-kpi-value" style={{ color }}>{value}</div>
      {sub && <div className="en-kpi-sub">{sub}</div>}
    </div>
  )
}

// ── Bonus cell ────────────────────────────────────────────
function BonusCell({ t, bonusMap, setBonusTx }) {
  const bonus = bonusMap[t.txId]
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')

  if (editing) return (
    <div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'center'}}>
      <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)}
        placeholder="€ importo"
        style={{width:76,padding:'3px 6px',borderRadius:5,border:'1px solid var(--accent)',
          background:'var(--bg)',color:'var(--text)',fontSize:12,
          fontFamily:'var(--font-mono)',textAlign:'right'}}
        onKeyDown={e=>{
          if(e.key==='Enter'){
            const n=parseFloat(draft.replace(',','.'))
            if(!isNaN(n)&&n>0) setBonusTx(t.txId,t.cat2,n)
            else setBonusTx(t.txId,null,null)
            setEditing(false)
          }
          if(e.key==='Escape') setEditing(false)
        }}/>
      <button onClick={()=>{
        const n=parseFloat(draft.replace(',','.'))
        if(!isNaN(n)&&n>0) setBonusTx(t.txId,t.cat2,n)
        setEditing(false)
      }} style={{border:'none',background:'var(--green)',color:'#fff',
        borderRadius:4,padding:'3px 6px',cursor:'pointer',fontSize:11}}>✓</button>
    </div>
  )
  if (bonus) return (
    <div style={{display:'flex',alignItems:'center',gap:5,justifyContent:'center'}}>
      <span style={{fontSize:11,fontWeight:700,color:'var(--accent)',
        background:'var(--accent-l)',padding:'2px 7px',borderRadius:10}}>
        di cui € {fmtIT(bonus.amt,0)} bonus
      </span>
      <button onClick={()=>{setDraft(String(bonus.amt));setEditing(true)}}
        style={{border:'none',background:'transparent',cursor:'pointer',color:'var(--text3)',fontSize:11,padding:0}}>✏</button>
      <button onClick={()=>setBonusTx(t.txId,null,null)}
        style={{border:'none',background:'transparent',cursor:'pointer',color:'var(--red)',fontSize:11,padding:0}}>✕</button>
    </div>
  )
  return (
    <button onClick={()=>{setDraft('');setEditing(true)}}
      style={{border:'1px dashed var(--border)',borderRadius:6,padding:'2px 10px',
        background:'transparent',color:'var(--text3)',cursor:'pointer',
        fontSize:11,fontFamily:'var(--font-sans)'}}>
      di cui bonus
    </button>
  )
}

// ── Source badge ──────────────────────────────────────────
function SourceBadge({ cat2 }) {
  const color = COLORS[cat2] || '#888'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: color + '20', color, border: `1px solid ${color}40`
    }}>{cat2 || 'Altro'}</span>
  )
}

// ── Insights ──────────────────────────────────────────────
function InsightsBox({ insights }) {
  if (insights.length === 0) return (
    <div className="card en-insights en-insights--ok">
      <div className="en-insights-title">✅ Nessuna anomalia rilevata</div>
      <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>
        Tutti i versamenti risultano regolari negli ultimi 12 mesi.
      </div>
    </div>
  )
  return (
    <div className="card en-insights en-insights--warn">
      <div className="en-insights-title">⚠️ Anomalie rilevate ({insights.length})</div>
      <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
        {insights.map((ins, i) => (
          <div key={i} className={`en-insight-row en-insight-row--${ins.type}`}>
            <span className="en-insight-icon">
              {ins.type === 'missing' ? '❌' : '⚡'}
            </span>
            <div>
              <span className="en-insight-person" style={{color: COLORS[ins.person] || '#888'}}>{ins.person}</span>
              {ins.type === 'missing'
                ? <> — nessun versamento in <strong>{ins.label}</strong>. Mese saltato o mancante.</>
                : <> — <strong>{ins.count} versamenti</strong> in <strong>{ins.label}</strong>. Possibile doppio o competenza da verificare.</>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Row aggregator (used by all three chart views) ────────
function buildRow(label, txs, bonusMap) {
  const row = { label }
  row['Fra']  = txs.filter(t => t.cat2 === 'Fra').reduce((s,t) => s + (t.amount - (bonusMap[t.txId]?.amt||0)), 0)
  row['Sofi'] = txs.filter(t => t.cat2 === 'Sofi').reduce((s,t) => s + (t.amount - (bonusMap[t.txId]?.amt||0)), 0)
  row['Fra-Bonus']  = txs.filter(t => t.cat2 === 'Fra').reduce((s,t) => s + (bonusMap[t.txId]?.amt||0), 0)
  row['Sofi-Bonus'] = txs.filter(t => t.cat2 === 'Sofi').reduce((s,t) => s + (bonusMap[t.txId]?.amt||0), 0)
  row.total = (row['Fra']||0) + (row['Sofi']||0) + (row['Fra-Bonus']||0) + (row['Sofi-Bonus']||0)
  return row
}

// ── Main page ─────────────────────────────────────────────
export default function EntratePage() {
  const transactions = useStore(s => s.transactions)
  const appPrefs     = useStore(s => s.appPrefs)
  const setAppPref   = useStore(s => s.setAppPref)
  const { fmt }      = useFinancials()
  const [period, setPeriod] = useState('month')
  const [tab, setTab]       = useState('stipendi')

  // RAL / Netto chart state — read directly from appPrefs (reactive via Zustand)
  const ralData     = appPrefs?.ralData     || DEFAULT_RAL_DATA
  const ralSettings = appPrefs?.ralSettings || { fraValuta: 'EUR', sofiValuta: 'EUR', fxRate: 1 }
  const [ralView,         setRalView]         = useState('netto') // 'ral' | 'netto'
  const [ralWithBonus,    setRalWithBonus]     = useState(false)
  const [ralEditPerson,   setRalEditPerson]    = useState(null)   // 'Fra' | 'Sofi' | null
  const [showRalSettings, setShowRalSettings]  = useState(false)

  function saveRalData(newData)     { setAppPref('ralData', newData) }
  function saveRalSettings(s)       { setAppPref('ralSettings', s) }

  const now    = new Date()
  const thisYM = getYM(now)

  // Bonus map — read directly from appPrefs (reactive via Zustand)
  const bonusMap = appPrefs?.bonusMap || {}
  function saveBonusMap(map) { setAppPref('bonusMap', map) }
  function setBonusTx(txId, member, amt) {
    const next = { ...bonusMap }
    if (amt == null) { delete next[txId] } else { next[txId] = { member, amt: parseFloat(amt)||0 } }
    saveBonusMap(next)
  }

  // Only cat1=Entrate, cat2=Fra or Sofi
  const incomeTxs = useMemo(() =>
    transactions.filter(t =>
      !t.excluded && t.cat1 === 'Entrate' && t.amount > 0 &&
      (t.cat2 === 'Fra' || t.cat2 === 'Sofi')
    )
  , [transactions])

  // All years present in data (asc)
  const allYears = useMemo(() => {
    const yrs = new Set(incomeTxs.map(t => parseInt((t._effDate||t.date).slice(0, 4))).filter(Boolean))
    return [...yrs].sort((a, b) => a - b)
  }, [incomeTxs])

  // ── Chart data — depends on toggle ────────────────────
  const chartData = useMemo(() => {
    if (period === 'month') {
      // Last 12 months — monthly bars
      return getLastNMonths(12, now).map(ym => {
        const txs = incomeTxs.filter(t => (t._effDate||t.date).startsWith(ym))
        return buildRow(ymLabel(ym), txs, bonusMap)
      })
    }
    if (period === '3m') {
      // Last 12 quarters — quarterly bars
      return getLastNQuarters(12, now).map(({ year, q, label }) => {
        const mths = qMonths(year, q)
        const txs  = incomeTxs.filter(t => mths.some(ym => (t._effDate||t.date).startsWith(ym)))
        return buildRow(label, txs, bonusMap)
      })
    }
    // 'year' — one bar per year present in DB
    return allYears.map(year => {
      const txs = incomeTxs.filter(t => (t._effDate||t.date).startsWith(String(year)))
      return buildRow(String(year), txs, bonusMap)
    })
  }, [period, incomeTxs, bonusMap, allYears])

  // ── KPIs — always YTD ─────────────────────────────────
  const yearStr = now.getFullYear().toString()
  const ytdTxs  = useMemo(() => incomeTxs.filter(t => (t._effDate||t.date).startsWith(yearStr)), [incomeTxs])
  const ytdTotal = ytdTxs.reduce((s, t) => s + t.amount, 0)
  const ytdFra   = ytdTxs.filter(t => t.cat2 === 'Fra').reduce((s, t) => s + t.amount, 0)
  const ytdSofi  = ytdTxs.filter(t => t.cat2 === 'Sofi').reduce((s, t) => s + t.amount, 0)

  // Average monthly (last 6 months)
  const last6months = useMemo(() => getLastNMonths(6, now), [])
  const avgMonthly  = useMemo(() => {
    const total = last6months.reduce((s, ym) =>
      s + incomeTxs.filter(t => (t._effDate||t.date).startsWith(ym)).reduce((ss, t) => ss + t.amount, 0)
    , 0)
    return total / 6
  }, [incomeTxs, last6months])

  // ── Yearly history table — all years desc ─────────────
  const yearlyHistory = useMemo(() =>
    [...allYears].reverse().map(year => {
      const yStr = String(year)
      const yTxs = incomeTxs.filter(t => (t._effDate||t.date).startsWith(yStr))
      const fra   = yTxs.filter(t => t.cat2 === 'Fra').reduce((s,t) => s + t.amount, 0)
      const sofi  = yTxs.filter(t => t.cat2 === 'Sofi').reduce((s,t) => s + t.amount, 0)
      const total = fra + sofi
      const months   = new Set(yTxs.map(t => (t._effDate||t.date).slice(0,7))).size
      const avgMonth = months > 0 ? total / months : 0
      const fraBonus  = yTxs.filter(t => t.cat2==='Fra').reduce((s,t) => s+(bonusMap[t.txId]?.amt||0), 0)
      const sofiBonus = yTxs.filter(t => t.cat2==='Sofi').reduce((s,t) => s+(bonusMap[t.txId]?.amt||0), 0)
      return { year, fra, sofi, total, avgMonth, months, fraBonus, sofiBonus }
    })
  , [allYears, incomeTxs, bonusMap])

  // ── Transactions by year (all, newest first) ──────────
  const txsByYear = useMemo(() => {
    const sorted = [...incomeTxs].sort((a, b) => b.date.localeCompare(a.date))
    const groups = {}
    sorted.forEach(t => {
      const yr = (t._effDate||t.date).slice(0, 4)
      if (!groups[yr]) groups[yr] = []
      groups[yr].push(t)
    })
    return Object.entries(groups).sort(([a], [b]) => b - a)
  }, [incomeTxs])

  // ── Insights — last 12 months anomaly detection ───────
  const insights = useMemo(() => {
    const alerts = []
    // Earliest month with income data — avoids spurious alerts before data starts
    const firstYM = incomeTxs.reduce((min, t) => {
      const ym = (t._effDate||t.date).slice(0,7)
      return !min || ym < min ? ym : min
    }, null)
    getLastNMonths(12, now).forEach(ym => {
      if (ym === thisYM) return
      if (!firstYM || ym < firstYM) return
      const all = incomeTxs.filter(t => (t._effDate||t.date).startsWith(ym))
      const fra  = all.filter(t => t.cat2 === 'Fra')
      const sofi = all.filter(t => t.cat2 === 'Sofi')
      const label = ymLabel(ym)
      if (fra.length === 0)  alerts.push({ type:'missing', person:'Fra',  ym, label })
      if (fra.length > 1)    alerts.push({ type:'double',  person:'Fra',  ym, label, count: fra.length })
      if (sofi.length === 0) alerts.push({ type:'missing', person:'Sofi', ym, label })
      if (sofi.length > 1)   alerts.push({ type:'double',  person:'Sofi', ym, label, count: sofi.length })
    })
    return alerts
  }, [incomeTxs, thisYM])

  const isEmpty = incomeTxs.length === 0

  const activeCats = INCOME_CATS.filter(c => chartData.some(m => m[c] > 0))
  const topCat     = activeCats.at(-1)

  return (
    <>
      {/* Tab bar */}
      <div className="en-tab-bar">
        <button className={'en-tab' + (tab === 'stipendi' ? ' active' : '')} onClick={() => setTab('stipendi')}>
          💰 Stipendi
        </button>
        <button className={'en-tab' + (tab === 'altre' ? ' active' : '')} onClick={() => setTab('altre')}>
          💸 Altre Entrate
        </button>
      </div>

      {tab === 'altre' && <AltreEntratePage />}
      {tab === 'stipendi' && <div className="en-page">
      {/* Header */}
      <div className="en-header">
        <div>
          <h1 className="en-title">📈 Entrate e Stipendi</h1>
          <div className="en-sub">
            Solo stipendi <strong>Entrate · Fra</strong> e <strong>Entrate · Sofi</strong> — escluse altre entrate
          </div>
        </div>
        <div className="period-tabs">
          {[
            ['month', 'Mese',   'Andamento mensile (ultimi 12 mesi)'],
            ['3m',    '3 Mesi', 'Andamento trimestrale (ultimi 12 trimestri)'],
            ['year',  'Anno',   'Andamento annuale (tutti gli anni)'],
          ].map(([v, l, title]) => (
            <button key={v} title={title}
              className={'period-tab' + (period===v?' active':'')}
              onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <div className="en-empty">
          <div style={{fontSize:48,marginBottom:16}}>📈</div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Nessuna entrata registrata</div>
          <div style={{fontSize:13,color:'var(--text3)'}}>
            Categorizza transazioni come "Entrate" con cat2 "Fra" o "Sofi" per visualizzarle qui.
          </div>
        </div>
      ) : (
        <>
          {/* KPIs — always YTD */}
          <div className="en-kpis">
            <KPICard label={`Totale ${yearStr}`} value={fmt(ytdTotal)} color="var(--green)" sub="YTD"/>
            <KPICard label="Fra"   value={fmt(ytdFra)}   color={COLORS.Fra}  sub="YTD stipendio"/>
            <KPICard label="Sofia" value={fmt(ytdSofi)}  color={COLORS.Sofi} sub="YTD stipendio"/>
            <KPICard label="Media mensile" value={fmt(avgMonthly)} sub="ultimi 6 mesi"/>
          </div>

          {/* Charts — respond to toggle */}
          {(() => {
            // Build RAL chart data using effectiveDate-based row lookup + global FX
            const fraRows  = (ralData.Fra  || []).map(normalizeRalRow)
            const sofiRows = (ralData.Sofi || []).map(normalizeRalRow)
            const fraFx  = (ralSettings.fraValuta||'EUR')  !== 'EUR' ? (ralSettings.fxRate||1) : 1
            const sofiFx = (ralSettings.sofiValuta||'EUR') !== 'EUR' ? (ralSettings.fxRate||1) : 1
            const hasNonEur = fraFx !== 1 || sofiFx !== 1
            // Derive years from all effectiveDates
            const allDates = [
              ...fraRows.map(r => r.effectiveDate || `${r.year}-01`),
              ...sofiRows.map(r => r.effectiveDate || `${r.year}-01`),
            ]
            const ralYears = [...new Set(allDates.map(d => parseInt(d.slice(0,4))))].sort((a,b)=>a-b)
            const ralChartData = ralYears.map(yr => {
              const frR = getActiveRalForYear(fraRows, yr)
              const soR = getActiveRalForYear(sofiRows, yr)
              return {
                year: String(yr),
                'Fra RAL':            frR ? frR.ral * fraFx : undefined,
                'Fra RAL+Bonus':      frR ? ((frR.ral||0) + (frR.bonusLordo||0)) * fraFx : undefined,
                'Fra Netto':          frR ? frR.netto * fraFx : undefined,
                'Fra Netto+Bonus':    frR ? ((frR.netto||0) + (frR.bonusNetto||0)) * fraFx : undefined,
                'Sofi RAL':           soR ? soR.ral * sofiFx : undefined,
                'Sofi RAL+Bonus':     soR ? ((soR.ral||0) + (soR.bonusLordo||0)) * sofiFx : undefined,
                'Sofi Netto':         soR ? soR.netto * sofiFx : undefined,
                'Sofi Netto+Bonus':   soR ? ((soR.netto||0) + (soR.bonusNetto||0)) * sofiFx : undefined,
              }
            })
            const ralLines = ralView === 'ral'
              ? (ralWithBonus
                ? [{ key:'Fra RAL+Bonus',   color:COLORS.Fra,  dash:'5 3' }, { key:'Sofi RAL+Bonus',   color:COLORS.Sofi, dash:'5 3' }]
                : [{ key:'Fra RAL',         color:COLORS.Fra,  dash:'5 3' }, { key:'Sofi RAL',         color:COLORS.Sofi, dash:'5 3' }])
              : (ralWithBonus
                ? [{ key:'Fra Netto+Bonus', color:COLORS.Fra,  dash:'0'   }, { key:'Sofi Netto+Bonus', color:COLORS.Sofi, dash:'0'   }]
                : [{ key:'Fra Netto',       color:COLORS.Fra,  dash:'0'   }, { key:'Sofi Netto',       color:COLORS.Sofi, dash:'0'   }])
            return (
              <div className="en-charts">
                {/* Chart 1 — Entrate per fonte */}
                <div className="card en-chart-card">
                  <div className="en-chart-header">
                    <span className="en-chart-title">Entrate per fonte (Fra + Sofi)</span>
                    <span style={{fontSize:11,color:'var(--text3)'}}>{chartSubLabel(period)}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} barCategoryGap="35%" margin={{bottom:20}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="label" tick={{fontSize:9,fill:'var(--text3)'}} axisLine={false} tickLine={false}
                        interval={0} angle={-35} textAnchor="end" height={44}/>
                      <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={52}
                        tickFormatter={v => v>=1000 ? `€${(v/1000).toFixed(0)}K` : `€${v}`}/>
                      <Tooltip formatter={(v,n) => [`€ ${fmtIT(v,0)}`, n]}
                        contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
                      <Legend iconType="circle" iconSize={8}
                        formatter={v => <span style={{fontSize:11,color:'var(--text2)'}}>{v}</span>}/>
                      {activeCats.map(cat => (
                        <Bar key={cat} dataKey={cat} name={cat} fill={COLORS[cat]} stackId="a"
                          radius={cat === topCat ? [4,4,0,0] : [0,0,0,0]}/>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Chart 2 — Stipendio RAL vs Netto */}
                <div className="card en-chart-card" style={{position:'relative'}}>
                  {/* Top-right toggles — RAL | Netto + con bonus + gear */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                    <span className="en-chart-title">Stipendio (RAL vs Netto)</span>
                    <div style={{display:'flex',alignItems:'center',gap:6,position:'relative'}}>
                      {/* Gear settings */}
                      <button onClick={e=>{e.stopPropagation();setShowRalSettings(v=>!v)}}
                        title="Impostazioni valuta e cambio"
                        style={{
                          padding:'3px 7px',border:`1px solid ${showRalSettings?'var(--accent)':'var(--border)'}`,
                          borderRadius:6,cursor:'pointer',fontSize:13,transition:'all .15s',
                          background: showRalSettings ? 'var(--surface2)' : 'transparent',
                          color: showRalSettings ? 'var(--accent)' : 'var(--text3)',
                        }}>⚙️</button>
                      {showRalSettings && (
                        <RalSettingsPanel
                          settings={ralSettings}
                          onChange={s => saveRalSettings(s)}
                          onClose={() => setShowRalSettings(false)}
                        />
                      )}
                      {/* con bonus toggle */}
                      <button onClick={() => setRalWithBonus(b => !b)}
                        style={{
                          padding:'3px 10px',border:`1px solid ${ralWithBonus?'var(--gold,#b8942a)':'var(--border)'}`,
                          borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:700,transition:'all .15s',
                          background: ralWithBonus ? 'rgba(184,148,42,.15)' : 'transparent',
                          color: ralWithBonus ? 'var(--gold,#b8942a)' : 'var(--text3)',
                        }}>🎯 con bonus</button>
                      {/* RAL | Netto segmented */}
                      <div style={{display:'flex',background:'var(--surface2,rgba(0,0,0,.04))',borderRadius:7,padding:2,border:'1px solid var(--border)',gap:0}}>
                        {[['ral','RAL'],['netto','Netto']].map(([v,label]) => (
                          <button key={v} onClick={() => setRalView(v)}
                            style={{
                              padding:'3px 12px',border:'none',borderRadius:5,cursor:'pointer',
                              fontSize:11,fontWeight:700,transition:'all .15s',
                              background: ralView===v ? 'var(--accent,#b8942a)' : 'transparent',
                              color: ralView===v ? '#fff' : 'var(--text3)',
                            }}>{label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={ralChartData} margin={{top:8,bottom:4,left:0,right:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="year" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={56}
                        tickFormatter={v => v>=1000 ? `€${(v/1000).toFixed(0)}K` : `€${v}`}/>
                      <Tooltip formatter={(v,n) => [`€ ${fmtIT(v,0)}`, n]}
                        contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
                      {ralLines.map(l => (
                        <Line key={l.key} type="monotone" dataKey={l.key}
                          stroke={l.color} strokeWidth={2} strokeDasharray={l.dash}
                          dot={{r:4,fill:l.color}} activeDot={{r:6}} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  {/* FX note */}
                  {hasNonEur && (
                    <div style={{fontSize:10,color:'var(--text3)',textAlign:'right',marginTop:2,fontStyle:'italic'}}>
                      * valori convertiti in EUR al tasso di cambio dell'anno
                    </div>
                  )}
                  {/* Bottom-right edit buttons */}
                  <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:6}}>
                    {['Fra','Sofi'].map(p => (
                      <button key={p} onClick={() => setRalEditPerson(p)}
                        title={`Modifica dati RAL/Netto ${p}`}
                        style={{
                          display:'flex',alignItems:'center',gap:5,
                          padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,
                          background:'var(--bg)',cursor:'pointer',fontSize:11,fontWeight:600,
                          color:COLORS[p]||'var(--text2)',transition:'background .12s',
                        }}>
                        <span style={{fontSize:12}}>🗒️</span>{p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* RAL Edit Modal */}
          {ralEditPerson && (
            <RalEditModal
              person={ralEditPerson}
              data={ralData}
              onSave={saveRalData}
              onClose={() => setRalEditPerson(null)}
            />
          )}

          {/* Insights */}
          <InsightsBox insights={insights}/>

          {/* Yearly history — all years */}
          {yearlyHistory.length > 0 && (
            <div className="card en-ytd" style={{marginTop:16}}>
              <div className="en-chart-header" style={{marginBottom:14}}>
                <span className="en-chart-title">📅 Storico per Anno</span>
                <span style={{fontSize:12,color:'var(--text3)'}}>
                  {yearlyHistory.length} {yearlyHistory.length === 1 ? 'anno' : 'anni'} — solo Fra e Sofi
                </span>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)'}}>
                    {['Anno','Fra','Sofi','Totale','Media/mese','Mesi'].map(h => (
                      <th key={h} style={{padding:'6px 12px',fontSize:11,fontWeight:700,
                        letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',
                        textAlign:['Fra','Sofi','Totale','Media/mese'].includes(h)?'right':'left'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yearlyHistory.map((y, i) => (
                    <tr key={y.year} style={{borderBottom:'1px solid var(--border)',
                      background: i===0 ? 'var(--accent-l)' : 'transparent'}}>
                      <td style={{padding:'10px 12px',fontWeight:700,fontSize:14}}>
                        {y.year}
                        {i===0 && <span style={{marginLeft:6,fontSize:10,padding:'1px 6px',
                          borderRadius:10,background:'var(--accent)',color:'#fff'}}>Corrente</span>}
                      </td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:13}}>
                        <span style={{color:COLORS.Fra,fontWeight:600}}>€ {fmtIT(y.fra,0)}</span>
                        {y.fraBonus>0 && <span style={{fontSize:10,color:COLORS['Fra-Bonus'],marginLeft:4}}>(+{fmtIT(y.fraBonus,0)} bonus)</span>}
                      </td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:13}}>
                        <span style={{color:COLORS.Sofi,fontWeight:600}}>€ {fmtIT(y.sofi,0)}</span>
                        {y.sofiBonus>0 && <span style={{fontSize:10,color:COLORS['Sofi-Bonus'],marginLeft:4}}>(+{fmtIT(y.sofiBonus,0)} bonus)</span>}
                      </td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:14,fontWeight:700,color:'var(--green)'}}>
                        € {fmtIT(y.total,0)}
                      </td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:13,color:'var(--text2)'}}>
                        € {fmtIT(y.avgMonth,0)}
                      </td>
                      <td style={{padding:'10px 12px',fontSize:12,color:'var(--text3)'}}>{y.months}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Transaction table — all, grouped by year */}
          <div className="card en-table-wrap" style={{marginTop:16}}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',display:'flex',
              alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:14,fontWeight:700}}>Tutte le transazioni</span>
              <span style={{fontSize:12,color:'var(--text3)'}}>{incomeTxs.length} totali</span>
            </div>
            {txsByYear.length === 0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:13}}>
                Nessuna entrata registrata
              </div>
            ) : (
              txsByYear.map(([year, txs]) => (
                <div key={year}>
                  <div style={{
                    padding:'6px 18px', background:'var(--bg2)',
                    borderBottom:'1px solid var(--border)',
                    fontSize:12, fontWeight:700, color:'var(--text3)',
                    letterSpacing:'.05em', textTransform:'uppercase',
                  }}>{year}</div>
                  <table className="en-table">
                    <thead>
                      <tr>
                        <th style={{width:60}}>Data</th>
                        <th>Descrizione</th>
                        <th style={{width:80}}>Fonte</th>
                        <th style={{textAlign:'right',width:110}}>Importo</th>
                        <th style={{textAlign:'center',width:130}}>Bonus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map(t => (
                        <tr key={t.txId} className="en-row">
                          <td style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                            {fmtDate(t._effDate||t.date)}
                          </td>
                          <td>
                            <div style={{fontSize:13,fontWeight:500}}>{t.descAI || t.description}</div>
                            <div style={{fontSize:11,color:'var(--text3)'}}>{t.description}</div>
                          </td>
                          <td><SourceBadge cat2={t.cat2}/></td>
                          <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--green)',whiteSpace:'nowrap'}}>
                            +€ {fmtIT(t.amount,2)}
                          </td>
                          <td style={{textAlign:'center'}}>
                            <BonusCell t={t} bonusMap={bonusMap} setBonusTx={setBonusTx}/>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </>
      )}
      </div>}
    </>
  )
}
