import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import { Plus, Trash2, Link, TrendingUp, RefreshCw } from 'lucide-react'
import './AltreEntratePage.css'
import { fmtIT } from '../utils/format'
import { CATS } from '../data/categories'

const ENTRY_TYPES = ['Rimborso Costo','Prestito Ricevuto','Trasferimento','Entrata Generica']
const TYPE_COLORS  = {
  'Rimborso Costo':    'var(--green)',
  'Prestito Ricevuto': 'var(--gold)',
  'Trasferimento':     'var(--blue)',
  'Entrata Generica':  'var(--text2)',
}

// ── User nicknames ─────────────────────────────────────────
function getUserNicknames() {
  try {
    const appPrefs  = useStore.getState()?.appPrefs || {}
    const ownerNick = appPrefs.ownerNickname || 'Fra'
    const fam       = appPrefs.family || []
    const famNicks  = fam.map(m => m.nickname || m.name?.split(' ')[0]).filter(Boolean)
    return [ownerNick, ...famNicks]
  } catch { return ['Fra', 'Sofi'] }
}

// ── Compensation links (Firestore via appPrefs) ─────────────
function getCompLinks() { return useStore.getState()?.appPrefs?.compLinks || {} }
function saveCompLinks(data) { useStore.getState()?.setAppPref?.('compLinks', data) }

// ── Notes (Firestore via appPrefs) ──────────────────────────
function getAeNotes() { return useStore.getState()?.appPrefs?.aeNotes || {} }
function saveAeNotes(data) { useStore.getState()?.setAppPref?.('aeNotes', data) }

// ── AE Categories (Firestore via appPrefs) ──────────────────
function getAeCats() { return useStore.getState()?.appPrefs?.aeCats || {} }
function saveAeCats(data) { useStore.getState()?.setAppPref?.('aeCats', data) }

const AE_CATS = ['Regalo', 'Prestito', 'Costo compensato', 'Altro']
const AE_CAT_COLORS = {
  'Regalo':           '#9a4ab8',
  'Prestito':         '#2a7a4a',
  'Costo compensato': '#2a5c8a',
  'Altro':            '#607080',
}

// ── NoteCell — inline note editing ────────────────────────
function NoteCell({ entryKey, notes, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(notes[entryKey] || '')
  if (editing) return (
    <input autoFocus value={val}
      onChange={e=>setVal(e.target.value)}
      onBlur={()=>{ onSave(entryKey, val); setEditing(false) }}
      onKeyDown={e=>{ if(e.key==='Enter'||e.key==='Escape'){onSave(entryKey,val);setEditing(false)} }}
      style={{width:'100%',minWidth:100,padding:'3px 6px',border:'1px solid var(--accent)',borderRadius:5,
        fontSize:12,background:'var(--bg)',color:'var(--text)',fontFamily:'var(--font-sans)'}}/>
  )
  return (
    <span onClick={()=>setEditing(true)} style={{fontSize:12,color:val?'var(--text2)':'var(--text3)',
      cursor:'text',fontStyle:val?'normal':'italic',display:'block',minWidth:80}}>
      {val || '+ nota'}
    </span>
  )
}

// ── AeCatCell — 4 fixed category options ──────────────────
function AeCatCell({ entryKey, cats, onSave }) {
  const [editing, setEditing] = useState(false)
  const current = cats[entryKey] || ''
  const color = AE_CAT_COLORS[current] || 'var(--text3)'
  if (editing) return (
    <select autoFocus value={current}
      onChange={e=>{ onSave(entryKey, e.target.value); setEditing(false) }}
      onBlur={()=>setEditing(false)}
      style={{padding:'3px 6px',borderRadius:6,border:'1px solid var(--accent)',fontSize:12,
        background:'var(--surface)',color:'var(--text)'}}>
      <option value="">— nessuna —</option>
      {AE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
    </select>
  )
  return (
    <button onClick={()=>setEditing(true)} style={{
      padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:700,cursor:'pointer',
      background: current ? color+'22' : 'var(--surface2)',
      border: `1px solid ${current ? color+'66' : 'var(--border)'}`,
      color: current ? color : 'var(--text3)',
    }}>{current || '+ cat'}</button>
  )
}

// ── CompensaModal — link income entry to a transaction ─────
function CompensaModal({ incomeEntry, transactions, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const [tab, setTab] = useState('list')  // 'list' | 'code'
  const [search, setSearch] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeResult, setCodeResult] = useState(null) // tx or 'not-found'
  const [selected, setSelected] = useState(null)
  const [saved, setSaved] = useState(false)

  // Stable link key: bank entries use txId, manual entries use id
  const linkKey = incomeEntry.txId || incomeEntry.id

  const existingLink = (linkKey != null && getCompLinks()[linkKey]) || null

  // All transactions (income and expense) with abs amount within range
  // Show those where abs(amount) >= incomeEntry.amount - 1 (1€ tolerance below)
  const eligible = useMemo(() => {
    const alreadyLinked = new Set(
      Object.entries(getCompLinks())
        .filter(([id]) => id !== String(linkKey))
        .map(([,l]) => l.expTxId)
    )
    return transactions
      .filter(t => {
        if (t.txId === incomeEntry.txId || t.excluded) return false
        if (alreadyLinked.has(t.txId)) return false
        return Math.abs(t.amount) >= incomeEntry.amount - 1
      })
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  }, [transactions, incomeEntry])

  const filtered = eligible.filter(t => {
    const hay = `${t.description||''} ${t.merchant||''} ${t.descAI||''}`.toLowerCase()
    return hay.includes(search.toLowerCase())
  })

  function searchByCode() {
    const code = codeInput.trim()
    if (!code) return
    const found = transactions.find(t =>
      t.txId === code ||
      (t.txId||'').toLowerCase() === code.toLowerCase() ||
      (t.description||'').toLowerCase().includes(code.toLowerCase()) ||
      (t.descAI||'').toLowerCase().includes(code.toLowerCase())
    )
    setCodeResult(found || 'not-found')
    if (found) setSelected(found)
  }

  function confirm() {
    if (!selected || linkKey == null) return
    const absExp = Math.abs(selected.amount)
    const isFull = absExp <= incomeEntry.amount  // expense fully covered
    const links = { ...getCompLinks() }
    links[linkKey] = { expTxId: selected.txId, mode: isFull ? 'full' : 'partial', compensatedAmt: incomeEntry.amount }
    saveCompLinks(links)
    if (isFull) {
      updateTransaction(selected.txId, { excluded: true, _compensatedBy: linkKey })
    } else {
      updateTransaction(selected.txId, { _compensatedAmt: incomeEntry.amount, _compensatedBy: linkKey })
    }
    setSaved(true)
    setTimeout(onClose, 800)
  }

  const preview = selected ? (() => {
    const absExp = Math.abs(selected.amount)
    if (absExp <= incomeEntry.amount) return { type:'full', msg:`✅ Spesa completamente coperta — verrà esclusa dalle statistiche` }
    return { type:'partial', msg:`⚠️ Compensazione parziale — la spesa (€ ${(absExp).toLocaleString('it-IT',{minimumFractionDigits:2})}) verrà ridotta di € ${incomeEntry.amount.toLocaleString('it-IT',{minimumFractionDigits:2})}, il rimanente € ${(absExp-incomeEntry.amount).toLocaleString('it-IT',{minimumFractionDigits:2})} resterà nelle statistiche con indicatore blu` }
  })() : null

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'24px 28px',maxWidth:640,width:'94%',
        boxShadow:'0 16px 48px rgba(0,0,0,.25)',maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:800}}>🔗 Abbina a Transazione</div>
          <button onClick={onClose} style={{border:'none',background:'transparent',cursor:'pointer',fontSize:18,color:'var(--text3)'}}>✕</button>
        </div>

        {/* Income info */}
        <div style={{padding:'10px 14px',background:'var(--green-l)',border:'1px solid var(--green)',borderRadius:8,marginBottom:14,fontSize:12}}>
          <strong>Entrata:</strong> {incomeEntry.descAI||incomeEntry.description?.slice(0,50)} —
          <strong style={{color:'var(--green)'}}> +€ {incomeEntry.amount.toLocaleString('it-IT',{minimumFractionDigits:2})}</strong>
          <span style={{color:'var(--text3)',marginLeft:8,fontSize:11}}>Mostrate tx con importo ≥ €{(incomeEntry.amount-1).toLocaleString('it-IT',{minimumFractionDigits:0})}</span>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:2,marginBottom:12,background:'var(--surface2)',borderRadius:8,padding:3}}>
          {[['list','📋 Seleziona da lista'],['code','🔍 Cerca per codice']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,padding:'6px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:13,fontWeight:tab===t?700:400,
              background:tab===t?'var(--surface)':'transparent',color:tab===t?'var(--text)':'var(--text3)',
              boxShadow:tab===t?'0 1px 4px rgba(0,0,0,.1)':'none'
            }}>{l}</button>
          ))}
        </div>

        {tab === 'list' && (
          <>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filtra per descrizione..." autoFocus
              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--border)',borderRadius:6,
                fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',
                fontFamily:'var(--font-sans)',boxSizing:'border-box',marginBottom:8}}/>
            <div style={{flex:1,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,marginBottom:12,maxHeight:260}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'var(--surface2)',position:'sticky',top:0}}>
                    {['Data','Descrizione','Importo','Match'].map(h=>(
                      <th key={h} style={{padding:'6px 10px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                        textTransform:'uppercase',color:'var(--text3)',textAlign:h==='Importo'?'right':'left',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0,60).map(t => {
                    const absAmt = Math.abs(t.amount)
                    const isSel = selected?.txId === t.txId
                    const isFull = absAmt <= incomeEntry.amount
                    return (
                      <tr key={t.txId} onClick={()=>setSelected(t)} style={{
                        borderBottom:'1px solid var(--border)',cursor:'pointer',
                        background:isSel?'var(--accent-l)':'transparent',
                      }}>
                        <td style={{padding:'6px 10px',fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{(t._effDate||(t._effDate||t.date||'')).slice(5).replace('-','/')}</td>
                        <td style={{padding:'6px 10px',fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.descAI||t.description?.slice(0,40)}</td>
                        <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,
                          color:t.amount>0?'var(--green)':'var(--red)'}}>
                          {t.amount>0?'+':'−'}€ {(absAmt).toLocaleString('it-IT',{minimumFractionDigits:2})}
                        </td>
                        <td style={{padding:'6px 10px',textAlign:'center',fontSize:14}}>
                          {isFull ? '✅' : '⚠️'}
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && <tr><td colSpan={5} style={{padding:16,textAlign:'center',color:'var(--text3)',fontSize:12}}>Nessuna transazione nell'intervallo</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'code' && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:10}}>
              Inserisci il codice transazione o parte della descrizione:
            </div>
            <div style={{display:'flex',gap:8}}>
              <input value={codeInput} onChange={e=>setCodeInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&searchByCode()}
                placeholder="Es. 24-000123 o descrizione..."
                style={{flex:1,padding:'8px 12px',border:'1px solid var(--border)',borderRadius:6,
                  fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}
                autoFocus/>
              <button className="btn btn-primary" onClick={searchByCode}>Cerca</button>
            </div>
            {codeResult === 'not-found' && (
              <div style={{marginTop:10,padding:'8px 12px',background:'var(--red-l)',borderRadius:6,fontSize:12,color:'var(--red)'}}>
                Nessuna transazione trovata
              </div>
            )}
            {codeResult && codeResult !== 'not-found' && (
              <div onClick={()=>setSelected(codeResult)} style={{
                marginTop:10,padding:'10px 14px',borderRadius:8,cursor:'pointer',
                border:`2px solid ${selected?.txId===codeResult.txId?'var(--accent)':'var(--border)'}`,
                background:selected?.txId===codeResult.txId?'var(--accent-l)':'var(--surface2)'
              }}>
                <div style={{fontSize:13,fontWeight:600}}>{codeResult.descAI||codeResult.description?.slice(0,50)}</div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{codeResult.date} · € {Math.abs(codeResult.amount).toLocaleString('it-IT',{minimumFractionDigits:2})} · {codeResult.txId}</div>
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div style={{padding:'8px 12px',borderRadius:8,marginBottom:12,fontSize:12,
            background:preview.type==='full'?'var(--green-l)':'rgba(200,150,42,.12)',
            color:preview.type==='full'?'var(--green)':'var(--gold)',
            border:`1px solid ${preview.type==='full'?'var(--green)':'var(--gold)'}`}}>
            {preview.msg}
          </div>
        )}

        {saved && <div style={{padding:'8px 12px',background:'var(--green-l)',borderRadius:8,marginBottom:12,fontSize:12,color:'var(--green)',fontWeight:600}}>✅ Abbinamento salvato!</div>}

        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={confirm} disabled={!selected||saved}>Conferma abbinamento</button>
        </div>
      </div>
    </div>
  )
}

// ── Add/Edit entry modal ──────────────────────────────────
function EntryModal({ entry, onClose }) {
  const { addChatMessage, rimborsiCosts, addRimborsiCost } = useStore()
  const isEdit = !!entry
  const [form, setForm] = useState({
    date:    entry?.date || new Date().toISOString().slice(0,10),
    desc:    entry?.desc || '',
    type:    entry?.type || 'Rimborso Costo',
    amount:  entry?.amount || '',
    account: entry?.account || 'Conto Corrente',
    note:    entry?.note || '',
    linkedCostId: entry?.linkedCostId || '',
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const setAppPref = useStore(s => s.setAppPref)

  function save() {
    if (!form.desc || !form.amount) return
    const data = {...form, amount: parseFloat(form.amount)}
    const list = useStore.getState()?.appPrefs?.altreEntrateManual || []
    const next = isEdit
      ? list.map(x => x.id === entry.id ? { ...x, ...data } : x)
      : [...list, { ...data, id: Date.now(), manuale: true }]
    setAppPref('altreEntrateManual', next)
    onClose()
  }

  return (
    <Modal title={isEdit ? 'Modifica Entrata' : '+ Nuova Entrata'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Data"><Input type="date" value={form.date} onChange={e=>set('date',e.target.value)}/></FormRow>
        <FormRow label="Tipo">
          <Select value={form.type} onChange={e=>set('type',e.target.value)}>
            {ENTRY_TYPES.map(t=><option key={t}>{t}</option>)}
          </Select>
        </FormRow>
      </div>
      <FormRow label="Descrizione / Da chi"><Input value={form.desc} onChange={e=>set('desc',e.target.value)} placeholder="es. Marco — rimborso cena"/></FormRow>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Importo (€)"><Input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} step="0.01" placeholder="0.00"/></FormRow>
        <FormRow label="Conto"><Input value={form.account} onChange={e=>set('account',e.target.value)} placeholder="Conto Corrente"/></FormRow>
      </div>
      <FormRow label="Note"><Input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="Opzionale"/></FormRow>
      {form.type === 'Rimborso Costo' && rimborsiCosts.length > 0 && (
        <FormRow label="Abbina a costo condiviso">
          <Select value={form.linkedCostId} onChange={e=>set('linkedCostId',e.target.value)}>
            <option value="">— Nessuno —</option>
            {rimborsiCosts.map(c=><option key={c.id} value={c.id}>{c.desc} (€{c.fullAmount})</option>)}
          </Select>
        </FormRow>
      )}
      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>Salva</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Shared cost modal ─────────────────────────────────────
function SharedCostModal({ onClose }) {
  const { addRimborsiCost } = useStore()
  const [form, setForm] = useState({ desc:'', fullAmount:'', cadenza:'Mensile', note:'' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function save() {
    if (!form.desc || !form.fullAmount) return
    addRimborsiCost({ ...form, fullAmount: parseFloat(form.fullAmount) })
    onClose()
  }

  return (
    <Modal title="+ Costo Condiviso" onClose={onClose}>
      <FormRow label="Nome costo"><Input value={form.desc} onChange={e=>set('desc',e.target.value)} placeholder="es. Netflix Family, Affitto condiviso"/></FormRow>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Importo totale (€)"><Input type="number" value={form.fullAmount} onChange={e=>set('fullAmount',e.target.value)} placeholder="12.99"/></FormRow>
        <FormRow label="Cadenza">
          <Select value={form.cadenza} onChange={e=>set('cadenza',e.target.value)}>
            {['Mensile','Bimestrale','Trimestrale','Semestrale','Annuale','Una tantum'].map(c=><option key={c}>{c}</option>)}
          </Select>
        </FormRow>
      </div>
      <FormRow label="Note"><Input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="Opzionale"/></FormRow>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>Crea</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Shared costs table ────────────────────────────────────
function SharedCostsSection() {
  const { rimborsiCosts, addReimbursement, deleteRimborsiCost } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [addReimbId, setAddReimbId] = useState(null)
  const [reimbAmount, setReimbAmount] = useState('')

  function saveReimb() {
    if (!reimbAmount) return
    addReimbursement(addReimbId, {
      date:   new Date().toISOString().slice(0,10),
      amount: parseFloat(reimbAmount),
      note:   '',
    })
    setAddReimbId(null)
    setReimbAmount('')
  }

  if (!rimborsiCosts.length && !showAdd) return (
    <div style={{textAlign:'center',padding:'24px',background:'var(--surface2)',borderRadius:'var(--radius-sm)',marginBottom:20}}>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:10}}>
        Nessun costo condiviso — es. Netflix con amici, spese divise con il partner.
      </div>
      <button className="btn btn-secondary" style={{fontSize:12}} onClick={()=>setShowAdd(true)}><Plus size={12}/> Aggiungi costo condiviso</button>
    </div>
  )

  return (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700}}>🔗 Costi Condivisi e Rimborsi</div>
        <button className="btn btn-secondary" style={{fontSize:12}} onClick={()=>setShowAdd(true)}><Plus size={12}/> Aggiungi</button>
      </div>
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>
            {['Costo','Importo pieno','Rimborsato','Netto','Cadenza','%',''].map(h=>(
              <th key={h} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:['Importo pieno','Rimborsato','Netto'].includes(h)?'right':'left'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rimborsiCosts.map(c=>{
              const totReimb = (c.reimbursements||[]).reduce((s,r)=>s+r.amount,0)
              const netto    = c.fullAmount - totReimb
              const pct      = c.fullAmount>0 ? Math.round(totReimb/c.fullAmount*100) : 0
              const color    = pct>=100?'var(--green)':pct>0?'var(--gold)':'var(--text3)'
              return (
                <tr key={c.id} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'10px 14px'}}>
                    <div style={{fontWeight:600,fontSize:13}}>{c.desc}</div>
                    {c.note&&<div style={{fontSize:11,color:'var(--text3)'}}>{c.note}</div>}
                  </td>
                  <td style={{padding:'10px 14px',fontFamily:'var(--font-mono)',textAlign:'right'}}>€ {fmtIT(c.fullAmount, 2)}</td>
                  <td style={{padding:'10px 14px',fontFamily:'var(--font-mono)',textAlign:'right',color:'var(--green)'}}>+€ {fmtIT(totReimb, 2)}</td>
                  <td style={{padding:'10px 14px',fontFamily:'var(--font-mono)',fontWeight:700,textAlign:'right',color:netto<c.fullAmount?'var(--green)':'var(--text)'}}>€ {fmtIT(netto, 2)}</td>
                  <td style={{padding:'10px 14px',fontSize:12,color:'var(--text3)'}}>{c.cadenza}</td>
                  <td style={{padding:'10px 14px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{flex:1,height:6,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                        <div style={{height:'100%',width:Math.min(pct,100)+'%',background:color,borderRadius:3}}/>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color,minWidth:28}}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{padding:'6px 10px',display:'flex',gap:4}}>
                    <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setAddReimbId(c.id)} title="Aggiungi rimborso">+€</button>
                    <button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={()=>deleteRimborsiCost(c.id)}><Trash2 size={11}/></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {addReimbId && (
        <Modal title="+ Aggiungi Rimborso Ricevuto" onClose={()=>setAddReimbId(null)} width={360}>
          <div style={{marginBottom:12,fontSize:13}}>
            Costo: <strong>{rimborsiCosts.find(c=>c.id===addReimbId)?.desc}</strong>
          </div>
          <FormRow label="Importo rimborso (€)">
            <Input type="number" value={reimbAmount} onChange={e=>setReimbAmount(e.target.value)} autoFocus step="0.01" placeholder="0.00"/>
          </FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={saveReimb}>Aggiungi</button>
            <button className="btn btn-secondary" onClick={()=>setAddReimbId(null)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
      {showAdd && <SharedCostModal onClose={()=>setShowAdd(false)}/>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function AltreEntratePage() {
  const { transactions, rimborsiCosts } = useStore()
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [showAdd, setShowAdd] = useState(false)
  // Manual entries + links/notes/cats read directly from appPrefs (reactive via Zustand)
  const entries   = appPrefs?.altreEntrateManual || []
  const compLinks = appPrefs?.compLinks || {}
  const [compensaEntry, setCompensaEntry] = useState(null)
  const aeNotes = appPrefs?.aeNotes || {}
  const aeCats  = appPrefs?.aeCats || {}
  const nicknames = useMemo(() => getUserNicknames(), [])

  const now    = new Date()
  const thisYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

  // L2 categories that must never appear in Altre Entrate
  const EXCLUDED_L2 = ['fra', 'sofi', 'francesco', 'sofia', 'satispay']

  // Detect non-salary income from bank transactions, excluding Satispay
  const autoEntries = useMemo(() => {
    return transactions.filter(t => {
      if (t.amount <= 0 || t.excluded) return false
      const cat2low = (t.cat2||'').toLowerCase()
      // Exclude salary / personal entries (Fra, Sofi, etc.) by nickname config AND explicit list
      if (t.cat1 === 'Entrate' && nicknames.some(n => t.cat2 === n)) return false
      if (t.cat1 === 'Entrate' && EXCLUDED_L2.includes(cat2low)) return false
      // Exclude Satispay
      const desc = (t.description||'').toUpperCase()
      const merch = (t.merchant||'').toUpperCase()
      if (t.cat1 === 'Satispay' || cat2low === 'satispay') return false
      if (desc.includes('SATISPAY') || merch.includes('SATISPAY')) return false
      if (t._forcedBalance) return false
      return t.cat1 === 'Entrate' || t.cat2 === 'Prestiti' || t.cat2 === 'Altro'
    })
  }, [transactions, nicknames])

  const allEntries = [...autoEntries, ...entries].sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))

  // Entries abbinate non contano come entrate reali — escluse dai totali
  const unlinkedEntries = allEntries.filter(e => !compLinks[e.txId || e.id])
  const thisMonthTotal = unlinkedEntries.filter(e=>(e.date||'').startsWith(thisYM)).reduce((s,e)=>s+(e.amount||0),0)
  const rimborsiTotal  = autoEntries.filter(e=>e.cat2==='Prestiti' && !compLinks[e.txId || e.id]).reduce((s,e)=>s+e.amount,0)
  const ytdTotal       = unlinkedEntries.filter(e=>(e.date||'').startsWith(now.getFullYear().toString())).reduce((s,e)=>s+(e.amount||0),0)
  const compCount      = Object.keys(compLinks).length
  const compTotal      = Object.values(compLinks).reduce((s,l)=>s+(l.compensatedAmt||0),0)

  function addManual(data) {
    const next = [
      ...(appPrefs?.altreEntrateManual || []),
      { ...data, amount: parseFloat(data.amount) || 0, id: Date.now(), manuale: true },
    ]
    setAppPref('altreEntrateManual', next)
  }

  function deleteManual(id) {
    setAppPref('altreEntrateManual', (appPrefs?.altreEntrateManual || []).filter(x => x.id !== id))
  }

  function saveNote(key, val) {
    const next = { ...aeNotes, [key]: val }
    if (!val) delete next[key]
    setAppPref('aeNotes', next)
  }

  function saveCat(key, val) {
    const next = { ...aeCats, [key]: val }
    if (!val) delete next[key]
    setAppPref('aeCats', next)
  }

  return (
    <div className="ae-page">
      <div className="ae-header">
        <div>
          <h1 className="ae-title">💸 Altre Entrate</h1>
          <div className="ae-sub">Rimborsi, prestiti ricevuti, trasferimenti e entrate varie</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={14}/> Aggiungi</button>
      </div>

      {/* KPIs */}
      <div className="ae-kpis">
        {[
          ['Mese corrente',`€ ${fmtIT(thisMonthTotal, 0)}`,'var(--green)'],
          ['YTD',          `€ ${fmtIT(ytdTotal, 0)}`,       'var(--blue)'],
          ['Da transazioni',autoEntries.length,              'var(--text)'],
          compCount>0 && ['Compensazioni',`${compCount} | € ${fmtIT(compTotal,0)}`,'var(--gold)'],
        ].filter(Boolean).map(([l,v,c])=>(
          <div key={l} className="card ae-kpi">
            <div className="ae-kpi-label">{l}</div>
            <div className="ae-kpi-val" style={{color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Shared costs section */}
      <SharedCostsSection/>

      {/* Entries table */}
      <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>📋 Entrate Registrate</div>
      {allEntries.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 24px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
          <div style={{fontSize:36,marginBottom:12}}>💸</div>
          <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Nessuna entrata registrata</div>
          <div style={{fontSize:13,color:'var(--text3)',marginBottom:14}}>
            Le transazioni non-stipendio appariranno automaticamente una volta importato il CSV.<br/>
            Puoi anche aggiungere rimborsi e prestiti manualmente.
          </div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={14}/> Aggiungi manuale</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              {['Data','Descrizione','Cat L2','Categoria','Compensa costo','Importo','Note',''].map(h=>(
                <th key={h} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {allEntries.slice(0,50).map((e,i)=>{
                const entryKey = e.txId || e.id || String(i)
                const compLink = compLinks[e.txId || e.id]
                return (
                  <tr key={e.txId||e.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{(d=>(d.length>=10?`${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}`:d))(e.date||'')}</td>
                    <td style={{padding:'9px 14px', opacity: e.excluded ? 0.55 : 1}}>
                      <div style={{fontSize:13,fontWeight:500}}>{e.descAI||e.desc||e.description?.slice(0,40)}</div>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:2}}>
                        {e.manuale&&<span style={{fontSize:10,padding:'1px 5px',background:'var(--surface2)',color:'var(--text3)',borderRadius:4}}>Manuale</span>}
                        {e.excluded&&<span style={{fontSize:10,padding:'1px 5px',background:'rgba(220,50,50,.1)',color:'var(--red)',borderRadius:4}}>Esclusa</span>}
                      </div>
                    </td>
                    <td style={{padding:'9px 14px'}}>
                      {e.cat2 ? (
                        <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,fontWeight:600,
                          background:'rgba(100,100,220,.07)',color:'var(--accent)',
                          border:'1px solid rgba(100,100,220,.2)'}}>
                          {e.cat2}
                        </span>
                      ) : (
                        <span style={{color:'var(--text3)',fontSize:11}}>—</span>
                      )}
                    </td>
                    <td style={{padding:'9px 14px'}}>
                      <AeCatCell entryKey={entryKey} cats={aeCats} onSave={saveCat}/>
                    </td>
                    <td style={{padding:'9px 14px'}}>
                      {!compLink && (
                        <button className="btn btn-ghost" style={{fontSize:11,color:'var(--blue)',border:'1px solid var(--blue)',borderRadius:6,padding:'2px 8px'}}
                          onClick={()=>setCompensaEntry(e)}>
                          🔗 Abbina
                        </button>
                      )}
                      {compLink && (
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <span style={{fontSize:11,color:'var(--green)',fontWeight:600}}>✓ Abbinata</span>
                          <button onClick={()=>{
                            const linkKey = e.txId || e.id
                            const links = { ...getCompLinks() }
                            const expTxId = links[linkKey]?.expTxId
                            delete links[linkKey]
                            saveCompLinks(links)
                            if(expTxId) useStore.getState().updateTransaction(expTxId, { excluded: false, _compensatedAmt: null, _compensatedBy: null })
                          }} style={{border:'none',background:'transparent',cursor:'pointer',color:'var(--red)',fontSize:11,padding:0}}>✕</button>
                        </div>
                      )}
                    </td>
                    <td style={{padding:'9px 14px',fontSize:13,fontWeight:700,color:'var(--green)',textAlign:'right',fontFamily:'var(--font-mono)'}}>
                      +€ {fmtIT(e.amount||0, 2)}
                    </td>
                    <td style={{padding:'9px 14px'}}>
                      <NoteCell entryKey={entryKey} notes={aeNotes} onSave={saveNote}/>
                    </td>
                    <td style={{padding:'6px 10px'}}>
                      {e.manuale&&<button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={()=>deleteManual(e.id)}><Trash2 size={11}/></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="+ Nuova Entrata" onClose={()=>setShowAdd(false)}>
          <EntryFormInline onSave={data=>{addManual(data);setShowAdd(false)}} onClose={()=>setShowAdd(false)}/>
        </Modal>
      )}
      {compensaEntry && (
        <CompensaModal
          incomeEntry={compensaEntry}
          transactions={transactions}
          onClose={()=>setCompensaEntry(null)}
        />
      )}
    </div>
  )
}

function EntryFormInline({ onSave, onClose }) {
  const { rimborsiCosts } = useStore()
  const [form, setForm] = useState({ date:new Date().toISOString().slice(0,10), desc:'', type:'Rimborso Costo', amount:'', note:'', linkedCostId:'' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Data"><Input type="date" value={form.date} onChange={e=>set('date',e.target.value)}/></FormRow>
        <FormRow label="Tipo"><Select value={form.type} onChange={e=>set('type',e.target.value)}>{ENTRY_TYPES.map(t=><option key={t}>{t}</option>)}</Select></FormRow>
      </div>
      <FormRow label="Descrizione"><Input value={form.desc} onChange={e=>set('desc',e.target.value)} placeholder="es. Marco — rimborso cena"/></FormRow>
      <FormRow label="Importo (€)"><Input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} step="0.01" placeholder="0.00"/></FormRow>
      <FormRow label="Note"><Input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="Opzionale"/></FormRow>
      {form.type==='Rimborso Costo' && rimborsiCosts.length>0 && (
        <FormRow label="Abbina a costo condiviso">
          <Select value={form.linkedCostId} onChange={e=>set('linkedCostId',e.target.value)}>
            <option value="">— Nessuno —</option>
            {rimborsiCosts.map(c=><option key={c.id} value={c.id}>{c.desc} (€{c.fullAmount})</option>)}
          </Select>
        </FormRow>
      )}
      <ModalFooter>
        <button className="btn btn-primary" onClick={()=>{if(!form.desc||!form.amount)return;onSave(form)}}>Salva</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </>
  )
}
