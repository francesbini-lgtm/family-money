import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import { Plus, Trash2, CheckCircle, Circle, Bell } from 'lucide-react'
import { requestNotificationPermission, scheduleScadenzeNotifications } from '../services/notifications'
import './ScadenzePage.css'
import { fmtIT } from '../utils/format'

const CATS_SCD = ['Mutuo/Prestito','Assicurazione','Abbonamento','Tasse','Auto','Utenze','Altro']

function urgencyClass(daysLeft, pagata) {
  if (pagata) return 'paid'
  if (daysLeft < 0)  return 'overdue'
  if (daysLeft <= 7) return 'urgent'
  if (daysLeft <= 30)return 'soon'
  return 'ok'
}

function ScadenzaRow({ s, onToggle, onDelete }) {
  const today   = new Date().toISOString().slice(0,10)
  const daysLeft = Math.round((new Date(s.data) - new Date(today)) / 86400000)
  const cls     = urgencyClass(daysLeft, s.pagata)

  const label = s.pagata ? 'Pagata' :
    daysLeft < 0   ? `Scaduta ${Math.abs(daysLeft)}gg fa` :
    daysLeft === 0  ? 'Scade oggi' :
    daysLeft <= 30  ? `Tra ${daysLeft} giorni` :
    `${s.data.slice(5).replace('-','/')}`

  // Vehicle-derived scadenza: read-only, distinct style
  if (s.isVehicle) {
    return (
      <div className={'scd-row scd-'+cls} style={{borderLeft:'3px solid var(--accent)',paddingLeft:10}}>
        <span style={{fontSize:22,lineHeight:1,flexShrink:0,marginRight:4}}>{s.vehicleIcon||'🚗'}</span>
        <div className="scd-info">
          <div className="scd-name">{s.nome}</div>
          <div className="scd-meta">🚗 Veicolo · {s.cadenza}</div>
        </div>
        <div className="scd-right">
          <span className={'scd-badge scd-badge-'+cls}>{label}</span>
          <span style={{fontSize:10,color:'var(--text3)',padding:'1px 6px',background:'var(--surface2)',
            borderRadius:4,border:'1px solid var(--border)'}}>dal veicolo</span>
        </div>
      </div>
    )
  }

  return (
    <div className={'scd-row scd-'+cls}>
      <button className="scd-check" onClick={onToggle}>
        {s.pagata ? <CheckCircle size={18} color="var(--green)"/> : <Circle size={18} color="var(--text3)"/>}
      </button>
      <div className="scd-info">
        <div className="scd-name">{s.nome}</div>
        <div className="scd-meta">{s.cat} · {s.cadenza}</div>
      </div>
      <div className="scd-right">
        {s.importo > 0 && (
          <div className="scd-amount">€ {fmtIT(s.importo, 0)}</div>
        )}
        <span className={'scd-badge scd-badge-'+cls}>{label}</span>
        <button className="btn btn-ghost" onClick={onDelete}><Trash2 size={13}/></button>
      </div>
    </div>
  )
}

function AddModal({ onClose }) {
  const addScadenza = useStore(s => s.addScadenza)
  const [form, setForm] = useState({ nome:'', data:'', importo:'', cat:'Altro', cadenza:'Annuale', note:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  function save() {
    if (!form.nome || !form.data) return
    addScadenza({ ...form, importo: parseFloat(form.importo)||0, pagata: false })
    onClose()
  }

  return (
    <Modal title="+ Nuova Scadenza" onClose={onClose}>
      <FormRow label="Nome"><Input value={form.nome} onChange={e=>set('nome',e.target.value)} placeholder="es. Bollo Auto" /></FormRow>
      <FormRow label="Data scadenza"><Input type="date" value={form.data} onChange={e=>set('data',e.target.value)} /></FormRow>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Importo (€)"><Input type="number" value={form.importo} onChange={e=>set('importo',e.target.value)} placeholder="0" /></FormRow>
        <FormRow label="Categoria">
          <Select value={form.cat} onChange={e=>set('cat',e.target.value)}>
            {CATS_SCD.map(c=><option key={c}>{c}</option>)}
          </Select>
        </FormRow>
      </div>
      <FormRow label="Cadenza">
        <Select value={form.cadenza} onChange={e=>set('cadenza',e.target.value)}>
          {['Mensile','Bimestrale','Trimestrale','Semestrale','Annuale','Biennale','Una tantum'].map(c=><option key={c}>{c}</option>)}
        </Select>
      </FormRow>
      <FormRow label="Note (opzionale)"><Input value={form.note} onChange={e=>set('note',e.target.value)} /></FormRow>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>Salva</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

export default function ScadenzePage() {
  const { scadenze, updateScadenza, deleteScadenza, vehicles } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter]   = useState('all') // all | pending | paid

  const today = new Date().toISOString().slice(0,10)

  // Generate virtual scadenze from vehicle deadline fields
  const vehScadenze = (vehicles||[]).flatMap(v =>
    [
      ['assicurazione', '🛡 Assicurazione', 'Annuale'],
      ['tagliando',     '🔧 Tagliando',     'Annuale'],
      ['revisione',     '🔩 Revisione',     'Biennale'],
      ['bollo',         '📋 Bollo',         'Annuale'],
    ]
    .filter(([k]) => v[k])
    .map(([k, label, cadenza]) => ({
      id: `veh-${v.id}-${k}`,
      nome: `${label} — ${v.name}`,
      data: v[k],
      cat: 'Auto',
      cadenza,
      importo: 0,
      pagata: false,
      isVehicle: true,
      vehicleIcon: v.icon,
    }))
  )

  const allScadenze = [...scadenze, ...vehScadenze]
  const sorted = [...allScadenze].sort((a,b) => a.data.localeCompare(b.data))
  const filtered = sorted.filter(s =>
    filter === 'all'    ? true :
    filter === 'pending'? !s.pagata :
    s.pagata
  )

  const urgent  = allScadenze.filter(s => !s.pagata && new Date(s.data) <= new Date(new Date().setDate(new Date().getDate()+30)))
  const overdue = allScadenze.filter(s => !s.pagata && s.data < today)
  const totalDue = scadenze.filter(s=>!s.pagata).reduce((sum,s)=>sum+s.importo,0)

  return (
    <div className="scd-page">
      <div className="scd-header">
        <div>
          <h1 className="scd-title">📅 Scadenze</h1>
          <div className="scd-sub">Tieni traccia di bollette, assicurazioni e rate</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary" onClick={async()=>{
            const p=await requestNotificationPermission()
            if(p==='granted') scheduleScadenzeNotifications(scadenze)
            else if(p==='denied') alert('Notifiche bloccate dal browser. Abilitale nelle impostazioni.')
          }} title="Abilita notifiche scadenze">
            <Bell size={14}/> Notifiche
          </button>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>
            <Plus size={14}/> Aggiungi
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="scd-kpis">
        <div className="card scd-kpi">
          <Bell size={16} color="var(--red)"/>
          <div>
            <div className="scd-kpi-label">In scadenza (30gg)</div>
            <div className="scd-kpi-val" style={{color:'var(--red)'}}>{urgent.length}</div>
          </div>
        </div>
        <div className="card scd-kpi">
          <div className="scd-kpi-dot overdue"/>
          <div>
            <div className="scd-kpi-label">Scadute</div>
            <div className="scd-kpi-val" style={{color:'var(--red)'}}>{overdue.length}</div>
          </div>
        </div>
        <div className="card scd-kpi">
          <div className="scd-kpi-dot ok"/>
          <div>
            <div className="scd-kpi-label">Totale da pagare</div>
            <div className="scd-kpi-val">€ {fmtIT(totalDue, 0)}</div>
          </div>
        </div>
        <div className="card scd-kpi">
          <CheckCircle size={16} color="var(--green)"/>
          <div>
            <div className="scd-kpi-label">Pagate</div>
            <div className="scd-kpi-val" style={{color:'var(--green)'}}>{scadenze.filter(s=>s.pagata).length}</div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="scd-filters">
        {[['all','Tutte'],['pending','Da pagare'],['paid','Pagate']].map(([v,l])=>(
          <button key={v} className={'scd-filter'+(filter===v?' active':'')} onClick={()=>setFilter(v)}>{l}</button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="scd-empty">
          <div style={{fontSize:40,marginBottom:12}}>📅</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>
            {filter==='all'?'Nessuna scadenza':filter==='pending'?'Nessuna scadenza da pagare':'Nessuna scadenza pagata'}
          </div>
          <div style={{fontSize:13,color:'var(--text3)'}}>Aggiungi bollette, assicurazioni e rate per non dimenticarle.</div>
        </div>
      ) : (
        <div className="card scd-list">
          {filtered.map(s => (
            <ScadenzaRow
              key={s.id} s={s}
              onToggle={() => updateScadenza(s.id, {pagata:!s.pagata})}
              onDelete={() => deleteScadenza(s.id)}
            />
          ))}
        </div>
      )}

      {showAdd && <AddModal onClose={()=>setShowAdd(false)}/>}
    </div>
  )
}
