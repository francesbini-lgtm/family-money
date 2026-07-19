import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
// Importi NETTI post-compensazione (consolidamento 2026-07-12)
import { netAmt } from '../data/compensation'
import { useFinancials, getYM, ymLabel } from '../hooks/useFinancials'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line, LabelList
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
// Normalize: ensure effectiveDate exists (backward compat con righe solo-anno) e
// valuta esista (backward compat con righe create prima che la valuta fosse per-riga:
// eredita la vecchia valuta "globale per persona" se presente, altrimenti EUR)
function normalizeRalRow(r, legacyValuta) {
  return {
    ...r,
    effectiveDate: r.effectiveDate || (r.year ? `${r.year}-01` : ''),
    valuta: r.valuta || legacyValuta || 'EUR',
  }
}

function RalEditModal({ person, data, onSave, onClose }) {
  const [rows, setRows] = useState(() =>
    [...(data[person] || [])].map(normalizeRalRow)
      .map(r=>({...r, ral:String(r.ral??''), netto:String(r.netto??''), bonusLordo:String(r.bonusLordo??''), bonusNetto:String(r.bonusNetto??'')}))
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  )
  const [newDate, setNewDate]               = useState('')
  const [newRal, setNewRal]                 = useState('')
  const [newNetto, setNewNetto]             = useState('')
  const [newBonusLordo, setNewBonusLordo]   = useState('')
  const [newBonusNetto, setNewBonusNetto]   = useState('')

  function updateRow(i, field, val) {
    setRows(prev => prev.map((r, idx) => idx === i
      ? { ...r, [field]: val }   // store raw string; parse only on save
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
  function handleSave() {
    const parsed = rows.map(r => ({
      ...r,
      ral:        parseFloat(r.ral)        || 0,
      netto:      parseFloat(r.netto)      || 0,
      bonusLordo: parseFloat(r.bonusLordo) || 0,
      bonusNetto: parseFloat(r.bonusNetto) || 0,
    }))
    onSave({ ...data, [person]: parsed })
    onClose()
  }
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
                  <input className="en-ral-input" type="number" value={r.bonusLordo??''}
                    onChange={e => updateRow(i, 'bonusLordo', e.target.value)}
                    style={{borderColor:'rgba(184,148,42,.4)'}} />
                </td>
                <td>
                  <input className="en-ral-input" type="number" value={r.netto}
                    onChange={e => updateRow(i, 'netto', e.target.value)} />
                </td>
                <td>
                  <input className="en-ral-input" type="number" value={r.bonusNetto??''}
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

// ── Per-year FX rate lookup ───────────────────────────────
function getYearFxRate(year, ralSettings) {
  const rates = ralSettings?.fxRates || {}
  if (rates[String(year)] != null) return Number(rates[String(year)])
  return ralSettings?.fxRate || 1  // legacy single-rate fallback
}

// ── Historical CHF→EUR annual average rates ───────────────
const DEFAULT_CHFEUR_RATES = {
  '2014': 0.8232, '2015': 0.9359, '2016': 0.9174, '2017': 0.8997,
  '2018': 0.8657, '2019': 0.8991, '2020': 0.9341, '2021': 0.9247,
  '2022': 0.9953, '2023': 1.0293, '2024': 1.0521, '2025': 1.0753,
  '2026': 1.0811,
}

// ── RAL config modal (3 sections) ────────────────────────
function RalConfigModal({ ralData, ralSettings, onSaveData, onSaveSettings, onClose }) {
  const [section, setSection] = useState('cambio')
  const s = ralSettings || {}
  const currencies = ['EUR','CHF','USD','GBP','SEK']

  // ── Tassi di cambio state ──────────────────────────────
  const [fxRows, setFxRows] = useState(() => {
    const src = Object.keys(s.fxRates || {}).length > 0 ? s.fxRates : DEFAULT_CHFEUR_RATES
    return Object.entries(src)
      .map(([y, r]) => ({ year: String(y), rate: String(r) }))
      .sort((a, b) => Number(a.year) - Number(b.year))
  })
  const [newFxYear, setNewFxYear] = useState('')
  const [newFxRate, setNewFxRate] = useState('')

  function updateFx(i, field, val) { setFxRows(prev => prev.map((r,idx)=>idx===i?{...r,[field]:val}:r)) }
  function deleteFx(i)             { setFxRows(prev => prev.filter((_,idx)=>idx!==i)) }
  function addFx() {
    if (!newFxYear || !newFxRate) return
    setFxRows(prev => [...prev, {year:String(newFxYear), rate:String(newFxRate)}]
      .sort((a,b)=>Number(a.year)-Number(b.year)))
    setNewFxYear(''); setNewFxRate('')
  }
  function saveFxRates() {
    const fxRates = {}
    fxRows.forEach(r => { if (r.year) fxRates[r.year] = parseFloat(r.rate)||1 })
    onSaveSettings({ ...s, fxRates })
  }

  // ── Fra salary state ───────────────────────────────────
  // La valuta è ora per-riga (per periodo), non più unica per persona — ogni riga
  // porta il proprio campo `valuta`. normalizeRalRow eredita la vecchia valuta
  // globale (s.fraValuta) solo come fallback per righe salvate prima di questa modifica.
  const [fraRows, setFraRows] = useState(() =>
    [...(ralData.Fra||[])].map(r=>normalizeRalRow(r, s.fraValuta))
      .map(r=>({...r, ral:String(r.ral??''), netto:String(r.netto??''), bonusLordo:String(r.bonusLordo??''), bonusNetto:String(r.bonusNetto??'')}))
      .sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate))
  )
  const [fraND, setFraND] = useState(''); const [fraNR, setFraNR] = useState('')
  const [fraNN, setFraNN] = useState(''); const [fraNBL, setFraNBL] = useState('')
  const [fraNBN, setFraNBN] = useState(''); const [fraNV, setFraNV] = useState('EUR')

  // ── Sofi salary state ──────────────────────────────────
  const [sofiRows, setSofiRows] = useState(() =>
    [...(ralData.Sofi||[])].map(r=>normalizeRalRow(r, s.sofiValuta))
      .map(r=>({...r, ral:String(r.ral??''), netto:String(r.netto??''), bonusLordo:String(r.bonusLordo??''), bonusNetto:String(r.bonusNetto??'')}))
      .sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate))
  )
  const [sofiND, setSofiND] = useState(''); const [sofiNR, setSofiNR] = useState('')
  const [sofiNN, setSofiNN] = useState(''); const [sofiNBL, setSofiNBL] = useState('')
  const [sofiNBN, setSofiNBN] = useState(''); const [sofiNV, setSofiNV] = useState('EUR')

  function mkRowUpdater(setR) {
    return (i, field, val) => setR(prev => prev.map((r,idx)=>idx===i
      ? {...r,[field]: val}   // keep raw string so cursor never jumps
      : r
    ))
  }
  function mkRowDeleter(setR) { return (i) => setR(prev=>prev.filter((_,idx)=>idx!==i)) }
  function mkRowAdder(rows, setR, nd, setND, nr, setNR, nn, setNN, nbl, setNBL, nbn, setNBN, nv, setNV) {
    return () => {
      if (!nd) return
      if (rows.find(r=>r.effectiveDate===nd)) return
      setR(prev=>[...prev,{
        effectiveDate:nd, year:parseInt(nd.slice(0,4)), valuta:nv||'EUR',
        ral:parseFloat(nr)||0, netto:parseFloat(nn)||0,
        bonusLordo:parseFloat(nbl)||0, bonusNetto:parseFloat(nbn)||0,
      }].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)))
      setND(''); setNR(''); setNN(''); setNBL(''); setNBN(''); setNV('EUR')
    }
  }

  const updateFra  = mkRowUpdater(setFraRows)
  const deleteFra  = mkRowDeleter(setFraRows)
  const addFra     = mkRowAdder(fraRows, setFraRows, fraND,setFraND, fraNR,setFraNR, fraNN,setFraNN, fraNBL,setFraNBL, fraNBN,setFraNBN, fraNV,setFraNV)
  const updateSofi = mkRowUpdater(setSofiRows)
  const deleteSofi = mkRowDeleter(setSofiRows)
  const addSofi    = mkRowAdder(sofiRows, setSofiRows, sofiND,setSofiND, sofiNR,setSofiNR, sofiNN,setSofiNN, sofiNBL,setSofiNBL, sofiNBN,setSofiNBN, sofiNV,setSofiNV)

  // La valuta ora viaggia dentro ogni riga (r.valuta) — non c'è più un valutaKey
  // a livello di persona da salvare separatamente in ralSettings
  function saveSalary(person) {
    const rawRows = person==='Fra' ? fraRows : sofiRows
    const rows = rawRows.map(r => ({
      ...r,
      valuta:     r.valuta || 'EUR',
      ral:        parseFloat(r.ral)        || 0,
      netto:      parseFloat(r.netto)      || 0,
      bonusLordo: parseFloat(r.bonusLordo) || 0,
      bonusNetto: parseFloat(r.bonusNetto) || 0,
    }))
    onSaveData({ ...ralData, [person]: rows })
  }

  const inp = {
    width:'100%', padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6,
    background:'var(--bg)', color:'var(--text)', fontSize:12,
    fontFamily:'var(--font-mono)', boxSizing:'border-box',
  }
  const lbl = {
    fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em',
    color:'var(--text3)', marginBottom:3, display:'block',
  }
  const secBtnStyle = (id) => ({
    padding:'8px 16px', border:'none', background:'transparent', cursor:'pointer',
    fontWeight:600, fontSize:13, fontFamily:'var(--font-sans)',
    borderBottom: section===id ? '2px solid var(--accent,#b8942a)' : '2px solid transparent',
    color: section===id ? 'var(--accent,#b8942a)' : 'var(--text3)',
    marginBottom:-1, transition:'color .12s',
  })

  // NB: plain render function, NOT a component — se fosse un componente definito qui dentro,
  // ogni keystroke lo ricreerebbe (nuova identità) e React smonterebbe/rimonterebbe gli input → focus perso
  function renderSalarySection({ person, rows, updateRow, deleteRow, addRow,
    nd, setNd, nr, setNr, nn, setNn, nbl, setNbl, nbn, setNbn, nv, setNv }) {
    const color = COLORS[person]||'#888'
    return (
      <div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>
          La valuta si imposta per singolo periodo (riga) — utile se {person} ha cambiato valuta di stipendio nel tempo (es. trasferimento all'estero).
        </div>
        <table className="en-ral-table">
          <thead><tr>
            <th>Data inizio</th><th>Valuta</th><th>RAL</th>
            <th style={{color:'var(--gold,#b8942a)'}}>+ Lordo Bonus</th>
            <th>Netto annuo</th>
            <th style={{color:'var(--gold,#b8942a)'}}>+ Netto Bonus</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i}>
                <td><input className="en-ral-input" type="month" value={r.effectiveDate}
                  onChange={e=>updateRow(i,'effectiveDate',e.target.value)} style={{minWidth:130}}/></td>
                <td>
                  <select value={r.valuta||'EUR'} onChange={e=>updateRow(i,'valuta',e.target.value)}
                    style={{...inp,fontFamily:'var(--font-sans)'}}>
                    {currencies.map(c=><option key={c}>{c}</option>)}
                  </select>
                </td>
                <td><input className="en-ral-input" type="number" value={r.ral}
                  onChange={e=>updateRow(i,'ral',e.target.value)}/></td>
                <td><input className="en-ral-input" type="number" value={r.bonusLordo??''}
                  onChange={e=>updateRow(i,'bonusLordo',e.target.value)}
                  style={{borderColor:'rgba(184,148,42,.4)'}}/></td>
                <td><input className="en-ral-input" type="number" value={r.netto}
                  onChange={e=>updateRow(i,'netto',e.target.value)}/></td>
                <td><input className="en-ral-input" type="number" value={r.bonusNetto??''}
                  onChange={e=>updateRow(i,'bonusNetto',e.target.value)}
                  style={{borderColor:'rgba(184,148,42,.4)'}}/></td>
                <td><button className="en-ral-del" onClick={()=>deleteRow(i)}>✕</button></td>
              </tr>
            ))}
            <tr className="en-ral-add-row">
              <td><input className="en-ral-input" type="month" value={nd}
                onChange={e=>setNd(e.target.value)} style={{minWidth:130}}/></td>
              <td>
                <select value={nv} onChange={e=>setNv(e.target.value)}
                  style={{...inp,fontFamily:'var(--font-sans)'}}>
                  {currencies.map(c=><option key={c}>{c}</option>)}
                </select>
              </td>
              <td><input className="en-ral-input" type="number" placeholder="RAL" value={nr}
                onChange={e=>setNr(e.target.value)}/></td>
              <td><input className="en-ral-input" type="number" placeholder="Bonus lordo" value={nbl}
                onChange={e=>setNbl(e.target.value)} style={{borderColor:'rgba(184,148,42,.4)'}}/></td>
              <td><input className="en-ral-input" type="number" placeholder="Netto" value={nn}
                onChange={e=>setNn(e.target.value)}/></td>
              <td><input className="en-ral-input" type="number" placeholder="Bonus netto" value={nbn}
                onChange={e=>setNbn(e.target.value)} style={{borderColor:'rgba(184,148,42,.4)'}}/></td>
              <td><button className="en-ral-add-btn" onClick={addRow} disabled={!nd}>+</button></td>
            </tr>
          </tbody>
        </table>
        <button className="en-ral-save-btn" style={{marginTop:14}}
          onClick={()=>saveSalary(person)}>✓ Salva {person}</button>
      </div>
    )
  }

  return (
    <div className="en-ral-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="en-ral-modal" style={{maxWidth:760}}>
        <button className="en-ral-close" onClick={onClose}>✕</button>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
          <span style={{fontSize:16,fontWeight:700}}>⚙️ Impostazioni Stipendio</span>
        </div>

        {/* Section tabs */}
        <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:20}}>
          <button style={secBtnStyle('cambio')} onClick={()=>setSection('cambio')}>💱 Tassi di cambio</button>
          <button style={secBtnStyle('fra')}    onClick={()=>setSection('fra')}>
            <span style={{color:COLORS.Fra,marginRight:4}}>●</span>Salario Fra
          </button>
          <button style={secBtnStyle('sofi')}   onClick={()=>setSection('sofi')}>
            <span style={{color:COLORS.Sofi,marginRight:4}}>●</span>Salario Sofi
          </button>
        </div>

        {/* ── Tassi di cambio section ── */}
        {section === 'cambio' && (
          <div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:14}}>
              Imposta il tasso di cambio per anno. Usato quando una persona ha salario in valuta non EUR.
              <br/>Formato: 1 unità di valuta estera = X euro (es. 1 CHF = 0.9350 EUR).
            </div>
            <table className="en-ral-table">
              <thead><tr>
                <th>Anno</th>
                <th>Tasso → EUR (es. 0.9350)</th>
                <th></th>
              </tr></thead>
              <tbody>
                {fxRows.map((r,i) => (
                  <tr key={i}>
                    <td><input className="en-ral-input" type="number" min="2000" max="2099"
                      value={r.year} onChange={e=>updateFx(i,'year',e.target.value)}
                      style={{fontFamily:'var(--font-sans)'}}/></td>
                    <td><input className="en-ral-input" type="number" step="0.0001"
                      value={r.rate} onChange={e=>updateFx(i,'rate',e.target.value)}/></td>
                    <td><button className="en-ral-del" onClick={()=>deleteFx(i)}>✕</button></td>
                  </tr>
                ))}
                <tr className="en-ral-add-row">
                  <td><input className="en-ral-input" type="number" placeholder="Anno" value={newFxYear}
                    onChange={e=>setNewFxYear(e.target.value)} style={{fontFamily:'var(--font-sans)'}}/></td>
                  <td><input className="en-ral-input" type="number" step="0.0001" placeholder="es. 0.9350"
                    value={newFxRate} onChange={e=>setNewFxRate(e.target.value)}/></td>
                  <td><button className="en-ral-add-btn" onClick={addFx}
                    disabled={!newFxYear||!newFxRate}>+</button></td>
                </tr>
              </tbody>
            </table>
            <button className="en-ral-save-btn" style={{marginTop:14}} onClick={saveFxRates}>
              ✓ Salva tassi
            </button>
          </div>
        )}

        {/* ── Salary sections ── */}
        {section === 'fra' && renderSalarySection({ person:'Fra',
          rows:fraRows, updateRow:updateFra, deleteRow:deleteFra, addRow:addFra,
          nd:fraND, setNd:setFraND, nr:fraNR, setNr:setFraNR,
          nn:fraNN, setNn:setFraNN, nbl:fraNBL, setNbl:setFraNBL,
          nbn:fraNBN, setNbn:setFraNBN, nv:fraNV, setNv:setFraNV })}
        {section === 'sofi' && renderSalarySection({ person:'Sofi',
          rows:sofiRows, updateRow:updateSofi, deleteRow:deleteSofi, addRow:addSofi,
          nd:sofiND, setNd:setSofiND, nr:sofiNR, setNr:setSofiNR,
          nn:sofiNN, setNn:setSofiNN, nbl:sofiNBL, setNbl:setSofiNBL,
          nbn:sofiNBN, setNbn:setSofiNBN, nv:sofiNV, setNv:setSofiNV })}
      </div>
    </div>
  )
}

// ── Date helpers ──────────────────────────────────────────
// offsetMonths: richiesta utente 2026-07-19 — permette di sfogliare la
// finestra a blocchi di 12 mesi (0 = i 12 mesi correnti, 12 = i 12 precedenti, ecc.)
function getLastNMonths(n, now = new Date(), offsetMonths = 0) {
  const months = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i - offsetMonths, 1)
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
// ── Tab pill — stesso stile di UscitePage.jsx (richiesta utente 2026-07-14) ──
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
  // Richiesta utente 2026-07-19: sfoglia a blocchi di 12 mesi (solo period==='month')
  // e toggle per scorporare/fondere il bonus nel chart "Entrate per fonte"
  const [monthOffset, setMonthOffset]           = useState(0)
  const [chartBonusSeparate, setChartBonusSeparate] = useState(true)
  useEffect(() => { setMonthOffset(0) }, [period])

  // RAL / Netto chart state — read directly from appPrefs (reactive via Zustand)
  const ralData     = appPrefs?.ralData     || DEFAULT_RAL_DATA
  const ralSettings = appPrefs?.ralSettings || { fxRate: 1 }
  const [ralView,         setRalView]         = useState('netto') // 'ral' | 'netto'
  const [ralWithBonus,    setRalWithBonus]     = useState(false)
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
  const chartMonths = useMemo(() => getLastNMonths(12, now, monthOffset), [monthOffset])
  const chartData = useMemo(() => {
    if (period === 'month') {
      // 12 mesi — sfogliabili a blocchi di 12 tramite monthOffset
      return chartMonths.map(ym => {
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
  }, [period, incomeTxs, bonusMap, allYears, chartMonths])

  // Richiesta utente 2026-07-19: toggle "con bonus" — fonde Fra-Bonus/Sofi-Bonus
  // dentro Fra/Sofi quando disattivato (i totali non cambiano, solo la scomposizione
  // visiva); il flag bonus per singola transazione resta gestito nella tabella
  // "Tutte le transazioni" più sotto (BonusCell/bonusMap) indipendentemente da questo toggle.
  const chartDataDisplay = useMemo(() => {
    if (chartBonusSeparate) return chartData
    // Richiesta utente 2026-07-19 (correzione): "con bonus" OFF non deve fondere
    // il bonus dentro Fra/Sofi — deve escluderlo del tutto dal chart (solo stipendio base)
    return chartData.map(row => ({
      label: row.label,
      Fra:  row['Fra']  || 0,
      Sofi: row['Sofi'] || 0,
    }))
  }, [chartData, chartBonusSeparate])

  // ── KPIs — always YTD ─────────────────────────────────
  const yearStr = now.getFullYear().toString()
  const ytdTxs  = useMemo(() => incomeTxs.filter(t => (t._effDate||t.date).startsWith(yearStr)), [incomeTxs])
  const ytdTotal = ytdTxs.reduce((s, t) => s + netAmt(t), 0)
  const ytdFra   = ytdTxs.filter(t => t.cat2 === 'Fra').reduce((s, t) => s + netAmt(t), 0)
  const ytdSofi  = ytdTxs.filter(t => t.cat2 === 'Sofi').reduce((s, t) => s + netAmt(t), 0)

  // Average monthly (last 6 months)
  const last6months = useMemo(() => getLastNMonths(6, now), [])
  const avgMonthly  = useMemo(() => {
    const total = last6months.reduce((s, ym) =>
      s + incomeTxs.filter(t => (t._effDate||t.date).startsWith(ym)).reduce((ss, t) => ss + netAmt(t), 0)
    , 0)
    return total / 6
  }, [incomeTxs, last6months])

  // ── Yearly history table — all years desc ─────────────
  const yearlyHistory = useMemo(() =>
    [...allYears].reverse().map(year => {
      const yStr = String(year)
      const yTxs = incomeTxs.filter(t => (t._effDate||t.date).startsWith(yStr))
      // fra/sofi = intero importo delle transazioni (bonus incluso, senza scorporo in tabella)
      const fra   = yTxs.filter(t => t.cat2 === 'Fra').reduce((s,t) => s + netAmt(t), 0)
      const sofi  = yTxs.filter(t => t.cat2 === 'Sofi').reduce((s,t) => s + netAmt(t), 0)
      const total = fra + sofi
      const months   = new Set(yTxs.map(t => (t._effDate||t.date).slice(0,7))).size
      const avgMonth = months > 0 ? total / months : 0
      return { year, fra, sofi, total, avgMonth, months }
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

  const activeCats = INCOME_CATS.filter(c => chartDataDisplay.some(m => m[c] > 0))
  const topCat     = activeCats.at(-1)
  // Richiesta utente 2026-07-19 (correzione): la legenda mostra solo le persone
  // base (Fra/Sofi) — niente voce separata per il bonus, anche quando è
  // scorporato nel chart (si distingue lì solo per tonalità più chiara)
  const legendCats = activeCats.filter(c => c === 'Fra' || c === 'Sofi')

  // Richiesta utente 2026-07-19: totale in alto su ogni colonna dell'istogramma
  // "Entrate per fonte (Fra + Sofi)", in formato breve (es. "50k" non "€50.000")
  function fmtCompactK(n) {
    if (!n) return ''
    return Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
  }
  function IncomeBarTotalLabel({ x, y, width, index }) {
    if (index == null || !chartDataDisplay[index]) return null
    const total = activeCats.reduce((s, c) => s + (chartDataDisplay[index][c] || 0), 0)
    if (!total) return null
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10}
        fontWeight={700} fill="var(--text2)" style={{ pointerEvents: 'none' }}>
        {fmtCompactK(total)}
      </text>
    )
  }

  // Richiesta utente 2026-07-19: 3 KPI (Media/Max/Min) sotto il chart, calcolati
  // sui totali per barra ATTUALMENTE mostrati (rispettano period/monthOffset/toggle bonus)
  const chartTotals = chartDataDisplay.map(row => activeCats.reduce((s, c) => s + (row[c] || 0), 0)).filter(v => v > 0)
  const chartAvg = chartTotals.length ? chartTotals.reduce((s, v) => s + v, 0) / chartTotals.length : 0
  const chartMax = chartTotals.length ? Math.max(...chartTotals) : 0
  const chartMin = chartTotals.length ? Math.min(...chartTotals) : 0

  return (
    <>
      {/* Header + tab pills — stesso schema padding/stile di UscitePage (richiesta utente 2026-07-14) */}
      <div className="en-root">
        <div className="en-header">
          <div>
            <h1 className="en-title">📈 Entrate e Stipendi</h1>
            <div className="en-sub">
              Solo stipendi <strong>Entrate · Fra</strong> e <strong>Entrate · Sofi</strong> — escluse altre entrate
            </div>
          </div>
          {tab === 'stipendi' && (
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
          )}
        </div>

        {/* Tab switcher — pill style, come in UscitePage */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
          <TabPill label="💰 Stipendi"      active={tab==='stipendi'} onClick={()=>setTab('stipendi')}/>
          <TabPill label="💸 Altre Entrate" active={tab==='altre'}    onClick={()=>setTab('altre')}/>
        </div>
      </div>

      {tab === 'altre' && <AltreEntratePage />}
      {tab === 'stipendi' && <div className="en-page">

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
            // Build RAL chart data using effectiveDate-based row lookup. La valuta è
            // per-riga (r.valuta) — ogni periodo può avere una valuta diversa, non più
            // un'unica valuta fissa per persona.
            const fraRows  = (ralData.Fra  || []).map(normalizeRalRow)
            const sofiRows = (ralData.Sofi || []).map(normalizeRalRow)
            const hasNonEur = fraRows.some(r => (r.valuta||'EUR') !== 'EUR') || sofiRows.some(r => (r.valuta||'EUR') !== 'EUR')
            // Derive years from all effectiveDates
            const allDates = [
              ...fraRows.map(r => r.effectiveDate || `${r.year}-01`),
              ...sofiRows.map(r => r.effectiveDate || `${r.year}-01`),
            ]
            const ralYears = [...new Set(allDates.map(d => parseInt(d.slice(0,4))))].sort((a,b)=>a-b)
            const ralChartData = ralYears.map(yr => {
              const frR = getActiveRalForYear(fraRows, yr)
              const soR = getActiveRalForYear(sofiRows, yr)
              const fraFx  = frR && (frR.valuta||'EUR') !== 'EUR' ? getYearFxRate(yr, ralSettings) : 1
              const sofiFx = soR && (soR.valuta||'EUR') !== 'EUR' ? getYearFxRate(yr, ralSettings) : 1
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
                  <div className="en-chart-header" style={{flexWrap:'wrap',rowGap:8}}>
                    <span className="en-chart-title">Entrate per fonte (Fra + Sofi)</span>
                    {/* Legenda spostata qui in linea col titolo (richiesta utente 2026-07-19,
                        era in fondo al chart via <Legend/> di recharts) */}
                    <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                        {legendCats.map(cat => (
                          <span key={cat} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--text2)'}}>
                            <span style={{width:8,height:8,borderRadius:'50%',background:COLORS[cat],display:'inline-block'}}/>
                            {cat}
                          </span>
                        ))}
                      </div>
                      {/* Toggle "con bonus" — scorpora Fra-Bonus/Sofi-Bonus (default) oppure li fonde in Fra/Sofi */}
                      <button onClick={()=>setChartBonusSeparate(v=>!v)}
                        title="Scorpora/fondi il bonus dentro Fra e Sofi"
                        style={{padding:'3px 10px',border:`1px solid ${chartBonusSeparate?'var(--gold,#b8942a)':'var(--border)'}`,
                          borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:700,transition:'all .15s',
                          background:chartBonusSeparate?'rgba(184,148,42,.15)':'transparent',
                          color:chartBonusSeparate?'var(--gold,#b8942a)':'var(--text3)'}}>
                        🎯 con bonus
                      </button>
                      {/* Sfoglia a blocchi di 12 mesi — solo vista Mese */}
                      {period==='month' && (
                        <div style={{display:'flex',alignItems:'center',gap:2,background:'var(--surface2)',
                          border:'1px solid var(--border)',borderRadius:8,padding:'2px 4px'}}>
                          <button onClick={()=>setMonthOffset(o=>o+12)} title="12 mesi indietro"
                            style={{border:'none',background:'none',cursor:'pointer',fontSize:14,color:'var(--text2)',padding:'0 4px',lineHeight:1}}>‹</button>
                          <span style={{fontSize:10,fontWeight:600,color:'var(--text3)',minWidth:74,textAlign:'center',fontFamily:'var(--font-mono)'}}>
                            {chartMonths.length ? `${shortDate(chartMonths[0]).replace(' ','').toUpperCase()}-${shortDate(chartMonths[chartMonths.length-1]).replace(' ','').toUpperCase()}` : ''}
                          </span>
                          <button onClick={()=>setMonthOffset(o=>Math.max(0,o-12))} disabled={monthOffset===0} title="12 mesi avanti"
                            style={{border:'none',background:'none',cursor:monthOffset===0?'default':'pointer',fontSize:14,
                              color:monthOffset===0?'var(--border)':'var(--text2)',padding:'0 4px',lineHeight:1}}>›</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartDataDisplay} barCategoryGap="35%" margin={{top:16,bottom:20}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="label" tick={{fontSize:9,fill:'var(--text3)'}} axisLine={false} tickLine={false}
                        interval={0} angle={-35} textAnchor="end" height={44}/>
                      <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={52}
                        tickFormatter={v => v>=1000 ? `€${(v/1000).toFixed(0)}K` : `€${v}`}/>
                      <Tooltip formatter={(v,n) => [`€ ${fmtIT(v,0)}`, n]}
                        contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
                      {activeCats.map(cat => (
                        <Bar key={cat} dataKey={cat} name={cat} fill={COLORS[cat]} stackId="a"
                          radius={cat === topCat ? [4,4,0,0] : [0,0,0,0]}>
                          {cat === topCat && <LabelList content={<IncomeBarTotalLabel/>}/>}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  {/* 3 KPI richiesti dall'utente 2026-07-19: Media/Max/Min sui totali per
                      barra ATTUALMENTE mostrati (rispettano period/sfoglia/toggle bonus) */}
                  <div style={{display:'flex',gap:10,marginTop:12}}>
                    <div style={{flex:1,textAlign:'center',padding:'8px 6px',background:'var(--surface2)',borderRadius:8}}>
                      <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>Media</div>
                      <div style={{fontSize:14,fontWeight:700,fontFamily:'var(--font-mono)'}}>€ {fmtIT(Math.round(chartAvg),0)}</div>
                    </div>
                    <div style={{flex:1,textAlign:'center',padding:'8px 6px',background:'var(--surface2)',borderRadius:8}}>
                      <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>Max</div>
                      <div style={{fontSize:14,fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--green)'}}>€ {fmtIT(Math.round(chartMax),0)}</div>
                    </div>
                    <div style={{flex:1,textAlign:'center',padding:'8px 6px',background:'var(--surface2)',borderRadius:8}}>
                      <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>Min</div>
                      <div style={{fontSize:14,fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--red)'}}>€ {fmtIT(Math.round(chartMin),0)}</div>
                    </div>
                  </div>
                </div>

                {/* Chart 2 — Stipendio RAL vs Netto */}
                <div className="card en-chart-card" style={{position:'relative'}}>
                  {/* Top-right toggles — RAL | Netto + con bonus + gear */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                    <span className="en-chart-title">Stipendio (RAL vs Netto)</span>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
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
                  {/* Bottom-right gear */}
                  <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                    <button onClick={() => setShowRalSettings(true)}
                      title="Impostazioni stipendio, tassi di cambio e salari"
                      style={{
                        padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,
                        background:'var(--bg)',cursor:'pointer',fontSize:13,
                        color:'var(--text3)',transition:'all .15s',
                      }}>⚙️</button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* RAL Config Modal */}
          {showRalSettings && (
            <RalConfigModal
              ralData={ralData}
              ralSettings={ralSettings}
              onSaveData={saveRalData}
              onSaveSettings={saveRalSettings}
              onClose={() => setShowRalSettings(false)}
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
                      </td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:13}}>
                        <span style={{color:COLORS.Sofi,fontWeight:600}}>€ {fmtIT(y.sofi,0)}</span>
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
