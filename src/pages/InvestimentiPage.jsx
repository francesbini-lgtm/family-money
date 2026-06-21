import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import { Plus, Trash2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import './InvestimentiPage.css'
import { fmtIT } from '../utils/format'

const INV_CLASSES = {
  'ETF':          { color:'#2a5c8a', icon:'📈' },
  'Azione':       { color:'#c8622a', icon:'📊' },
  'Obbligazione': { color:'#2a7a4a', icon:'🏦' },
  'Fondo':        { color:'#b8942a', icon:'💼' },
  'Crypto':       { color:'#9b59b6', icon:'₿' },
  'Liquidità':    { color:'#2a9aa0', icon:'💧' },
  'Altro':        { color:'#888',    icon:'📦' },
}

// ── Position utils ────────────────────────────────────────
const posVal  = p => p.qty * p.prezzoLive * (p.currency==='$'?0.92:1)
const posCost = p => p.qty * p.pmCarico  * (p.currency==='$'?0.92:1)
const posGL   = p => posVal(p) - posCost(p)
const posGLPct= p => posCost(p) > 0 ? (posGL(p)/posCost(p))*100 : 0

// Mini SVG sparkline
function Spark({ data, color }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1))*78
    const y = 28 - ((v-min)/range)*24
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox="0 0 80 32" width={80} height={32}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

// ── Add/Edit position modal ───────────────────────────────
function PositionModal({ position, portfolioId, onClose }) {
  const { addPortfolioPosition, updatePortfolioPosition } = useStore()
  const [form, setForm] = useState(position || {
    ticker:'', name:'', class:'ETF', qty:'', pmCarico:'', prezzoLive:'', currency:'€'
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  function save() {
    const data = {...form, qty:parseFloat(form.qty)||0, pmCarico:parseFloat(form.pmCarico)||0, prezzoLive:parseFloat(form.prezzoLive)||0}
    if (position) updatePortfolioPosition(portfolioId, position.id, data)
    else addPortfolioPosition(portfolioId, {...data, id:Date.now()})
    onClose()
  }
  return (
    <Modal title={position?'✏️ Modifica Posizione':'+ Aggiungi Posizione'} onClose={onClose} width={500}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Ticker"><Input value={form.ticker} onChange={e=>set('ticker',e.target.value.toUpperCase())} placeholder="es. VWCE"/></FormRow>
        <FormRow label="Classe">
          <Select value={form.class} onChange={e=>set('class',e.target.value)}>
            {Object.keys(INV_CLASSES).map(c=><option key={c}>{c}</option>)}
          </Select>
        </FormRow>
        <FormRow label="Nome"><Input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="es. Vanguard All-World"/></FormRow>
        <FormRow label="Valuta">
          <Select value={form.currency} onChange={e=>set('currency',e.target.value)}>
            {['€','$','£','CHF'].map(c=><option key={c}>{c}</option>)}
          </Select>
        </FormRow>
        <FormRow label="Quantità"><Input type="number" value={form.qty} onChange={e=>set('qty',e.target.value)} placeholder="0" step="any"/></FormRow>
        <FormRow label="P.M. Carico"><Input type="number" value={form.pmCarico} onChange={e=>set('pmCarico',e.target.value)} placeholder="0" step="any"/></FormRow>
        <FormRow label="Prezzo Attuale"><Input type="number" value={form.prezzoLive} onChange={e=>set('prezzoLive',e.target.value)} placeholder="0" step="any"/></FormRow>
      </div>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save} disabled={!form.ticker}>Salva</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function InvestimentiPage() {
  const { portfolios, addPortfolio, deletePortfolio, deletePortfolioPosition } = useStore()
  const [selPortfolio, setSelPortfolio] = useState(null)
  const [showAddPort,  setShowAddPort]  = useState(false)
  const [newPortName,  setNewPortName]  = useState('')
  const [showAddPos,   setShowAddPos]   = useState(false)
  const [editPos,      setEditPos]      = useState(null)
  const [filterClass,  setFilterClass]  = useState('')
  const [sortKey,      setSortKey]      = useState('value')
  const [lastRefresh,  setLastRefresh]  = useState(null)

  // Select first portfolio by default
  const activePortfolioId = selPortfolio || portfolios[0]?.id
  const activePortfolio   = portfolios.find(p=>p.id===activePortfolioId)
  const positions         = activePortfolio?.positions || []

  // KPIs
  const totalVal   = positions.reduce((s,p)=>s+posVal(p),0)
  const totalCost  = positions.reduce((s,p)=>s+posCost(p),0)
  const totalGL    = totalVal - totalCost
  const totalGLPct = totalCost > 0 ? (totalGL/totalCost)*100 : 0

  // Filter + sort
  const filtered = useMemo(() => {
    let pos = filterClass ? positions.filter(p=>p.class===filterClass) : [...positions]
    pos.sort((a,b) => {
      if (sortKey==='value')  return posVal(b)  - posVal(a)
      if (sortKey==='perf')   return posGLPct(b) - posGLPct(a)
      if (sortKey==='ticker') return a.ticker.localeCompare(b.ticker)
      return 0
    })
    return pos
  }, [positions, filterClass, sortKey])

  // Allocation by class
  const allocData = useMemo(() => {
    const byClass = {}
    positions.forEach(p => {
      byClass[p.class] = (byClass[p.class]||0) + posVal(p)
    })
    return Object.entries(byClass).map(([name,val])=>({
      name, val: Math.round(val), color: INV_CLASSES[name]?.color||'#888'
    })).sort((a,b)=>b.val-a.val)
  }, [positions])

  // Simulated equity curve (6 months)
  const equityCurve = useMemo(() => {
    const months = ['Gen','Feb','Mar','Apr','Mag','Giu']
    const base = totalCost || 10000
    return months.map((m,i) => ({
      label: m,
      valore: Math.round(base * (1 + (i*0.02 + Math.sin(i)*0.01)))
    }))
  }, [totalCost])

  function addPortfolioHandler() {
    if (!newPortName.trim()) return
    addPortfolio({ name: newPortName.trim() })
    setNewPortName('')
    setShowAddPort(false)
  }

  function simulateRefresh() {
    setLastRefresh(new Date().toLocaleTimeString('it-IT'))
  }

  if (portfolios.length === 0) return (
    <div style={{padding:'28px 32px',textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:16}}>📊</div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Nessun portafoglio</div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:20}}>Crea il tuo primo portafoglio per tracciare investimenti</div>
      <button className="btn btn-primary" onClick={()=>setShowAddPort(true)}><Plus size={14}/> Nuovo Portafoglio</button>
      {showAddPort && (
        <Modal title="+ Nuovo Portafoglio" onClose={()=>setShowAddPort(false)} width={380}>
          <FormRow label="Nome portafoglio">
            <Input value={newPortName} onChange={e=>setNewPortName(e.target.value)} placeholder="es. Portafoglio Principale" autoFocus/>
          </FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={addPortfolioHandler} disabled={!newPortName.trim()}>Crea</button>
            <button className="btn btn-secondary" onClick={()=>setShowAddPort(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )

  return (
    <div className="inv-page">
      {/* Header */}
      <div className="inv-header">
        <div>
          <h1 className="inv-title">📊 Portafoglio Investimenti</h1>
          <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
            Prezzi aggiornati · {lastRefresh ? `Ultimo aggiornamento: ${lastRefresh}` : 'Premi ↻ per aggiornare'}
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* Portfolio tabs */}
          <div style={{display:'flex',gap:3,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:9,padding:3}}>
            {portfolios.map(p=>(
              <button key={p.id}
                onClick={()=>setSelPortfolio(p.id)}
                style={{padding:'5px 14px',borderRadius:7,border:'none',
                  background:activePortfolioId===p.id?'var(--surface)':'none',
                  color:activePortfolioId===p.id?'var(--text)':'var(--text3)',
                  fontWeight:activePortfolioId===p.id?700:500,
                  cursor:'pointer',fontSize:12,fontFamily:'var(--font-sans)',
                  boxShadow:activePortfolioId===p.id?'0 1px 4px rgba(0,0,0,.08)':'none'}}>
                {p.name}
              </button>
            ))}
            <button title="Nuovo portafoglio" onClick={()=>setShowAddPort(true)}
              style={{padding:'5px 10px',borderRadius:7,border:'none',background:'none',color:'var(--text3)',cursor:'pointer',fontSize:12,fontFamily:'var(--font-sans)'}}>
              +
            </button>
          </div>
          <button className="btn btn-ghost" style={{fontSize:12}} onClick={simulateRefresh} title="Aggiorna prezzi">
            <RefreshCw size={13}/> Aggiorna
          </button>
          <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>setShowAddPos(true)}>
            <Plus size={13}/> Aggiungi
          </button>
          {activePortfolio && (
            <button className="btn btn-ghost" style={{fontSize:12,color:'var(--red)'}}
              onClick={()=>{if(confirm('Eliminare portafoglio?'))deletePortfolio(activePortfolioId)}}>
              <Trash2 size={13}/>
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="inv-kpis">
        {[
          ['Valore Portafoglio', `€ ${fmtIT(totalVal, 0)}`, totalGL>=0?'var(--green)':'var(--red)',
            `${totalGL>=0?'+':'-'}€ ${Math.round(Math.abs(totalGL)).toLocaleString('it-IT')} (${totalGL>=0?'+':''}${totalGLPct.toFixed(1)}%)`],
          ['Guadagno / Perdita', `${totalGL>=0?'+':'-'}€ ${Math.round(Math.abs(totalGL)).toLocaleString('it-IT')}`, totalGL>=0?'var(--green)':'var(--red)',
            `${totalGLPct>=0?'+':''}${totalGLPct.toFixed(2)}% sul capitale`],
          ['Capitale Investito', `€ ${fmtIT(totalCost, 0)}`, 'var(--blue)',
            `${positions.length} posizioni attive`],
          ['Posizioni', String(positions.length), 'var(--gold)',
            filterClass ? `${filtered.length} filtrate` : 'Tutte le classi'],
        ].map(([l,v,color,sub])=>(
          <div key={l} className="card inv-kpi" style={{borderLeft:`3px solid ${color}`}}>
            <div className="inv-kpi-label">{l}</div>
            <div className="inv-kpi-value" style={{color}}>{v}</div>
            <div className="inv-kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="inv-charts-row">
        <div className="card" style={{padding:'16px 18px'}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Evoluzione Valore (simulata)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={60}
                tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
              <Tooltip formatter={v=>[`€ ${fmtIT(v, 0)}`, 'Valore']}
                contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
              <Line type="monotone" dataKey="valore" stroke="var(--accent)" strokeWidth={2.5} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{padding:'16px 18px'}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Allocazione per Asset Class</div>
          {allocData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={allocData} dataKey="val" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={40}>
                    {allocData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip formatter={v=>[`€ ${fmtIT(v, 0)}`]}
                    contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:8}}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:8}}>
                {allocData.map(d=>(
                  <div key={d.name} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                    <div style={{width:10,height:10,borderRadius:3,background:d.color,flexShrink:0}}/>
                    <span style={{flex:1,color:'var(--text2)'}}>{d.name}</span>
                    <span style={{fontWeight:600}}>€ {fmtIT(d.val, 0)}</span>
                    <span style={{color:'var(--text3)',width:40,textAlign:'right',fontSize:11}}>
                      {totalVal>0?((d.val/totalVal)*100).toFixed(1):0}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:20}}>Nessuna posizione</div>}
        </div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <select className="filter-select" value={filterClass} onChange={e=>setFilterClass(e.target.value)}>
          <option value="">Tutte le Asset Class</option>
          {Object.keys(INV_CLASSES).map(c=><option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          <option value="value">Ordina: Valore ↓</option>
          <option value="perf">Ordina: Performance ↓</option>
          <option value="ticker">Ordina: Ticker A-Z</option>
        </select>
      </div>

      {/* Positions table */}
      {filtered.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',color:'var(--text3)'}}>
          <div style={{fontSize:32,marginBottom:12}}>📈</div>
          <div style={{fontWeight:700,marginBottom:6}}>Nessuna posizione</div>
          <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>setShowAddPos(true)}><Plus size={12}/> Aggiungi posizione</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'var(--surface2)'}}>
                {['','Ticker','Classe','Qty','P.M. Carico','Prezzo Att.','Valore €','G/P €','G/P %','Trend','Peso %',''].map(h=>(
                  <th key={h} style={{padding:'9px 10px',fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',borderBottom:'1px solid var(--border)',textAlign:['Valore €','G/P €','G/P %','Qty','P.M. Carico','Prezzo Att.','Peso %'].includes(h)?'right':'left',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p=>{
                const val    = posVal(p)
                const gl     = posGL(p)
                const glPct  = posGLPct(p)
                const weight = totalVal > 0 ? (val/totalVal)*100 : 0
                const ci     = INV_CLASSES[p.class] || INV_CLASSES['Altro']
                const glColor= gl >= 0 ? 'var(--green)' : 'var(--red)'
                const sparkData = [p.pmCarico*0.95,p.pmCarico*0.98,p.pmCarico,p.pmCarico*1.02,p.prezzoLive*0.99,p.prezzoLive]
                return (
                  <tr key={p.id} className="inv-row" style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 10px',fontSize:20,textAlign:'center'}}>{ci.icon}</td>
                    <td style={{padding:'10px 10px'}}>
                      <div style={{fontWeight:700,color:ci.color,fontSize:14}}>{p.ticker}</div>
                      <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{p.name||p.ticker}</div>
                    </td>
                    <td style={{padding:'10px 10px'}}>
                      <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,fontWeight:700,background:ci.color+'18',color:ci.color,border:`1px solid ${ci.color}30`}}>{p.class}</span>
                    </td>
                    <td style={{padding:'10px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{p.qty}</td>
                    <td style={{padding:'10px 10px',textAlign:'right',fontSize:12,color:'var(--text2)'}}>{p.pmCarico?.toFixed(2)} {p.currency}</td>
                    <td style={{padding:'10px 10px',textAlign:'right',fontSize:13,fontWeight:700}}>{p.prezzoLive?.toFixed(2)} {p.currency}</td>
                    <td style={{padding:'10px 10px',textAlign:'right',fontFamily:'var(--font-serif)',fontSize:14,fontWeight:700}}>€ {fmtIT(val, 0)}</td>
                    <td style={{padding:'10px 10px',textAlign:'right'}}><span style={{color:glColor,fontWeight:700,fontSize:12}}>{gl>=0?'+':'-'}€ {Math.round(Math.abs(gl)).toLocaleString('it-IT')}</span></td>
                    <td style={{padding:'10px 10px',textAlign:'right'}}><span style={{color:glColor,fontWeight:700,fontSize:12}}>{glPct>=0?'+':''}{ glPct.toFixed(1)}%</span></td>
                    <td style={{padding:'10px 10px'}}><Spark data={sparkData} color={gl>=0?'#2a7a4a':'#c83030'}/></td>
                    <td style={{padding:'10px 10px',textAlign:'right'}}>
                      <div style={{fontSize:12,fontWeight:600}}>{weight.toFixed(1)}%</div>
                      <div style={{height:3,borderRadius:2,background:'var(--border)',width:52,marginTop:3}}>
                        <div style={{height:'100%',borderRadius:2,background:ci.color,width:Math.min(weight*3,100)+'%'}}/>
                      </div>
                    </td>
                    <td style={{padding:'8px 8px',whiteSpace:'nowrap'}}>
                      <button className="btn btn-ghost" style={{padding:'2px 6px',fontSize:11}} onClick={()=>setEditPos(p)}>✏️</button>
                      <button className="btn btn-ghost" style={{padding:'2px 6px',fontSize:11,color:'var(--red)'}} onClick={()=>{if(confirm('Eliminare?'))deletePortfolioPosition(activePortfolioId,p.id)}}>✕</button>
                    </td>
                  </tr>
                )
              })}
              {/* Footer totals */}
              <tr style={{background:'var(--surface2)',borderTop:'2px solid var(--border)',fontWeight:700}}>
                <td colSpan={6} style={{padding:'10px 14px',fontSize:13}}>Totale {filterClass||'Portafoglio'}</td>
                <td style={{padding:'10px 10px',textAlign:'right',fontFamily:'var(--font-serif)',fontSize:14}}>€ {Math.round(filtered.reduce((s,p)=>s+posVal(p),0)).toLocaleString('it-IT')}</td>
                <td style={{padding:'10px 10px',textAlign:'right'}}><span style={{color:totalGL>=0?'var(--green)':'var(--red)',fontWeight:700}}>{totalGL>=0?'+':'-'}€ {Math.round(Math.abs(filtered.reduce((s,p)=>s+posGL(p),0))).toLocaleString('it-IT')}</span></td>
                <td colSpan={4}/>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {showAddPort && (
        <Modal title="+ Nuovo Portafoglio" onClose={()=>setShowAddPort(false)} width={380}>
          <FormRow label="Nome"><Input value={newPortName} onChange={e=>setNewPortName(e.target.value)} placeholder="es. Portafoglio ETF" autoFocus/></FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={addPortfolioHandler} disabled={!newPortName.trim()}>Crea</button>
            <button className="btn btn-secondary" onClick={()=>setShowAddPort(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
      {showAddPos && <PositionModal portfolioId={activePortfolioId} onClose={()=>setShowAddPos(false)}/>}
      {editPos    && <PositionModal portfolioId={activePortfolioId} position={editPos} onClose={()=>setEditPos(null)}/>}
    </div>
  )
}
