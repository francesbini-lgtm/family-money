import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { CATS, CAT_NAMES } from '../data/categories'
import Modal, { ModalFooter, FormRow, Input } from '../components/Modal'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import './CalendarioPage.css'
import { fmtIT } from '../utils/format'

const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
const DAYS_IN_MONTH = (y, m) => new Date(y, m + 1, 0).getDate()
const IS_WEEKEND = (y, m, d) => { const dow = new Date(y, m, d).getDay(); return dow === 0 || dow === 6 }

// ── Vacation store (Firestore via appPrefs) ───────────────
function useVacations() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [vacations, setVacations] = useState(() => appPrefs.calendarVacations || [])
  function save(v) { setVacations(v); setAppPref('calendarVacations', v) }
  function add(vac) { save([...vacations, { id: Date.now(), ...vac }]) }
  function remove(id) { save(vacations.filter(v => v.id !== id)) }
  return { vacations, add, remove }
}

// ── Day cell ──────────────────────────────────────────────
function DayCell({ year, month, day, txs, filter, vacations, onClick }) {
  const isWeekend = IS_WEEKEND(year, month, day)
  const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`

  // Filter transactions for this day
  const dayTxs = useMemo(() => {
    let t = txs.filter(t => (t._effDate||t.date) === dateStr && !t.excluded)
    if (filter.type === 'income')  t = t.filter(x => x.amount > 0)
    if (filter.type === 'expense') t = t.filter(x => x.amount < 0)
    if (filter.cat1) t = t.filter(x => x.cat1 === filter.cat1)
    return t
  }, [txs, dateStr, filter])

  const total   = dayTxs.reduce((s, t) => s + t.amount, 0)
  const hasData = dayTxs.length > 0

  // Most frequent city that day (ignore nulls / 'null' strings)
  const dominantCity = useMemo(() => {
    const freq = {}
    for (const t of dayTxs) {
      const c = t.city && t.city !== 'null' ? t.city : null
      if (c) freq[c] = (freq[c] || 0) + 1
    }
    const entries = Object.entries(freq)
    if (!entries.length) return null
    return entries.sort((a, b) => b[1] - a[1])[0][0]
  }, [dayTxs])

  // Vacation overlap
  const vacs = vacations.filter(v => dateStr >= v.from && dateStr <= v.to)
  const isVac = vacs.length > 0

  const today = new Date().toISOString().slice(0,10) === dateStr

  return (
    <td
      className={[
        'cal-cell',
        isWeekend ? 'weekend' : '',
        isVac     ? 'vacation' : '',
        today     ? 'today' : '',
        hasData   ? 'has-data' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => onClick(dateStr, dayTxs, vacs)}
      title={vacs.map(v => v.name).join(', ')}
    >
      <div className="cal-day-num">{day}</div>
      {hasData && (
        <div className={`cal-day-total ${total >= 0 ? 'positive' : 'negative'}`}>
          {total >= 0 ? '+' : ''}{total < 0 ? '-' : ''}
          {Math.abs(Math.round(total)).toLocaleString('it-IT')}
        </div>
      )}
      {dominantCity && (
        <div className="cal-day-city" title={dominantCity}>{dominantCity}</div>
      )}
      {isVac && <div className="cal-vac-dot" title={vacs.map(v=>v.name).join(', ')}/>}
    </td>
  )
}

// ── Day detail modal ──────────────────────────────────────
function DayModal({ dateStr, txs, vacs, onClose }) {
  const d = new Date(dateStr)
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const income  = txs.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)
  const expense = Math.abs(txs.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))

  return (
    <Modal title={`📅 ${label}`} onClose={onClose} width={520}>
      {vacs.length > 0 && (
        <div style={{marginBottom:12,padding:'8px 12px',background:'var(--blue-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--blue)',fontWeight:600}}>
          🏖 {vacs.map(v=>v.name).join(' · ')}
        </div>
      )}
      {txs.length === 0 ? (
        <div style={{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:13}}>Nessuna transazione questo giorno.</div>
      ) : (
        <>
          <div style={{display:'flex',gap:16,marginBottom:14}}>
            {income>0 && <div style={{fontSize:12}}><span style={{color:'var(--text3)'}}>Entrate: </span><strong style={{color:'var(--green)'}}>+€ {fmtIT(income, 2)}</strong></div>}
            {expense>0 && <div style={{fontSize:12}}><span style={{color:'var(--text3)'}}>Uscite: </span><strong style={{color:'var(--red)'}}>{fmtIT(expense, 2)}</strong></div>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:320,overflowY:'auto'}}>
            {txs.map(t => {
              const color = CATS[t.cat1]?.color||'#888'
              return (
                <div key={t.txId} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',background:'var(--surface2)',borderRadius:'var(--radius-sm)'}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.descAI||(t.description||'')}</div>
                    <div style={{fontSize:11,color:'var(--text3)'}}>{t.cat1}{t.cat2?` › ${t.cat2}`:''}</div>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:t.amount>0?'var(--green)':t.amount<0?'var(--red)':'var(--text)',fontFamily:'var(--font-mono)',flexShrink:0}}>
                    {t.amount>0?'+':''}{t.amount<0?'-':''}{fmtIT(Math.abs(t.amount), 2)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
      <ModalFooter>
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

// ── Main page ─────────────────────────────────────────────
export default function CalendarioPage() {
  const { transactions } = useStore()
  const { vacations, add: addVac, remove: removeVac } = useVacations()

  const now     = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [filter, setFilter] = useState({ type:'', cat1:'' })
  const [modal,  setModal]  = useState(null) // {dateStr, txs, vacs}
  const [showAddVac, setShowAddVac] = useState(false)
  const [showVacList, setShowVacList] = useState(false)

  // Index transactions by date for fast lookup
  const txByDate = useMemo(() => {
    const idx = {}
    transactions.forEach(t => {
      if (!(t._effDate||t.date)) return
      if (!idx[t._effDate||t.date]) idx[t._effDate||t.date] = []
      idx[t._effDate||t.date].push(t)
    })
    return idx
  }, [transactions])

  // All transactions for the year (for cell rendering)
  const allTxs = useMemo(() =>
    transactions.filter(t => (t._effDate||(t._effDate||t.date||'')).startsWith(String(year)))
  , [transactions, year])

  return (
    <div className="cal-page">
      {/* Header */}
      <div className="cal-header">
        <div>
          <h1 className="cal-title">📅 Calendario</h1>
          <div style={{fontSize:13,color:'var(--text3)'}}>Transazioni per giorno nell'anno</div>
        </div>
        <div className="cal-header-actions">
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
              <span style={{fontSize:12,fontWeight:600}}>{v.name}</span>
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
          {CAT_NAMES.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Legend */}
      <div className="cal-legend">
        <span className="cal-legend-item weekend-eg">Weekend</span>
        <span className="cal-legend-item vacation-eg">Vacanza / weekend fuori</span>
        <span className="cal-legend-item today-eg">Oggi</span>
        <span className="cal-legend-item positive-eg">+Entrate</span>
        <span className="cal-legend-item negative-eg">−Uscite</span>
      </div>

      {/* Calendar grid */}
      <div className="cal-scroll">
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
              return (
                <tr key={m} className="cal-month-row">
                  <td className="cal-month-label">
                    <span className="cal-month-short">{MONTHS_SHORT[m]}</span>
                  </td>
                  {Array.from({length:31},(_,i)=>{
                    const day = i + 1
                    if (day > daysInMonth) {
                      return <td key={day} className="cal-cell empty"/>
                    }
                    return (
                      <DayCell
                        key={day}
                        year={year} month={m} day={day}
                        txs={allTxs}
                        filter={filter}
                        vacations={vacations}
                        onClick={(dateStr, txs, vacs) => setModal({dateStr, txs, vacs})}
                      />
                    )
                  })}
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
          onClose={()=>setModal(null)}
        />
      )}

      {/* Add vacation modal */}
      {showAddVac && (
        <AddVacationModal
          onSave={addVac}
          onClose={()=>setShowAddVac(false)}
        />
      )}
    </div>
  )
}
