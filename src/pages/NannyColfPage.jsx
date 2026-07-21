import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal, { ModalFooter, FormRow, Input } from '../components/Modal'
import { Plus, Trash2, CheckCircle, AlertCircle, XCircle, Search } from 'lucide-react'
import { fmtIT, fmtDate } from '../utils/format'

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

const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function meseLabel(ym) {
  if (!ym) return '—'
  const [y,m] = ym.split('-')
  return `${MESI[parseInt(m)-1]} ${String(y).slice(2)}`
}

// Somma dei residui prelievi (post abbinamento a Nanny/Colf/Contanti) raggruppati per mese —
// richiesta utente 2026-07-20: colonna "Prelievi nel mese" + box laterale storico.
// Il residuo di ogni prelievo usa computeAtmUsed (store), che già somma nannyRecon+colfRecon
// +cashEntries+atmMeta.links, quindi riflette TUTTO quello già assegnato, non solo Nanny/Colf.
function computePrelieviByMonth(transactions, store) {
  const map = {}
  transactions.forEach(t => {
    if (!isAtmWithdrawal(t)) return
    const mese = (t._effDate || t.date || '').slice(0,7)
    if (!mese) return
    const used    = store.computeAtmUsed(t.txId)
    const importo = Math.abs(t.amount)
    const residuo = Math.round((importo - used) * 100) / 100
    if (!map[mese]) map[mese] = { mese, importo:0, totale:0, count:0, items:[] }
    map[mese].importo += importo
    map[mese].totale  += residuo
    map[mese].count   += 1
    map[mese].items.push({
      txId: t.txId,
      date: (t._effDate || t.date || '').slice(0,10),
      importo,
      residuo,
    })
  })
  Object.values(map).forEach(m => m.items.sort((a,b)=>b.date.localeCompare(a.date)))
  return map
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

// Allocazioni di una riga recon (nuovo formato multi-prelievo o vecchio formato singolo)
function reconAllocations(r) {
  if (!r) return []
  if (Array.isArray(r.allocations)) return r.allocations
  return r.txId ? [{ txId: r.txId, amt: r.nannyAmt }] : []
}

function ReconcileModal({ entry, transactions, onClose, entityLabel='Nanny', reconKey=NANNY_RECON_KEY }) {
  const [tab, setTab]         = useState('atm')    // 'atm' | 'code'
  const [selectedIds, setSelectedIds] = useState(() => {
    const existing = getRecon(reconKey)[entry.id]
    return new Set(reconAllocations(existing).map(a => a.txId))
  })
  const [codeInput, setCodeInput] = useState('')
  const [codeResult, setCodeResult] = useState(null) // found tx or 'not-found'
  const [saved, setSaved] = useState(false)

  const existingRecon = getRecon(reconKey)[entry.id] || null
  const nannyAmt = entry.totale

  // Residuo disponibile di un prelievo — esclude l'allocazione CORRENTE di questa
  // stessa entry (così ri-aprendo la riconciliazione si rivede il suo pieno residuo),
  // ma tiene conto di tutto ciò che è abbinato altrove (altre entry Nanny/Colf, Contanti) —
  // richiesta utente: "questi devono essere gli importi residuo post abbinamenti,
  // altrimenti va in overlap con altri già abbinati per altro"
  function residuoOf(txId) {
    const used = useStore.getState().computeAtmUsedExcluding(txId, entry.id, reconKey)
    const tx = transactions.find(t => t.txId === txId)
    if (!tx) return 0
    return Math.round((Math.abs(tx.amount) - used) * 100) / 100
  }

  // Solo prelievi fatti nel mese di competenza o in mesi precedenti (non futuri
  // rispetto al mese dell'entry) — richiesta utente 2026-07-20
  const meseCutoff = entry.mese // 'YYYY-MM'
  const atmTxs = transactions
    .filter(t => isAtmWithdrawal(t) && (t._effDate||t.date||'').slice(0,7) <= meseCutoff)
    .map(t => ({ ...t, _residuo: residuoOf(t.txId) }))
    .filter(t => t._residuo > 0.01 || selectedIds.has(t.txId)) // nascondi quelli già esauriti altrove
    .sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))

  const selectedTxs = atmTxs.filter(t => selectedIds.has(t.txId))
  const totalSelected = Math.round(selectedTxs.reduce((s,t)=>s+t._residuo,0)*100)/100
  const isCovered = totalSelected >= nannyAmt - 0.01
  const excess = isCovered ? Math.round((totalSelected - nannyAmt)*100)/100 : 0

  function toggleSelect(txId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId); else next.add(txId)
      return next
    })
  }

  function searchByCode() {
    const code = codeInput.trim()
    if (!code) return
    const found = transactions.find(t =>
      t.txId === code ||
      (t.txId||'').toLowerCase() === code.toLowerCase() ||
      (t.description||'').toLowerCase().includes(code.toLowerCase())
    )
    setCodeResult(found || 'not-found')
    if (found) setSelectedIds(prev => new Set(prev).add(found.txId))
  }

  function confirm() {
    if (selectedIds.size === 0) return
    // Alloca in ordine di visualizzazione (più recente prima), fino a coprire nannyAmt;
    // ciò che resta libero su un prelievo NON viene registrato — resta automaticamente
    // disponibile per altri usi (Contanti/altra entry), niente overlap.
    let remaining = nannyAmt
    const allocations = []
    for (const t of atmTxs) {
      if (!selectedIds.has(t.txId)) continue
      if (remaining <= 0.005) break
      const amt = Math.min(t._residuo, remaining)
      if (amt <= 0) continue
      allocations.push({ txId: t.txId, amt: Math.round(amt*100)/100 })
      remaining -= amt
    }
    const recon = { ...getRecon(reconKey) }
    recon[entry.id] = {
      allocations,
      txId:  allocations[0]?.txId || null,   // compat: sync/lookup legacy che leggono .txId
      txAmt: allocations[0]?.amt  || 0,
      nannyAmt,
      contantiAmt: 0,
      split: allocations.length > 1,
      date:  new Date().toISOString(),
    }
    saveRecon(reconKey, recon)
    setSaved(true)
  }

  function removeRecon() {
    const recon = { ...getRecon(reconKey) }
    delete recon[entry.id]
    saveRecon(reconKey, recon)
    setSaved(false)
    setSelectedIds(new Set())
    setCodeResult(null)
    setCodeInput('')
  }

  const thStyle = { padding:'8px 12px', fontSize:10, fontWeight:700, letterSpacing:'.07em',
    textTransform:'uppercase', color:'var(--text3)', background:'var(--surface2)',
    borderBottom:'1px solid var(--border)', textAlign:'left', whiteSpace:'nowrap' }
  const tdStyle = { padding:'8px 12px', fontSize:12, borderBottom:'1px solid var(--border)' }

  if (saved) {
    const r = getRecon(reconKey)[entry.id]
    const allocs = reconAllocations(r)
    return (
      <Modal title={`Riconciliazione salvata — ${entry.mese}`} onClose={onClose} width={520}>
        <div style={{padding:14,background:'var(--green-l,#e8f5e9)',borderRadius:'var(--radius-sm)',marginBottom:16,fontSize:13}}>
          <div style={{fontWeight:700,color:'var(--green)',marginBottom:6}}>✅ Riconciliazione registrata</div>
          {allocs.map(a => {
            const tx = transactions.find(t=>t.txId===a.txId)
            return (
              <div key={a.txId} style={{color:'var(--text2)',marginTop:4}}>
                {tx ? <>Transazione: <strong>{tx.txId}</strong> — {tx.descAI||(tx.description||'').slice(0,32)}</> : a.txId} — usato <strong>€ {fmtIT(a.amt,2)}</strong>
              </div>
            )
          })}
          <div style={{color:'var(--text2)',marginTop:6}}>Importo {entityLabel}: <strong>€ {fmtIT(r.nannyAmt,2)}</strong></div>
          {r.split && (
            <div style={{marginTop:8,padding:'8px 10px',background:'var(--surface2)',borderRadius:6,fontSize:12}}>
              <div style={{fontWeight:700}}>🔀 Coperto da {allocs.length} prelievi diversi</div>
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
            <div style={{fontWeight:700,fontSize:13}}>{reconAllocations(existingRecon).length} prelievo/i</div>
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
            Nessun prelievo ATM disponibile (fino al mese di {entry.mese}).<br/>
            <span style={{fontSize:12}}>Usa la scheda "Inserisci Codice" per assegnare manualmente.</span>
          </div>
        ) : (
          <div style={{maxHeight:280,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:10}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Descrizione</th>
                <th style={{...thStyle,textAlign:'right'}}>Residuo</th>
                <th style={thStyle}></th>
              </tr></thead>
              <tbody>
                {atmTxs.map(t=>{
                  const isSelected = selectedIds.has(t.txId)
                  return (
                    <tr key={t.txId} style={{background:isSelected?'var(--accent-l,#f0f4ff)':'',cursor:'pointer'}} onClick={()=>toggleSelect(t.txId)}>
                      <td style={{...tdStyle,fontFamily:'var(--font-mono)',color:'var(--text3)'}}>{fmtDate(t._effDate||t.date)}</td>
                      <td style={tdStyle}>{t.descAI||(t.description||'').slice(0,38)}</td>
                      <td style={{...tdStyle,textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--red)'}}>
                        € {fmtIT(t._residuo,2)}
                        {t._residuo < Math.abs(t.amount) - 0.01 && (
                          <div style={{fontSize:10,fontWeight:400,color:'var(--text3)'}}>di € {fmtIT(Math.abs(t.amount),2)}</div>
                        )}
                      </td>
                      <td style={{...tdStyle,textAlign:'center'}}>
                        <input type="checkbox" checked={isSelected} onChange={()=>toggleSelect(t.txId)} onClick={e=>e.stopPropagation()}/>
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

      {/* Riepilogo selezione — più prelievi possono coprire insieme il pagamento */}
      <div style={{padding:'12px 14px',background: isCovered?'var(--green-l,#e8f5e9)':'var(--surface2)',borderRadius:'var(--radius-sm)',marginBottom:14,fontSize:13}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>Selezionati: <strong>{selectedTxs.length}</strong> prelievo/i — totale residuo <strong style={{fontFamily:'var(--font-mono)'}}>€ {fmtIT(totalSelected,2)}</strong></span>
          <span style={{fontWeight:700,color:isCovered?'var(--green)':'var(--red)'}}>
            {isCovered ? '✅ Coperto' : `Mancano € ${fmtIT(nannyAmt-totalSelected,2)}`}
          </span>
        </div>
        {isCovered && excess > 0.01 && (
          <div style={{marginTop:6,fontSize:12,color:'var(--text3)'}}>
            🔀 Verrà usato solo il necessario da ciascun prelievo — € {fmtIT(excess,2)} resterà libero per altri usi.
          </div>
        )}
      </div>

      <ModalFooter>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={confirm} disabled={selectedIds.size===0}>
          Conferma riconciliazione
        </button>
      </ModalFooter>
    </Modal>
  )
}

function TimesheetPage({ title, icon, tsKey, addFn, deleteFn, updateFn, defaultRate=10, nameKey, reconKey=NANNY_RECON_KEY }) {
  const store = useStore()
  const entries = store[tsKey] || []
  const transactions = useStore(s=>s.transactions)
  const [showAdd, setShowAdd] = useState(false)
  const [reconEntry, setReconEntry] = useState(null)
  const [prelievoDetailEntry, setPrelievoDetailEntry] = useState(null) // entry per popup data+importo prelievi
  const [expandedPrelievoMese, setExpandedPrelievoMese] = useState(null) // mese espanso nel box Storico Prelievi
  // richiesta utente 2026-07-21: nota per riga via pallino cliccabile (nero se
  // presente), non occupa colonna in tabella — popup con textarea
  const [noteEntry, setNoteEntry] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  // richiesta utente 2026-07-21: modificare righe già aggiunte manualmente —
  // riusa lo stesso modale "Aggiungi Mese", precompilato; editingId!=null → save() aggiorna invece di creare
  const [editingId, setEditingId] = useState(null)
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

  // €/ora precompilato con l'ultimo usato (mese più recente registrato), non un
  // valore fisso — richiesta utente 2026-07-20, vale sia per Nanny che Colf
  function lastUsedRate() {
    if (!entries.length) return defaultRate
    return [...entries].sort((a,b)=>b.mese.localeCompare(a.mese))[0].rate || defaultRate
  }
  function openAdd() {
    setEditingId(null)
    setForm(f => ({ ...f, mese:new Date().toISOString().slice(0,7), ore:'', rate: lastUsedRate() }))
    setShowAdd(true)
  }
  function openEdit(e) {
    setEditingId(e.id)
    setForm({ mese:e.mese, ore:String(e.ore), rate:e.rate||defaultRate, note:e.note||'' })
    setShowAdd(true)
  }

  function save(){
    if(!form.ore) return
    const ore=parseFloat(form.ore), rate=parseFloat(form.rate)||defaultRate
    const totale=ore*rate
    if (editingId != null && updateFn) {
      store[updateFn](editingId, { mese:form.mese, ore, rate, totale, note:form.note })
    } else {
      store[addFn]({ mese:form.mese, ore, rate, totale, note:form.note, pagato:false })
    }
    setShowAdd(false)
    setEditingId(null)
    setForm({ mese:new Date().toISOString().slice(0,7), ore:'', rate, note:'' })
  }

  const yearEntries = entries.filter(e=>e.mese.startsWith(new Date().getFullYear().toString()))
  const totalYear = yearEntries.reduce((s,e)=>s+e.totale,0)

  const StatusIcon=({status})=>status==='ok'?<CheckCircle size={14} color="var(--green)"/>:status==='partial'?<AlertCircle size={14} color="var(--gold)"/>:<XCircle size={14} color="var(--red)"/>

  // Prelievi ATM raggruppati per mese, con residuo post-abbinamento — richiesta
  // utente 2026-07-20: colonna "Prelievi nel mese" in tabella + box storico a destra
  const prelieviByMonth = computePrelieviByMonth(transactions, store)
  const prelieviList = Object.values(prelieviByMonth).sort((a,b)=>b.mese.localeCompare(a.mese))

  return (
    <div style={{padding:'28px 32px',display:'flex',gap:24,alignItems:'flex-start'}}>
    <div style={{flex:1,maxWidth:860,minWidth:0}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600}}>{icon} {displayTitle}</h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>Registro mensile ore, compensi e riconciliazione</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/> Aggiungi Mese</button>
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
        {[['Mesi registrati',entries.length],['Totale anno',`€ ${fmtIT(totalYear, 2)}`],['Media mensile',yearEntries.length?`€ ${fmtIT(totalYear/yearEntries.length, 2)}`:'—']].map(([l,v])=>(
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
              {['Mese','Ore','€/ora','Totale','Riconciliazione','Data Prelievo','Prelievi nel mese','',''].map((h,hi)=>(
                <th key={h+hi} style={{padding:'10px 14px',fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:['Totale','Prelievi nel mese'].includes(h)?'right':'left'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...entries].sort((a,b)=>b.mese.localeCompare(a.mese)).map(e=>{
                const r=reconcileStatus(e,transactions,reconKey)
                const allocs = r.status==='ok' ? reconAllocations(r.recon) : []
                const firstTx = allocs[0] ? transactions.find(t=>t.txId===allocs[0].txId) : null
                const atmDate = firstTx ? (firstTx.date||'').slice(0,10) : null
                const fmtAtmDate = d => {
                  if (!d) return '—'
                  const [,m,day] = d.match(/\d{4}-(\d{2})-(\d{2})/) || []
                  return m ? `${parseInt(day)} ${MESI[parseInt(m)-1]}` : d
                }
                const mesePrelievi = prelieviByMonth[e.mese]
                return (
                  <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 14px',fontWeight:600}}>{e.mese}</td>
                    <td style={{padding:'10px 14px',color:'var(--text3)'}}>{e.ore}h</td>
                    <td style={{padding:'10px 14px',color:'var(--text3)',fontFamily:'var(--font-mono)'}}>€ {fmtIT(e.rate||0,2)}</td>
                    <td style={{padding:'10px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--accent)'}}>€ {fmtIT(e.totale, 2)}</td>
                    <td style={{padding:'10px 14px'}}>
                      <button onClick={()=>setReconEntry(e)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:12,color:'var(--text2)'}}>
                        <StatusIcon status={r.status}/>
                        {r.status==='ok'?'Verificato':r.status==='partial'?`Parziale (€${Math.round(r.found)})`:'Non trovato'}
                      </button>
                    </td>
                    <td style={{padding:'10px 14px',fontSize:12,color:atmDate?'var(--text2)':'var(--text3)',fontFamily:atmDate?'var(--font-mono)':'inherit'}}>
                      {atmDate ? (
                        <button onClick={()=>setPrelievoDetailEntry(e)}
                          title="Clicca per vedere data e importo"
                          style={{border:'none',background:'none',cursor:'pointer',padding:0,fontFamily:'inherit',fontSize:'inherit',color:'inherit'}}>
                          📅 {fmtAtmDate(atmDate)}{allocs.length>1 ? ` +${allocs.length-1}` : ''}
                        </button>
                      ) : '—'}
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:mesePrelievi?'var(--text2)':'var(--text3)'}}
                      title="Somma dei residui prelievi non ancora assegnati, fatti in questo mese">
                      {mesePrelievi ? `€ ${fmtIT(mesePrelievi.totale,0)}` : '—'}
                    </td>
                    <td style={{padding:'10px 6px',textAlign:'center'}}>
                      <button onClick={()=>{setNoteDraft(e.note||''); setNoteEntry(e)}}
                        title={e.note ? e.note : 'Aggiungi nota'}
                        style={{border:'none',background:'none',cursor:'pointer',padding:4,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                        <span style={{display:'inline-block',width:9,height:9,borderRadius:'50%',
                          background:e.note?.trim() ? 'var(--text1,#222)' : 'transparent',
                          border:`1.5px solid ${e.note?.trim() ? 'var(--text1,#222)' : 'var(--border)'}`}}/>
                      </button>
                    </td>
                    <td style={{padding:'6px 10px',whiteSpace:'nowrap'}}>
                      <button className="btn btn-ghost" title="Modifica" onClick={()=>openEdit(e)} style={{marginRight:2}}>✏️</button>
                      <button className="btn btn-ghost" onClick={()=>store[deleteFn](e.id)}><Trash2 size={12}/></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title={editingId!=null ? `✏️ Modifica Mese — ${title}` : `+ Aggiungi Mese — ${title}`} onClose={()=>{setShowAdd(false);setEditingId(null)}}>
          <FormRow label="Mese"><Input type="month" value={form.mese} onChange={e=>set('mese',e.target.value)}/></FormRow>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <FormRow label="Ore lavorate"><Input type="number" value={form.ore} onChange={e=>set('ore',e.target.value)} placeholder="es. 88"/></FormRow>
            <FormRow label="€/ora"><Input type="number" value={form.rate} onChange={e=>set('rate',e.target.value)}/></FormRow>
          </div>
          <FormRow label="Note"><Input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="Opzionale"/></FormRow>
          {form.ore && (
            <div style={{padding:'10px 14px',background:'var(--blue-l)',borderRadius:'var(--radius-sm)',fontSize:13,marginTop:4}}>
              Totale: <strong>€ {fmtIT((parseFloat(form.ore)||0)*(parseFloat(form.rate)||0), 2)}</strong>
            </div>
          )}
          <ModalFooter>
            <button className="btn btn-primary" onClick={save}>{editingId!=null ? 'Salva modifiche' : 'Salva'}</button>
            <button className="btn btn-secondary" onClick={()=>{setShowAdd(false);setEditingId(null)}}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
      {reconEntry && <ReconcileModal entry={reconEntry} transactions={transactions} onClose={()=>setReconEntry(null)} entityLabel={title} reconKey={reconKey}/>}
      {prelievoDetailEntry && (() => {
        const r = reconcileStatus(prelievoDetailEntry, transactions, reconKey)
        const allocs = r.status==='ok' ? reconAllocations(r.recon) : []
        return (
          <Modal title={`Prelievi — ${prelievoDetailEntry.mese}`} onClose={()=>setPrelievoDetailEntry(null)} width={420}>
            {allocs.length === 0 ? (
              <div style={{padding:'10px 4px',fontSize:13,color:'var(--text3)'}}>Nessun prelievo abbinato.</div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr>
                  <th style={{padding:'6px 10px',fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Data</th>
                  <th style={{padding:'6px 10px',fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',textAlign:'right',borderBottom:'1px solid var(--border)'}}>Importo usato</th>
                </tr></thead>
                <tbody>
                  {allocs.map(a => {
                    const tx = transactions.find(t=>t.txId===a.txId)
                    return (
                      <tr key={a.txId} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'6px 10px',fontFamily:'var(--font-mono)',color:'var(--text2)'}}>{tx ? fmtDate(tx._effDate||tx.date) : '—'}</td>
                        <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--red)'}}>€ {fmtIT(a.amt||0,2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <ModalFooter>
              <button className="btn btn-secondary" onClick={()=>setPrelievoDetailEntry(null)}>Chiudi</button>
            </ModalFooter>
          </Modal>
        )
      })()}
      {noteEntry && (
        <Modal title={`Nota — ${noteEntry.mese}`} onClose={()=>setNoteEntry(null)} width={420}>
          <FormRow label="Nota">
            <textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} autoFocus
              placeholder="Scrivi una nota per questo mese…" rows={4}
              style={{width:'100%',padding:'8px 10px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',
                fontSize:13,fontFamily:'var(--font-sans)',background:'var(--bg)',color:'var(--text)',resize:'vertical'}}/>
          </FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={()=>{
              if (updateFn) store[updateFn](noteEntry.id, { note: noteDraft })
              setNoteEntry(null)
            }}>Salva</button>
            <button className="btn btn-secondary" onClick={()=>setNoteEntry(null)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>

      {/* Box laterale — storico prelievi per mese, sfogliabile in verticale.
          Mostra sia l'importo prelevato che il residuo POST abbinamento (quello
          ancora libero) — richiesta utente 2026-07-20 */}
      <aside className="card" style={{width:280,flexShrink:0,position:'sticky',top:20,padding:0,overflow:'hidden'}}>
        <div style={{padding:'12px 14px',borderBottom:'1px solid var(--border)',background:'var(--surface2)'}}>
          <div style={{fontSize:12,fontWeight:700}}>💵 Storico Prelievi</div>
          <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>Importo prelevato e residuo, per mese</div>
        </div>
        {prelieviList.length === 0 ? (
          <div style={{padding:'20px 14px',textAlign:'center',color:'var(--text3)',fontSize:12}}>Nessun prelievo trovato</div>
        ) : (
          <div style={{maxHeight:520,overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',padding:'4px 14px',fontSize:9,fontWeight:700,
              letterSpacing:'.05em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)'}}>
              <span>Mese</span>
              <span style={{display:'flex',gap:14}}><span style={{minWidth:52,textAlign:'right'}}>Importo</span><span style={{minWidth:52,textAlign:'right'}}>Residuo</span></span>
            </div>
            {prelieviList.map(p=>{
              const isExpandable = p.count > 1
              const isOpen = expandedPrelievoMese === p.mese
              return (
                <div key={p.mese} style={{borderBottom:'1px solid var(--border)'}}>
                  <div onClick={()=>isExpandable && setExpandedPrelievoMese(isOpen?null:p.mese)}
                    style={{padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'baseline',
                      cursor:isExpandable?'pointer':'default',userSelect:'none'}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:'var(--text2)',display:'flex',alignItems:'center',gap:4}}>
                        {meseLabel(p.mese)}
                        {isExpandable && <span style={{fontSize:9,opacity:.5}}>{isOpen?'▲':'▼'}</span>}
                      </div>
                      <div style={{fontSize:10,color:'var(--text3)'}}>{p.count} prelievo/i</div>
                    </div>
                    <div style={{display:'flex',gap:14}}>
                      <span style={{minWidth:52,textAlign:'right',fontSize:13,fontWeight:600,fontFamily:'var(--font-mono)',color:'var(--text2)'}}>
                        € {fmtIT(p.importo,0)}
                      </span>
                      <span style={{minWidth:52,textAlign:'right',fontSize:13,fontWeight:700,fontFamily:'var(--font-mono)',color:p.totale>0.01?'var(--red)':'var(--text3)'}}>
                        € {fmtIT(p.totale,0)}
                      </span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{padding:'0 14px 8px 14px',background:'var(--surface2)'}}>
                      {p.items.map(it=>(
                        <div key={it.txId} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',
                          borderTop:'1px solid var(--border)',fontSize:11}}>
                          <span style={{color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{fmtDate(it.date)}</span>
                          <span style={{display:'flex',gap:14}}>
                            <span style={{minWidth:52,textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--text2)'}}>€ {fmtIT(it.importo,0)}</span>
                            <span style={{minWidth:52,textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:it.residuo>0.01?'var(--red)':'var(--text3)'}}>€ {fmtIT(it.residuo,0)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </aside>
    </div>
  )
}

export function NannyPage() { return <TimesheetPage title="Nanny" icon="👩‍🍼" tsKey="nannyTS" addFn="addNannyMonth" deleteFn="deleteNannyMonth" updateFn="updateNannyMonth" defaultRate={12} nameKey="fm-nanny-name" reconKey={NANNY_RECON_KEY}/> }
export function ColfPage()  { return <TimesheetPage title="Colf"  icon="🧹"    tsKey="colfTS"  addFn="addColfMonth"  deleteFn="deleteColfMonth"  updateFn="updateColfMonth"  defaultRate={10} nameKey="fm-colf-name"  reconKey={COLF_RECON_KEY}/> }
