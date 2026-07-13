import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useFinancials, getLast6Months, getYM, ymLabel } from '../hooks/useFinancials'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { Plus, Trash2, Edit2, Target, TrendingUp, Gift } from 'lucide-react'
import './CeciliaPage.css'
import { fmtIT, fmtDate } from '../utils/format'

const GOAL_ICONS = ['🎓','🚗','🏠','✈️','💻','📚','🎮','💒','🌍','💰','🎁','⭐']

// ── Goal progress card ────────────────────────────────────
function GoalCard({ goal, onEdit, onDelete, onDeposit }) {
  const pct     = goal.target > 0 ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0
  const missing = Math.max(0, goal.target - goal.current)
  const isReached = goal.current >= goal.target

  return (
    <div className={'cec-goal card' + (isReached ? ' reached' : '')}>
      <div className="cec-goal-header">
        <div className="cec-goal-icon">{goal.icon || '⭐'}</div>
        <div className="cec-goal-info">
          <div className="cec-goal-name">{goal.name}</div>
          {goal.targetDate && (
            <div className="cec-goal-date">📅 Obiettivo entro {goal.targetDate}</div>
          )}
          {goal.note && <div className="cec-goal-note">{goal.note}</div>}
        </div>
        <div className="cec-goal-actions">
          <button className="btn btn-ghost" onClick={onEdit}><Edit2 size={12}/></button>
          <button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={onDelete}><Trash2 size={12}/></button>
        </div>
      </div>

      <div className="cec-progress-row">
        <span className="cec-saved">€ {fmtIT(goal.current, 0)}</span>
        <span className="cec-target">/ € {fmtIT(goal.target, 0)}</span>
        <span className={'cec-pct' + (isReached ? ' reached' : '')}>{pct}%</span>
      </div>

      <div className="cec-progress-bar">
        <div className="cec-progress-fill" style={{
          width: pct + '%',
          background: isReached ? 'var(--green)' : 'var(--accent)'
        }}/>
      </div>

      {isReached ? (
        <div className="cec-reached-badge">🎉 Obiettivo raggiunto!</div>
      ) : (
        <div className="cec-missing">Mancano € {fmtIT(missing, 0)}</div>
      )}

      <button className="btn btn-secondary cec-deposit-btn" onClick={onDeposit}>
        + Aggiungi versamento
      </button>
    </div>
  )
}

// ── Deposit modal ─────────────────────────────────────────
function DepositModal({ goal, onClose }) {
  const updateCeciliaGoal = useStore(s => s.updateCeciliaGoal)
  const [amount, setAmount] = useState('')
  const [note,   setNote]   = useState('')

  function save() {
    const n = parseFloat(amount)
    if (!n) return
    const newCurrent = (goal.current || 0) + n
    const history = [...(goal.history || []), {
      date: new Date().toISOString().slice(0, 10),
      amount: n, note
    }]
    updateCeciliaGoal(goal.id, { current: newCurrent, history })
    onClose()
  }

  return (
    <Modal title={`+ Versamento — ${goal.name}`} onClose={onClose} width={380}>
      <div style={{marginBottom:14,padding:'10px 14px',background:'var(--surface2)',borderRadius:'var(--radius-sm)',fontSize:13}}>
        Saldo attuale: <strong>€ {fmtIT(goal.current || 0, 0)}</strong>
        {' → '}
        <strong style={{color:'var(--green)'}}>€ {Math.round((goal.current||0)+(parseFloat(amount)||0)).toLocaleString('it-IT')}</strong>
      </div>
      <FormRow label="Importo (€)">
        <Input type="number" value={amount} onChange={e=>setAmount(e.target.value)} autoFocus placeholder="es. 50"/>
      </FormRow>
      <FormRow label="Note (opzionale)">
        <Input value={note} onChange={e=>setNote(e.target.value)} placeholder="es. Regalo nonni"/>
      </FormRow>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>Aggiungi</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Add/Edit goal modal ───────────────────────────────────
function GoalModal({ goal, onClose }) {
  const { addCeciliaGoal, updateCeciliaGoal } = useStore()
  const isEdit = !!goal
  const [form, setForm] = useState({
    name: goal?.name || '', icon: goal?.icon || '⭐',
    target: goal?.target || '', targetDate: goal?.targetDate || '',
    note: goal?.note || ''
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function save() {
    if (!form.name || !form.target) return
    const data = {...form, target: parseFloat(form.target)}
    if (isEdit) {
      updateCeciliaGoal(goal.id, data)
    } else {
      addCeciliaGoal({...data, current: 0, history: []})
    }
    onClose()
  }

  return (
    <Modal title={isEdit ? 'Modifica Obiettivo' : '+ Nuovo Obiettivo'} onClose={onClose}>
      <FormRow label="Nome obiettivo">
        <Input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="es. Fondo Università"/>
      </FormRow>
      <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:12,alignItems:'end'}}>
        <FormRow label="Icona">
          <Select value={form.icon} onChange={e=>set('icon',e.target.value)} style={{width:60}}>
            {GOAL_ICONS.map(i=><option key={i} value={i}>{i}</option>)}
          </Select>
        </FormRow>
        <FormRow label="Obiettivo (€)">
          <Input type="number" value={form.target} onChange={e=>set('target',e.target.value)} placeholder="10000"/>
        </FormRow>
      </div>
      <FormRow label="Data obiettivo (opzionale)">
        <Input type="month" value={form.targetDate} onChange={e=>set('targetDate',e.target.value)}/>
      </FormRow>
      <FormRow label="Note">
        <Input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="Descrizione"/>
      </FormRow>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>{isEdit ? 'Salva' : 'Crea'}</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}


// ── Cecilia Portfolio ─────────────────────────────────────
function CeciliaPortfolio() {
  const { portfolios, addPortfolio, updatePortfolio, deletePortfolio } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name:'', ticker:'', type:'ETF', qty:'', avgPrice:'', currentPrice:'' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  // Cecilia's portfolio = first portfolio named "Cecilia" or create one
  const cecPort = portfolios.find(p => p.name.toLowerCase().includes('cecilia'))

  const positions = cecPort?.positions || []
  const totalInvested = positions.reduce((s,p)=>s+p.invested,0)
  const totalCurrent  = positions.reduce((s,p)=>s+p.currentValue,0)
  const totalPnl      = totalCurrent - totalInvested
  const isPos         = totalPnl >= 0

  function createCecPortfolio() {
    addPortfolio({ name:'Portafoglio Cecilia', positions:[], createdAt:new Date().toISOString() })
  }

  function addPosition() {
    if (!form.name || !form.qty || !form.avgPrice) return
    const qty = parseFloat(form.qty)
    const avg = parseFloat(form.avgPrice)
    const cur = parseFloat(form.currentPrice) || avg
    const newPos = {
      id: String(Date.now()), ...form, quantity:qty, avgPrice:avg, currentPrice:cur,
      invested:qty*avg, currentValue:qty*cur, pnl:qty*(cur-avg), pnlPct:((cur-avg)/avg*100).toFixed(1)
    }
    updatePortfolio(cecPort.id, { positions:[...positions, newPos] })
    setForm({ name:'', ticker:'', type:'ETF', qty:'', avgPrice:'', currentPrice:'' })
    setShowAdd(false)
  }

  function removePosition(posId) {
    updatePortfolio(cecPort.id, { positions: positions.filter(p=>p.id!==posId) })
  }

  if (!cecPort) return (
    <div style={{textAlign:'center',padding:'32px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
      <div style={{fontSize:32,marginBottom:10}}>📈</div>
      <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Nessun portafoglio investimenti</div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:14}}>Crea il portafoglio di Cecilia per ETF, azioni e buoni fruttiferi.</div>
      <button className="btn btn-primary" onClick={createCecPortfolio}><Plus size={13}/> Crea Portafoglio</button>
    </div>
  )

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{display:'flex',gap:20}}>
          {[
            ['Investito','€ '+fmtIT(totalInvested, 0),'var(--text)'],
            ['Valore attuale','€ '+fmtIT(totalCurrent, 0),'var(--blue)'],
            ['P&L',(isPos?'+':'-')+'€ '+Math.abs(Math.round(totalPnl)).toLocaleString('it-IT'),isPos?'var(--green)':'var(--red)'],
          ].map(([l,v,color])=>(
            <div key={l}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:3}}>{l}</div>
              <div style={{fontSize:18,fontWeight:700,fontFamily:'var(--font-mono)',color}}>{v}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>setShowAdd(true)}><Plus size={12}/> Posizione</button>
      </div>

      {positions.length === 0 ? (
        <div style={{textAlign:'center',padding:'20px',color:'var(--text3)',fontSize:13,background:'var(--surface2)',borderRadius:'var(--radius-sm)'}}>
          Nessuna posizione — aggiungi ETF, azioni o altri strumenti
        </div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              {['Titolo','Tipo','Qtà','P.M.','Prezzo','Valore','P&L',''].map(h=>(
                <th key={h} style={{padding:'8px 12px',fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:h==='P&L'||h==='Valore'?'right':'left'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {positions.map(p=>{
                const pnl = p.currentValue-p.invested
                const isP = pnl>=0
                return (
                  <tr key={p.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'9px 12px'}}>
                      <div style={{fontWeight:700,fontSize:13}}>{p.ticker||p.name}</div>
                      {p.ticker&&<div style={{fontSize:11,color:'var(--text3)'}}>{p.name}</div>}
                    </td>
                    <td style={{padding:'9px 12px'}}><span style={{padding:'2px 7px',borderRadius:12,fontSize:10,fontWeight:700,background:'var(--blue-l)',color:'var(--blue)'}}>{p.type}</span></td>
                    <td style={{padding:'9px 12px',fontSize:12,fontFamily:'var(--font-mono)'}}>{p.quantity}</td>
                    <td style={{padding:'9px 12px',fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)'}}>€{fmtIT(p.avgPrice, 2)}</td>
                    <td style={{padding:'9px 12px',fontSize:12,fontFamily:'var(--font-mono)'}}>€{fmtIT(p.currentPrice, 2)}</td>
                    <td style={{padding:'9px 12px',fontSize:13,fontWeight:700,fontFamily:'var(--font-mono)',textAlign:'right'}}>€ {fmtIT(p.currentValue, 0)}</td>
                    <td style={{padding:'9px 12px',fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,textAlign:'right',color:isP?'var(--green)':'var(--red)'}}>
                      {isP?'+':'-'}€{Math.abs(pnl).toFixed(0)} <span style={{fontSize:10}}>({p.pnlPct}%)</span>
                    </td>
                    <td style={{padding:'6px 10px'}}><button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={()=>removePosition(p.id)}><Trash2 size={11}/></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="+ Posizione Cecilia" onClose={()=>setShowAdd(false)}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <FormRow label="Nome/Titolo"><Input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="es. iShares MSCI World"/></FormRow>
            <FormRow label="Ticker (opz.)"><Input value={form.ticker} onChange={e=>set('ticker',e.target.value)} placeholder="es. SWDA"/></FormRow>
          </div>
          <FormRow label="Tipo">
            <Select value={form.type} onChange={e=>set('type',e.target.value)}>
              {['ETF','Azione','Fondo','Obbligazione','Buono','Altro'].map(t=><option key={t}>{t}</option>)}
            </Select>
          </FormRow>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <FormRow label="Quantità"><Input type="number" value={form.qty} onChange={e=>set('qty',e.target.value)} placeholder="10"/></FormRow>
            <FormRow label="P.M. (€)"><Input type="number" value={form.avgPrice} onChange={e=>set('avgPrice',e.target.value)} placeholder="100"/></FormRow>
            <FormRow label="Prezzo att. (€)"><Input type="number" value={form.currentPrice} onChange={e=>set('currentPrice',e.target.value)} placeholder="100"/></FormRow>
          </div>
          {form.qty && form.avgPrice && (
            <div style={{padding:'8px 12px',background:'var(--blue-l)',borderRadius:'var(--radius-sm)',fontSize:12,marginTop:4}}>
              Valore: <strong>€ {Math.round(parseFloat(form.qty||0)*parseFloat(form.currentPrice||form.avgPrice||0)).toLocaleString('it-IT')}</strong>
            </div>
          )}
          <ModalFooter>
            <button className="btn btn-primary" onClick={addPosition}>Aggiungi</button>
            <button className="btn btn-secondary" onClick={()=>setShowAdd(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────

// ── Buoni Postali & Libretti ─────────────────────────────
function BuoniPostaliSection() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [bonds, setBonds] = useState(() => appPrefs.cecBonds || [])
  // Resync when async prefs arrive (avoids stale snapshot overwrite)
  useEffect(() => { setBonds(appPrefs.cecBonds || []) }, [appPrefs.cecBonds])
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ name:'', issuer:'Poste Italiane', rate:'', nominal:'', valueNow:'', maturity:'', note:'' })

  function save() {
    const updated = [...bonds, { id:Date.now(), ...form, nominal:parseFloat(form.nominal)||0, valueNow:parseFloat(form.valueNow)||0 }]
    setBonds(updated)
    setAppPref('cecBonds', updated)
    setShowAdd(false)
    setForm({ name:'', issuer:'Poste Italiane', rate:'', nominal:'', valueNow:'', maturity:'', note:'' })
  }

  function remove(id) {
    const updated = bonds.filter(b=>b.id!==id)
    setBonds(updated)
    setAppPref('cecBonds', updated)
  }

  const totalNominal  = bonds.reduce((s,b)=>s+(b.nominal||0),0)
  const totalValueNow = bonds.reduce((s,b)=>s+(b.valueNow||0),0)
  const gain = totalValueNow - totalNominal

  return (
    <div>
      {bonds.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
          {[
            ['Valore Nominale Totale', `€ ${fmtIT(totalNominal, 0)}`, 'var(--text2)'],
            ['Valore Attuale Totale',  `€ ${fmtIT(totalValueNow, 0)}`, 'var(--green)'],
            ['Plusvalenza',           (gain>=0?'+':'')+'€ '+fmtIT(gain, 0), gain>=0?'var(--green)':'var(--red)'],
          ].map(([l,v,color])=>(
            <div key={l} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'10px 14px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--text3)',marginBottom:4}}>{l}</div>
              <div style={{fontSize:16,fontWeight:800,color}}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{padding:0,overflow:'hidden',marginBottom:8}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>
            {['Strumento','Emittente','Nominale','Valore Attuale','Scadenza','Tasso','Note',''].map(h=>(
              <th key={h} style={{padding:'8px 12px',fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:['Nominale','Valore Attuale'].includes(h)?'right':'left'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {bonds.length === 0 ? (
              <tr><td colSpan={8} style={{padding:'24px',textAlign:'center',color:'var(--text3)',fontSize:13}}>Nessun buono postale o libretto registrato.</td></tr>
            ) : bonds.map(b=>(
              <tr key={b.id} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'9px 12px',fontWeight:600}}>{b.name}</td>
                <td style={{padding:'9px 12px',fontSize:12,color:'var(--text3)'}}>{b.issuer}</td>
                <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'var(--font-mono)'}}>€ {(b.nominal||0).toLocaleString('it-IT')}</td>
                <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--green)'}}>€ {(b.valueNow||0).toLocaleString('it-IT')}</td>
                <td style={{padding:'9px 12px',fontSize:12}}>{b.maturity||'—'}</td>
                <td style={{padding:'9px 12px',fontSize:12,color:'var(--blue)',fontWeight:600}}>{b.rate||'—'}</td>
                <td style={{padding:'9px 12px',fontSize:11,color:'var(--text3)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={b.note}>{b.note||'—'}</td>
                <td style={{padding:'6px 8px'}}>
                  <button className="btn btn-ghost" style={{color:'var(--red)',padding:'2px 6px'}} onClick={()=>remove(b.id)}><Trash2 size={11}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{padding:'10px 14px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
          <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>setShowAdd(true)}>
            <Plus size={12}/> Aggiungi
          </button>
        </div>
      </div>

      {showAdd && (
        <Modal title="+ Buono / Strumento Obbligazionario" onClose={()=>setShowAdd(false)} width={500}>
          <FormRow label="Nome strumento">
            <Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="es. Buono Postale Ordinario" autoFocus/>
          </FormRow>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <FormRow label="Emittente">
              <Input value={form.issuer} onChange={e=>setForm(f=>({...f,issuer:e.target.value}))} placeholder="Poste Italiane"/>
            </FormRow>
            <FormRow label="Tasso">
              <Input value={form.rate} onChange={e=>setForm(f=>({...f,rate:e.target.value}))} placeholder="2.0%"/>
            </FormRow>
            <FormRow label="Valore Nominale (€)">
              <Input type="number" value={form.nominal} onChange={e=>setForm(f=>({...f,nominal:e.target.value}))} placeholder="0"/>
            </FormRow>
            <FormRow label="Valore Attuale (€)">
              <Input type="number" value={form.valueNow} onChange={e=>setForm(f=>({...f,valueNow:e.target.value}))} placeholder="0"/>
            </FormRow>
            <FormRow label="Scadenza">
              <Input type="date" value={form.maturity} onChange={e=>setForm(f=>({...f,maturity:e.target.value}))}/>
            </FormRow>
          </div>
          <FormRow label="Note">
            <Input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="es. Intestato a Cecilia"/>
          </FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={save} disabled={!form.name}>Aggiungi</button>
            <button className="btn btn-secondary" onClick={()=>setShowAdd(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}

export default function CeciliaPage() {
  const { ceciliaGoals, deleteCeciliaGoal, transactions, satiPots } = useStore()
  const [showAdd,    setShowAdd]    = useState(false)
  const [editGoal,   setEditGoal]   = useState(null)
  const [depositGoal,setDepositGoal]= useState(null)

  const now    = new Date()
  const thisYM = getYM(now)
  const last6  = getLast6Months()

  // Cecilia related transactions from main log
  const cecTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && t.cat1 === 'Figli' && t.amount < 0)
  , [transactions])

  // Monthly spending on Figli
  const monthlySpend = last6.map(ym => ({
    label: ymLabel(ym),
    spesa: Math.abs(cecTxs.filter(t=>(t._effDate||t.date).startsWith(ym)).reduce((s,t)=>s+t.amount,0))
  }))

  const totalSaved  = ceciliaGoals.reduce((s,g) => s + (g.current || 0), 0)
  const totalTarget = ceciliaGoals.reduce((s,g) => s + g.target, 0)
  // KPI "Spese Figli" da inizio anno (YTD), non solo il mese corrente — richiesta
  // utente 2026-07-13: "i kpis prima riga, metti YTD, scrivilo nel titolo"
  const todayStr  = now.toISOString().slice(0, 10)
  const thisYear  = thisYM.slice(0, 4)
  const ytdSpend  = Math.abs(cecTxs.filter(t=>{
    const d = t._effDate || t.date
    return d && d.startsWith(thisYear) && d <= todayStr
  }).reduce((s,t)=>s+t.amount,0))

  // Satispay "Cecilia" fund — find pot by name (case-insensitive)
  const cecSatiPot = (satiPots||[]).find(p => p.name?.toLowerCase().includes('cecilia'))
  const cecSatiTotal = useMemo(() => {
    if (!cecSatiPot) return 0
    const nowYM_ = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
    const voci = cecSatiPot.voci || []
    let total = 0
    const data = cecSatiPot.data || {}
    Object.entries(data).forEach(([ym, entry]) => {
      if (ym > nowYM_) return
      const cells = entry?.cells || {}
      total += voci.reduce((s,v) => s + (parseFloat(cells[v.id])||0), 0)
    })
    return total
  }, [cecSatiPot])

  return (
    <div className="cec-page">
      <div className="cec-header">
        <div>
          <h1 className="cec-title">👧 Cecilia</h1>
          <div className="cec-sub">Obiettivi di risparmio e spese per la famiglia</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>
          <Plus size={14}/> Nuovo Obiettivo
        </button>
      </div>

      {/* KPIs */}
      <div className="cec-kpis">
        {[
          [Target,    'Totale Accantonato', `€ ${fmtIT(totalSaved, 0)}`, 'var(--green)'],
          [Gift,      'Obiettivi Totali',   `€ ${fmtIT(totalTarget, 0)}`, 'var(--blue)'],
          [TrendingUp,'Spese Figli (YTD)', `€ ${fmtIT(ytdSpend, 0)}`, 'var(--accent)'],
        ].map(([Icon,label,val,color])=>(
          <div key={label} className="card cec-kpi">
            <Icon size={16} color={color}/>
            <div>
              <div className="cec-kpi-label">{label}</div>
              <div className="cec-kpi-val" style={{color}}>{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Satispay Cecilia fund card */}
      {cecSatiPot && (
        <div className="card" style={{padding:'16px 20px',marginBottom:20,
          borderLeft:'3px solid var(--accent)',display:'flex',alignItems:'center',
          justifyContent:'space-between',gap:16}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:28}}>{cecSatiPot.icon}</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text2)'}}>
                💚 Fondo Satispay — {cecSatiPot.name}
              </div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                Accantonamento automatico sincronizzato da Satispay
              </div>
            </div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:22,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--green)'}}>
              € {fmtIT(cecSatiTotal, 0)}
            </div>
            <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>totale accumulato</div>
          </div>
        </div>
      )}

      {/* Spending chart */}
      {cecTxs.length > 0 && (
        <div className="card cec-chart-card">
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Spese categoria Figli — ultimi 6 mesi</div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={monthlySpend}>
              <defs>
                <linearGradient id="cecGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={50}
                tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(1)}K`:`€${v}`}/>
              <Tooltip formatter={v=>[`€ ${fmtIT(v, 0)}`,'Spese Figli']}
                contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
              <Area type="monotone" dataKey="spesa" stroke="var(--accent)" strokeWidth={2} fill="url(#cecGrad)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Goals grid */}
      <div className="cec-section-title">🎯 Obiettivi di Risparmio</div>
      {ceciliaGoals.length === 0 ? (
        <div className="cec-empty">
          <div style={{fontSize:40,marginBottom:12}}>⭐</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>Nessun obiettivo</div>
          <div style={{fontSize:13,color:'var(--text3)',marginBottom:16}}>
            Crea obiettivi di risparmio per Cecilia — università, macchina, viaggi.
          </div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={14}/> Primo Obiettivo</button>
        </div>
      ) : (
        <div className="cec-goals-grid">
          {ceciliaGoals.map(g=>(
            <GoalCard key={g.id} goal={g}
              onEdit={()=>setEditGoal(g)}
              onDelete={()=>{ if(confirm('Eliminare obiettivo?')) deleteCeciliaGoal(g.id) }}
              onDeposit={()=>setDepositGoal(g)}
            />
          ))}
        </div>
      )}

      {/* Recent Figli transactions */}
      {cecTxs.length > 0 && (
        <>
          <div className="cec-section-title" style={{marginTop:24}}>📋 Ultime Spese Figli</div>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                {['Data','Descrizione','Sotto-cat','Importo'].map(h=>(
                  <th key={h} style={{padding:'9px 14px',fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {cecTxs.slice(0,10).map(t=>(
                  <tr key={t.txId} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{fmtDate(t._effDate||t.date)}</td>
                    <td style={{padding:'9px 14px',fontSize:13,fontWeight:500}}>{t.descAI||t.description.slice(0,40)}</td>
                    <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)'}}>{t.cat2||'—'}</td>
                    <td style={{padding:'9px 14px',fontSize:13,fontWeight:700,color:'var(--red)',textAlign:'right',fontFamily:'var(--font-mono)'}}>
                      €{fmtIT(Math.abs(t.amount), 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Buoni Postali & Libretti */}
      <div className="cec-section-title" style={{marginTop:24}}>📄 Buoni Postali & Libretti</div>
      <BuoniPostaliSection/>

      {/* Portafoglio Investimenti */}
      <div className="cec-section-title" style={{marginTop:24}}>📈 Portafoglio Investimenti</div>
      <div className="card" style={{padding:'18px 20px',marginBottom:20}}>
        <CeciliaPortfolio/>
      </div>

      {showAdd    && <GoalModal onClose={()=>setShowAdd(false)}/>}
      {editGoal   && <GoalModal goal={editGoal} onClose={()=>setEditGoal(null)}/>}
      {depositGoal&& <DepositModal goal={depositGoal} onClose={()=>setDepositGoal(null)}/>}
    </div>
  )
}
