import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { CATS, CAT_NAMES, getMergedCats } from '../data/categories'
import Modal, { ModalFooter, FormRow, Input } from '../components/Modal'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import './CalendarioPage.css'
import { fmtIT } from '../utils/format'
import { useVacations, useNotVacationDates } from '../hooks/useCalendarVacations'
import { groupConsecutiveDates, labelToEmoji, destCategoryLabel } from '../data/vacationRules'

// ── Net amount after compensation ──────────────────────────
// Consolidamento 2026-07-12: si usa il modulo condiviso (compensation.js) —
// la copia locale divergeva per gli importi POSITIVI (non sottraeva
// _compensatedAmt), mostrando residui fantasma sulle entrate compensate.
import { netAmt } from '../data/compensation'

const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
const DAYS_IN_MONTH = (y, m) => new Date(y, m + 1, 0).getDate()
const IS_WEEKEND = (y, m, d) => { const dow = new Date(y, m, d).getDay(); return dow === 0 || dow === 6 }

// ── Vacation emoji from city name ─────────────────────────
function cityToVacEmoji(city = '') {
  const n = city.toLowerCase()
  const beach = ['mare','sard','rimini','cost','bagn','lido','lignan','riccione','cattolica','riviera','tropea','sicil','calabr','puglia','salent','amalfi','elba','capri','ischia','taormin','eolie','positano','gallipoli','otranto','vieste','ibiza','mykonos','maiorca','tenerife','palermo','catania']
  const mtn   = ['mont','alp','dolomit','aosta','neve','ski','snowboard','courmayeur','livigno','madonna','sestriere','bormio','cervinia','cortina','trentino','val di fass','val garden','alta badia','davos','zermatt','innsbruck','salzburg']
  if (beach.some(k => n.includes(k))) return '🌴'
  if (mtn.some(k => n.includes(k)))   return '⛰️'
  return '🏖️'
}

// ── Day cell ──────────────────────────────────────────────
function DayCell({ year, month, day, txs, filter, vacations, boatDaySet, quickFilter, onClick, cityOverrides, onCityEdit, selectMode, selected, notVacSet, onCellMouseDown, onCellMouseEnter }) {
  const isWeekend = IS_WEEKEND(year, month, day)
  const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`

  const [editingCity, setEditingCity] = useState(false)
  const [cityInput, setCityInput]     = useState('')

  // All transactions this day (unfiltered) — needed for vacation/boat detection
  const allDayTxs = useMemo(() =>
    txs.filter(t => (t._effDate||t.date) === dateStr && !t.excluded)
  , [txs, dateStr])

  // Filter transactions for display
  const dayTxs = useMemo(() => {
    let t = allDayTxs
    if (filter.type === 'income')  t = t.filter(x => x.amount > 0)
    if (filter.type === 'expense') t = t.filter(x => x.amount < 0)
    if (filter.cat1) t = t.filter(x => x.cat1 === filter.cat1)
    return t
  }, [allDayTxs, filter])

  // When vacation quick-filter is active, show only Weekend e Vacanze costs in cell
  const displayTxs = useMemo(() =>
    quickFilter === 'vacation'
      ? dayTxs.filter(t => t.cat1 === 'Weekend e Vacanze')
      : dayTxs
  , [dayTxs, quickFilter])

  // Spese compensate a zero (o quasi, per arrotondamenti float) non contano come "dato presente" nella cella
  const shownDisplayTxs = displayTxs.filter(t => !(t.amount < 0 && Math.abs(netAmt(t)) < 0.005))

  const total   = shownDisplayTxs.reduce((s, t) => s + netAmt(t), 0)
  const hasData = shownDisplayTxs.length > 0

  // Most frequent city that day (ignore nulls / 'null' strings)
  const dominantCity = useMemo(() => {
    const freq = {}
    for (const t of displayTxs) {
      const c = t.city && t.city !== 'null' ? t.city : null
      if (c) freq[c] = (freq[c] || 0) + 1
    }
    const entries = Object.entries(freq)
    if (!entries.length) return null
    return entries.sort((a, b) => b[1] - a[1])[0][0]
  }, [displayTxs])

  // Override takes priority over auto-detected city
  const effectiveCity = cityOverrides?.[dateStr] ?? dominantCity

  // Vacation overlap (manual periods — blue background)
  const vacs  = vacations.filter(v => dateStr >= v.from && dateStr <= v.to)
  const isVac = vacs.length > 0

  // Richiesta utente 2026-07-12: nel Calendario si vedono SOLO le vacanze
  // CONFERMATE (appPrefs.calendarVacations, gestite da Weekend e Vacanze v2) —
  // i giorni con sole spese "Weekend e Vacanze" non vengono più mostrati come
  // vacanza automatica/rilevata (isVacTx rimosso).

  // Emoji per TIPO di destinazione della vacanza dichiarata (mare/montagna/
  // città/altro — v.destType impostato in Weekend e Vacanze v2), con fallback
  // sull'euristica dal nome/città
  const vacIcon = useMemo(() => {
    if (!isVac) return null
    const v = vacs[0]
    const label = v?.destType || destCategoryLabel(v?.city || v?.name || '')
    return labelToEmoji(label) || cityToVacEmoji(v?.city || v?.name || '')
  }, [isVac, vacs])

  // Boat trip
  const isBoat = boatDaySet.has(dateStr)

  // Quick-filter dimming
  const isAnyVac = isVac
  const isDimmed = (quickFilter === 'boat' && !isBoat) ||
                   (quickFilter === 'vacation' && !isAnyVac)

  const today = new Date().toISOString().slice(0,10) === dateStr

  function startCityEdit(e) {
    e.stopPropagation()
    setCityInput(effectiveCity || '')
    setEditingCity(true)
  }

  function commitCityEdit() {
    const val = cityInput.trim()
    onCityEdit(dateStr, val)
    setEditingCity(false)
  }

  return (
    <td
      className={[
        'cal-cell',
        isWeekend  ? 'weekend' : '',
        isAnyVac   ? 'vacation' : '',
        today      ? 'today' : '',
        hasData    ? 'has-data' : '',
        isDimmed   ? 'dimmed' : '',
        selectMode ? 'selectable' : '',
        selected   ? 'cell-selected' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => { if (!selectMode) onClick(dateStr, dayTxs, vacs) }}
      onMouseDown={selectMode ? (e => { e.preventDefault(); onCellMouseDown([dateStr]) }) : undefined}
      onMouseEnter={selectMode ? (() => onCellMouseEnter([dateStr])) : undefined}
      title={selectMode ? dateStr : [...vacs.map(v => v.name), isBoat ? '🚤 Uscita in barca' : ''].filter(Boolean).join(' · ')}
    >
      <div className="cal-day-num">{day}</div>
      {(isBoat || vacIcon) && (
        <div className="cal-day-emoji">
          {isBoat && <span>🚤</span>}
          {vacIcon && <span>{vacIcon}</span>}
        </div>
      )}
      {hasData && (
        <div className={`cal-day-total ${total >= 0 ? 'positive' : 'negative'}`}>
          {Math.abs(Math.round(total)).toLocaleString('it-IT')}
        </div>
      )}
      {editingCity ? (
        <input
          className="cal-city-input"
          value={cityInput}
          onChange={e => setCityInput(e.target.value)}
          onBlur={commitCityEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') commitCityEdit()
            if (e.key === 'Escape') setEditingCity(false)
            e.stopPropagation()
          }}
          onClick={e => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <div
          className={`cal-day-city${effectiveCity ? '' : ' cal-day-city-empty'}`}
          title={effectiveCity ? effectiveCity : 'Clicca per aggiungere location'}
          onClick={selectMode ? undefined : startCityEdit}
        >
          {effectiveCity ? effectiveCity.split(' ')[0] : ''}
        </div>
      )}
    </td>
  )
}

// ── Merged cell (consecutive days with same city) ─────────
function MergedCell({ year, month, startDay, endDay, city, txs, filter, vacations, boatDaySet, quickFilter, onCityEditRange, onClick, selectMode, selected, notVacSet, onCellMouseDown, onCellMouseEnter }) {
  const colspan = endDay - startDay + 1
  const [editingCity, setEditingCity] = useState(false)
  const [cityInput, setCityInput]     = useState('')

  const total = useMemo(() => {
    let sum = 0
    for (let d = startDay; d <= endDay; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      txs.filter(t => {
        if ((t._effDate||t.date) !== dateStr || t.excluded) return false
        if (filter.type === 'income'  && t.amount <= 0) return false
        if (filter.type === 'expense' && t.amount >= 0) return false
        if (filter.cat1 && t.cat1 !== filter.cat1) return false
        if (quickFilter === 'vacation' && t.cat1 !== 'Weekend e Vacanze') return false
        return true
      }).forEach(t => { sum += netAmt(t) })
    }
    return sum
  }, [txs, filter, quickFilter, year, month, startDay, endDay])

  const hasVac = useMemo(() => {
    for (let d = startDay; d <= endDay; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      if (vacations.some(v => dateStr >= v.from && dateStr <= v.to)) return true
      if (notVacSet?.has(dateStr)) continue
      if (txs.some(t => !t.excluded && (t._effDate||t.date) === dateStr && t.cat1 === 'Weekend e Vacanze')) return true
    }
    return false
  }, [txs, vacations, year, month, startDay, endDay, notVacSet])

  const firstDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`

  // Weekend anche per le celle unite (modalità 🌴 Vacanze) — vero solo se TUTTI i
  // giorni coperti dalla cella sono sabato/domenica (una cella unita che mescola
  // giorni feriali e weekend non viene tratteggiata, sarebbe fuorviante)
  const isWeekendCell = useMemo(() => {
    for (let d = startDay; d <= endDay; d++) {
      if (!IS_WEEKEND(year, month, d)) return false
    }
    return true
  }, [year, month, startDay, endDay])

  // Tutte le date coperte da questa cella unita — usate per la selezione multipla
  const rangeDates = useMemo(() => {
    const arr = []
    for (let d = startDay; d <= endDay; d++) {
      arr.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
    }
    return arr
  }, [year, month, startDay, endDay])

  function commitCityEdit() {
    const val = cityInput.trim()
    onCityEditRange(year, month, startDay, endDay, val)
    setEditingCity(false)
  }

  return (
    <td
      className={`cal-cell cal-merged-cell${isWeekendCell ? ' weekend' : ''}${hasVac ? ' vacation' : ''}${selectMode ? ' selectable' : ''}${selected ? ' cell-selected' : ''}`}
      colSpan={colspan}
      onClick={() => { if (!selectMode) onClick(firstDateStr) }}
      onMouseDown={selectMode ? (e => { e.preventDefault(); onCellMouseDown(rangeDates) }) : undefined}
      onMouseEnter={selectMode ? (() => onCellMouseEnter(rangeDates)) : undefined}
      title={selectMode ? `${rangeDates[0]} → ${rangeDates[rangeDates.length-1]}` : city}
    >
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:'100%', padding:'2px 5px', gap:3 }}>
        {total !== 0 && (
          <div className={`cal-day-total ${total >= 0 ? 'positive' : 'negative'}`} style={{ fontSize:9, flex:1 }}>
            {Math.abs(Math.round(total)).toLocaleString('it-IT')}
          </div>
        )}
        {editingCity ? (
          <input
            className="cal-city-input"
            value={cityInput}
            onChange={e => setCityInput(e.target.value)}
            onBlur={commitCityEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCityEdit()
              if (e.key === 'Escape') setEditingCity(false)
              e.stopPropagation()
            }}
            onClick={e => e.stopPropagation()}
            autoFocus
            style={{ width: '50%' }}
          />
        ) : (
          <div
            className="cal-day-city"
            style={{ opacity:1, fontWeight:700, fontSize:9, flexShrink:0, cursor:'pointer' }}
            onClick={selectMode ? undefined : e => { e.stopPropagation(); setCityInput(city || ''); setEditingCity(true) }}
            title="Clicca per modificare location"
          >
            {city ? city.split(' ')[0] : ''}
          </div>
        )}
      </div>
    </td>
  )
}

// ── Inline tx editor row ─────────────────────────────────
function TxEditRow({ tx }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats        = useStore(s => s.customCats)
  const allCats = useMemo(() => getMergedCats(customCats), [customCats])
  const [open, setOpen]       = useState(false)
  const [date, setDate]       = useState(tx.competenza || tx._effDate || tx.date || '')
  const [descAI, setDescAI]   = useState(tx.descAI || '')
  const [cat1, setCat1]       = useState(tx.cat1 || '')
  const [cat2, setCat2]       = useState(tx.cat2 || '')
  const [saved, setSaved]     = useState(false)

  const cat2Options = cat1 && allCats[cat1]?.sub ? allCats[cat1].sub : []
  const color = CATS[cat1]?.color || CATS[tx.cat1]?.color || '#888'

  function handleSave() {
    const patch = {}
    if (date !== (tx.competenza || tx._effDate || tx.date)) patch.competenza = date
    if (descAI.trim() !== tx.descAI) patch.descAI = descAI.trim()
    if (cat1 !== tx.cat1) patch.cat1 = cat1
    if (cat2 !== tx.cat2) patch.cat2 = cat2
    if (Object.keys(patch).length) updateTransaction(tx.txId, patch)
    setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 900)
  }

  return (
    <div style={{borderRadius:'var(--radius-sm)',overflow:'hidden',border:'1px solid var(--border)'}}>
      {/* Summary row */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',background:'var(--surface2)',cursor:'pointer'}}
        onClick={() => setOpen(o => !o)}>
        <span style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{descAI||(tx.description||'')}</div>
          <div style={{fontSize:11,color:'var(--text3)'}}>{cat1}{cat2?` › ${cat2}`:''} · {date}</div>
        </div>
        <span style={{fontSize:13,fontWeight:700,color:tx.amount>0?'var(--green)':netAmt(tx)<0?'var(--red)':'var(--text3)',fontFamily:'var(--font-mono)',flexShrink:0}}>
          {tx.amount>0?'+':''}{netAmt(tx)<0?'-':''}{fmtIT(Math.abs(netAmt(tx)), 2)}{tx._compensatedAmt>0&&tx.amount<0?<span style={{fontSize:9,marginLeft:2,opacity:.6}}>*</span>:null}
        </span>
        <span style={{fontSize:11,color:'var(--text3)',flexShrink:0}}>{open ? '▲' : '✏️'}</span>
      </div>
      {/* Edit panel */}
      {open && (
        <div style={{padding:'12px 14px',background:'var(--bg)',display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>Data</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{width:'100%',padding:'5px 8px',border:'1px solid var(--border)',borderRadius:6,
                  background:'var(--surface)',color:'var(--text)',fontSize:13,fontFamily:'var(--font-sans)',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>Descrizione AI</div>
              <input value={descAI} onChange={e => setDescAI(e.target.value)}
                style={{width:'100%',padding:'5px 8px',border:'1px solid var(--border)',borderRadius:6,
                  background:'var(--surface)',color:'var(--text)',fontSize:13,fontFamily:'var(--font-sans)',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>Categoria L1</div>
              <select value={cat1} onChange={e => { setCat1(e.target.value); setCat2('') }}
                style={{width:'100%',padding:'5px 8px',border:'1px solid var(--border)',borderRadius:6,
                  background:'var(--surface)',color:'var(--text)',fontSize:13,fontFamily:'var(--font-sans)',outline:'none',boxSizing:'border-box'}}>
                <option value="">—</option>
                {Object.keys(allCats).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>Categoria L2</div>
              <select value={cat2} onChange={e => setCat2(e.target.value)}
                disabled={!cat2Options.length}
                style={{width:'100%',padding:'5px 8px',border:'1px solid var(--border)',borderRadius:6,
                  background:'var(--surface)',color:'var(--text)',fontSize:13,fontFamily:'var(--font-sans)',outline:'none',boxSizing:'border-box',
                  opacity:cat2Options.length?1:0.4}}>
                <option value="">—</option>
                {cat2Options.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
            <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => setOpen(false)}>Annulla</button>
            <button className="btn btn-primary" style={{fontSize:12}} onClick={handleSave}>
              {saved ? '✓ Salvato' : 'Salva'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Day detail modal ──────────────────────────────────────
function DayModal({ dateStr, txs, vacs, quickFilter, onClose, isNotVac, onMarkNotVacation, onUnmarkNotVacation }) {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const d = new Date(dateStr)
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

  // In vacation mode, show only Weekend e Vacanze txs (matches cell content)
  const visibleTxs = quickFilter === 'vacation'
    ? txs.filter(t => t.cat1 === 'Weekend e Vacanze')
    : txs

  // Spese compensate a zero (o quasi, per arrotondamenti float) non vanno mostrate
  const shownTxs = visibleTxs.filter(t => !(t.amount < 0 && Math.abs(netAmt(t)) < 0.005))

  const income  = shownTxs.filter(t=>t.amount>0).reduce((s,t)=>s+netAmt(t),0)
  const expense = Math.abs(shownTxs.filter(t=>t.amount<0).reduce((s,t)=>s+netAmt(t),0))

  const savedCity = appPrefs?.calendarCityOverrides?.[dateStr] || ''

  // Dominant city from this day's transactions (fallback when no manual override saved)
  const dominantCity = useMemo(() => {
    const freq = {}
    for (const t of shownTxs) {
      const c = t.city && t.city !== 'null' ? t.city : null
      if (c) freq[c] = (freq[c] || 0) + 1
    }
    const entries = Object.entries(freq)
    if (!entries.length) return null
    return entries.sort((a, b) => b[1] - a[1])[0][0]
  }, [shownTxs])

  const locationLabel = savedCity || dominantCity || ''

  const [cityVal, setCityVal] = useState(savedCity)
  const [citySaved, setCitySaved] = useState(false)

  function saveCity() {
    const overrides = { ...(appPrefs?.calendarCityOverrides || {}) }
    if (cityVal.trim()) overrides[dateStr] = cityVal.trim()
    else delete overrides[dateStr]
    setAppPref('calendarCityOverrides', overrides)
    setCitySaved(true)
    setTimeout(() => setCitySaved(false), 1500)
  }

  return (
    <Modal title={`📅 ${label}${locationLabel ? ` · ${locationLabel}` : ''}`} onClose={onClose} width={540}>
      {vacs.length > 0 && (
        <div style={{marginBottom:12,padding:'8px 12px',background:'var(--blue-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--blue)',fontWeight:600}}>
          🏖 {vacs.map(v=>v.name).join(' · ')}
        </div>
      )}
      {isNotVac && (
        <div style={{marginBottom:12,padding:'8px 12px',background:'#fef3e2',borderRadius:'var(--radius-sm)',fontSize:13,color:'#b8792a',fontWeight:600}}>
          🚫 Segnato come "non vacanza" — le spese "Weekend e Vacanze" di questo giorno sono da rivedere competenza
        </div>
      )}
      {shownTxs.length === 0 ? (
        <div style={{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:13}}>Nessuna transazione questo giorno.</div>
      ) : (
        <>
          <div style={{display:'flex',gap:16,marginBottom:10}}>
            {income>0 && <div style={{fontSize:12}}><span style={{color:'var(--text3)'}}>Entrate: </span><strong style={{color:'var(--green)'}}>+€ {fmtIT(income, 2)}</strong></div>}
            {expense>0 && <div style={{fontSize:12}}><span style={{color:'var(--text3)'}}>Uscite: </span><strong style={{color:'var(--red)'}}>{fmtIT(expense, 2)}</strong></div>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:360,overflowY:'auto'}}>
            {shownTxs.map(t => <TxEditRow key={t.txId} tx={t}/>)}
          </div>
        </>
      )}
      {/* City / location */}
      <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:12,color:'var(--text3)',flexShrink:0}}>📍 Location:</span>
        <input
          value={cityVal}
          onChange={e => { setCityVal(e.target.value); setCitySaved(false) }}
          onKeyDown={e => { if (e.key === 'Enter') saveCity() }}
          placeholder="es. Sestri Levante"
          style={{flex:1,padding:'5px 10px',border:'1px solid var(--border)',borderRadius:8,
            background:'var(--bg)',color:'var(--text)',fontSize:13,fontFamily:'var(--font-sans)',outline:'none'}}
        />
        <button className="btn btn-primary" style={{fontSize:12,padding:'5px 12px'}} onClick={saveCity}>
          {citySaved ? '✓' : 'Salva'}
        </button>
      </div>
      <ModalFooter>
        {isNotVac ? (
          <button className="btn btn-secondary" onClick={onUnmarkNotVacation}>
            ✅ Segna come vacanza
          </button>
        ) : (
          <button className="btn btn-secondary" style={{color:'#b8792a'}}
            title="Le spese 'Weekend e Vacanze' di questo giorno verranno flaggate da rivedere competenza"
            onClick={onMarkNotVacation}>
            🚫 Non è vacanza
          </button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>Chiudi</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Add vacation modal ────────────────────────────────────
function AddVacationModal({ onSave, onClose }) {
  const [form, setForm] = useState({ name:'', from: new Date().toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) })
  return (
    <Modal title="🏖 Aggiungi Vacanza / Weekend" onClose={onClose} width={400}>
      <FormRow label="Nome (es. Vacanza Sardegna)">
        <Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="es. Vacanza estate, Weekend montagna…" autoFocus/>
      </FormRow>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Data inizio"><Input type="date" value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))}/></FormRow>
        <FormRow label="Data fine"><Input type="date" value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))}/></FormRow>
      </div>
      <ModalFooter>
        <button className="btn btn-primary" disabled={!form.name||!form.from||!form.to} onClick={()=>{onSave(form);onClose()}}>Salva</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Barra di conferma selezione giorni (dichiarazione vacanza) ─────
function SelectionConfirmBar({ count, onConfirm, onMarkNotVacation, onCancel }) {
  const [name, setName] = useState('Vacanza')
  const [city, setCity] = useState('')
  return (
    <div className="cal-select-bar">
      <span style={{fontSize:13,fontWeight:700,whiteSpace:'nowrap'}}>🏖 {count} {count===1?'giorno':'giorni'} selezionat{count===1?'o':'i'}</span>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome vacanza" style={{width:140}} autoFocus/>
      <input value={city} onChange={e=>setCity(e.target.value)} placeholder="Location (es. Sestri Levante)" style={{width:180}}/>
      <button className="btn btn-primary" style={{fontSize:12,whiteSpace:'nowrap'}}
        disabled={!name.trim()}
        onClick={()=>onConfirm(name.trim(), city.trim())}>
        ✅ Conferma vacanza
      </button>
      <button className="btn btn-secondary" style={{fontSize:12,whiteSpace:'nowrap',color:'#b8792a'}}
        title="Le spese 'Weekend e Vacanze' in questi giorni verranno flaggate da rivedere competenza"
        onClick={onMarkNotVacation}>
        🚫 Non è vacanza
      </button>
      <button className="btn btn-secondary" style={{fontSize:12,whiteSpace:'nowrap'}} onClick={onCancel}>Annulla</button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function CalendarioPage() {
  const { transactions } = useStore()
  const customCats  = useStore(s => s.customCats)
  const vehicles    = useStore(s => s.vehicles)
  const appPrefs    = useStore(s => s.appPrefs)
  const setAppPref  = useStore(s => s.setAppPref)
  const { vacations, add: addVac, addMultiple: addVacMultiple, remove: removeVac } = useVacations()
  const { notVacationDates, mark: markNotVac, unmark: unmarkNotVac } = useNotVacationDates()
  const notVacSet = useMemo(() => new Set(notVacationDates), [notVacationDates])

  const now     = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [filter, setFilter] = useState({ type:'', cat1:'' })
  const [quickFilter, setQuickFilter] = useState(null) // 'boat' | 'vacation' | null
  const mergeMode = quickFilter === 'vacation'  // auto-merge when vacation filter active
  const [hideSati, setHideSati]         = useState(true)
  const [modal,  setModal]  = useState(null) // {dateStr, txs, vacs}
  const [showAddVac, setShowAddVac] = useState(false)
  const [showVacList, setShowVacList] = useState(false)

  // ── Selezione multipla giorni (dichiarazione vacanza) — solo in modalità 🌴 Vacanze
  // Selezione via drag&drop del cursore: mousedown su una cella avvia il drag,
  // mouseenter sulle celle successive estende (o restringe) la selezione, mouseup la conclude.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedDates, setSelectedDates] = useState(() => new Set())
  const dragModeRef = useRef(null) // 'add' | 'remove' | null (null = non in drag)

  function applyToSelection(dateStrs, mode) {
    setSelectedDates(prev => {
      const next = new Set(prev)
      dateStrs.forEach(d => mode === 'add' ? next.add(d) : next.delete(d))
      return next
    })
  }

  // Click/mousedown su una cella: se già selezionata il drag la deseleziona, altrimenti la seleziona
  function handleCellMouseDown(dateStrs) {
    const alreadyIn = dateStrs.every(d => selectedDates.has(d))
    const mode = alreadyIn ? 'remove' : 'add'
    dragModeRef.current = mode
    applyToSelection(dateStrs, mode)
  }

  // mouseenter durante il drag: estende/restringe con la stessa modalità impostata dal mousedown
  function handleCellMouseEnter(dateStrs) {
    if (!dragModeRef.current) return
    applyToSelection(dateStrs, dragModeRef.current)
  }

  useEffect(() => {
    function onMouseUp() { dragModeRef.current = null }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedDates(new Set())
    dragModeRef.current = null
  }

  // Conferma: crea uno o più periodi vacanza (uno per gruppo di date consecutive),
  // eventualmente salva la location, e rimuove questi giorni da "non vacanza" se lo erano
  function confirmVacationSelection(name, city) {
    const dates = [...selectedDates]
    if (!dates.length) return
    const runs = groupConsecutiveDates(dates)
    addVacMultiple(runs.map(([from, to]) => ({ name, from, to, ...(city ? { city } : {}) })))
    if (city) {
      const overrides = { ...(appPrefs?.calendarCityOverrides || {}) }
      dates.forEach(d => { overrides[d] = city })
      setAppPref('calendarCityOverrides', overrides)
    }
    unmarkNotVac(dates)
    exitSelectMode()
  }

  // "Non è vacanza": marca i giorni selezionati ed flagga da subito le eventuali
  // transazioni "Weekend e Vacanze" di quei giorni come da rivedere competenza
  function markNotVacationSelection() {
    const dates = [...selectedDates]
    if (!dates.length) return
    markNotVac(dates)
    exitSelectMode()
  }

  // City overrides from Firestore prefs
  const cityOverrides = useMemo(() => appPrefs?.calendarCityOverrides || {}, [appPrefs?.calendarCityOverrides])

  // ── Boat days set ────────────────────────────────────────
  const boatDaySet = useMemo(() => {
    const s = new Set()
    ;(vehicles || [])
      .filter(v => v.icon === '🚤' || v.icon === '⛵' || v.icon === 'svg:motoscafo')
      .forEach(v => {
        ;(appPrefs?.vehicleTrips?.[v.id] || []).forEach(t => s.add(t.date))
      })
    return s
  }, [vehicles, appPrefs?.vehicleTrips])

  // Index transactions by date for fast lookup
  const txByDate = useMemo(() => {
    const idx = {}
    transactions.forEach(t => {
      if (t.excluded) return
      if (!(t._effDate||t.date)) return
      if (!idx[t._effDate||t.date]) idx[t._effDate||t.date] = []
      idx[t._effDate||t.date].push(t)
    })
    return idx
  }, [transactions])

  // All transactions for the year (for cell rendering)
  const allTxs = useMemo(() => {
    let txs = transactions.filter(t => (t._effDate||(t._effDate||t.date||'')).startsWith(String(year)))
    if (hideSati) {
      txs = txs.filter(t => !(t.descAI || '').toLowerCase().includes('satispay'))
    }
    return txs
  }, [transactions, year, hideSati])

  // Effective city per date — override takes priority, then dominant from txs
  const effectiveCityByDate = useMemo(() => {
    const result = {}
    for (let m = 0; m < 12; m++) {
      const days = DAYS_IN_MONTH(year, m)
      for (let d = 1; d <= days; d++) {
        const dateStr = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        if (cityOverrides[dateStr]) {
          result[dateStr] = cityOverrides[dateStr]
        } else {
          const dayTxs = txByDate[dateStr] || []
          const freq = {}
          dayTxs.filter(t => !t.excluded && t.cat1 === 'Weekend e Vacanze').forEach(t => {
            const c = t.city && t.city !== 'null' ? t.city : null
            if (c) freq[c] = (freq[c] || 0) + 1
          })
          const entries = Object.entries(freq)
          if (entries.length) result[dateStr] = entries.sort((a,b) => b[1]-a[1])[0][0]
        }
      }
    }
    return result
  }, [year, txByDate, cityOverrides])

  // ── City edit handlers ───────────────────────────────────
  function handleCityEdit(dateStr, newCity) {
    const overrides = { ...(appPrefs?.calendarCityOverrides || {}) }
    if (newCity) overrides[dateStr] = newCity
    else delete overrides[dateStr]
    setAppPref('calendarCityOverrides', overrides)
  }

  function handleCityEditRange(yr, mo, startDay, endDay, newCity) {
    const overrides = { ...(appPrefs?.calendarCityOverrides || {}) }
    for (let d = startDay; d <= endDay; d++) {
      const dateStr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      if (newCity) overrides[dateStr] = newCity
      else delete overrides[dateStr]
    }
    setAppPref('calendarCityOverrides', overrides)
  }

  return (
    <div className="cal-page">
      {/* Header */}
      <div className="cal-header">
        <div>
          <h1 className="cal-title">📅 Calendario</h1>
          <div style={{fontSize:13,color:'var(--text3)'}}>Transazioni per giorno nell'anno</div>
        </div>
        <div className="cal-header-actions">
          {/* Quick filters */}
          <button
            className={'cal-filter-btn' + (quickFilter === 'boat' ? ' active' : '')}
            onClick={() => setQuickFilter(q => q === 'boat' ? null : 'boat')}
            title="Mostra solo giorni con uscita in barca"
          >🚤 Barca</button>
          <button
            className={'cal-filter-btn' + (quickFilter === 'vacation' ? ' active' : '')}
            onClick={() => {
              setQuickFilter(q => {
                const next = q === 'vacation' ? null : 'vacation'
                if (next !== 'vacation') exitSelectMode()
                return next
              })
            }}
            title="Mostra solo giorni di vacanza / weekend fuori"
          >🌴 Vacanze</button>
          {quickFilter === 'vacation' && (
            <button
              className={'cal-filter-btn' + (selectMode ? ' active' : '')}
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              title="Seleziona più giorni per dichiarare una vacanza e la location"
            >🖊️ Seleziona giorni</button>
          )}
          <button
            className={'cal-filter-btn' + (hideSati ? ' active' : '')}
            onClick={() => setHideSati(v => !v)}
            title="Nascondi accantonamenti e accrediti Satispay"
          >🔒 Nascondi Satispay</button>

          <div style={{width:1,height:20,background:'var(--border)',margin:'0 2px'}}/>

          {/* Year nav */}
          <div className="cal-year-nav">
            <button className="btn btn-ghost" onClick={()=>setYear(y=>y-1)}><ChevronLeft size={16}/></button>
            <span style={{fontSize:18,fontWeight:800,minWidth:56,textAlign:'center'}}>{year}</span>
            <button className="btn btn-ghost" onClick={()=>setYear(y=>y+1)}><ChevronRight size={16}/></button>
          </div>

          {/* Vacation button */}
          <button className="btn btn-secondary" style={{fontSize:12}} onClick={()=>setShowAddVac(true)}>
            <Plus size={12}/> Vacanza
          </button>
          {vacations.length > 0 && (
            <button className="btn btn-ghost" style={{fontSize:12,color:'var(--blue)'}} onClick={()=>setShowVacList(v=>!v)}>
              🏖 {vacations.length}
            </button>
          )}
        </div>
      </div>

      {/* Vacation list */}
      {showVacList && vacations.length > 0 && (
        <div className="cal-vac-list">
          {vacations.map(v=>(
            <div key={v.id} className="cal-vac-item">
              <span style={{fontSize:12,fontWeight:600}}>{v.name}{v.city ? ` · 📍 ${v.city}` : ''}</span>
              <span style={{fontSize:11,color:'var(--text3)'}}>{v.from} → {v.to}</span>
              <button className="btn btn-ghost" style={{padding:'1px 4px',color:'var(--text3)'}} onClick={()=>removeVac(v.id)}><X size={10}/></button>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="cal-filters">
        <span style={{fontSize:12,fontWeight:700,color:'var(--text3)'}}>Mostra:</span>
        {[
          {id:'',       label:'Tutto'},
          {id:'income', label:'Solo entrate'},
          {id:'expense',label:'Solo uscite'},
        ].map(opt=>(
          <button key={opt.id}
            className={'cal-filter-btn'+(filter.type===opt.id?' active':'')}
            onClick={()=>setFilter(f=>({...f,type:opt.id}))}>
            {opt.label}
          </button>
        ))}
        <select className="cal-filter-select" value={filter.cat1} onChange={e=>setFilter(f=>({...f,cat1:e.target.value}))}>
          <option value="">Tutte le categorie</option>
          {Object.keys(getMergedCats(customCats)).map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Legend */}
      <div className="cal-legend">
        <span className="cal-legend-item weekend-eg">Weekend</span>
        <span className="cal-legend-item vacation-eg">🌴/⛰️ Vacanza</span>
        <span className="cal-legend-item today-eg">Oggi</span>
        <span className="cal-legend-item positive-eg">+Entrate</span>
        <span className="cal-legend-item negative-eg">−Uscite</span>
        {boatDaySet.size > 0 && <span style={{fontSize:11,color:'var(--text3)'}}>🚤 = uscita barca</span>}
        {mergeMode && !selectMode && <span style={{fontSize:11,color:'var(--text3)'}}>Celle unite per location · clicca city per modificare</span>}
        {selectMode && <span style={{fontSize:11,color:'#b8792a',fontWeight:700}}>🖊️ Clicca o trascina sui giorni da selezionare, poi in basso conferma come vacanza oppure segna come "non è vacanza"</span>}
      </div>

      {/* Calendar grid */}
      <div className={`cal-scroll${selectMode ? ' cal-selecting' : ''}`}>
        <table className="cal-table">
          <thead>
            <tr>
              <th className="cal-month-th"/>
              {Array.from({length:31},(_,i)=>(
                <th key={i+1} className="cal-day-th">{i+1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((monthName, m) => {
              const daysInMonth = DAYS_IN_MONTH(year, m)

              let cells
              if (mergeMode) {
                cells = []
                let i = 1
                while (i <= daysInMonth) {
                  const dateStr = `${year}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`
                  const city = effectiveCityByDate[dateStr]
                  if (city) {
                    let j = i + 1
                    while (j <= daysInMonth) {
                      const nd = `${year}-${String(m+1).padStart(2,'0')}-${String(j).padStart(2,'0')}`
                      if (effectiveCityByDate[nd] !== city) break
                      j++
                    }
                    if (j - i >= 2) {
                      const mergedDates = []
                      for (let d = i; d <= j - 1; d++) mergedDates.push(`${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
                      cells.push(
                        <MergedCell
                          key={i}
                          year={year} month={m}
                          startDay={i} endDay={j-1}
                          city={city}
                          txs={allTxs}
                          filter={filter}
                          vacations={vacations}
                          boatDaySet={boatDaySet}
                          quickFilter={quickFilter}
                          onCityEditRange={handleCityEditRange}
                          selectMode={selectMode}
                          selected={selectMode && mergedDates.every(d => selectedDates.has(d))}
                          notVacSet={notVacSet}
                          onCellMouseDown={handleCellMouseDown}
                          onCellMouseEnter={handleCellMouseEnter}
                          onClick={ds => {
                            const dayTxs = txByDate[ds] || []
                            const dayVacs = vacations.filter(v => ds >= v.from && ds <= v.to)
                            setModal({dateStr: ds, txs: dayTxs, vacs: dayVacs})
                          }}
                        />
                      )
                      i = j
                      continue
                    }
                  }
                  // Single cell
                  cells.push(
                    <DayCell
                      key={i}
                      year={year} month={m} day={i}
                      txs={allTxs}
                      filter={filter}
                      vacations={vacations}
                      boatDaySet={boatDaySet}
                      quickFilter={quickFilter}
                      cityOverrides={cityOverrides}
                      onCityEdit={handleCityEdit}
                      selectMode={selectMode}
                      selected={selectMode && selectedDates.has(dateStr)}
                      notVacSet={notVacSet}
                      onCellMouseDown={handleCellMouseDown}
                      onCellMouseEnter={handleCellMouseEnter}
                      onClick={(ds, txs, vacs) => setModal({dateStr: ds, txs, vacs})}
                    />
                  )
                  i++
                }
                // Empty cells for remaining columns
                for (let d = daysInMonth + 1; d <= 31; d++) {
                  cells.push(<td key={d} className="cal-cell empty"/>)
                }
              } else {
                cells = Array.from({length:31},(_,i)=>{
                  const day = i + 1
                  if (day > daysInMonth) return <td key={day} className="cal-cell empty"/>
                  return (
                    <DayCell
                      key={day}
                      year={year} month={m} day={day}
                      txs={allTxs}
                      filter={filter}
                      vacations={vacations}
                      boatDaySet={boatDaySet}
                      quickFilter={quickFilter}
                      cityOverrides={cityOverrides}
                      onCityEdit={handleCityEdit}
                      notVacSet={notVacSet}
                      onClick={(ds, txs, vacs) => setModal({dateStr: ds, txs, vacs})}
                    />
                  )
                })
              }

              // Cross-month continuation hint
              const lastDayStr  = `${year}-${String(m+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`
              const firstNextStr = m < 11 ? `${year}-${String(m+2).padStart(2,'0')}-01` : null
              const cityLast  = effectiveCityByDate[lastDayStr]
              const cityFirst = firstNextStr ? effectiveCityByDate[firstNextStr] : null
              const continuesNext = mergeMode && cityLast && cityFirst && cityLast === cityFirst

              const prevDaysInMonth = m > 0 ? DAYS_IN_MONTH(year, m-1) : null
              const lastPrevStr = m > 0 ? `${year}-${String(m).padStart(2,'0')}-${String(prevDaysInMonth).padStart(2,'0')}` : null
              const cityPrev = lastPrevStr ? effectiveCityByDate[lastPrevStr] : null
              const continuesPrev = mergeMode && cityPrev && effectiveCityByDate[`${year}-${String(m+1).padStart(2,'0')}-01`] === cityPrev

              return (
                <tr key={m} className={`cal-month-row${continuesPrev ? ' month-continues-from-prev' : ''}${continuesNext ? ' month-continues-to-next' : ''}`}>
                  <td className="cal-month-label">
                    <span className="cal-month-short">{MONTHS_SHORT[m]}</span>
                  </td>
                  {cells}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Day detail modal */}
      {modal && (
        <DayModal
          dateStr={modal.dateStr}
          txs={modal.txs}
          vacs={modal.vacs}
          quickFilter={quickFilter}
          onClose={()=>setModal(null)}
          isNotVac={notVacSet.has(modal.dateStr)}
          onMarkNotVacation={() => { markNotVac([modal.dateStr]); setModal(null) }}
          onUnmarkNotVacation={() => { unmarkNotVac([modal.dateStr]); setModal(null) }}
        />
      )}

      {/* Add vacation modal */}
      {showAddVac && (
        <AddVacationModal
          onSave={addVac}
          onClose={()=>setShowAddVac(false)}
        />
      )}

      {/* Barra di conferma selezione giorni vacanza */}
      {selectMode && selectedDates.size > 0 && (
        <SelectionConfirmBar
          count={selectedDates.size}
          onConfirm={confirmVacationSelection}
          onMarkNotVacation={markNotVacationSelection}
          onCancel={exitSelectMode}
        />
      )}
    </div>
  )
}
