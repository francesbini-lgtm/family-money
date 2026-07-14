import { useState, useMemo, useRef } from 'react'
import { useStore } from '../store/useStore'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import VehicleQuickPicker from '../components/VehicleQuickPicker'
import { uploadExpenseFiles, deleteExpenseFile } from '../services/storage'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LabelList,
  PieChart, Pie, Cell
} from 'recharts'
import { Plus, Trash2, Link } from 'lucide-react'
import './VeicoliRegistroPage.css'
import { fmtIT, fmtDate } from '../utils/format'
import { CATS, getMergedCats } from '../data/categories'

const VEH_ICONS = ['🚗','🚙','🚕','🏎','🚐','🛻','🏍','🚤','⛵','🚁','🛵','🚌',
  'svg:motocross','svg:motoscafo','svg:bmw1','svg:jeep']

// SVG custom icons
const SVG_ICONS = {
  'svg:motocross': (
    <svg viewBox="0 0 48 32" width="32" height="22" xmlns="http://www.w3.org/2000/svg">
      {/* rear wheel */}
      <circle cx="10" cy="23" r="8" fill="none" stroke="#1a4a8a" strokeWidth="2.5"/>
      <circle cx="10" cy="23" r="3" fill="#1a4a8a"/>
      {/* front wheel */}
      <circle cx="40" cy="24" r="7" fill="none" stroke="#1a4a8a" strokeWidth="2.5"/>
      <circle cx="40" cy="24" r="2.5" fill="#1a4a8a"/>
      {/* frame */}
      <path d="M10 15 L22 8 L34 10 L40 17" fill="none" stroke="#1a4a8a" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M10 15 L18 22" fill="none" stroke="#1a4a8a" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M22 8 L20 22" fill="none" stroke="#2a6ac8" strokeWidth="2" strokeLinecap="round"/>
      {/* handlebar */}
      <path d="M34 10 L38 6 L42 7" fill="none" stroke="#1a4a8a" strokeWidth="2" strokeLinecap="round"/>
      {/* seat */}
      <path d="M20 8 L30 7" fill="none" stroke="#1a4a8a" strokeWidth="3" strokeLinecap="round"/>
      {/* exhaust */}
      <path d="M14 18 L8 20" fill="none" stroke="#2a6ac8" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  'svg:motoscafo': (
    <svg viewBox="0 0 56 32" width="36" height="22" xmlns="http://www.w3.org/2000/svg">
      {/* hull */}
      <path d="M4 22 L8 28 L48 28 L54 22 L4 22Z" fill="#ddd" stroke="#999" strokeWidth="1.2"/>
      {/* cabin */}
      <rect x="14" y="10" width="24" height="13" rx="3" fill="white" stroke="#aaa" strokeWidth="1.2"/>
      {/* windshield */}
      <path d="M14 16 L18 10 L36 10 L38 16" fill="#cde" stroke="#aaa" strokeWidth="1"/>
      {/* windows */}
      <rect x="17" y="12" width="6" height="5" rx="1" fill="#b8d8f0" stroke="#aaa" strokeWidth="0.8"/>
      <rect x="27" y="12" width="6" height="5" rx="1" fill="#b8d8f0" stroke="#aaa" strokeWidth="0.8"/>
      {/* bow */}
      <path d="M38 18 L54 22" fill="none" stroke="#bbb" strokeWidth="1.5"/>
      {/* antenna */}
      <line x1="32" y1="10" x2="32" y2="5" stroke="#888" strokeWidth="1"/>
      <circle cx="32" cy="4.5" r="1" fill="#888"/>
    </svg>
  ),
  'svg:bmw1': (
    <svg viewBox="0 0 56 28" width="36" height="22" xmlns="http://www.w3.org/2000/svg">
      {/* body */}
      <path d="M4 20 L6 14 L14 8 L34 7 L44 12 L52 14 L52 20Z" fill="#111" stroke="#333" strokeWidth="1"/>
      {/* roof */}
      <path d="M14 8 L18 4 L36 4 L42 8" fill="#111" stroke="#333" strokeWidth="1"/>
      {/* windshield */}
      <path d="M18 4 L16 8 L14 8" fill="none" stroke="#555" strokeWidth="1"/>
      <path d="M18 4 L36 4 L42 8 L38 8" fill="#2a2a2a" stroke="#444" strokeWidth="0.8"/>
      {/* rear window */}
      <path d="M14 8 L18 4" fill="none" stroke="#444" strokeWidth="1"/>
      {/* wheels */}
      <circle cx="14" cy="21" r="5.5" fill="#222" stroke="#555" strokeWidth="1.5"/>
      <circle cx="14" cy="21" r="2.5" fill="#444" stroke="#666" strokeWidth="1"/>
      <circle cx="42" cy="21" r="5.5" fill="#222" stroke="#555" strokeWidth="1.5"/>
      <circle cx="42" cy="21" r="2.5" fill="#444" stroke="#666" strokeWidth="1"/>
      {/* headlights */}
      <rect x="47" y="14" width="4" height="2.5" rx="1" fill="#ffe"/>
      {/* kidney grille */}
      <rect x="47" y="17" width="2" height="2" rx="0.5" fill="#333"/>
      <rect x="50" y="17" width="2" height="2" rx="0.5" fill="#333"/>
      {/* ground line */}
      <line x1="4" y1="26" x2="52" y2="26" stroke="#333" strokeWidth="0.5"/>
    </svg>
  ),
  'svg:jeep': (
    <svg viewBox="0 0 56 32" width="36" height="22" xmlns="http://www.w3.org/2000/svg">
      {/* body — boxy */}
      <rect x="6" y="10" width="44" height="16" rx="2" fill="#111" stroke="#333" strokeWidth="1"/>
      {/* roof — flat */}
      <rect x="8" y="5" width="40" height="7" rx="1" fill="#111" stroke="#333" strokeWidth="1"/>
      {/* windshield */}
      <rect x="10" y="6" width="15" height="6" rx="1" fill="#2a2a2a" stroke="#444" strokeWidth="0.8"/>
      {/* rear window */}
      <rect x="31" y="6" width="14" height="6" rx="1" fill="#2a2a2a" stroke="#444" strokeWidth="0.8"/>
      {/* wheels — big off-road */}
      <circle cx="16" cy="26" r="6" fill="#1a1a1a" stroke="#444" strokeWidth="2"/>
      <circle cx="16" cy="26" r="2.5" fill="#333" stroke="#555" strokeWidth="1"/>
      <circle cx="40" cy="26" r="6" fill="#1a1a1a" stroke="#444" strokeWidth="2"/>
      <circle cx="40" cy="26" r="2.5" fill="#333" stroke="#555" strokeWidth="1"/>
      {/* headlights */}
      <rect x="48" y="13" width="3" height="3" rx="0.5" fill="#ffe" stroke="#aaa" strokeWidth="0.5"/>
      {/* grille */}
      <line x1="49" y1="17" x2="49" y2="22" stroke="#444" strokeWidth="1"/>
      <line x1="51" y1="17" x2="51" y2="22" stroke="#444" strokeWidth="1"/>
      {/* spare wheel hint on back */}
      <circle cx="7" cy="18" r="4" fill="#1a1a1a" stroke="#444" strokeWidth="1.5"/>
      <circle cx="7" cy="18" r="1.5" fill="#333"/>
    </svg>
  ),
}

function renderIcon(icon, size = 36) {
  if (icon && icon.startsWith('svg:')) return SVG_ICONS[icon] || '🚗'
  return <span style={{fontSize: size}}>{icon || '🚗'}</span>
}
const VEH_CATS  = ['Carburante','Assicurazione','Tagliando','Revisione','Gomme','Bollo','Car Washing','Autostrade','Parcheggio','Multa','Ormeggio','Extra','Altro']
const VEH_COLORS = ['#2a5c8a','#c8622a','#2a7a4a','#b8942a','#9b59b6','#2a9aa0','#e74c3c','#f39c12','#1abc9c','#8e44ad','#2980b9','#27ae60']
const CAT_COLORS = {
  Carburante:'#2a5c8a',Assicurazione:'#c8622a',Tagliando:'#2a7a4a',Revisione:'#b8942a',
  Gomme:'#9b59b6',Bollo:'#2a9aa0',CarWashing:'#e74c3c',Autostrade:'#f39c12',
  Parcheggio:'#1abc9c',Multa:'#e91e63',Extra:'#607080',Altro:'#888'
}
const MONTHS_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function getLast6Months() {
  const now = new Date(), r = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
    r.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }
  return r
}
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6) }
// fmtDate imported from utils/format

// ── Add/Edit Vehicle Modal ────────────────────────────────
function VehicleModal({ vehicle, onClose }) {
  const { addVehicle, updateVehicle } = useStore()
  const [form, setForm] = useState(vehicle || {
    name:'', targa:'', marca:'', modello:'', anno:'', icon:'🚗', consumo:'', valoreMercato:'', carburante:'',
    assicurazione:'', tagliando:'', revisione:'', bollo:''
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const isEdit = !!vehicle

  function save() {
    if (!form.name) return
    if (isEdit) { updateVehicle(vehicle.id, form); onClose() }
    else { addVehicle(form); onClose() }
  }

  return (
    <Modal title={isEdit ? `✏️ ${vehicle.name}` : '+ Aggiungi Veicolo'} onClose={onClose} width={560}>
      <FormRow label="Nome"><Input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="es. BMW X3" autoFocus/></FormRow>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Targa"><Input value={form.targa} onChange={e=>set('targa',e.target.value.toUpperCase())} placeholder="AB123CD"/></FormRow>
        <FormRow label="Marca"><Input value={form.marca} onChange={e=>set('marca',e.target.value)} placeholder="BMW"/></FormRow>
        <FormRow label="Modello"><Input value={form.modello||''} onChange={e=>set('modello',e.target.value)} placeholder="es. Renegade, X3, Model 3"/></FormRow>
        <FormRow label="Anno"><Input type="number" value={form.anno} onChange={e=>set('anno',e.target.value)} placeholder="2022"/></FormRow>
        <FormRow label="Carburante">
          <Select value={form.carburante||''} onChange={e=>set('carburante',e.target.value)}>
            <option value="">—</option>
            <option value="Benzina">Benzina</option>
            <option value="Diesel">Diesel</option>
            <option value="GPL">GPL</option>
            <option value="Metano">Metano</option>
            <option value="Elettrico">Elettrico</option>
            <option value="Ibrido">Ibrido</option>
          </Select>
        </FormRow>
        <FormRow label="Consumo (km/l)"><Input type="number" step="0.1" value={form.consumo||''} onChange={e=>set('consumo',e.target.value)} placeholder="es. 15"/></FormRow>
        <FormRow label="Valore di mercato (€)"><Input type="number" value={form.valoreMercato||''} onChange={e=>set('valoreMercato',e.target.value)} placeholder="es. 18000"/></FormRow>
        <FormRow label="Icona">
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {VEH_ICONS.map(ic=>(
              <button key={ic} onClick={()=>set('icon',ic)} style={{
                padding:'4px 6px',borderRadius:7,border:`2px solid ${form.icon===ic?'var(--accent)':'var(--border)'}`,
                background:form.icon===ic?'var(--accent-l)':'var(--surface)',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',minWidth:36,minHeight:32}}>
                {ic.startsWith('svg:')
                  ? <span style={{display:'flex',alignItems:'center'}}>{SVG_ICONS[ic]}</span>
                  : <span style={{fontSize:20,lineHeight:1}}>{ic}</span>
                }
              </button>
            ))}
          </div>
        </FormRow>
      </div>
      <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',margin:'12px 0 8px'}}>📅 Scadenze</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Assicurazione"><Input type="date" value={form.assicurazione||''} onChange={e=>set('assicurazione',e.target.value)}/></FormRow>
        <FormRow label="Tagliando"><Input type="date" value={form.tagliando||''} onChange={e=>set('tagliando',e.target.value)}/></FormRow>
        <FormRow label="Revisione"><Input type="date" value={form.revisione||''} onChange={e=>set('revisione',e.target.value)}/></FormRow>
        <FormRow label="Bollo"><Input type="date" value={form.bollo||''} onChange={e=>set('bollo',e.target.value)}/></FormRow>
      </div>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>{isEdit?'Aggiorna':'Salva'}</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Add/Edit Expense Modal ────────────────────────────────
// expense = null → add mode; expense = obj → edit mode
function AddExpenseModal({ vehicles, preVehicleId, expense: editingExpense, onClose }) {
  const { addVehExpense, updateVehExpense } = useStore()
  const isEdit = !!editingExpense

  const [form, setForm] = useState(() => {
    if (isEdit) return {
      date: editingExpense.date || new Date().toISOString().slice(0,10),
      desc: editingExpense.desc || '',
      cat: editingExpense.cat || 'Carburante',
      amount: editingExpense.amount != null ? String(editingExpense.amount) : '',
      vehicleId: editingExpense.vehicleId || vehicles[0]?.id || '',
      payMethod: editingExpense.payMethod || 'carta',
      notes: editingExpense.notes || '',
    }
    return {
      date: new Date().toISOString().slice(0,10),
      desc: '', cat: 'Carburante', amount: '',
      vehicleId: preVehicleId || vehicles[0]?.id || '',
      payMethod: 'carta', notes: ''
    }
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  // Existing attachments (edit mode) — can be individually removed
  const [existingAtts, setExistingAtts] = useState(isEdit ? (editingExpense.attachments || []) : [])
  const [files,    setFiles]    = useState([])   // new File[] pending upload
  const [uploading, setUploading] = useState(false)
  const [monthOnly, setMonthOnly] = useState(isEdit && (editingExpense.date||'').endsWith('-15'))
  const fileRef = useRef()

  function addFiles(newFiles) {
    setFiles(prev => [...prev, ...Array.from(newFiles)])
  }
  function removeFile(idx) { setFiles(f => f.filter((_,i)=>i!==idx)) }

  async function removeExistingAtt(idx) {
    const att = existingAtts[idx]
    if (att?.path) {
      try { await deleteExpenseFile(att.path) } catch(e) { console.warn(e) }
    }
    setExistingAtts(prev => prev.filter((_,i)=>i!==idx))
  }

  function onDrop(e) {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }

  async function save() {
    if (!form.amount || !form.vehicleId) return
    setUploading(true)
    let newAttachments = []
    if (files.length > 0) {
      const expId = isEdit ? editingExpense.id : uid()
      try { newAttachments = await uploadExpenseFiles(expId, files) } catch(e) { console.error(e) }
    }
    const attachments = [...existingAtts, ...newAttachments]

    if (isEdit) {
      updateVehExpense(editingExpense.id, { ...form, amount: parseFloat(form.amount), attachments })
    } else {
      addVehExpense({ ...form, amount: parseFloat(form.amount), id: uid(), attachments })
    }
    setUploading(false)
    onClose()
  }

  const fmtSize = b => b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`

  return (
    <Modal title={isEdit ? `✏️ Modifica spesa` : '+ Spesa Veicolo'} onClose={onClose} width={500}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Veicolo">
          <Select value={form.vehicleId} onChange={e=>set('vehicleId',e.target.value)}>
            {vehicles.map(v=><option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
          </Select>
        </FormRow>
        <FormRow label="Categoria">
          <Select value={form.cat} onChange={e=>set('cat',e.target.value)}>
            {VEH_CATS.map(c=><option key={c}>{c}</option>)}
          </Select>
        </FormRow>
        <FormRow label={
          <span style={{display:'flex',alignItems:'center',gap:6}}>
            Data
            <label style={{display:'flex',alignItems:'center',gap:4,fontWeight:400,fontSize:10,color:'var(--text3)',cursor:'pointer'}}>
              <input type="checkbox" checked={monthOnly} onChange={e=>{
                setMonthOnly(e.target.checked)
                if(e.target.checked) {
                  // keep only YYYY-MM, set day to 15 as neutral
                  const ym = form.date.slice(0,7)
                  set('date', ym+'-15')
                }
              }} style={{accentColor:'var(--accent)',width:11,height:11}}/>
              so solo il mese
            </label>
          </span>
        }>
          {monthOnly
            ? <Input type="month" value={form.date.slice(0,7)}
                onChange={e=>set('date', e.target.value+'-15')}/>
            : <Input type="date" value={form.date} onChange={e=>set('date',e.target.value)}/>
          }
        </FormRow>
        <FormRow label="Importo €"><Input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" step="0.01" autoFocus/></FormRow>
        <FormRow label="Metodo pagamento">
          <Select value={form.payMethod} onChange={e=>set('payMethod',e.target.value)}>
            <option value="carta">💳 Carta</option>
            <option value="cash">💵 Cash</option>
            <option value="bonifico">🏦 Bonifico</option>
            <option value="altro">• Altro</option>
          </Select>
        </FormRow>
      </div>
      <FormRow label="Descrizione"><Input value={form.desc} onChange={e=>set('desc',e.target.value)} placeholder="es. Rifornimento IP Como"/></FormRow>

      {/* File drop zone */}
      <div style={{marginTop:12}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',marginBottom:6}}>
          📎 Allegati (foto, PDF)
        </div>
        <div
          onDrop={onDrop} onDragOver={e=>e.preventDefault()}
          onClick={()=>fileRef.current?.click()}
          style={{border:'2px dashed var(--border)',borderRadius:8,padding:'14px 16px',
            cursor:'pointer',textAlign:'center',color:'var(--text3)',fontSize:12,
            background:'var(--surface2)',transition:'border-color .15s'}}
          onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
          onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
          Trascina file qui oppure <span style={{color:'var(--accent)',fontWeight:600}}>clicca per selezionare</span>
          <br/><span style={{fontSize:10,marginTop:2,display:'block'}}>JPG, PNG, PDF — più file supportati</span>
        </div>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{display:'none'}}
          onChange={e=>addFiles(e.target.files)}/>

        {files.length > 0 && (
          <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4}}>
            {files.map((f,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',
                background:'var(--surface)',borderRadius:6,border:'1px solid var(--border)'}}>
                <span style={{fontSize:16}}>{f.type.startsWith('image/')?' 🖼':'📄'}</span>
                <span style={{flex:1,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                <span style={{fontSize:10,color:'var(--text3)',flexShrink:0}}>{fmtSize(f.size)}</span>
                <button onClick={e=>{e.stopPropagation();removeFile(i)}}
                  style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',padding:2,fontSize:14,lineHeight:1}}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Existing attachments (edit mode) */}
      {isEdit && existingAtts.length > 0 && (
        <div style={{marginTop:8}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',marginBottom:5}}>
            Allegati esistenti
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {existingAtts.map((att,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',
                background:'var(--surface)',borderRadius:6,border:'1px solid var(--border)'}}>
                <span style={{fontSize:16}}>{att.type?.startsWith('image/')?'🖼':'📄'}</span>
                <span style={{flex:1,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  <a href={att.url} target="_blank" rel="noreferrer" style={{color:'var(--accent)',textDecoration:'none'}}>{att.name}</a>
                </span>
                <button onClick={()=>removeExistingAtt(i)}
                  style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',padding:2,fontSize:14,lineHeight:1}}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ModalFooter>
        <button className="btn btn-primary" onClick={save} disabled={uploading}>
          {uploading ? '⏳ Caricamento…' : isEdit ? 'Aggiorna' : 'Aggiungi'}
        </button>
        <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Attachments viewer modal ──────────────────────────────
function AttachmentsModal({ expense, onClose, onDelete }) {
  const atts = expense.attachments || []

  function isImage(att) { return att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name) }

  return (
    <Modal title={`📎 Allegati — ${expense.desc || 'Spesa'}`} onClose={onClose} width={520}>
      {atts.length === 0
        ? <div style={{textAlign:'center',color:'var(--text3)',padding:24}}>Nessun allegato.</div>
        : <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {atts.map((att,i)=>(
              <div key={i} style={{border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
                {isImage(att) && (
                  <img src={att.url} alt={att.name}
                    style={{width:'100%',maxHeight:260,objectFit:'contain',background:'var(--surface2)',display:'block'}}/>
                )}
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--surface)'}}>
                  <span style={{fontSize:18}}>{isImage(att)?'🖼':'📄'}</span>
                  <span style={{flex:1,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</span>
                  <a href={att.url} target="_blank" rel="noreferrer"
                    style={{fontSize:11,color:'var(--accent)',fontWeight:600,textDecoration:'none',flexShrink:0}}>
                    Apri ↗
                  </a>
                  {onDelete && (
                    <button onClick={()=>onDelete(att,i)}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:12,padding:'0 4px'}}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
      }
      <ModalFooter><button className="btn btn-secondary" onClick={onClose}>Chiudi</button></ModalFooter>
    </Modal>
  )
}

// ── Reconcile Modal ───────────────────────────────────────
// allExpenses needed to detect already-assigned cashEntries
function VehReconModal({ expense, transactions, cashEntries, payMethod, allVehExpenses, onSave, onClose }) {
  const [search, setSearch] = useState('')
  const isCash = (payMethod || expense.payMethod) === 'cash'

  // IDs already linked to other veh expenses
  const usedReconRefs = new Set(
    (allVehExpenses||[]).filter(e=>e.id!==expense.id && e.reconType==='cash' && e.reconRef)
      .map(e=>e.reconRef.slice(0,80))
  )

  // Build candidate list based on payment method
  let candidates = []
  if (isCash) {
    // Cash mode: ATM prelievi (cat1=Contanti, amount<0) within 60 days before expense date
    const expDate = expense.date || ''
    const cutoff = expDate ? new Date(new Date(expDate).getTime() - 60*24*60*60*1000).toISOString().slice(0,10) : ''
    candidates = (transactions||[])
      .filter(t => {
        if (t.excluded || t.amount >= 0 || t.cat1 !== 'Contanti') return false
        const tDate = t._effDate || t.date || ''
        const beforeDate = !expDate || tDate <= expDate
        const withinWindow = !cutoff || tDate >= cutoff
        const label = `💵 ${t.descAI||(t.description||'').slice(0,30)} · ${tDate} · €${fmtIT(Math.abs(t.amount),2)}`
        return beforeDate && withinWindow && !usedReconRefs.has(label.slice(0,80))
      })
      .map(t => {
        const tDate = t._effDate || t.date || ''
        return {
          id:`atm-${t.txId}`,
          label:`💵 ${t.descAI||(t.description||'').slice(0,30)} · ${tDate} · €${fmtIT(Math.abs(t.amount),2)}`,
          amount: Math.abs(t.amount), type:'cash'
        }
      })
  } else {
    // Bank/other: show transactions before expense date
    candidates = transactions
      .filter(t => !t.excluded && t.amount < 0 && (!expense.date || (t._effDate||(t._effDate||t.date||'')) <= expense.date))
      .map(t=>({
        id:`tx-${t.txId}`,
        label:`${t.descAI||(t.description||'').slice(0,30)} · ${t._effDate||t.date} · €${fmtIT(Math.abs(t.amount),2)}`,
        amount: Math.abs(t.amount), type:'bank'
      }))
  }

  // Sort by closeness to expense amount
  const sorted = candidates
    .map(c=>({...c, delta: Math.abs(c.amount - expense.amount)}))
    .sort((a,b)=>a.delta-b.delta)
  const filtered = search ? sorted.filter(c=>c.label.toLowerCase().includes(search.toLowerCase())) : sorted.slice(0,40)

  // For cash: detect partial match (withdrawal > expense)
  function handleSelect(c) {
    if (isCash && c.amount > expense.amount * 1.05) {
      // Partial: note that only part of the withdrawal is used
      onSave({ ...c, partial: true, usedAmount: expense.amount })
    } else {
      onSave(c)
    }
  }

  return (
    <Modal title={`🔗 Collega — ${expense.desc || 'Spesa'}`} onClose={onClose} width={540}>
      <div style={{marginBottom:10,padding:'8px 12px',background:'var(--blue-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--blue)'}}>
        <strong>{expense.desc||'—'}</strong> · € {fmtIT(expense.amount,2)} · {expense.date}
        {isCash && <span style={{marginLeft:8,fontSize:11,background:'var(--gold-l)',color:'var(--gold)',padding:'1px 7px',borderRadius:8,fontWeight:700}}>💵 Cash — prelievi ATM ultimi 60gg</span>}
      </div>
      <FormRow label="Cerca"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca…" autoFocus/></FormRow>
      <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:300,overflowY:'auto',marginBottom:4}}>
        {filtered.length===0
          ? <div style={{textAlign:'center',fontSize:12,color:'var(--text3)',padding:16}}>
              {isCash ? 'Nessun prelievo ATM trovato (cat. Contanti, ultimi 60gg).' : 'Nessuna transazione trovata.'}
            </div>
          : filtered.map(c=>{
              const isPartial = isCash && c.amount > expense.amount * 1.05
              return (
                <button key={c.id} onClick={()=>handleSelect(c)}
                  style={{padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',
                    background:'var(--surface)',cursor:'pointer',textAlign:'left',fontFamily:'var(--font-sans)',
                    display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:11,padding:'2px 6px',borderRadius:4,fontWeight:700,flexShrink:0,
                    background:c.type==='cash'?'var(--gold-l)':'var(--blue-l)',
                    color:c.type==='cash'?'var(--gold)':'var(--blue)'}}>
                    {c.type==='cash'?'💵':'🏦'}
                  </span>
                  <span style={{fontSize:12,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.label}</span>
                  {isPartial && <span style={{fontSize:10,color:'var(--gold)',fontWeight:700,flexShrink:0,border:'1px solid var(--gold)',borderRadius:4,padding:'0 5px'}}>parziale €{fmtIT(expense.amount,2)}</span>}
                  {!isPartial && c.delta < expense.amount * 0.15 && <span style={{fontSize:10,color:'var(--green)',fontWeight:700,flexShrink:0}}>≈ match</span>}
                </button>
              )
            })
        }
      </div>
      <ModalFooter><button className="btn btn-secondary" onClick={onClose}>Annulla</button></ModalFooter>
    </Modal>
  )
}

// ── Vehicle Compact Card ──────────────────────────────────
// ── Vehicle Trips Modal ───────────────────────────────────
function TripsModal({ vehicle, onClose }) {
  const { appPrefs, setAppPref } = useStore()
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0,10))

  const allTrips = useMemo(() => {
    const raw = appPrefs?.vehicleTrips?.[vehicle.id] || []
    return [...raw].sort((a,b) => b.date.localeCompare(a.date))
  }, [appPrefs?.vehicleTrips, vehicle.id])

  const thisYear = new Date().getFullYear().toString()

  function addTrip() {
    if (!newDate) return
    const existing = appPrefs?.vehicleTrips?.[vehicle.id] || []
    const trip = { id: uid(), date: newDate }
    setAppPref('vehicleTrips', { ...(appPrefs?.vehicleTrips || {}), [vehicle.id]: [...existing, trip] })
    setNewDate(new Date().toISOString().slice(0,10))
  }

  function deleteTrip(id) {
    const existing = appPrefs?.vehicleTrips?.[vehicle.id] || []
    setAppPref('vehicleTrips', { ...(appPrefs?.vehicleTrips || {}), [vehicle.id]: existing.filter(t => t.id !== id) })
  }

  const tripsThisYear = allTrips.filter(t => t.date.startsWith(thisYear))

  return (
    <Modal title={`🗓 Uscite ${vehicle.name}`} onClose={onClose} width={420}>
      <div style={{marginBottom:16,padding:'10px 14px',background:'var(--surface2)',borderRadius:8,display:'flex',alignItems:'center',gap:12}}>
        <span style={{fontSize:28}}>{renderIcon(vehicle.icon, 28)}</span>
        <div>
          <div style={{fontSize:22,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--accent)'}}>{tripsThisYear.length}</div>
          <div style={{fontSize:11,color:'var(--text3)'}}>uscite nel {thisYear}</div>
        </div>
        {allTrips.length > tripsThisYear.length && (
          <div style={{marginLeft:'auto',textAlign:'right'}}>
            <div style={{fontSize:16,fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--text2)'}}>{allTrips.length}</div>
            <div style={{fontSize:11,color:'var(--text3)'}}>totale storico</div>
          </div>
        )}
      </div>

      {/* Add new trip */}
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
        <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
          style={{flex:1,padding:'7px 10px',border:'1px solid var(--border)',borderRadius:7,
            fontSize:13,background:'var(--surface)',color:'var(--text)',fontFamily:'var(--font-sans)'}}/>
        <button className="btn btn-primary" style={{fontSize:12,whiteSpace:'nowrap'}} onClick={addTrip}>
          + Aggiungi uscita
        </button>
      </div>

      {/* Trip list */}
      {allTrips.length === 0
        ? <div style={{textAlign:'center',padding:'20px 0',fontSize:13,color:'var(--text3)'}}>Nessuna uscita registrata.</div>
        : <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:320,overflowY:'auto'}}>
            {allTrips.map((t,i) => (
              <div key={t.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'7px 12px',borderRadius:7,background:'var(--surface2)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:11,fontWeight:700,color:'var(--text3)',fontFamily:'var(--font-mono)',minWidth:18,textAlign:'right'}}>{allTrips.length - i}</span>
                  <span style={{fontSize:13,fontFamily:'var(--font-mono)'}}>{fmtDate(t.date)}</span>
                  {t.date.startsWith(thisYear) && (
                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'var(--accent-l,var(--blue-l))',color:'var(--accent)',fontWeight:700}}>{thisYear}</span>
                  )}
                </div>
                <button onClick={()=>deleteTrip(t.id)} style={{background:'none',border:'none',cursor:'pointer',
                  color:'var(--text3)',opacity:0.5,padding:2,lineHeight:1}}
                  onMouseEnter={e=>e.currentTarget.style.opacity=1}
                  onMouseLeave={e=>e.currentTarget.style.opacity=0.5}>
                  <Trash2 size={12}/>
                </button>
              </div>
            ))}
          </div>
      }
    </Modal>
  )
}

// ── Vehicle Km Readings Modal ─────────────────────────────
// Registro chilometraggio: l'utente inserisce data + km rilevati (es. dal
// cruscotto). Serve a tenere traccia dell'ultima rilevazione nota, utile
// per calcoli futuri (consumo reale, valore residuo, tagliandi per km ecc.)
// — richiesta utente 2026-07-14: "lascia spazio per inserire quanti km ha
// l'ultima rilevazione (utente deve mettere data)".
function KmModal({ vehicle, onClose }) {
  const { appPrefs, setAppPref } = useStore()
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0,10))
  const [newKm,   setNewKm]   = useState('')

  const allReadings = useMemo(() => {
    const raw = appPrefs?.vehicleKmReadings?.[vehicle.id] || []
    return [...raw].sort((a,b) => b.date.localeCompare(a.date))
  }, [appPrefs?.vehicleKmReadings, vehicle.id])

  function addReading() {
    if (!newDate || !newKm) return
    const existing = appPrefs?.vehicleKmReadings?.[vehicle.id] || []
    const reading = { id: uid(), date: newDate, km: parseFloat(newKm)||0 }
    setAppPref('vehicleKmReadings', { ...(appPrefs?.vehicleKmReadings || {}), [vehicle.id]: [...existing, reading] })
    setNewDate(new Date().toISOString().slice(0,10))
    setNewKm('')
  }

  function deleteReading(id) {
    const existing = appPrefs?.vehicleKmReadings?.[vehicle.id] || []
    setAppPref('vehicleKmReadings', { ...(appPrefs?.vehicleKmReadings || {}), [vehicle.id]: existing.filter(r => r.id !== id) })
  }

  return (
    <Modal title={`🛣 Chilometraggio ${vehicle.name}`} onClose={onClose} width={420}>
      {allReadings.length > 0 && (
        <div style={{marginBottom:16,padding:'10px 14px',background:'var(--surface2)',borderRadius:8,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:28}}>{renderIcon(vehicle.icon, 28)}</span>
          <div>
            <div style={{fontSize:22,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--accent)'}}>{fmtIT(allReadings[0].km,0)} km</div>
            <div style={{fontSize:11,color:'var(--text3)'}}>ultima rilevazione: {fmtDate(allReadings[0].date)}</div>
          </div>
        </div>
      )}

      {/* Add new reading */}
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
        <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
          style={{flex:1,padding:'7px 10px',border:'1px solid var(--border)',borderRadius:7,
            fontSize:13,background:'var(--surface)',color:'var(--text)',fontFamily:'var(--font-sans)'}}/>
        <input type="number" value={newKm} onChange={e=>setNewKm(e.target.value)} placeholder="es. 42500"
          style={{width:110,padding:'7px 10px',border:'1px solid var(--border)',borderRadius:7,
            fontSize:13,background:'var(--surface)',color:'var(--text)',fontFamily:'var(--font-mono)'}}/>
        <button className="btn btn-primary" style={{fontSize:12,whiteSpace:'nowrap'}} onClick={addReading} disabled={!newDate||!newKm}>
          + Aggiungi
        </button>
      </div>

      {/* Readings list */}
      {allReadings.length === 0
        ? <div style={{textAlign:'center',padding:'20px 0',fontSize:13,color:'var(--text3)'}}>Nessuna rilevazione registrata.</div>
        : <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:320,overflowY:'auto'}}>
            {allReadings.map((r,i) => (
              <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'7px 12px',borderRadius:7,background:'var(--surface2)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:13,fontFamily:'var(--font-mono)'}}>{fmtDate(r.date)}</span>
                  <span style={{fontSize:13,fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--accent)'}}>{fmtIT(r.km,0)} km</span>
                  {i===0 && (
                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'var(--accent-l,var(--blue-l))',color:'var(--accent)',fontWeight:700}}>ultima</span>
                  )}
                </div>
                <button onClick={()=>deleteReading(r.id)} style={{background:'none',border:'none',cursor:'pointer',
                  color:'var(--text3)',opacity:0.5,padding:2,lineHeight:1}}
                  onMouseEnter={e=>e.currentTarget.style.opacity=1}
                  onMouseLeave={e=>e.currentTarget.style.opacity=0.5}>
                  <Trash2 size={12}/>
                </button>
              </div>
            ))}
          </div>
      }
    </Modal>
  )
}

function VehicleChip({ vehicle, onEdit, onDelete }) {
  const { appPrefs } = useStore()
  const [showTrips, setShowTrips] = useState(false)
  const [showKm, setShowKm] = useState(false)

  const lastKmReading = useMemo(() => {
    const raw = appPrefs?.vehicleKmReadings?.[vehicle.id] || []
    if (!raw.length) return null
    return [...raw].sort((a,b) => b.date.localeCompare(a.date))[0]
  }, [appPrefs?.vehicleKmReadings, vehicle.id])

  const scadenze = [['assicurazione','🛡'],['tagliando','🔧'],['revisione','🔩'],['bollo','📋']]
    .filter(([k]) => vehicle[k])
    .map(([k,icon]) => {
      const days = Math.round((new Date(vehicle[k]) - new Date()) / 86400000)
      const color = days < 0 ? 'var(--red)' : days < 30 ? 'var(--red)' : days < 90 ? 'var(--gold)' : 'var(--green)'
      const bg    = days < 0 ? 'var(--red-l)' : days < 30 ? 'var(--red-l)' : days < 90 ? 'var(--gold-l)' : 'var(--green-l)'
      return { key:k, icon, color, bg, label: days < 0 ? '⚠ scaduta' : days < 90 ? `${days}gg` : '✓', date: vehicle[k] }
    })

  const thisYear = new Date().getFullYear().toString()
  const tripsThisYear = (appPrefs?.vehicleTrips?.[vehicle.id] || []).filter(t => t.date.startsWith(thisYear)).length

  return (
    <>
    <div className="card" style={{padding:'14px 16px',display:'flex',alignItems:'flex-start',gap:14,position:'relative'}}>
      {/* Edit pencil — top right corner */}
      <button onClick={onEdit} title="Modifica" style={{
        position:'absolute',top:8,right:8,background:'none',border:'none',cursor:'pointer',
        color:'var(--text3)',padding:3,borderRadius:4,lineHeight:1,opacity:0.5,transition:'opacity .15s'}}
        onMouseEnter={e=>e.currentTarget.style.opacity=1}
        onMouseLeave={e=>e.currentTarget.style.opacity=0.5}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      {/* Delete — bottom right corner */}
      <button onClick={()=>{if(confirm(`Eliminare ${vehicle.name}?`)) onDelete(vehicle.id)}} title="Elimina" style={{
        position:'absolute',bottom:8,right:8,background:'none',border:'none',cursor:'pointer',
        color:'var(--red)',padding:3,borderRadius:4,lineHeight:1,opacity:0.35,transition:'opacity .15s'}}
        onMouseEnter={e=>e.currentTarget.style.opacity=1}
        onMouseLeave={e=>e.currentTarget.style.opacity=0.35}>
        <Trash2 size={11}/>
      </button>

      <span style={{flexShrink:0,display:'flex',alignItems:'center'}}>{renderIcon(vehicle.icon, 36)}</span>
      <div style={{flex:1,minWidth:0,paddingRight:20}}>
        <div style={{fontWeight:700,fontSize:15}}>{vehicle.name}</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:2}}>
          {[vehicle.targa, [vehicle.marca, vehicle.modello].filter(Boolean).join(' '), vehicle.anno, vehicle.carburante].filter(Boolean).join(' · ')}
        </div>
        {vehicle.valoreMercato > 0 && (
          <div style={{fontSize:12,color:'var(--text2)',fontWeight:600,marginBottom:6}}>
            💰 {fmtIT(vehicle.valoreMercato,0)} €
          </div>
        )}
        {scadenze.length > 0 && (
          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6}}>
            {scadenze.map(s=>(
              <span key={s.key} style={{fontSize:10,padding:'2px 7px',borderRadius:5,background:s.bg,color:s.color,fontWeight:700}}>
                {s.icon} {s.key.slice(0,4)}: {fmtDate(s.date)} {s.label}
              </span>
            ))}
          </div>
        )}
        {/* Uscite counter + Chilometraggio — stesso stile */}
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          <button onClick={e=>{e.stopPropagation();setShowTrips(true)}}
            style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',
              border:'1px solid var(--border)',borderRadius:6,background:'var(--surface2)',
              cursor:'pointer',fontSize:11,color:'var(--text2)',fontFamily:'var(--font-sans)',
              transition:'background .12s'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--surface3,var(--border))'}
            onMouseLeave={e=>e.currentTarget.style.background='var(--surface2)'}>
            🗓 <strong style={{color:'var(--accent)',fontFamily:'var(--font-mono)'}}>{tripsThisYear}</strong> uscite {thisYear}
          </button>
          <button onClick={e=>{e.stopPropagation();setShowKm(true)}}
            style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',
              border:'1px solid var(--border)',borderRadius:6,background:'var(--surface2)',
              cursor:'pointer',fontSize:11,color:'var(--text2)',fontFamily:'var(--font-sans)',
              transition:'background .12s'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--surface3,var(--border))'}
            onMouseLeave={e=>e.currentTarget.style.background='var(--surface2)'}>
            🛣 {lastKmReading
              ? <><strong style={{color:'var(--accent)',fontFamily:'var(--font-mono)'}}>{fmtIT(lastKmReading.km,0)} km</strong> · {fmtDate(lastKmReading.date)}</>
              : <span style={{color:'var(--text3)'}}>+ km</span>
            }
          </button>
        </div>
      </div>
    </div>
    {showTrips && <TripsModal vehicle={vehicle} onClose={()=>setShowTrips(false)}/>}
    {showKm && <KmModal vehicle={vehicle} onClose={()=>setShowKm(false)}/>}
    </>
  )
}

// ── Per-vehicle spending strip ─────────────────────────────
function VehSpendingStrip({ vehicles, spending12m }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(vehicles.length,4)},1fr)`,gap:12,marginBottom:20}}>
      {vehicles.map(v => (
        <div key={v.id} className="card" style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <span style={{flexShrink:0,fontSize:24,lineHeight:1}}>{renderIcon(v.icon, 24)}</span>
          <div style={{minWidth:0}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.name}</div>
            <div style={{fontSize:16,fontWeight:800,color:'var(--accent)',fontFamily:'var(--font-mono)'}}>
              {spending12m[v.id] ? `€ ${fmtIT(Math.round(spending12m[v.id]),0)}` : '—'}
            </div>
            <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>ultimi 12 mesi</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Charts Section ────────────────────────────────────────
const CHART_TOOLTIP = { fontSize:11, border:'1px solid var(--border)', borderRadius:7, background:'var(--surface)' }

// allRows = merged manual + auto rows from the table (same data)
function VehicleCharts({ vehicles, allRows = [] }) {
  const last6 = getLast6Months()
  const noData = allRows.length === 0
  const empty = <div style={{color:'var(--text3)',fontSize:12,padding:'20px 0',textAlign:'center'}}>Nessuna spesa registrata.</div>

  // ── Chart 1: Andamento Carburante (bar, 6 mesi) ──────────
  const fuelData = last6.map(ym => ({
    label: MONTHS_IT[parseInt(ym.slice(5))-1],
    Carburante: allRows.filter(r => r.cat === 'Carburante' && (r.date||'').startsWith(ym)).reduce((s,r)=>s+r.amount,0)
  }))
  const fuelAvg = fuelData.reduce((s,d)=>s+(d.Carburante||0),0) / (fuelData.filter(d=>d.Carburante>0).length||1)

  // ── Chart 2: Distribuzione categorie (escluso carburante) ──
  const nonFuelRows = allRows.filter(r => r.cat !== 'Carburante')
  const catTotals = VEH_CATS.filter(c=>c!=='Carburante').map(c=>({
    name: c,
    value: Math.round(nonFuelRows.filter(r=>r.cat===c).reduce((s,r)=>s+r.amount,0))
  })).filter(x=>x.value>0)

  // ── Chart 3: Costo per veicolo donut (MEDIA ANNUA, solo costi allocabili) ──
  // Richiesta utente 2026-07-13: mostrare la media annua (non il totale storico) —
  // divide per il numero di anni distinti presenti nei dati. Escluse anche
  // Autostrada e Parcheggio oltre al Carburante: sono costi tipicamente NON
  // allocabili a un singolo veicolo (spesso senza vehicleId assegnato, o comuni
  // a più veicoli), quindi falserebbero il confronto per-veicolo; restano invece
  // visibili nel grafico "Costi per Categoria" qui sotto, che non è per-veicolo.
  const vehAllocRows = allRows.filter(r => !['Carburante','Autostrada','Parcheggio'].includes(r.cat))
  const vehAllocYears = new Set(vehAllocRows.map(r=>(r.date||'').slice(0,4)).filter(Boolean))
  const numYearsVehAlloc = vehAllocYears.size || 1
  const vehTotals = vehicles.map((v,i)=>({
    name: v.name,
    value: Math.round(vehAllocRows.filter(r=>r.vehicleId===v.id).reduce((s,r)=>s+r.amount,0) / numYearsVehAlloc),
    color: VEH_COLORS[i%VEH_COLORS.length]
  })).filter(x=>x.value>0)

  // ── Chart 4: Totale costi veicoli per anno — istogramma, tutti gli anni presenti ──
  // Richiesta utente 2026-07-13: sostituito il trend a 6 mesi con un istogramma
  // annuale che copre TUTTI gli anni trovati nei dati (non solo gli ultimi).
  const yearsAll = [...new Set(allRows.map(r=>(r.date||'').slice(0,4)).filter(Boolean))].sort()
  const trendData = yearsAll.map(y => ({
    year: y,
    Totale: Math.round(allRows.filter(r=>(r.date||'').startsWith(y)).reduce((s,r)=>s+r.amount,0))
  }))

  const DONUT_COLORS = ['#c8622a','#2a5c8a','#2a7a4a','#b8942a','#9b59b6','#2a9aa0','#e74c3c','#1abc9c']

  const RADIAN = Math.PI / 180
  const renderPieLabel = ({ cx, cy, midAngle, outerRadius, value, name }) => {
    const radius = outerRadius + 22
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="var(--text2)" textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central" fontSize={9} fontFamily="var(--font-mono)">
        €{fmtIT(Math.round(value),0)}
      </text>
    )
  }

  const ChartCard = ({title, children}) => (
    <div className="card" style={{padding:'16px 18px'}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:'var(--text)'}}>{title}</div>
      {noData ? empty : children}
    </div>
  )

  const renderLegend = (items, colors) => (
    <div style={{display:'flex',flexWrap:'wrap',gap:'4px 12px',marginTop:8,justifyContent:'center'}}>
      {items.map((item,i)=>(
        <span key={item.name||item} style={{fontSize:10,display:'flex',alignItems:'center',gap:4}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:colors[i%colors.length],display:'inline-block',flexShrink:0}}/>
          {item.name||item}
        </span>
      ))}
    </div>
  )

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>

      {/* 1 — Andamento Carburante */}
      <ChartCard title="⛽ Andamento Spesa Carburante">
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={fuelData} margin={{top:20,right:4,bottom:0,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={44} tickFormatter={v=>`€${v}`}/>
            <Tooltip formatter={v=>[`€ ${fmtIT(Math.round(v),0)}`,'Carburante']} contentStyle={CHART_TOOLTIP}/>
            {/* media dashed line via reference line approximated with a custom shape */}
            <Bar dataKey="Carburante" radius={[4,4,0,0]}>
              {fuelData.map((d,i)=>(
                <Cell key={i} fill={d.Carburante > fuelAvg ? '#c8622a' : '#e8a888'}/>
              ))}
              <LabelList dataKey="Carburante" position="top"
                formatter={v=>v>0?`€${fmtIT(Math.round(v),0)}`:''}
                style={{fontSize:9,fill:'var(--text2)',fontFamily:'var(--font-mono)'}}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{fontSize:10,color:'var(--text3)',textAlign:'right',marginTop:4}}>
          Media: € {fmtIT(Math.round(fuelAvg),0)}/mese
        </div>
      </ChartCard>

      {/* 2 — Totale costi veicoli per anno (istogramma, tutti gli anni presenti) */}
      <ChartCard title="📈 Trend Costi Totali">
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={trendData} margin={{top:20,right:4,bottom:0,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="year" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={48} tickFormatter={v=>`€${v}`}/>
            <Tooltip formatter={v=>[`€ ${fmtIT(Math.round(v),0)}`,'Totale']} contentStyle={CHART_TOOLTIP}/>
            <Bar dataKey="Totale" fill="#c8622a" radius={[4,4,0,0]}>
              <LabelList dataKey="Totale" position="top"
                formatter={v=>v>0?`€${fmtIT(Math.round(v),0)}`:''}
                style={{fontSize:9,fill:'var(--text2)',fontFamily:'var(--font-mono)'}}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 3 — Costo per Veicolo donut (media annua, solo costi allocabili) */}
      <ChartCard title="🚗 Costo per Veicolo (media annua, escluso carburante/autostrada/parcheggio)">
        {vehTotals.length === 0
          ? empty
          : <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={vehTotals} cx="50%" cy="50%" innerRadius={45} outerRadius={72}
                  dataKey="value" paddingAngle={2}
                  label={renderPieLabel} labelLine={false}>
                  {vehTotals.map((v,i)=><Cell key={i} fill={v.color}/>)}
                </Pie>
                <Tooltip formatter={v=>[`€ ${fmtIT(v,0)}`]} contentStyle={CHART_TOOLTIP}/>
              </PieChart>
            </ResponsiveContainer>
            {renderLegend(vehTotals, vehTotals.map(v=>v.color))}
          </>
        }
      </ChartCard>

      {/* 4 — Distribuzione categorie (escluso carburante) */}
      <ChartCard title="📊 Costi per Categoria (escluso carburante)">
        {catTotals.length === 0
          ? empty
          : (
            /* Legenda a destra del pie (richiesta utente 2026-07-13), non più sotto */
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{flex:'1 1 60%',minWidth:0}}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={catTotals} cx="50%" cy="50%" innerRadius={45} outerRadius={72}
                      dataKey="value" paddingAngle={2}
                      label={renderPieLabel} labelLine={false}>
                      {catTotals.map((_,i)=><Cell key={i} fill={DONUT_COLORS[i%DONUT_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={v=>[`€ ${fmtIT(v,0)}`]} contentStyle={CHART_TOOLTIP}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6,flex:'1 1 40%',minWidth:0}}>
                {catTotals.map((item,i)=>(
                  <span key={item.name} style={{fontSize:10,display:'flex',alignItems:'center',gap:6}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:DONUT_COLORS[i%DONUT_COLORS.length],display:'inline-block',flexShrink:0}}/>
                    <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )
        }
      </ChartCard>

    </div>
  )
}

// ── All Expenses Table ────────────────────────────────────
function AllExpensesTable({ vehicles, allExpenses, transactions, cashEntries, onAddExpense }) {
  const { deleteVehExpense, updateVehExpense, appPrefs, setAppPref } = useStore()
  const customCats = useStore(s => s.customCats)
  const satiMatches = useMemo(() => appPrefs?.satiMatches || {}, [appPrefs?.satiMatches])

  // ── Cat filters config (stored in appPrefs) ──────────────
  const vehCatFilters = useMemo(() => {
    const saved = appPrefs?.vehCatFilters
    if (saved) return saved
    // Default: all Veicoli sub-categories
    const sub = CATS['Veicoli']?.sub || []
    return sub.map(s => ({ cat1: 'Veicoli', cat2: s }))
  }, [appPrefs?.vehCatFilters])

  const vehTxVehicles = useMemo(() => appPrefs?.vehTxVehicles || {}, [appPrefs?.vehTxVehicles])

  function saveCatFilters(f) { setAppPref('vehCatFilters', f) }
  function removeCatFilter(cat1, cat2) {
    saveCatFilters(vehCatFilters.filter(f => !(f.cat1 === cat1 && f.cat2 === cat2)))
  }
  function addCatFilter(cat1, cat2) {
    if (!cat1 || !cat2) return
    if (vehCatFilters.some(f => f.cat1 === cat1 && f.cat2 === cat2)) return
    saveCatFilters([...vehCatFilters, { cat1, cat2 }])
  }
  function setTxVehicle(txId, vehicleId) {
    setAppPref('vehTxVehicles', { ...vehTxVehicles, [txId]: vehicleId })
  }

  // ── Settings panel state ──────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [draftL1, setDraftL1] = useState('Veicoli')
  const [draftL2, setDraftL2] = useState('')
  const _mergedCats = getMergedCats(customCats)
  const cat1List = Object.keys(_mergedCats)
  const cat2List = draftL1 && _mergedCats[draftL1]?.sub ? _mergedCats[draftL1].sub : []

  // ── Table state ───────────────────────────────────────────
  const [sortKey, setSortKey]   = useState('date')
  const [sortDir, setSortDir]   = useState('desc')
  const [filterVeh, setFilterVeh] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [reconExp,  setReconExp]  = useState(null)
  const [attExp,    setAttExp]    = useState(null)
  const [editExp,   setEditExp]   = useState(null)
  const [detailTx,  setDetailTx]  = useState(null)

  const vehMap = Object.fromEntries(vehicles.map(v => [v.id, v]))

  // ── Merge manual + auto rows ──────────────────────────────
  const rows = useMemo(() => {
    // 1) Manual expenses
    const manualRows = allExpenses.map(e => ({
      _type: 'manual', _key: `m-${e.id}`,
      date: e.date || '',
      desc: e.desc || '—',
      cat: e.cat || '—',
      vehicleId: e.vehicleId || '',
      amount: e.amount || 0,
      id: e.id, payMethod: e.payMethod,
      reconRef: e.reconRef, reconType: e.reconType,
      reconPartial: e.reconPartial, reconUsedAmount: e.reconUsedAmount,
      attachments: e.attachments,
    }))

    // 2) Auto-detected transactions matching configured L1/L2 filters
    const autoRows = vehCatFilters.length > 0
      ? transactions
          .filter(t => {
            if (t.excluded || t.amount >= 0) return false
            return vehCatFilters.some(f => t.cat1 === f.cat1 && t.cat2 === f.cat2)
          })
          .map(t => ({
            _type: 'auto', _key: `a-${t.txId}`,
            date: t._effDate || t.date || '',
            desc: t.descAI || (t.description || '').slice(0, 60) || '—',
            cat: t.cat2 || t.cat1 || '—',
            vehicleId: vehTxVehicles[t.txId] || '',
            amount: Math.abs(t.amount),
            txId: t.txId,
            cat1: t.cat1, cat2: t.cat2,
          }))
      : []

    // 3) Merge + filter + sort
    return [...manualRows, ...autoRows]
      .filter(r => !filterVeh || r.vehicleId === filterVeh)
      .filter(r => !filterCat || r.cat === filterCat)
      .sort((a, b) => {
        if (sortKey === 'amount') return sortDir === 'asc' ? a.amount - b.amount : b.amount - a.amount
        const va = a[sortKey] || '', vb = b[sortKey] || ''
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
  }, [allExpenses, transactions, vehCatFilters, vehTxVehicles, filterVeh, filterCat, sortKey, sortDir])

  const total = rows.reduce((s, r) => s + r.amount, 0)

  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  const sortIcon = k => sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : ''

  const TH = ({ k, label, right = false }) => (
    <th onClick={() => toggleSort(k)} style={{
      padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
      textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)',
      textAlign: right ? 'right' : 'left', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none'
    }}>
      {label} <span style={{ fontSize: 9 }}>{sortIcon(k)}</span>
    </th>
  )

  // ── All cats for filter dropdown ──────────────────────────
  const allCats = useMemo(() => {
    const s = new Set(rows.map(r => r.cat).filter(Boolean))
    return [...s].sort()
  }, [rows])

  return (
    <div style={{ marginTop: 8 }}>

      {/* Settings panel */}
      {showSettings && (
        <div style={{ marginBottom: 12, padding: '16px 20px', background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            ⚙️ Categorie rilevate automaticamente
          </div>

          {/* Current filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {vehCatFilters.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>Nessuna categoria configurata</span>
            )}
            {vehCatFilters.map(f => (
              <span key={`${f.cat1}-${f.cat2}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: 'var(--accent-l,rgba(200,98,42,.1))', color: 'var(--accent)',
                  border: '1px solid var(--accent)44' }}>
                {f.cat1} › {f.cat2}
                <button onClick={() => removeCatFilter(f.cat1, f.cat2)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer',
                    color: 'var(--accent)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>

          {/* Add new filter */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={draftL1} onChange={e => { setDraftL1(e.target.value); setDraftL2('') }}
              style={{ padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 6,
                fontSize: 12, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
              <option value="">— L1 —</option>
              {cat1List.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={draftL2} onChange={e => setDraftL2(e.target.value)}
              disabled={!cat2List.length}
              style={{ padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 6,
                fontSize: 12, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
              <option value="">— L2 —</option>
              {cat2List.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => { addCatFilter(draftL1, draftL2); setDraftL2('') }}
              disabled={!draftL1 || !draftL2}
              className="btn btn-primary" style={{ fontSize: 11, padding: '5px 14px' }}>
              + Aggiungi
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'var(--surface2)',
        borderRadius: 'var(--radius) var(--radius) 0 0', border: '1px solid var(--border)', borderBottom: 'none' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>📋 Tutte le spese veicoli</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {rows.length} spese · € {fmtIT(Math.round(total), 0)} totale
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Gear button */}
          <button onClick={() => setShowSettings(v => !v)}
            title="Configura categorie rilevate automaticamente"
            style={{ border: `1px solid ${showSettings ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 7, background: showSettings ? 'var(--accent-l,rgba(200,98,42,.1))' : 'transparent',
              color: showSettings ? 'var(--accent)' : 'var(--text3)',
              cursor: 'pointer', padding: '4px 8px', fontSize: 14, lineHeight: 1 }}>
            ⚙️
          </button>
          <select value={filterVeh} onChange={e => setFilterVeh(e.target.value)}
            style={{ padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11,
              background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)' }}>
            <option value="">Tutti i veicoli</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11,
              background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)' }}>
            <option value="">Tutte le categorie</option>
            {allCats.map(c => <option key={c}>{c}</option>)}
          </select>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={onAddExpense}>
            <Plus size={11} /> Aggiungi spesa
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13,
          border: '1px solid var(--border)', borderTop: 'none',
          borderRadius: '0 0 var(--radius) var(--radius)', background: 'var(--surface)' }}>
          Nessuna spesa. Usa "+ Aggiungi spesa" o configura le categorie automatiche con ⚙️.
        </div>
      ) : (
        <div style={{ overflow: 'hidden', border: '1px solid var(--border)', borderTop: 'none',
          borderRadius: '0 0 var(--radius) var(--radius)', background: 'var(--surface)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <TH k="date" label="Data" />
                  <TH k="desc" label="Descrizione" />
                  <TH k="cat" label="Categoria" />
                  <TH k="vehicleId" label="Veicolo" />
                  <TH k="amount" label="Importo" right />
                  <th style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                    textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)',
                    textAlign: 'center', whiteSpace: 'nowrap' }}>
                    Comp. Satisp
                  </th>
                  <th style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                    textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
                    Fonte
                  </th>
                  <th style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                    textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', minWidth: 110 }}>
                    Riconciliazione
                  </th>
                  <th style={{ borderBottom: '1px solid var(--border)', width: 36 }} />
                  <th style={{ borderBottom: '1px solid var(--border)', width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const veh = vehMap[r.vehicleId]
                  const catColor = CAT_COLORS[r.cat] || '#888'

                  // For auto rows, find the transaction to open detail modal
                  const handleRowClick = () => {
                    if (r._type === 'auto' && r.txId) {
                      const tx = transactions.find(t => t.txId === r.txId)
                      if (tx) setDetailTx(tx)
                    }
                  }

                  return (
                    <tr key={r._key} style={{ borderBottom: '1px solid var(--border)', cursor: r._type === 'auto' ? 'pointer' : 'default' }}
                      onClick={handleRowClick}
                      onMouseEnter={e => { if (r._type === 'auto') e.currentTarget.style.background = 'var(--surface2)' }}
                      onMouseLeave={e => { if (r._type === 'auto') e.currentTarget.style.background = 'transparent' }}>
                      {/* Data */}
                      <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text3)',
                        fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {fmtDate(r.date)}
                      </td>

                      {/* Descrizione (descAI) */}
                      <td style={{ padding: '7px 12px', fontSize: 13, fontWeight: 600,
                        maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.desc}>
                        {r.desc}
                      </td>

                      {/* Categoria (L2) */}
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                          background: catColor + '18', color: catColor, border: `1px solid ${catColor}44` }}>
                          {r.cat}
                        </span>
                      </td>

                      {/* Veicolo — select for both auto and manual */}
                      <td style={{ padding: '7px 12px', fontSize: 12 }}>
                        <select value={r.vehicleId || ''}
                          onChange={e => {
                            e.stopPropagation()
                            if (r._type === 'auto') setTxVehicle(r.txId, e.target.value)
                            else updateVehExpense(r.id, { vehicleId: e.target.value })
                          }}
                          onClick={e => e.stopPropagation()}
                          style={{ padding: '3px 7px', border: '1px solid var(--border)', borderRadius: 6,
                            fontSize: 11, background: 'var(--surface2)', color: r.vehicleId ? 'var(--text)' : 'var(--text3)',
                            fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                          <option value="">— Assegna —</option>
                          {vehicles.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
                        </select>
                      </td>

                      {/* Importo */}
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700,
                        fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                        € {fmtIT(r.amount, 2)}
                      </td>

                      {/* Comp. Satisp */}
                      {(() => {
                        const matchKey = r._type === 'manual' ? `veh-${r.id}` : r.txId
                        const match = matchKey ? satiMatches[matchKey] : null
                        const isMatched = match?.status === 'matched'
                        return (
                          <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                            {isMatched ? (
                              <span title={`Compensato €${fmtIT(match.compensatedAmt||0,2)} via Satispay`}
                                style={{ fontSize: 16, lineHeight: 1 }}>🟢</span>
                            ) : (
                              <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                            )}
                          </td>
                        )
                      })()}

                      {/* Fonte */}
                      <td style={{ padding: '7px 12px' }}>
                        {r._type === 'auto' ? (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700,
                            background: 'var(--blue-l)', color: 'var(--blue)' }}>
                            🏦 Auto
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700,
                            background: r.payMethod === 'cash' ? 'var(--gold-l)' : r.payMethod === 'carta' ? 'var(--blue-l)' : 'var(--surface2)',
                            color: r.payMethod === 'cash' ? 'var(--gold)' : r.payMethod === 'carta' ? 'var(--blue)' : 'var(--text3)' }}>
                            {r.payMethod === 'cash' ? '💵 Cash' : r.payMethod === 'carta' ? '💳 Carta' : r.payMethod === 'bonifico' ? '🏦 Bonifico' : '• Manuale'}
                          </span>
                        )}
                      </td>

                      {/* Riconciliazione (manual only) */}
                      <td style={{ padding: '7px 12px' }}>
                        {r._type === 'auto' ? (
                          <span style={{ fontSize: 10, color: 'var(--text3)' }}>—</span>
                        ) : r.reconRef ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                              background: r.reconType === 'cash' ? 'var(--gold-l)' : 'var(--blue-l)',
                              color: r.reconType === 'cash' ? 'var(--gold)' : 'var(--blue)' }}>
                              {r.reconType === 'cash' ? '💵' : '🏦'}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text3)', maxWidth: 80,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={r.reconRef}>{r.reconRef.slice(0, 28)}</span>
                            <button className="btn btn-ghost" style={{ padding: '1px 4px', fontSize: 10, color: 'var(--text3)' }}
                              onClick={() => updateVehExpense(r.id, { reconRef: null, reconType: null })}>×</button>
                          </div>
                        ) : (
                          <button className="btn btn-ghost"
                            style={{ fontSize: 10, padding: '2px 7px', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: 4 }}
                            onClick={() => setReconExp({ ...r, payMethod: r.payMethod })}>
                            <Link size={9} /> Collega
                          </button>
                        )}
                      </td>

                      {/* Edit (manual only) */}
                      <td style={{ padding: '5px 6px' }}>
                        {r._type === 'manual' && (
                          <button className="btn btn-ghost" style={{ color: 'var(--text3)', padding: '2px 5px' }}
                            title="Modifica" onClick={() => setEditExp(r)}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        )}
                      </td>

                      {/* Delete (manual only) */}
                      <td style={{ padding: '5px 6px' }}>
                        {r._type === 'manual' && (
                          <button className="btn btn-ghost" style={{ color: 'var(--red)', padding: '2px 5px' }}
                            onClick={() => { if (confirm('Eliminare spesa?')) deleteVehExpense(r.id) }}>
                            <Trash2 size={11} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                  <td colSpan={4} style={{ padding: '8px 12px', fontSize: 12 }}>
                    Totale ({rows.length})
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                    € {fmtIT(total, 2)}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reconExp && (
        <VehReconModal
          expense={reconExp}
          transactions={transactions}
          cashEntries={cashEntries}
          payMethod={reconExp.payMethod}
          allVehExpenses={allExpenses}
          onSave={ref => { updateVehExpense(reconExp.id, { reconRef: ref.label.slice(0, 80), reconType: ref.type, reconPartial: ref.partial || false, reconUsedAmount: ref.usedAmount || null }); setReconExp(null) }}
          onClose={() => setReconExp(null)}
        />
      )}

      {attExp && (
        <AttachmentsModal
          expense={attExp}
          onClose={() => setAttExp(null)}
          onDelete={async (att, i) => {
            if (!confirm(`Eliminare "${att.name}"?`)) return
            if (att.path) await deleteExpenseFile(att.path)
            const newAtts = (attExp.attachments || []).filter((_, j) => j !== i)
            updateVehExpense(attExp.id, { attachments: newAtts })
            setAttExp({ ...attExp, attachments: newAtts })
          }}
        />
      )}

      {editExp && (
        <AddExpenseModal
          vehicles={vehicles}
          expense={editExp}
          onClose={() => setEditExp(null)}
        />
      )}

      {detailTx && (
        <TxDetailModal tx={detailTx} onClose={() => setDetailTx(null)}/>
      )}
    </div>
  )
}

// ── Tx Detail Modal ───────────────────────────────────────
function TxDetailModal({ tx, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats = useStore(s => s.customCats)
  const [editCat1, setEditCat1] = useState(tx?.cat1 || '')
  const [editCat2, setEditCat2] = useState(tx?.cat2 || '')
  const [editDescAI, setEditDescAI] = useState(tx?.descAI || '')
  const [saved, setSaved] = useState(false)
  const [toReview, setToReview] = useState(tx?._flagged || false)
  const [nonRecurring, setNonRecurring] = useState(tx?._nonRecurring || false)

  if (!tx) return null

  const _allCats = getMergedCats(customCats)
  const effDate = tx._effDate || tx.date || ''
  const fmtDateTx = (d) => {
    if (!d) return '—'
    const parts = (d||'').slice(0,10).split('-')
    return parts.length===3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d
  }

  const cat1Subs = _allCats[editCat1]?.sub || []

  function toggleReview() {
    const n = !toReview
    setToReview(n)
    updateTransaction(tx.txId, { _flagged: n })
  }

  function toggleNonRecurring() {
    const n = !nonRecurring
    setNonRecurring(n)
    updateTransaction(tx.txId, { _nonRecurring: n })
  }

  const handleSave = () => {
    updateTransaction(tx.txId, { cat1: editCat1, cat2: editCat2, conf: 100 })
    setSaved(true)
    setTimeout(onClose, 1000)
  }

  return (
    <div style={{
      position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:9999,
      display:'flex',alignItems:'center',justifyContent:'center',padding:16,
    }} onClick={onClose}>
      <div style={{
        background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
        padding:24,maxWidth:520,width:'100%',maxHeight:'90vh',overflowY:'auto',
        boxShadow:'0 8px 40px rgba(0,0,0,.35)',position:'relative',
      }} onClick={e=>e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} style={{
          position:'absolute',top:12,right:14,background:'none',border:'none',
          fontSize:20,cursor:'pointer',color:'var(--text3)',lineHeight:1,
        }}>✕</button>

        {/* Header */}
        <div style={{marginBottom:16,paddingRight:28}}>
          <div style={{fontSize:15,fontWeight:700,color:'var(--text)',lineHeight:1.3,marginBottom:4}}>
            {tx.descAI || (tx.description||'').slice(0,60) || '—'}
          </div>
          <div style={{fontSize:22,fontWeight:800,color:'var(--red)',fontFamily:'var(--font-mono)'}}>
            {tx.amount < 0 ? '−' : '+'}€ {fmtIT(Math.abs(tx.amount),2)}
          </div>
        </div>

        {/* Info grid */}
        <div style={{
          display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px',
          marginBottom:20,padding:'14px 16px',
          background:'var(--surface2)',borderRadius:8,
          border:'1px solid var(--border)',
        }}>
          {[
            ['Data contabile', fmtDateTx(tx.date)],
            ['Data valuta', fmtDateTx(tx.effectiveDate || tx._effDate)],
            ['Merchant', tx.merchant || '—'],
            ['Controparte', tx.counterpart || tx.counterparty || '—'],
            ['Categoria', tx.cat1 ? (tx.cat1 + (tx.cat2 ? ' › ' + tx.cat2 : '')) : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:2}}>{label}</div>
              <div style={{fontSize:12,color:'var(--text)',fontWeight:500}}>{value}</div>
            </div>
          ))}
          <div style={{gridColumn:'1 / -1'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:2}}>Descrizione originale</div>
            <div style={{fontSize:12,color:'var(--text2)',wordBreak:'break-word'}}>{tx.description || '—'}</div>
          </div>
        </div>

        {/* To Review flag */}
        <div onClick={toggleReview}
          style={{marginBottom:10,display:'flex',alignItems:'center',justifyContent:'space-between',
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

        {/* Non ricorrente flag */}
        <div onClick={toggleNonRecurring}
          style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'10px 14px',borderRadius:8,cursor:'pointer',userSelect:'none',
            background:nonRecurring?'rgba(59,130,246,.08)':'var(--surface2)',
            border:`1px solid ${nonRecurring?'var(--blue)':'var(--border)'}`}}>
          <span style={{fontSize:13,fontWeight:600,color:nonRecurring?'var(--blue)':'var(--text2)'}}>
            🔁 Non ricorrente
          </span>
          <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,fontWeight:700,
            background:nonRecurring?'var(--blue)':'var(--border)',
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

        {/* Category editor */}
        <div style={{borderTop:'1px solid var(--border)',paddingTop:16}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',marginBottom:10}}>
            Modifica Categoria
          </div>
          <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:140}}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Categoria</div>
              <select value={editCat1} onChange={e=>{setEditCat1(e.target.value);setEditCat2('')}} style={{
                width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',
                background:'var(--surface)',color:'var(--text)',fontSize:13,cursor:'pointer',
              }}>
                <option value="">— Nessuna —</option>
                {Object.keys(_allCats).filter(n=>n!=='Non Categorizzato').map(n=>(
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            {cat1Subs.length > 0 && (
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Sottocategoria</div>
                <select value={editCat2} onChange={e=>setEditCat2(e.target.value)} style={{
                  width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',
                  background:'var(--surface)',color:'var(--text)',fontSize:13,cursor:'pointer',
                }}>
                  <option value="">— Nessuna —</option>
                  {cat1Subs.map(s=>(
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            <button onClick={handleSave} style={{
              padding:'7px 18px',borderRadius:8,border:'none',cursor:'pointer',
              background: saved ? 'var(--green)' : 'var(--accent)',
              color:'#fff',fontSize:13,fontWeight:700,fontFamily:'var(--font-sans)',
              transition:'background .2s',whiteSpace:'nowrap',
            }}>
              {saved ? '✓ Salvato' : 'Salva'}
            </button>
          </div>
          <VehicleQuickPicker txId={tx.txId} cat1={editCat1} />
        </div>
      </div>
    </div>
  )
}

// ── KPI strip ─────────────────────────────────────────────
function KPIStrip({ vehicles, allExpenses }) {
  const now = new Date()
  const totalYTD = allExpenses.filter(e=>(e.date||'').startsWith(now.getFullYear().toString())).reduce((s,e)=>s+(e.amount||0),0)
  const totalAll = allExpenses.reduce((s,e)=>s+(e.amount||0),0)
  const thisYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const totalThisM = allExpenses.filter(e=>(e.date||'').startsWith(thisYM)).reduce((s,e)=>s+(e.amount||0),0)
  const topCat = (() => {
    const byCat = {}
    allExpenses.filter(e=>(e.date||'').startsWith(now.getFullYear().toString())).forEach(e=>{ byCat[e.cat]=(byCat[e.cat]||0)+(e.amount||0) })
    const sorted = Object.entries(byCat).sort((a,b)=>b[1]-a[1])
    return sorted[0] ? `${sorted[0][0]} (€${fmtIT(Math.round(sorted[0][1]),0)})` : '—'
  })()

  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
      {[
        ['Spesa mese corrente', `€ ${fmtIT(Math.round(totalThisM),0)}`, 'var(--text)'],
        ['Spesa YTD', `€ ${fmtIT(Math.round(totalYTD),0)}`, 'var(--accent)'],
        ['Spesa totale storico', `€ ${fmtIT(Math.round(totalAll),0)}`, 'var(--text2)'],
        ['Top categoria YTD', topCat, 'var(--blue)'],
      ].map(([l,v,c])=>(
        <div key={String(l)} className="card" style={{padding:'12px 16px'}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',marginBottom:4}}>{l}</div>
          <div style={{fontSize:16,fontWeight:800,color:String(c),fontFamily:'var(--font-mono)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────
export default function VeicoliRegistroPage() {
  const { vehicles, vehExpenses, transactions, cashEntries, deleteVehicle, appPrefs } = useStore()
  const [showAddVeh,  setShowAddVeh]  = useState(false)
  const [editVeh,     setEditVeh]     = useState(null)
  const [showAddExp,  setShowAddExp]  = useState(false)
  const [preVehId,    setPreVehId]    = useState('')

  // ── Merged rows (same logic as AllExpensesTable, unfiltered) for charts ──
  const vehCatFiltersPage = useMemo(() => {
    const saved = appPrefs?.vehCatFilters
    if (saved) return saved
    return (CATS['Veicoli']?.sub || []).map(s => ({ cat1: 'Veicoli', cat2: s }))
  }, [appPrefs?.vehCatFilters])
  const vehTxVehiclesPage = useMemo(() => appPrefs?.vehTxVehicles || {}, [appPrefs?.vehTxVehicles])

  const mergedVehRows = useMemo(() => {
    const manualRows = vehExpenses.map(e => ({
      _type: 'manual', date: e.date || '',
      cat: e.cat || '—', vehicleId: e.vehicleId || '',
      amount: e.amount || 0, id: e.id,
    }))
    // Always include Carburante e Parcheggio bank txs (indipendentemente dai filtri
    // configurabili, come richiesto — "metti anche il parcheggio" nel grafico Costi
    // per Categoria) + qualunque altro match dei vehCatFilters personalizzati
    const autoRows = transactions
      .filter(t => !t.excluded && t.amount < 0 && (
        (t.cat1 === 'Veicoli' && (t.cat2 === 'Carburante' || t.cat2 === 'Parcheggio')) ||
        vehCatFiltersPage.some(f => t.cat1 === f.cat1 && t.cat2 === f.cat2)
      ))
      .map(t => ({
        _type: 'auto', date: t._effDate || t.date || '',
        cat: t.cat2 || t.cat1 || '—', vehicleId: vehTxVehiclesPage[t.txId] || '',
        amount: Math.abs(t.amount), txId: t.txId,
      }))
    return [...manualRows, ...autoRows]
  }, [vehExpenses, transactions, vehCatFiltersPage, vehTxVehiclesPage])

  // Per-vehicle spending last 12 months
  const vehSpending12m = useMemo(() => {
    const now = new Date()
    // Cutoff = 1st of same month last year (includes all 12 calendar months incl. current)
    const cutoff = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-01`
    const result = {}
    mergedVehRows.forEach(r => {
      if ((r.date || '') >= cutoffStr && r.vehicleId) {
        result[r.vehicleId] = (result[r.vehicleId] || 0) + r.amount
      }
    })
    return result
  }, [mergedVehRows])

  function openAddExpense(vehicleId = '') {
    setPreVehId(vehicleId)
    setShowAddExp(true)
  }

  if (vehicles.length === 0) return (
    <div style={{textAlign:'center',padding:'48px 32px'}}>
      <div style={{fontSize:48,marginBottom:16}}>🚗</div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Nessun veicolo</div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:20}}>Aggiungi i tuoi veicoli per tracciare spese e manutenzione.</div>
      <button className="btn btn-primary" onClick={()=>setShowAddVeh(true)}><Plus size={14}/> Aggiungi Veicolo</button>
      {showAddVeh && <VehicleModal onClose={()=>setShowAddVeh(false)}/>}
    </div>
  )

  return (
    <div style={{padding:'24px 20px'}}>
      {/* Page header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:24,fontWeight:600,margin:0}}>🚗 Registro Veicoli</h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>Gestisci spese, manutenzioni e scadenze</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary" style={{fontSize:12}} onClick={()=>openAddExpense()}>
            <Plus size={12}/> Spesa
          </button>
          <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>setShowAddVeh(true)}>
            <Plus size={12}/> Veicolo
          </button>
        </div>
      </div>

      {/* Vehicle chips — row 1 */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12,marginBottom:16}}>
        {vehicles.map(v=>(
          <VehicleChip key={v.id} vehicle={v}
            onEdit={()=>setEditVeh(v)}
            onDelete={deleteVehicle}
          />
        ))}
      </div>

      {/* Per-vehicle spending KPIs — row 2 */}
      {vehicles.length > 0 && <VehSpendingStrip vehicles={vehicles} spending12m={vehSpending12m}/>}

      {/* Charts — use mergedVehRows to match what's in the table below */}
      {mergedVehRows.length > 0 && <VehicleCharts vehicles={vehicles} allRows={mergedVehRows}/>}

      {/* All expenses table */}
      <AllExpensesTable
        vehicles={vehicles}
        allExpenses={vehExpenses}
        transactions={transactions}
        cashEntries={cashEntries}
        onAddExpense={()=>openAddExpense()}
      />

      {showAddVeh && <VehicleModal onClose={()=>setShowAddVeh(false)}/>}
      {editVeh && <VehicleModal vehicle={editVeh} onClose={()=>setEditVeh(null)}/>}
      {showAddExp && <AddExpenseModal vehicles={vehicles} preVehicleId={preVehId} onClose={()=>setShowAddExp(false)}/>}
    </div>
  )
}
