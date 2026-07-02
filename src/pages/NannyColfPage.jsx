import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal, { ModalFooter, FormRow, Input } from '../components/Modal'
import { Plus, Trash2, CheckCircle, AlertCircle, XCircle, Search } from 'lucide-react'
import { fmtIT } from '../utils/format'

const NANNY_RECON_KEY = 'nannyRecon'
const COLF_RECON_KEY  = 'colfRecon'

function getRecon(key) {
  return useStore.getState()?.appPrefs?.[key] || {}
}
function saveRecon(key, data) {
  useStore.getState()?.setAppPref?.(key, data)
}

// ATM/prelievo detection
function isAtmWithdrawal(t) {
  if (t.excluded || t.amount >= 0) return false
  const desc = (t.description||'').toUpperCase()
  const merch = (t.merchant||'').toUpperCase()
  return (
    t.cat1 === 'Contanti' ||
    desc.includes('PRELIEVO') || desc.includes('BANCOMAT') || desc.includes('ATM') ||
    merch.includes('PRELIEVO') || merch.includes('ATM')
  )
}

function reconcileStatus(entry, transactions, reconKey=NANNY_RECON_KEY) {
  const recon = getRecon(reconKey)
  if (recon[entry.id]) return { status:'ok', recon: recon[entry.id] }

  // Fallback: auto-search by exact amount in month
  const month = entry.mese
  const atm = transactions.filter(t => isAtmWithdrawal(t) && (t._effDate||(t._effDate||t.date||'')).startsWith(month))
  const exact = atm.find(t => Math.abs(t.amount) === entry.totale)
  if (exact) return { status:'ok', recon:{ txId: exact.txId, txAmt: Math.abs(exact.amount), nannyAmt: entry.totale, auto:true } }

  const partial = atm.find(t => Math.abs(t.amount) >= entry.totale * 0.9)
  if (partial) return { status:'partial', found: Math.abs(partial.amount) }

  return { status:'missing', found:0 }
}

function ReconcileModal({ entry, transactions, onClose, entityLabel='Nanny', reconKey=NANNY_RECON_KEY }) {
  const [tab, setTab]         = useState('atm')    // 'atm' | 'code'
  const [selected, setSelected] = useState(null)   // { txId, amount, desc, date }
  const [codeInput, setCodeInput] = useState('')
  const [codeResult, setCodeResult] = useState(null) // found tx or 'not-found'
  const [saved, setSaved] = useState(false)

  const existingRecon = getRecon(reconKey)[entry.id] || null

  // All ATM withdrawals, not already assigned to another entry
  const allRecons = getRecon(reconKey)
  const usedTxIds = new Set(
    Object.entries(allRecons)
      .filter(([id]) => id !== String(entry.id))
      .map(([, r]) => r.txId)
  )

  const atmTxs = transactions
    .filter(t => isAtmWithdrawal(t) && !usedTxIds.has(t.txId))
    .sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))

  const nannyAmt = entry.totale
  const selectedAmt = selected ? Math.abs(selected.amount) : null
  const isSplit = selectedAmt !== null && selectedAmt > nannyAmt + 0.01
  const splitContanti = isSplit ? selectedAmt - nannyAmt : 0

  function searchByCode() {
    const code = codeInput.trim()
    if (!code) return
    const found = transactions.find(t =>
      t.txId === code ||
      (t.txId||'').toLowerCase() === code.toLowerCase() ||
      (t.description||'').toLowerCase().includes(code.toLowerCase())
    )
    setCodeResult(found || 'not-found')
    if (found) setSelected(found)
  }

  function confirm() {
    if (!selected) return
    const recon = { ...getRecon(reconKey) }
    recon[entry.id] = {
      txId:      selected.txId,
      txAmt:     Math.abs(selected.amount),
      nannyAmt,
      contantiAmt: isSplit ? Math.round(splitContanti*100)/100 : 0,
      split:     isSplit,
      date:      new Date().toISOString(),
    }
    saveRecon(reconKey, recon)
    setSaved(true)
  }

  function removeRecon() {
    const recon = { ...getRecon(reconKey) }
    delete recon[entry.id]
    saveRecon(reconKey, recon)
    setSaved(false)
    setSelected(null)
    setCodeResult(null)
    setCodeInput('')
  }

  const thStyle = { padding:'8px 12px', fontSize:10, fontWeight:700, letterSpacing:'.07em',
    textTransform:'uppercase', color:'var(--text3)', background:'var(--surface2)',
    borderBottom:'1px solid var(--border)', textAlign:'left', whiteSpace:'nowrap' }
  const tdStyle = { padding:'8px 12px', fontSize:12, borderBottom:'1px solid var(--border)' }

  if (saved) {
    const r = getRecon(reconKey)[entry.id]
    const tx = transactions.find(t=>t.txId===r?.txId)
    return (
      <Modal title={`Riconciliazione salvata — ${entry.mese}`} onClose={onClose} width={520}>
        <div style={{padding:14,background:'var(--green-l,#e8f5e9)',borderRadius:'var(--radius-sm)',marginBottom:16,fontSize:13}}>
          <div style={{fontWeight:700,color:'var(--green)',marginBottom:6}}>✅ Riconciliazione registrata</div>
          {tx && <div style={{color:'var(--text2)'}}>Transazione: <strong>{tx.txId}</strong> — {tx.descAI||(tx.description||'').slice(0,40)}</div>}
          <div style={{color:'var(--text2)',marginTop:4}}>Prelievo ATM: <strong>€ {fmtIT(r.txAmt,2)}</strong></div>
          <div style={{color:'var(--text2)'}}>Importo {entityLabel}: <strong>€ {fmtIT(r.nannyAmt,2)}</strong></div>
          {r.split && (
            <div style={{marginTop:8,padding:'8px 10px',background:'var(--surface2)',borderRadius:6,fontSize:12}}>
              <div style={{fontWeight:700,marginBottom:4}}>🔀 Split automatico</div>
              <div>Parte {entityLabel}: <strong>€ {fmtIT(r.nannyAmt,2)}</strong></div>
              <div>Parte Contanti: <strong>€ {fmtIT(r.contantiAmt,2)}</strong></div>
            </div>
          )}
        </div>
        <ModalFooter>
          <button className="btn btn-secondary" onClick={removeRecon} style={{color:'var(--red)'}}>Rimuovi riconciliazione</button>
          <button className="btn btn-primary" onClick={onClose}>Chiudi</button>
        </ModalFooter>
      </Modal>
    )
  }

  return (
    <Modal title={`Riconcilia ${entityLabel} — ${entry.mese}`} onClose={onClose} width={580}>
      {/* Header info */}
      <div style={{display:'flex',gap:12,marginBottom:16}}>
        <div style={{flex:1,padding:'10px 14px',background:'var(--surface2)',borderRadius:'var(--radius-sm)',fontSize:13}}>
          <div style={{color:'var(--text3)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Da riconciliare</div>
          <div style={{fontWeight:700,fontSize:18,fontFamily:'var(--font-mono)'}}>€ {fmtIT(nannyAmt,2)}</div>
        </div>
        {existingRecon && (
          <div style={{flex:1,padding:'10px 14px',background:'var(--green-l,#e8f5e9)',borderRadius:'var(--radius-sm)',fontSize:13}}>
            <div style={{color:'var(--green)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Già riconciliato</div>
            <div style={{fontWeight:700,fontSize:13}}>TX: {existingRecon.txId}</div>
            <button style={{fontSize:11,color:'var(--red)',background:'none',border:'none',cursor:'pointer',padding:0,marginTop:3}} onClick={removeRecon}>Rimuovi</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:0,borderBottom:'2px solid var(--border)',marginBottom:14}}>
        {[['atm','💵 Prelievi ATM'],['code','🔍 Inserisci Codice']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:'8px 16px',border:'none',background:'none',cursor:'pointer',
            fontSize:13,fontWeight:tab===t?700:500,color:tab===t?'var(--accent)':'var(--text3)',
            borderBottom:tab===t?'2px solid var(--accent)':'2px solid transparent',marginBottom:-2,
          }}>{l}</button>
        ))}
      </div>

      {tab==='atm' && (
        atmTxs.length === 0 ? (
          <div style={{padding:'20px 14px',textAlign:'center',color:'var(--text3)',fontSize:13}}>
            Nessun prelievo ATM trovato nelle transazioni.<br/>
            <span style={{fontSize:12}}>Usa la scheda "Inserisci Codice" per assegnare manualmente.</span>
          </div>
        ) : (
          <div style={{maxHeight:280,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:14}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Descrizione</th>
                <th style={{...thStyle,textAlign:'right'}}>Importo</th>
                <th style={thStyle}></th>
              </tr></thead>
              <tbody>
                {atmTxs.map(t=>{
                  const isSelected = selected?.txId === t.txId
                  return (
                    <tr key={t.txId} style={{background:isSelected?'var(--accent-l,#f0f4ff)':'',cursor:'pointer'}} onClick={()=>setSelected(isSelected?null:t)}>
                      <td style={{...tdStyle,fontFamily:'var(--font-mono)',color:'var(--text3)'}}>{(t._effDate||(t._effDate||t.date||'')).slice(5).replace('-','/')}</td>
                      <td style={tdStyle}>{t.descAI||(t.description||'').slice(0,38)}</td>
                      <td style={{...tdStyle,textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--red)'}}>€ {fmtIT(Math.abs(t.amount),2)}</td>
                      <td style={{...tdStyle,textAlign:'center'}}>
                        <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${isSelected?'var(--accent)':'var(--border)'}`,background:isSelected?'var(--accent)':'',display:'inline-block'}}/>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab==='code' && (
        <div style={{marginBottom:14}}>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <input
              value={codeInput}
              onChange={e=>setCodeInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&searchByCode()}
              placeholder="Codice transazione, es. 26-0014"
              style={{flex:1,padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',fontSize:13,background:'var(--bg)',color:'var(--text)'}}
            />
            <button className="btn btn-secondary" onClick={searchByCode}><Search size={14}/> Cerca</button>
          </div>
          {codeResult === 'not-found' && (
            <div style={{padding:'10px 14px',background:'var(--red-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--red)'}}>
              Transazione non trovata: "{codeInput}"
            </div>
          )}
          {codeResult && codeResult !== 'not-found' && (
            <div style={{padding:'12px 14px',background:'var(--surface2)',borderRadius:'var(--radius-sm)',fontSize:13}}>
              <div style={{fontWeight:700,marginBottom:4}}>{codeResult.txId} — {codeResult.descAI||(codeResult.description||'').slice(0,45)}</div>
              <div style={{color:'var(--text3)'}}>{codeResult.date} · € {fmtIT(Math.abs(codeResult.amount),2)} · {codeResult.cat1}</div>
            </div>
          )}
        </div>
      )}

      {/* Selected transaction + split preview */}
      {selected && (
        <div style={{padding:'12px 14px',background:'var(--surface2)',borderRadius:'var(--radius-sm)',marginBottom:14,fontSize:13}}>
          <div style={{fontWeight:700,marginBottom:6}}>📌 Prelievo selezionato: <span style={{fontFamily:'var(--font-mono)',color:'var(--red)'}}>€ {fmtIT(Math.abs(selected.amount),2)}</span></div>
          {isSplit ? (
            <div style={{padding:'10px 12px',background:'var(--gold-l,#fffbe6)',borderRadius:6,border:'1px solid var(--gold)'}}>
              <div style={{fontWeight:700,color:'var(--gold)',marginBottom:6}}>🔀 Il prelievo supera il costo — verrà suddiviso:</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div style={{padding:'8px 12px',background:'var(--surface)',borderRadius:6,textAlign:'center'}}>
                  <div style={{fontSize:11,color:'var(--text3)',marginBottom:2}}>{entityLabel}</div>
                  <div style={{fontWeight:700,fontSize:16,fontFamily:'var(--font-mono)'}}>€ {fmtIT(nannyAmt,2)}</div>
                </div>
                <div style={{padding:'8px 12px',background:'var(--surface)',borderRadius:6,textAlign:'center'}}>
                  <div style={{fontSize:11,color:'var(--text3)',marginBottom:2}}>💵 Contanti residui</div>
                  <div style={{fontWeight:700,fontSize:16,fontFamily:'var(--font-mono)'}}>€ {fmtIT(Math.round(splitContanti*100)/100,2)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{color:'var(--green)',fontWeight:600}}>✅ Importo corrispondente — nessun split necessario</div>
          )}
        </div>
      )}

      <ModalFooter>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={confirm} disabled={!selected}>
          Conferma riconciliazione
        </button>
      </ModalFooter>
    </Modal>
  )
}

function TimesheetPage({ title, icon, tsKey, addFn, deleteFn, defaultRate=10, nameKey, reconKey=NANNY_RECON_KEY }) {
  const store = useStore()
  const entries = store[tsKey] || []
  const transactions = useStore(s=>s.transactions)
  const [showAdd, setShowAdd] = useState(false)
  const [reconEntry, setReconEntry] = useState(null)
  const [form, setForm] = useState({ mese:new Date().toISOString().slice(0,7), ore:'', rate:defaultRate, note:'' })
  const set=(k,v)=>setForm(f=>({...f,[k]:v}))

  // Name field — derived directly from appPrefs (never local state, avoids async init bug)
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const personName = nameKey ? (appPrefs[nameKey] || '') : ''
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  function saveName() {
    if (nameKey) { setAppPref(nameKey, nameInput.trim()) }
    setEditingName(false)
  }
  const displayTitle = personName ? `${title} — ${personName}` : title

  function save(){
    if(!form.ore) return
    const ore=parseFloat(form.ore), rate=parseFloat(form.rate)||defaultRate
    const totale=ore*rate
    store[addFn]({ mese:form.mese, ore, rate, totale, note:form.note, pagato:false })
    setShowAdd(false)
    setForm({ mese:new Date().toISOString().slice(0,7), ore:'', rate:defaultRate, note:'' })
  }

  const yearEntries = entries.filter(e=>e.mese.startsWith(new Date().getFullYear().toString()))
  const totalYear = yearEntries.reduce((s,e)=>s+e.totale,0)

  const StatusIcon=({status})=>status==='ok'?<CheckCircle size={14} color="var(--green)"/>:status==='partial'?<AlertCircle size={14} color="var(--gold)"/>:<XCircle size={14} color="var(--red)"/>

  return (
    <div style={{padding:'28px 32px',maxWidth:860}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600}}>{icon} {displayTitle}</h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>Registro mensile ore, compensi e riconciliazione</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={14}/> Aggiungi Mese</button>
      </div>

      {/* Name field */}
      {nameKey && (
        <div style={{marginBottom:20,padding:'12px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:13,color:'var(--text3)',fontWeight:600,whiteSpace:'nowrap'}}>Nome {title}:</span>
          {editingName ? (
            <>
              <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveName()}
                autoFocus placeholder={`Es. Maria`}
                style={{flex:1,padding:'6px 10px',borderRadius:'var(--radius-sm)',border:'1px solid var(--accent)',fontSize:13,background:'var(--bg)',color:'var(--text)'}}/>
              <button className="btn btn-primary" style={{padding:'6px 14px'}} onClick={saveName}>Salva</button>
              <button className="btn btn-ghost" onClick={()=>setEditingName(false)}>✕</button>
            </>
          ) : (
            <>
              <span style={{flex:1,fontSize:14,fontWeight:600,color:personName?'var(--text)':'var(--text3)',fontStyle:personName?'normal':'italic'}}>
                {personName||'Non impostato'}
              </span>
              <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>{setNameInput(personName);setEditingName(true)}}>✏️ Modifica</button>
            </>
          )}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['Mesi registrati',entries.length],['Totale anno',`€ ${fmtIT(totalYear, 0)}`],['Media mensile',yearEntries.length?`€ ${fmtIT(totalYear/yearEntries.length, 0)}`:'—']].map(([l,v])=>(
          <div key={l} className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:6}}>{l}</div>
            <div style={{fontSize:22,fontWeight:700,fontFamily:'var(--font-mono)'}}>{v}</div>
          </div>
        ))}
      </div>

      {entries.length===0 ? (
        <div style={{textAlign:'center',padding:'60px 24px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
          <div style={{fontSize:40,marginBottom:12}}>{icon}</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>Nessun mese registrato</div>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              {['Mese','Ore','€/ora','Totale','Riconciliazione','Data Prelievo',''].map(h=>(
                <th key={h} style={{padding:'10px 14px',fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:['Totale'].includes(h)?'right':'left'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...entries].sort((a,b)=>b.mese.localeCompare(a.mese)).map(e=>{
                const r=reconcileStatus(e,transactions,reconKey)
                const atmTx = r.status==='ok' && r.recon?.txId
                  ? transactions.find(t=>t.txId===r.recon.txId)
                  : null
                const atmDate = atmTx ? (atmTx.date||'').slice(0,10) : null
                const fmtAtmDate = d => {
                  if (!d) return '—'
                  const [,m,day] = d.match(/\d{4}-(\d{2})-(\d{2})/) || []
                  const MESI=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
                  return m ? `${parseInt(day)} ${MESI[parseInt(m)-1]}` : d
                }
                return (
                  <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 14px',fontWeight:600}}>{e.mese}</td>
                    <td style={{padding:'10px 14px',color:'var(--text3)'}}>{e.ore}h</td>
                    <td style={{padding:'10px 14px',color:'var(--text3)',fontFamily:'var(--font-mono)'}}>€ {fmtIT(e.rate||0,2)}</td>
                    <td style={{padding:'10px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--accent)'}}>€ {fmtIT(e.totale, 0)}</td>
                    <td style={{padding:'10px 14px'}}>
                      <button onClick={()=>setReconEntry(e)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:12,color:'var(--text2)'}}>
                        <StatusIcon status={r.status}/>
                        {r.status==='ok'?'Verificato':r.status==='partial'?`Parziale (€${Math.round(r.found)})`:'Non trovato'}
                      </button>
                    </td>
                    <td style={{padding:'10px 14px',fontSize:12,color:atmDate?'var(--text2)':'var(--text3)',fontFamily:atmDate?'var(--font-mono)':'inherit'}}>
                      {atmDate ? (
                        <span title={`Prelievo del ${atmDate} — € ${r.recon?.txAmt?.toLocaleString('it-IT')}`}>
                          📅 {fmtAtmDate(atmDate)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{padding:'6px 10px'}}><button className="btn btn-ghost" onClick={()=>store[deleteFn](e.id)}><Trash2 size={12}/></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title={`+ Aggiungi Mese — ${title}`} onClose={()=>setShowAdd(false)}>
          <FormRow label="Mese"><Input type="month" value={form.mese} onChange={e=>set('mese',e.target.value)}/></FormRow>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <FormRow label="Ore lavorate"><Input type="number" value={form.ore} onChange={e=>set('ore',e.target.value)} placeholder="es. 88"/></FormRow>
            <FormRow label="€/ora"><Input type="number" value={form.rate} onChange={e=>set('rate',e.target.value)}/></FormRow>
          </div>
          <FormRow label="Note"><Input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="Opzionale"/></FormRow>
          {form.ore && (
            <div style={{padding:'10px 14px',background:'var(--blue-l)',borderRadius:'var(--radius-sm)',fontSize:13,marginTop:4}}>
              Totale: <strong>€ {Math.round((parseFloat(form.ore)||0)*(parseFloat(form.rate)||0)).toLocaleString('it-IT')}</strong>
            </div>
          )}
          <ModalFooter>
            <button className="btn btn-primary" onClick={save}>Salva</button>
            <button className="btn btn-secondary" onClick={()=>setShowAdd(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
      {reconEntry && <ReconcileModal entry={reconEntry} transactions={transactions} onClose={()=>setReconEntry(null)} entityLabel={title} reconKey={reconKey}/>}
    </div>
  )
}

export function NannyPage() { return <TimesheetPage title="Nanny" icon="👩‍🍼" tsKey="nannyTS" addFn="addNannyMonth" deleteFn="deleteNannyMonth" defaultRate={12} nameKey="fm-nanny-name" reconKey={NANNY_RECON_KEY}/> }
export function ColfPage()  { return <TimesheetPage title="Colf"  icon="🧹"    tsKey="colfTS"  addFn="addColfMonth"  deleteFn="deleteColfMonth"  defaultRate={10} nameKey="fm-colf-name"  reconKey={COLF_RECON_KEY}/> }
