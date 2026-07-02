import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { getYM, getLast6Months, ymLabel } from '../hooks/useFinancials'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts'
import { Plus, Trash2, Zap, Flame, Droplets, Wifi } from 'lucide-react'
import './EnergiePage.css'
import { fmtIT } from '../utils/format'

const UTILITY_TYPES = [
  { id:'luce',  label:'Luce',    icon:'⚡', color:'#b8942a', unit:'kWh' },
  { id:'gas',   label:'Gas',     icon:'🔥', color:'#c8622a', unit:'m³'  },
  { id:'acqua', label:'Acqua',   icon:'💧', color:'#2a9aa0', unit:'m³'  },
  { id:'internet',label:'Internet/Tel',icon:'📡',color:'#2a5c8a',unit:'' },
  { id:'altro', label:'Altro',   icon:'🏠', color:'#888888', unit:''    },
]

function UtilityChart({ type, bills }) {
  const last6 = getLast6Months()
  const data  = last6.map(ym => {
    const b = bills.filter(b=>b.type===type.id && b.date.startsWith(ym))
    return {
      label:   ymLabel(ym),
      importo: b.reduce((s,x)=>s+x.importo,0),
      consumo: b.reduce((s,x)=>s+(x.consumo||0),0),
    }
  })
  const hasData = data.some(d=>d.importo>0)
  if (!hasData) return (
    <div style={{height:100,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:12}}>
      Nessuna bolletta registrata
    </div>
  )
  return (
    <ResponsiveContainer width="100%" height={110}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`grad-${type.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={type.color} stopOpacity={0.25}/>
            <stop offset="95%" stopColor={type.color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
        <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
        <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={40}
          tickFormatter={v=>`€${v>=1000?(v/1000).toFixed(0)+'K':v}`}/>
        <Tooltip formatter={v=>[`€ ${fmtIT(v, 0)}`,'Importo']}
          contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:8}}/>
        <Area type="monotone" dataKey="importo" stroke={type.color} strokeWidth={2}
          fill={`url(#grad-${type.id})`}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

function UtilityCard({ type, bills }) {
  const { deleteEnergyBill } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ date:'', importo:'', consumo:'', fornitore:'', note:'' })
  const { addEnergyBill }     = useStore()
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const typeBills = bills.filter(b=>b.type===type.id).sort((a,b)=>b.date.localeCompare(a.date))
  const thisYM    = getYM(new Date())
  const thisMonth = typeBills.find(b=>b.date.startsWith(thisYM))
  const lastMonth = typeBills[0]

  const avgImporto = typeBills.length > 0
    ? typeBills.reduce((s,b)=>s+b.importo,0)/typeBills.length : 0

  function save() {
    if (!form.date || !form.importo) return
    addEnergyBill({ type:type.id, ...form, importo:parseFloat(form.importo), consumo:parseFloat(form.consumo)||0 })
    setShowAdd(false)
    setForm({date:'',importo:'',consumo:'',fornitore:'',note:''})
  }

  return (
    <div className="util-card card">
      <div className="util-card-header">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:24}}>{type.icon}</span>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>{type.label}</div>
            {lastMonth && <div style={{fontSize:11,color:'var(--text3)'}}>{lastMonth.fornitore||'—'}</div>}
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11,color:'var(--text3)',marginBottom:2}}>Ultima bolletta</div>
          <div style={{fontSize:18,fontWeight:700,fontFamily:'var(--font-mono)',color:type.color}}>
            {lastMonth ? `€ ${fmtIT(lastMonth.importo, 2)}` : '—'}
          </div>
          {avgImporto > 0 && <div style={{fontSize:10,color:'var(--text3)'}}>media € {fmtIT(avgImporto, 0)}</div>}
        </div>
      </div>

      <UtilityChart type={type} bills={bills}/>

      {typeBills.length > 0 && (
        <div style={{marginTop:10,maxHeight:180,overflowY:'auto'}}>
          {typeBills.slice(0,6).map(b=>(
            <div key={b.id} className="util-bill-row">
              <span style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{b.date.slice(0,7)}</span>
              {b.consumo>0 && <span style={{fontSize:11,color:'var(--text3)'}}>{b.consumo} {type.unit}</span>}
              <span style={{flex:1}}/>
              <span style={{fontSize:13,fontWeight:700,fontFamily:'var(--font-mono)'}}>€ {fmtIT(b.importo, 2)}</span>
              <button className="btn btn-ghost" style={{padding:'2px 6px'}} onClick={()=>deleteEnergyBill(b.id)}><Trash2 size={11}/></button>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-secondary" style={{width:'100%',marginTop:10,fontSize:12,justifyContent:'center'}} onClick={()=>setShowAdd(true)}>
        <Plus size={12}/> Aggiungi bolletta
      </button>

      {showAdd && (
        <Modal title={`+ Bolletta ${type.label}`} onClose={()=>setShowAdd(false)}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <FormRow label="Mese"><Input type="month" value={(form.date||'').slice(0,7)} onChange={e=>set('date',e.target.value+'-01')}/></FormRow>
            <FormRow label="Importo (€)"><Input type="number" value={form.importo} onChange={e=>set('importo',e.target.value)} placeholder="0"/></FormRow>
          </div>
          {type.unit && (
            <FormRow label={`Consumo (${type.unit})`}>
              <Input type="number" value={form.consumo} onChange={e=>set('consumo',e.target.value)} placeholder="0"/>
            </FormRow>
          )}
          <FormRow label="Fornitore"><Input value={form.fornitore} onChange={e=>set('fornitore',e.target.value)} placeholder={type.id==='luce'?'Enel, A2A…':type.id==='gas'?'ENI Gas…':''}/></FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={save}>Salva</button>
            <button className="btn btn-secondary" onClick={()=>setShowAdd(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}

export default function EnergiePage() {
  const { energyBills } = useStore()

  const totalThisMonth = useMemo(() => {
    const ym = getYM(new Date())
    return energyBills.filter(b=>b.date.startsWith(ym)).reduce((s,b)=>s+b.importo,0)
  }, [energyBills])

  const totalYear = useMemo(() => {
    const y = new Date().getFullYear().toString()
    return energyBills.filter(b=>b.date.startsWith(y)).reduce((s,b)=>s+b.importo,0)
  }, [energyBills])

  return (
    <div className="en2-page">
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600}}>⚡ Utenze</h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>Bollette luce, gas, acqua e altri contratti</div>
        </div>
      </div>

      {energyBills.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
          {[
            ['Utenze mese corrente',`€ ${fmtIT(totalThisMonth, 0)}`],
            ['Utenze anno corrente',`€ ${fmtIT(totalYear, 0)}`],
            ['Bollette registrate', energyBills.length],
          ].map(([l,v])=>(
            <div key={l} className="card" style={{padding:'14px 18px'}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:5}}>{l}</div>
              <div style={{fontSize:20,fontWeight:700,fontFamily:'var(--font-mono)'}}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="util-grid">
        {UTILITY_TYPES.map(t=>(
          <UtilityCard key={t.id} type={t} bills={energyBills}/>
        ))}
      </div>
    </div>
  )
}
