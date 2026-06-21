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

// ── Utility merchants (Firestore via appPrefs) ─────────────
function getUtilMerch() { return useStore.getState()?.appPrefs?.utilMerchants || {} }
function saveUtilMerch(d) { useStore.getState()?.setAppPref?.('utilMerchants', d) }

// Detect utility type from a transaction via configured merchants
function detectUtilType(tx, merchants) {
  const hay = `${tx.merchant||''} ${tx.description||''} ${tx.descAI||''} ${tx.counterpart||''}`.toLowerCase()
  for (const type of UTILITY_TYPES) {
    const list = merchants[type.id] || []
    if (list.some(m => m.trim() && hay.includes(m.trim().toLowerCase()))) return type
  }
  return null
}

// ── Merchant panel ─────────────────────────────────────────
function UtilityMerchantsPanel({ onChange }) {
  const [merchants, setMerchants] = useState(getUtilMerch)
  const [newVal, setNewVal] = useState({})

  function getMList(id) { return merchants[id] || [] }

  function addMerchant(typeId) {
    const val = (newVal[typeId]||'').trim()
    if (!val) return
    const updated = { ...merchants, [typeId]: [...getMList(typeId), val] }
    saveUtilMerch(updated)
    setMerchants(updated)
    setNewVal(v=>({...v,[typeId]:''}))
    onChange && onChange(updated)
  }

  function removeMerchant(typeId, idx) {
    const list = getMList(typeId).filter((_,i)=>i!==idx)
    const updated = { ...merchants, [typeId]: list }
    saveUtilMerch(updated)
    setMerchants(updated)
    onChange && onChange(updated)
  }

  return (
    <div className="card" style={{padding:'16px 18px',height:'fit-content'}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>🏷️ Fornitori per Tipo</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:16,lineHeight:1.5}}>
        Aggiungi i merchant per ogni utenza. Le transazioni con questi merchant vengono riconosciute automaticamente.
      </div>
      {UTILITY_TYPES.map(type => (
        <div key={type.id} style={{marginBottom:18}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
            <span style={{fontSize:15}}>{type.icon}</span>
            <span style={{fontSize:12,fontWeight:700,color:type.color,letterSpacing:'.03em'}}>{type.label}</span>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6,minHeight:24}}>
            {getMList(type.id).map((m,i)=>(
              <span key={i} style={{display:'inline-flex',alignItems:'center',gap:3,
                fontSize:11,padding:'2px 8px',borderRadius:20,fontWeight:600,
                background:`${type.color}18`,border:`1px solid ${type.color}44`,color:type.color}}>
                {m}
                <button onClick={()=>removeMerchant(type.id,i)}
                  style={{background:'none',border:'none',cursor:'pointer',color:type.color,fontSize:12,lineHeight:1,padding:0,marginLeft:1}}>×</button>
              </span>
            ))}
            {getMList(type.id).length === 0 && <span style={{fontSize:11,color:'var(--text3)',fontStyle:'italic'}}>—</span>}
          </div>
          <div style={{display:'flex',gap:5}}>
            <input value={newVal[type.id]||''}
              onChange={e=>setNewVal(v=>({...v,[type.id]:e.target.value}))}
              onKeyDown={e=>e.key==='Enter'&&addMerchant(type.id)}
              placeholder={
                type.id==='luce'?'es. Enel, A2A…':
                type.id==='gas'?'es. Illumia, ENI Gas…':
                type.id==='acqua'?'es. CAP Holding…':
                type.id==='internet'?'es. Fastweb, TIM…':'es. Fornitore…'}
              style={{flex:1,padding:'5px 9px',border:'1px solid var(--border)',borderRadius:6,
                fontSize:11,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}/>
            <button className="btn btn-secondary" style={{fontSize:11,padding:'4px 10px',whiteSpace:'nowrap'}}
              onClick={()=>addMerchant(type.id)}>+ Add</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Utility Transactions Table ─────────────────────────────
function UtilityTxSection() {
  const transactions = useStore(s => s.transactions)
  const [merchants, setMerchants] = useState(getUtilMerch)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const MONTHS_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const fmtDate = d => {
    const m = (d||'').match(/\d{4}-(\d{2})-(\d{2})/)
    return m ? `${parseInt(m[2])} ${MONTHS_IT[parseInt(m[1])-1]}` : d||'—'
  }

  function toggleSort(k) {
    if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  const sortIcon = k => sortKey===k ? (sortDir==='asc'?'▲':'▼') : null

  const utilTxs = useMemo(() => {
    return [...transactions]
      .filter(t => {
        if (t.excluded) return false
        // categorized as Utenze
        if (t.cat1 === 'Casa' && t.cat2 === 'Utenze') return true
        // or matches a configured merchant
        if (detectUtilType(t, merchants)) return true
        return false
      })
      .sort((a,b) => {
        if (sortKey==='amount') return sortDir==='asc' ? a.amount-b.amount : b.amount-a.amount
        return sortDir==='asc'
          ? (a[sortKey]||'').localeCompare(b[sortKey]||'')
          : (b[sortKey]||'').localeCompare(a[sortKey]||'')
      })
  }, [transactions, merchants, sortKey, sortDir])

  const total = utilTxs.reduce((s,t)=>s+Math.abs(t.amount),0)

  return (
    <div style={{marginTop:28}}>
      {/* Header */}
      <div style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'12px 16px',background:'var(--surface2)',
        borderRadius:'var(--radius) var(--radius) 0 0',border:'1px solid var(--border)',borderBottom:'none'
      }}>
        <div>
          <div style={{fontSize:15,fontWeight:700}}>⚡ Transazioni Utenze</div>
          <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
            Categorizzate come Utenze + merchant configurati · {utilTxs.length} trovate
          </div>
        </div>
        {total > 0 && (
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:11,color:'var(--text3)'}}>Totale spese</div>
            <div style={{fontSize:18,fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--accent)'}}>
              € {total.toLocaleString('it-IT',{minimumFractionDigits:2})}
            </div>
          </div>
        )}
      </div>

      {utilTxs.length === 0 ? (
        <div style={{padding:'24px',textAlign:'center',color:'var(--text3)',fontSize:13,
          border:'1px solid var(--border)',borderTop:'none',borderRadius:'0 0 var(--radius) var(--radius)',
          background:'var(--surface)'}}>
          Nessuna transazione utenza trovata.<br/>
          <span style={{fontSize:11,opacity:.7}}>Aggiungi fornitori sopra o categorizza transazioni come Casa › Utenze.</span>
        </div>
      ) : (
        <div style={{overflow:'hidden',border:'1px solid var(--border)',borderTop:'none',
          borderRadius:'0 0 var(--radius) var(--radius)',background:'var(--surface)'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--surface2)'}}>
                  {[['date','Data'],['descAI','Descrizione'],['merchant','Fornitore/Merchant'],['utilType','Tipo'],['amount','Importo (€)']].map(([k,l])=>(
                    <th key={k} onClick={()=>k!=='utilType'&&toggleSort(k)} style={{
                      padding:'8px 12px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                      textTransform:'uppercase',color:'var(--text3)',borderBottom:'1px solid var(--border)',
                      textAlign:k==='amount'?'right':'left',cursor:k!=='utilType'?'pointer':'default',
                      whiteSpace:'nowrap',userSelect:'none'}}>
                      {l} <span style={{fontSize:9}}>{k!=='utilType'?sortIcon(k):null}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {utilTxs.map(t => {
                  const detectedType = detectUtilType(t, merchants)
                  const isCatUtenza  = t.cat1==='Casa' && t.cat2==='Utenze'
                  const displayType  = detectedType || (isCatUtenza ? { label:'Utenze', color:'#888', icon:'🏠' } : null)
                  return (
                    <tr key={t.txId} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'7px 12px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
                      <td style={{padding:'7px 12px',fontSize:13,fontWeight:600,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {t.descAI || (t.description||'').slice(0,40) || '—'}
                      </td>
                      <td style={{padding:'7px 12px',fontSize:12,color:'var(--text2)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {t.merchant || t.counterpart || '—'}
                      </td>
                      <td style={{padding:'7px 12px'}}>
                        {displayType ? (
                          <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,fontWeight:700,
                            background:`${displayType.color}18`,color:displayType.color,
                            border:`1px solid ${displayType.color}44`,whiteSpace:'nowrap'}}>
                            {displayType.icon} {displayType.label}
                          </span>
                        ) : <span style={{fontSize:11,color:'var(--text3)'}}>—</span>}
                      </td>
                      <td style={{padding:'7px 12px',textAlign:'right',fontWeight:700,fontFamily:'var(--font-mono)',
                        color:t.amount>0?'var(--green)':'var(--red)'}}>
                        {t.amount>0?'+':''}€ {Math.abs(t.amount).toLocaleString('it-IT',{minimumFractionDigits:2})}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{background:'var(--surface2)',fontWeight:700}}>
                  <td colSpan={4} style={{padding:'8px 12px',fontSize:12}}>Totale ({utilTxs.length} transazioni)</td>
                  <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--accent)'}}>
                    € {total.toLocaleString('it-IT',{minimumFractionDigits:2})}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const UTILITY_TYPES = [
  { id:'luce',  label:'Luce',    icon:'\u26a1', color:'#b8942a', unit:'kWh' },
  { id:'gas',   label:'Gas',     icon:'\ud83d\udd25', color:'#c8622a', unit:'m\u00b3'  },
  { id:'acqua', label:'Acqua',   icon:'\ud83d\udca7', color:'#2a9aa0', unit:'m\u00b3'  },
  { id:'internet',label:'Internet/Tel',icon:'\ud83d\udce1',color:'#2a5c8a',unit:'' },
  { id:'altro', label:'Altro',   icon:'\ud83c\udfe0', color:'#888888', unit:''    },
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
          tickFormatter={v=>`\u20ac${v>=1000?(v/1000).toFixed(0)+'K':v}`}/>
        <Tooltip formatter={v=>[`\u20ac ${Math.round(v).toLocaleString('it-IT')}`,'Importo']}
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
            {lastMonth && <div style={{fontSize:11,color:'var(--text3)'}}>{lastMonth.fornitore||'\u2014'}</div>}
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11,color:'var(--text3)',marginBottom:2}}>Ultima bolletta</div>
          <div style={{fontSize:18,fontWeight:700,fontFamily:'var(--font-mono)',color:type.color}}>
            {lastMonth ? `\u20ac ${lastMonth.importo.toLocaleString('it-IT',{minimumFractionDigits:2})}` : '\u2014'}
          </div>
          {avgImporto > 0 && <div style={{fontSize:10,color:'var(--text3)'}}>media \u20ac {Math.round(avgImporto).toLocaleString('it-IT')}</div>}
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
              <span style={{fontSize:13,fontWeight:700,fontFamily:'var(--font-mono)'}}>\u20ac {b.importo.toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
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
            <FormRow label="Mese"><Input type="month" value={form.date} onChange={e=>set('date',e.target.value+'-01')}/></FormRow>
            <FormRow label="Importo (\u20ac)"><Input type="number" value={form.importo} onChange={e=>set('importo',e.target.value)} placeholder="0"/></FormRow>
          </div>
          {type.unit && (
            <FormRow label={`Consumo (${type.unit})`}>
              <Input type="number" value={form.consumo} onChange={e=>set('consumo',e.target.value)} placeholder="0"/>
            </FormRow>
          )}
          <FormRow label="Fornitore"><Input value={form.fornitore} onChange={e=>set('fornitore',e.target.value)} placeholder={type.id==='luce'?'Enel, A2A\u2026':type.id==='gas'?'ENI Gas\u2026':''}/></FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={save}>Salva</button>
            <button className="btn btn-secondary" onClick={()=>setShowAdd(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}


// ── Sezione Transazioni Casa con header visibile ──────────
function CasaTxSection() {
  const transactions = useStore(s => s.transactions)
  const casaCount = transactions.filter(t => !t.excluded && t.cat1 === 'Casa').length
  const casaTotal = transactions.filter(t => !t.excluded && t.cat1 === 'Casa').reduce((s,t)=>s+Math.abs(t.amount),0)

  return (
    <div style={{marginTop:32}}>
      <div style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'12px 16px',background:'var(--surface2)',borderRadius:'var(--radius) var(--radius) 0 0',
        border:'1px solid var(--border)',borderBottom:'none'
      }}>
        <div>
          <div style={{fontSize:16,fontWeight:700,display:'flex',alignItems:'center',gap:8}}>
            🏦 Transazioni Casa
          </div>
          <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
            Auto-filtrate da categoria Casa · {casaCount} transazioni trovate
          </div>
        </div>
        {casaCount > 0 && (
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:11,color:'var(--text3)'}}>Totale spese</div>
            <div style={{fontSize:18,fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--accent)'}}>
              € {casaTotal.toLocaleString('it-IT',{minimumFractionDigits:2})}
            </div>
          </div>
        )}
      </div>
      <CasaTxTable/>
    </div>
  )
}

// ── Transazioni Casa ─────────────────────────────────────
function CasaTxTable() {
  const transactions = useStore(s => s.transactions)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [attachments, setAttachments] = useState(() => appPrefs.attachments || {})

  const MONTHS_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const fmtDate = d => {
    const m = (d||'').match(/\d{4}-(\d{2})-(\d{2})/)
    return m ? `${parseInt(m[2])} ${MONTHS_IT[parseInt(m[1])-1]}` : d||'—'
  }

  function toggleSort(k) {
    if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  const sortIcon = k => sortKey===k ? (sortDir==='asc'?'▲':'▼') : null

  const casaTxs = useMemo(() => {
    return [...transactions]
      .filter(t => !t.excluded && t.cat1 === 'Casa')
      .sort((a,b) => {
        if (sortKey==='amount') return sortDir==='asc' ? a.amount-b.amount : b.amount-a.amount
        return sortDir==='asc'
          ? (a[sortKey]||'').localeCompare(b[sortKey]||'')
          : (b[sortKey]||'').localeCompare(a[sortKey]||'')
      })
  }, [transactions, sortKey, sortDir])

  function handleFile(txId, e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const all = { ...attachments, [txId]: { name: file.name, dataUrl: ev.target.result } }
      setAppPref('attachments', all)
      setAttachments(all)
    }
    reader.readAsDataURL(file)
  }

  function removeAtt(txId) {
    const all = { ...attachments }; delete all[txId]
    setAppPref('attachments', all)
    setAttachments(all)
  }

  if (casaTxs.length === 0) return (
    <div style={{padding:'24px',textAlign:'center',color:'var(--text3)',fontSize:13,
      border:'1px solid var(--border)',borderTop:'none',borderRadius:'0 0 var(--radius) var(--radius)',
      background:'var(--surface)'}}>
      Nessuna transazione con categoria "Casa".<br/>
      <span style={{fontSize:11,opacity:.7}}>Vai su Transazioni, seleziona una riga e assegna categoria Casa.</span>
    </div>
  )

  return (
    <div style={{padding:0,overflow:'hidden',border:'1px solid var(--border)',borderTop:'none',
      borderRadius:'0 0 var(--radius) var(--radius)',background:'var(--surface)'}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'var(--surface2)'}}>
              {[['date','Data'],['descAI','Descrizione'],['cat2','Sottocategoria'],['counterpart','Controparte'],['amount','Importo (€)']].map(([k,l]) => (
                <th key={k} onClick={()=>toggleSort(k)} style={{
                  padding:'8px 12px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                  textTransform:'uppercase',color:'var(--text3)',borderBottom:'1px solid var(--border)',
                  textAlign:k==='amount'?'right':'left',cursor:'pointer',whiteSpace:'nowrap',userSelect:'none'}}>
                  {l} <span style={{fontSize:9}}>{sortIcon(k)}</span>
                </th>
              ))}
              <th style={{padding:'8px 12px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                textTransform:'uppercase',color:'var(--text3)',borderBottom:'1px solid var(--border)',minWidth:130}}>
                Allegato
              </th>
            </tr>
          </thead>
          <tbody>
            {casaTxs.map(t => {
              const att = attachments[t.txId]
              return (
                <tr key={t.txId} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'7px 12px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
                  <td style={{padding:'7px 12px',fontSize:13,fontWeight:600,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {t.descAI || (t.description||'').slice(0,40) || '—'}
                  </td>
                  <td style={{padding:'7px 12px'}}>
                    {t.cat2 ? <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:'var(--surface2)',fontWeight:600}}>{t.cat2}</span> : '—'}
                  </td>
                  <td style={{padding:'7px 12px',fontSize:12,color:'var(--text2)',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {t.counterpart || '—'}
                  </td>
                  <td style={{padding:'7px 12px',textAlign:'right',fontWeight:700,fontFamily:'var(--font-mono)',color:t.amount>0?'var(--green)':'var(--red)'}}>
                    {t.amount>0?'+':''}€ {Math.abs(t.amount).toLocaleString('it-IT',{minimumFractionDigits:2})}
                  </td>
                  <td style={{padding:'7px 12px'}}>
                    {att ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <a href={att.dataUrl} download={att.name}
                          style={{fontSize:11,color:'var(--accent)',textDecoration:'none',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={att.name}>
                          📎 {att.name}
                        </a>
                        <button onClick={()=>removeAtt(t.txId)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:11,padding:0}}>✕</button>
                      </div>
                    ) : (
                      <label style={{cursor:'pointer',fontSize:11,color:'var(--text3)',display:'inline-flex',alignItems:'center',gap:4}}>
                        <input type="file" style={{display:'none'}} onChange={e=>handleFile(t.txId,e)} accept=".pdf,.png,.jpg,.jpeg"/>
                        📎 Allega
                      </label>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr style={{background:'var(--surface2)',fontWeight:700}}>
              <td colSpan={4} style={{padding:'8px 12px',fontSize:12}}>Totale ({casaTxs.length} transazioni)</td>
              <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--accent)'}}>
                € {casaTxs.reduce((s,t)=>s+Math.abs(t.amount),0).toLocaleString('it-IT',{minimumFractionDigits:2})}
              </td>
              <td/>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Utenze2Page() {
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
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600}}>\u26a1 Utenze</h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>Bollette luce, gas, acqua e altri contratti</div>
        </div>
      </div>

      {energyBills.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
          {[
            ['Utenze mese corrente',`\u20ac ${Math.round(totalThisMonth).toLocaleString('it-IT')}`],
            ['Utenze anno corrente',`\u20ac ${Math.round(totalYear).toLocaleString('it-IT')}`],
            ['Bollette registrate', energyBills.length],
          ].map(([l,v])=>(
            <div key={l} className="card" style={{padding:'14px 18px'}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:5}}>{l}</div>
              <div style={{fontSize:20,fontWeight:700,fontFamily:'var(--font-mono)'}}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Two-column: cards left + merchant panel right ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:20,alignItems:'start'}}>
        <div className="util-grid">
          {UTILITY_TYPES.map(t=>(
            <UtilityCard key={t.id} type={t} bills={energyBills}/>
          ))}
        </div>
        <UtilityMerchantsPanel/>
      </div>

      {/* ── Utility transactions table ── */}
      <UtilityTxSection/>

    </div>
  )
}
