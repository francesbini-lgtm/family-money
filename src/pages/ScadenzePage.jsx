import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import { Plus, Trash2, CheckCircle, Circle, Bell } from 'lucide-react'
import { requestNotificationPermission, scheduleScadenzeNotifications } from '../services/notifications'
import './ScadenzePage.css'
import { fmtIT, fmtDate } from '../utils/format'

const CATS_SCD = ['Mutuo/Prestito','Assicurazione','Abbonamento','Tasse','Auto','Utenze','Altro']

// ── Rinnovo automatico SOLO per il Bollo (richiesta utente 2026-07-14) ──────
// Il Bollo è una tassa fissa con cadenza nota — la data si può far avanzare
// in automatico senza bisogno di conferma. Assicurazione/Tagliando/Revisione
// invece dipendono da un rinnovo effettivo (con importo variabile) che
// l'utente deve confermare esplicitamente: per questi NON si usa più
// nextOccurrence — una data passata resta "scaduta" finché l'utente non
// preme "✓ Rinnovato" (vedi RenewModal più sotto). Il campo originale sul
// veicolo (v.assicurazione/tagliando/revisione/bollo) viene aggiornato SOLO
// dal rinnovo esplicito (o, per il bollo, mai — resta il riferimento e il
// calcolo riparte sempre da lì).
function nextOccurrence(dateStr, years, todayStr) {
  if (!dateStr) return dateStr
  let cur = dateStr
  let guard = 0 // evita loop infiniti su date malformate
  while (cur < todayStr && guard < 60) {
    const d = new Date(cur)
    d.setFullYear(d.getFullYear() + years)
    cur = d.toISOString().slice(0, 10)
    guard++
  }
  return cur
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── Ultimo importo pagato per una categoria L2 veicolo (richiesta utente
// 2026-07-14: "lo trovi guardando quel veicolo, qual'è l'ultima spesa per
// quella categoria" — niente più importo inserito a mano, si legge dallo
// storico spese del veicolo in VeicoliRegistroPage: sia le spese manuali
// (vehExpenses, es. pagate cash) sia le transazioni bancarie auto-rilevate
// e assegnate a quel veicolo via appPrefs.vehTxVehicles). Prende la più
// recente per data tra le due fonti.
function lastCategoryExpense(vehicleId, catLabel, vehExpenses, transactions, vehTxVehicles) {
  const manual = (vehExpenses||[])
    .filter(e => e.vehicleId === vehicleId && e.cat === catLabel)
    .map(e => ({ date: e.date || '', amount: e.amount || 0 }))
  const auto = (transactions||[])
    .filter(t => !t.excluded && t.amount < 0 && t.cat1 === 'Veicoli' && t.cat2 === catLabel &&
      (vehTxVehicles||{})[t.txId] === vehicleId)
    .map(t => ({ date: t._effDate || t.date || '', amount: Math.abs(t.amount) }))
  const all = [...manual, ...auto].sort((a,b) => (b.date||'').localeCompare(a.date||''))
  return all[0]?.amount || 0
}

const CAT_LABEL = { assicurazione:'Assicurazione', tagliando:'Tagliando', revisione:'Revisione', bollo:'Bollo' }

function urgencyClass(daysLeft, pagata) {
  if (pagata) return 'paid'
  if (daysLeft < 0)  return 'overdue'
  if (daysLeft <= 7) return 'urgent'
  if (daysLeft <= 30)return 'soon'
  return 'ok'
}

// Colore del bordo sinistro coerente con l'urgenza (prima era sempre var(--accent)
// per le righe veicolo, nascondendo lo stato "scaduta" — bug segnalato dall'utente
// 2026-07-14 insieme al resto).
const URGENCY_BORDER = {
  paid: 'var(--green)', overdue: 'var(--red)', urgent: 'var(--red)',
  soon: 'var(--gold)', ok: 'var(--accent)',
}

// ── Rinnovo scadenza veicolo (Assicurazione/Tagliando/Revisione) ────────────
// Chiede solo la nuova data (default: giorno dopo la vecchia scadenza) —
// aggiorna v[fieldKey]. L'importo NON si chiede più qui: viene letto in
// automatico dall'ultima spesa registrata per quella categoria/veicolo
// (vedi lastCategoryExpense) non appena l'utente registra la spesa in
// Uscite › Veicoli.
function RenewModal({ s, onSave, onClose }) {
  const [data, setData] = useState(addDays(s.data, 1))

  function save() {
    if (!data) return
    onSave(data)
    onClose()
  }

  return (
    <Modal title={`✓ Rinnova — ${s.nome}`} onClose={onClose} width={380}>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
        Vecchia scadenza: <strong>{fmtDate(s.data)}</strong>
      </div>
      <FormRow label="Nuova scadenza"><Input type="date" value={data} onChange={e=>setData(e.target.value)} autoFocus/></FormRow>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>Salva rinnovo</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

function ScadenzaRow({ s, onToggle, onDelete, onRenew }) {
  const [showRenew, setShowRenew] = useState(false)
  const today   = new Date().toISOString().slice(0,10)
  const daysLeft = Math.round((new Date(s.data) - new Date(today)) / 86400000)
  const cls     = urgencyClass(daysLeft, s.pagata)

  const label = s.pagata ? 'Pagata' :
    daysLeft < 0   ? `Scaduta ${Math.abs(daysLeft)}gg fa` :
    daysLeft === 0  ? 'Scade oggi' :
    daysLeft <= 30  ? `Tra ${daysLeft} giorni` :
    `${fmtDate(s.data)}`

  // Vehicle-derived scadenza: read-only date, ma rinnovabile (tranne il Bollo,
  // che si auto-avanza da solo e non ha bisogno del bottone)
  if (s.isVehicle) {
    return (
      <>
      <div className={'scd-row scd-'+cls} style={{borderLeft:`3px solid ${URGENCY_BORDER[cls]}`,paddingLeft:10}}>
        <span style={{fontSize:22,lineHeight:1,flexShrink:0,marginRight:4}}>{s.vehicleIcon||'🚗'}</span>
        <div className="scd-info">
          <div className="scd-name">{s.nome}</div>
          <div className="scd-meta">🚗 Veicolo · {s.cadenza}</div>
        </div>
        {/* Colonna costo — sempre visibile (ultimo importo pagato), tra nome e data
            (richiesta utente 2026-07-14). Larghezza/allineamento ora definiti dalla
            classe .scd-amount condivisa (richiesta utente 2026-07-19: layout tabellare) */}
        <div className="scd-amount" style={{
          color: s.importo > 0 ? 'var(--text1)' : 'var(--text3)', fontWeight: s.importo > 0 ? 700 : 400}}>
          {s.importo > 0 ? `€ ${fmtIT(s.importo,0)}` : '—'}
        </div>
        <div className="scd-right">
          <div className="scd-badge-col"><span className={'scd-badge scd-badge-'+cls}>{label}</span></div>
          {/* Bottone Rinnovato? — solo quando è effettivamente scaduta (richiesta
              utente 2026-07-14: prima compariva sempre, anche per date future).
              Colonna azione sempre riservata (scd-action-col) anche quando vuota,
              così l'allineamento resta identico fra tutte le righe. */}
          <div className="scd-action-col">
            {!s.autoRenew && cls === 'overdue' && (
              <button className="btn btn-secondary" style={{fontSize:11,padding:'4px 10px',whiteSpace:'nowrap'}}
                onClick={()=>setShowRenew(true)}>✓ Rinnovato?</button>
            )}
          </div>
        </div>
      </div>
      {showRenew && (
        <RenewModal s={s} onClose={()=>setShowRenew(false)}
          onSave={(newDate) => onRenew(s, newDate)}/>
      )}
      </>
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
        <div className="scd-amount">{s.importo > 0 ? `€ ${fmtIT(s.importo, 0)}` : '—'}</div>
        <div className="scd-badge-col"><span className={'scd-badge scd-badge-'+cls}>{label}</span></div>
        <div className="scd-action-col">
          <button className="btn btn-ghost" onClick={onDelete}><Trash2 size={13}/></button>
        </div>
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
  const { scadenze, updateScadenza, deleteScadenza, vehicles, updateVehicle, vehExpenses, transactions, appPrefs } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter]   = useState('all') // all | pending | paid

  const today = new Date().toISOString().slice(0,10)
  const vehTxVehicles = appPrefs?.vehTxVehicles || {}

  // Generate virtual scadenze from vehicle deadline fields.
  // Solo il Bollo auto-avanza (autoRenew:true, via nextOccurrence) — gli altri
  // 3 restano fermi alla data reale sul veicolo finché l'utente non conferma
  // il rinnovo (richiesta utente 2026-07-14, vedi commento più sopra).
  const vehScadenze = (vehicles||[]).flatMap(v =>
    [
      ['assicurazione', '🛡 Assicurazione', 'Annuale',  false],
      ['tagliando',     '🔧 Tagliando',     'Annuale',  false],
      ['revisione',     '🔩 Revisione',     'Biennale', false],
      ['bollo',         '📋 Bollo',         'Annuale',  true],
    ]
    .filter(([k]) => v[k])
    .map(([k, label, cadenza, autoRenew]) => ({
      id: `veh-${v.id}-${k}`,
      nome: `${label} — ${v.name}`,
      data: autoRenew ? nextOccurrence(v[k], cadenza === 'Biennale' ? 2 : 1, today) : v[k],
      cat: 'Auto',
      cadenza,
      importo: lastCategoryExpense(v.id, CAT_LABEL[k], vehExpenses, transactions, vehTxVehicles),
      pagata: false,
      isVehicle: true,
      vehicleIcon: v.icon,
      vehicleId: v.id,
      fieldKey: k,
      autoRenew,
    }))
  )

  function handleRenew(s, newDate) {
    updateVehicle(s.vehicleId, { [s.fieldKey]: newDate })
  }

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
              onRenew={handleRenew}
            />
          ))}
        </div>
      )}

      {showAdd && <AddModal onClose={()=>setShowAdd(false)}/>}
    </div>
  )
}
