import { useState, useMemo, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { fmtIT } from '../utils/format'
import { CATS, getMergedCats } from '../data/categories'
import { Plus, Trash2, Edit2, Check, X, Link } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

// ── Sati entrate notes + comp links (Firestore via appPrefs) ─
function getSatiNotes() { return useStore.getState()?.appPrefs?.satiNotes || {} }
function saveSatiNotes(d) { useStore.getState()?.setAppPref?.('satiNotes', d) }
function getSatiComp()  { return useStore.getState()?.appPrefs?.satiComp || {} }
function saveSatiComp(d) { useStore.getState()?.setAppPref?.('satiComp', d) }

function SatiNoteCell({ txId }) {
  const [notes, setNotes] = useState(getSatiNotes)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const val = notes[txId] || ''
  function startEdit() { setDraft(val); setEditing(true) }
  function save() {
    const n = {...getSatiNotes(), [txId]: draft}
    saveSatiNotes(n); setNotes(n); setEditing(false)
  }
  if (editing) return (
    <div style={{display:'flex',gap:4,alignItems:'center'}}>
      <input value={draft} onChange={e=>setDraft(e.target.value)} autoFocus
        onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape')setEditing(false)}}
        style={{padding:'3px 7px',border:'1px solid var(--accent)',borderRadius:5,fontSize:12,
          background:'var(--surface)',color:'var(--text)',outline:'none',width:120}}/>
      <button onClick={save} style={{border:'none',background:'none',cursor:'pointer',color:'var(--green)',fontSize:14}}>✓</button>
      <button onClick={()=>setEditing(false)} style={{border:'none',background:'none',cursor:'pointer',color:'var(--text3)',fontSize:14}}>✕</button>
    </div>
  )
  return (
    <div onClick={startEdit} style={{cursor:'text',minWidth:80,fontSize:12,color:val?'var(--text2)':'var(--text3)',
      fontStyle:val?'normal':'italic',padding:'2px 4px',borderRadius:4,
      border:'1px dashed transparent',transition:'border .15s'}}
      onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border)'}
      onMouseLeave={e=>e.currentTarget.style.borderColor='transparent'}>
      {val || 'aggiungi nota...'}
    </div>
  )
}

function SatiCompensaModal({ incomeEntry, transactions, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const [tab, setTab] = useState('list')
  const [search, setSearch] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeResult, setCodeResult] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saved, setSaved] = useState(false)

  const existingLink = getSatiComp()[incomeEntry.txId] || null

  const eligible = useMemo(() => {
    const alreadyLinked = new Set(
      Object.entries(getSatiComp())
        .filter(([id]) => id !== incomeEntry.txId)
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
    if (!selected) return
    const absExp = Math.abs(selected.amount)
    const isFull = absExp <= incomeEntry.amount
    const links = getSatiComp()
    links[incomeEntry.txId] = { expTxId: selected.txId, mode: isFull ? 'full' : 'partial', compensatedAmt: incomeEntry.amount }
    saveSatiComp(links)
    if (isFull) {
      updateTransaction(selected.txId, { excluded: true, _compensatedBy: incomeEntry.txId })
    } else {
      updateTransaction(selected.txId, { _compensatedAmt: incomeEntry.amount, _compensatedBy: incomeEntry.txId })
    }
    setSaved(true)
    setTimeout(onClose, 800)
  }

  function unlink() {
    const links = getSatiComp()
    if (links[incomeEntry.txId]) {
      const expTxId = links[incomeEntry.txId].expTxId
      updateTransaction(expTxId, { excluded: false, _compensatedAmt: undefined, _compensatedBy: undefined })
      delete links[incomeEntry.txId]
      saveSatiComp(links)
    }
    onClose()
  }

  const preview = selected ? (() => {
    const absExp = Math.abs(selected.amount)
    if (absExp <= incomeEntry.amount) return { type:'full', msg:`✅ Spesa completamente coperta — verrà esclusa dalle statistiche` }
    return { type:'partial', msg:`⚠️ Compensazione parziale — ridotta di €${incomeEntry.amount.toLocaleString('it-IT',{minimumFractionDigits:2})}` }
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
        <div style={{padding:'10px 14px',background:'var(--green-l)',border:'1px solid var(--green)',borderRadius:8,marginBottom:14,fontSize:12}}>
          <strong>Entrata:</strong> {incomeEntry.descAI||incomeEntry.description?.slice(0,50)} —
          <strong style={{color:'var(--green)'}}> +€ {incomeEntry.amount.toLocaleString('it-IT',{minimumFractionDigits:2})}</strong>
          <span style={{color:'var(--text3)',marginLeft:8,fontSize:11}}>Mostrate tx con importo ≥ €{(incomeEntry.amount-1).toLocaleString('it-IT',{minimumFractionDigits:0})}</span>
        </div>
        {existingLink && (
          <div style={{padding:'8px 12px',background:'var(--accent-l)',borderRadius:8,marginBottom:10,fontSize:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span>🔗 Abbinamento già presente</span>
            <button className="btn btn-ghost" style={{fontSize:11,color:'var(--red)'}} onClick={unlink}>✕ Rimuovi</button>
          </div>
        )}
        <div style={{display:'flex',gap:2,marginBottom:12,background:'var(--surface2)',borderRadius:8,padding:3}}>
          {[['list','📋 Seleziona da lista'],['code','🔍 Cerca per codice']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,padding:'6px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:13,fontWeight:tab===t?700:400,
              background:tab===t?'var(--surface)':'transparent',color:tab===t?'var(--text)':'var(--text3)',
            }}>{l}</button>
          ))}
        </div>
        {tab === 'list' && (
          <>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filtra per descrizione..." autoFocus
              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--border)',borderRadius:6,
                fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)',boxSizing:'border-box',marginBottom:8}}/>
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
                      <tr key={t.txId} onClick={()=>setSelected(t)} style={{borderBottom:'1px solid var(--border)',cursor:'pointer',background:isSel?'var(--accent-l)':'transparent'}}>
                        <td style={{padding:'6px 10px',fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{(t._effDate||(t._effDate||t.date||'')).slice(5).replace('-','/')}</td>
                        <td style={{padding:'6px 10px',fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.descAI||t.description?.slice(0,40)}</td>
                        <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,color:t.amount>0?'var(--green)':'var(--red)'}}>
                          {t.amount>0?'+':'−'}€ {absAmt.toLocaleString('it-IT',{minimumFractionDigits:2})}
                        </td>
                        <td style={{padding:'6px 10px',textAlign:'center',fontSize:14}}>{isFull ? '✅' : '⚠️'}</td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && <tr><td colSpan={4} style={{padding:16,textAlign:'center',color:'var(--text3)',fontSize:12}}>Nessuna transazione nell'intervallo</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'code' && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:10}}>Inserisci il codice transazione o parte della descrizione:</div>
            <div style={{display:'flex',gap:8}}>
              <input value={codeInput} onChange={e=>setCodeInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&searchByCode()}
                placeholder="Es. 24-000123 o descrizione..."
                style={{flex:1,padding:'8px 12px',border:'1px solid var(--border)',borderRadius:6,
                  fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}
                autoFocus/>
              <button className="btn btn-primary" onClick={searchByCode}>Cerca</button>
            </div>
            {codeResult === 'not-found' && <div style={{marginTop:10,padding:'8px 12px',background:'var(--red-l)',borderRadius:6,fontSize:12,color:'var(--red)'}}>Nessuna transazione trovata</div>}
            {codeResult && codeResult !== 'not-found' && (
              <div onClick={()=>setSelected(codeResult)} style={{marginTop:10,padding:'10px 14px',borderRadius:8,cursor:'pointer',border:`2px solid ${selected?.txId===codeResult.txId?'var(--accent)':'var(--border)'}`,background:selected?.txId===codeResult.txId?'var(--accent-l)':'var(--surface2)'}}>
                <div style={{fontSize:13,fontWeight:600}}>{codeResult.descAI||codeResult.description?.slice(0,50)}</div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{codeResult.date} · € {Math.abs(codeResult.amount).toLocaleString('it-IT',{minimumFractionDigits:2})} · {codeResult.txId}</div>
              </div>
            )}
          </div>
        )}
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

// ── helpers ───────────────────────────────────────────────
function nowYM() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`
}
function addMonth(ym, n=1) {
  let [y,m] = ym.split('-').map(Number)
  m += n
  while(m > 12){ m -= 12; y++ }
  while(m < 1){ m += 12; y-- }
  return `${y}-${String(m).padStart(2,'0')}`
}
function monthsRange(startYM, endYM) {
  const list = [], end = endYM || nowYM()
  let cur = startYM, i = 0
  while(cur <= end && i++ < 48){ list.push(cur); cur = addMonth(cur) }
  return list
}
const MONTH_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function ymLabel(ym) {
  const [y,m] = ym.split('-').map(Number)
  return `${MONTH_IT[m-1]} ${String(y).slice(2)}`
}
function uid() { return Math.random().toString(36).slice(2,9) }

// ── L1 / L2 pickers (categorie Satispay) ─────────────────
// Shared hook: returns merged cats (base + custom from Settings)
function useMergedCats() {
  const customCats = useStore(s => s.customCats)
  return useMemo(() => getMergedCats(customCats), [customCats])
}

const PICKER_STYLE = {
  padding:'2px 4px',borderRadius:4,border:'1px solid var(--border)',
  background:'var(--surface)',fontSize:10,fontFamily:'var(--font-sans)',
  cursor:'pointer',
}

function L1Picker({ value, onChange }) {
  const allCats = useMergedCats()
  return (
    <select value={value||''} onChange={e=>onChange(e.target.value)}
      style={{...PICKER_STYLE, color:value?'var(--text2)':'var(--text3)'}}>
      <option value="">— L1 —</option>
      {Object.keys(allCats)
        .filter(k=>k!=='Non Categorizzato')
        .map(l1=><option key={l1} value={l1}>{l1}</option>)}
    </select>
  )
}

function L2Picker({ l1, value, onChange }) {
  const allCats = useMergedCats()
  const subs = l1 ? (allCats[l1]?.sub||[]) : []
  if (!l1 || subs.length===0) return (
    <span style={{fontSize:11,color:'var(--text3)',paddingLeft:4}}>—</span>
  )
  return (
    <select value={value||''} onChange={e=>onChange(e.target.value)}
      style={{...PICKER_STYLE, color:value?'var(--text2)':'var(--text3)'}}>
      <option value="">— L2 —</option>
      {subs.map(l2=><option key={l2} value={l2}>{l2}</option>)}
    </select>
  )
}

// Legacy single-picker (kept for AltreSpesePot coloring — not used in FundCard)
function CategoryPicker({ value, onChange }) {
  const allCats = useMergedCats()
  return (
    <select value={value||''} onChange={e=>onChange(e.target.value)}
      style={{...PICKER_STYLE, color:value?'var(--text2)':'var(--text3)', maxWidth:140}}>
      <option value="">— nessuna —</option>
      {Object.entries(allCats)
        .filter(([k])=>k!=='Non Categorizzato')
        .map(([l1,info])=>(
          <optgroup key={l1} label={l1}>
            <option value={l1}>{l1}</option>
            {(info.sub||[]).map(l2=>(
              <option key={l2} value={`${l1} › ${l2}`}>{l2}</option>
            ))}
          </optgroup>
        ))}
    </select>
  )
}

// Migrate old voce format ({ label, cat }) → new ({ cat1, cat2 })
function migrateVoce(v) {
  if (v.cat1 !== undefined) return v
  if (v.cat) {
    const [l1, l2=''] = v.cat.split(' › ')
    return { id: v.id, cat1: l1||'', cat2: l2 }
  }
  return { id: v.id, cat1: '', cat2: '' }
}

// ── Add/Edit pot modal ────────────────────────────────────
function PotFormModal({ pot, onClose }) {
  const { addSatiPot, updateSatiPot } = useStore()
  const [form, setForm] = useState({
    name:    pot?.name    || '',
    icon:    pot?.icon    || '💰',
    startYM: pot?.startYM || nowYM(),
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function save() {
    if (!form.name) return
    if (pot) {
      updateSatiPot(pot.id, { name: form.name, icon: form.icon, startYM: form.startYM })
    } else {
      addSatiPot({
        ...form,
        voci: [{ id: uid(), label: 'Versamento mensile' }],
        data: {},
      })
    }
    onClose()
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
      display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'28px 30px',width:380,
        boxShadow:'0 16px 48px rgba(0,0,0,.2)'}}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:20}}>
          {pot ? '✏️ Modifica Fondo' : '+ Nuovo Fondo Satispay'}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'64px 1fr',gap:12,marginBottom:14,alignItems:'end'}}>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',display:'block',marginBottom:5}}>Icona</label>
            <input value={form.icon} onChange={e=>set('icon',e.target.value)} maxLength={2}
              style={{width:'100%',padding:'8px',borderRadius:8,border:'1px solid var(--border)',
                background:'var(--bg)',color:'var(--text)',fontSize:22,textAlign:'center',
                fontFamily:'var(--font-sans)'}}/>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',display:'block',marginBottom:5}}>Nome fondo</label>
            <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="es. Cecilia, Fondo Spese"
              style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',
                background:'var(--bg)',color:'var(--text)',fontSize:14,fontFamily:'var(--font-sans)'}}/>
          </div>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',display:'block',marginBottom:5}}>Mese di inizio</label>
          <input type="month" value={form.startYM} onChange={e=>set('startYM',e.target.value)}
            style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',
              background:'var(--bg)',color:'var(--text)',fontSize:14,fontFamily:'var(--font-sans)'}}/>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={save} disabled={!form.name}>Salva</button>
        </div>
      </div>
    </div>
  )
}

// ── Abbina modal (multi-select, delta può andare a un altro fondo) ────
function AbbinaModal({ pot, ym, currentLinked, onClose, onLink, allPots, onLinkOther }) {
  const { transactions } = useStore()

  const initSelected = useMemo(() => {
    if (!currentLinked) return new Set()
    return new Set(Array.isArray(currentLinked) ? currentLinked : [currentLinked])
  }, [])

  const [selected, setSelected]         = useState(initSelected)
  const [deltaFondoId, setDeltaFondoId] = useState('')  // altro fondo per il delta

  const linkedTxIds = useMemo(() => new Set(
    Object.entries(pot.data||{})
      .filter(([m,d]) => m !== ym && d?.linked)
      .flatMap(([,d]) => Array.isArray(d.linked) ? d.linked : [d.linked])
  ), [pot.data, ym])

  const candidates = useMemo(()=>
    transactions.filter(t=>
      !t.excluded &&
      t.amount < 0 &&
      (t._effDate||(t._effDate||t.date||'')).startsWith(ym) &&
      !linkedTxIds.has(t.txId) &&
      (
        (t.merchant||'').toLowerCase().includes('satispay') ||
        (t.description||'').toLowerCase().includes('satispay') ||
        (t.cat1||'').toLowerCase().includes('satispay')
      )
    ).sort((a,b)=>a.amount-b.amount)
  , [transactions, ym, linkedTxIds])

  const totalCell = useMemo(()=>{
    const voci = pot.voci||[]
    const cells = pot.data?.[ym]?.cells || {}
    return voci.reduce((s,v)=> s + (parseFloat(cells[v.id])||0), 0)
  }, [pot, ym])

  const selectedTotal = useMemo(()=>
    candidates.filter(t=>selected.has(t.txId)).reduce((s,t)=>s+Math.abs(t.amount),0)
  , [candidates, selected])

  const delta = selectedTotal - totalCell

  // Other pots with their monthly total for this ym
  const otherPots = useMemo(()=>
    (allPots||[])
      .filter(p => p.id !== pot.id)
      .map(p => {
        const voci  = p.voci || []
        const cells = p.data?.[ym]?.cells || {}
        const total = voci.reduce((s,v) => s + (parseFloat(cells[v.id])||0), 0)
        return { ...p, monthTotal: total }
      })
      .filter(p => p.monthTotal > 0)
  , [allPots, pot.id, ym])

  const selectedOtherPot = otherPots.find(p => p.id === deltaFondoId)
  const deltaMatchesOther = selectedOtherPot
    ? Math.abs(delta - selectedOtherPot.monthTotal) < 0.01
    : false

  const deltaOk = Math.abs(delta) < 0.01 || (delta > 0 && deltaMatchesOther)

  function toggleTx(txId) {
    setSelected(prev=>{
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId); else next.add(txId)
      return next
    })
  }

  function confirm() {
    if (!deltaOk) return
    const txIds = [...selected]
    // Link to this pot
    if (txIds.length === 0) { onLink(null, null) }
    else { onLink(txIds.length === 1 ? txIds[0] : txIds, totalCell) }
    // If delta assigned to another pot, link same txs there too
    if (delta > 0 && deltaMatchesOther && selectedOtherPot && onLinkOther) {
      const txIdsForOther = txIds.length === 1 ? txIds[0] : txIds
      onLinkOther(selectedOtherPot.id, ym, txIdsForOther, selectedOtherPot.monthTotal)
    }
    onClose()
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
      display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'24px 28px',width:540,
        maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 16px 48px rgba(0,0,0,.2)'}}>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:800}}>🔗 Abbina transazioni — {ymLabel(ym)}</div>
          <button onClick={onClose} style={{border:'none',background:'transparent',cursor:'pointer',
            fontSize:18,color:'var(--text3)'}}>✕</button>
        </div>

        {/* Delta bar */}
        <div style={{display:'flex',gap:16,alignItems:'center',padding:'10px 14px',borderRadius:8,
          marginBottom: delta > 0 && !deltaOk ? 8 : 14, fontSize:12,
          background: deltaOk ? 'var(--green-l)' : delta > 0 ? 'rgba(245,158,11,.08)' : 'rgba(200,80,80,.08)',
          border: `1px solid ${deltaOk ? 'var(--green)' : delta > 0 ? '#f59e0b' : 'var(--red)'}`,
          transition:'background .2s,border .2s'}}>
          <div>
            <span style={{color:'var(--text3)'}}>Totale voci: </span>
            <strong style={{fontFamily:'var(--font-mono)'}}>€ {fmtIT(totalCell,2)}</strong>
          </div>
          <div>
            <span style={{color:'var(--text3)'}}>Selezionate: </span>
            <strong style={{fontFamily:'var(--font-mono)'}}>€ {fmtIT(selectedTotal,2)}</strong>
          </div>
          <div style={{marginLeft:'auto',fontWeight:800,fontFamily:'var(--font-mono)',
            color: deltaOk ? 'var(--green)' : delta > 0 ? '#f59e0b' : 'var(--red)'}}>
            {deltaOk && Math.abs(delta) < 0.01
              ? '✅ Delta = 0'
              : deltaOk && delta > 0
                ? `✅ Delta coperto da ${selectedOtherPot?.name}`
                : `Delta ${delta > 0 ? '+' : ''}€ ${fmtIT(delta,2)}`}
          </div>
        </div>

        {/* Delta → altro fondo (appare solo se delta > 0 e ci sono altri fondi) */}
        {delta > 0 && otherPots.length > 0 && (
          <div style={{marginBottom:12,padding:'10px 14px',borderRadius:8,
            background:'rgba(245,158,11,.06)',border:'1px solid #f59e0b44',fontSize:12}}>
            <div style={{fontWeight:700,marginBottom:8,color:'#b45309'}}>
              💡 Il delta +€ {fmtIT(delta,2)} va a un altro fondo?
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <select value={deltaFondoId} onChange={e=>setDeltaFondoId(e.target.value)}
                style={{flex:1,padding:'6px 10px',borderRadius:7,border:'1px solid var(--border)',
                  background:'var(--surface)',fontSize:12,fontFamily:'var(--font-sans)',
                  color:'var(--text)',outline:'none'}}>
                <option value="">— Seleziona fondo —</option>
                {otherPots.map(p=>(
                  <option key={p.id} value={p.id}>
                    {p.icon||'💰'} {p.name} — accantonamento {ymLabel(ym)}: € {fmtIT(p.monthTotal,2)}
                    {Math.abs(delta - p.monthTotal) < 0.01 ? ' ✅' : ''}
                  </option>
                ))}
              </select>
            </div>
            {deltaFondoId && !deltaMatchesOther && (
              <div style={{marginTop:6,fontSize:11,color:'var(--red)'}}>
                ⚠ Il delta (€ {fmtIT(delta,2)}) non corrisponde all'accantonamento di quel fondo
                per {ymLabel(ym)} (€ {fmtIT(selectedOtherPot?.monthTotal||0,2)}).
              </div>
            )}
            {deltaMatchesOther && (
              <div style={{marginTop:6,fontSize:11,color:'var(--green)',fontWeight:600}}>
                ✅ Corrisponde! Le stesse transazioni saranno abbinate anche a "{selectedOtherPot.name}".
              </div>
            )}
          </div>
        )}

        {/* Candidates list */}
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:4,marginBottom:12}}>
          {candidates.length===0
            ? <div style={{textAlign:'center',padding:24,color:'var(--text3)',fontSize:13}}>
                Nessuna transazione Satispay trovata per {ymLabel(ym)}.
              </div>
            : candidates.map(t=>{
              const amt = Math.abs(t.amount)
              const isSel = selected.has(t.txId)
              return (
                <div key={t.txId} onClick={()=>toggleTx(t.txId)}
                  style={{display:'flex',alignItems:'center',gap:10,
                    padding:'9px 12px',borderRadius:8,cursor:'pointer',
                    border:`1px solid ${isSel?'var(--accent)':'var(--border)'}`,
                    background:isSel?'var(--accent-l)':'var(--surface)',
                    transition:'background .1s'}}>
                  <input type="checkbox" checked={isSel} onChange={()=>toggleTx(t.txId)}
                    onClick={e=>e.stopPropagation()}
                    style={{accentColor:'var(--accent)',width:15,height:15,cursor:'pointer',flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {t.descAI || (t.description||'').slice(0,50)}
                    </div>
                    <div style={{fontSize:11,color:'var(--text3)'}}>{t._effDate||t.date}</div>
                  </div>
                  <div style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:13,
                    color:isSel?'var(--accent)':'var(--text)',flexShrink:0}}>
                    € {fmtIT(amt,2)}
                  </div>
                </div>
              )
            })
          }
        </div>

        {/* Footer actions */}
        <div style={{display:'flex',gap:8,justifyContent:'space-between',alignItems:'center',
          borderTop:'1px solid var(--border)',paddingTop:12}}>
          <button className="btn btn-ghost" style={{color:'var(--red)',fontSize:12}}
            onClick={()=>{onLink(null,null);onClose()}}>
            ✕ Rimuovi abbinamento
          </button>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
            <button className="btn btn-primary" onClick={confirm}
              disabled={selected.size===0||!deltaOk}
              title={!deltaOk
                ? delta > 0
                  ? `Seleziona un altro fondo per il delta di € ${fmtIT(delta,2)}`
                  : `Il delta deve essere 0 (attuale: €${fmtIT(delta,2)})`
                : 'Conferma abbinamento'}>
              Conferma abbinamento
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Editable cell ─────────────────────────────────────────
function EditCell({ value, onChange, style={} }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef()

  function start() {
    setDraft(value!=null&&value!==0 ? String(value) : '')
    setEditing(true)
    setTimeout(()=>ref.current?.select(),0)
  }
  function commit() {
    const n = parseFloat(draft.replace(',','.'))
    onChange(isNaN(n)?0:n)
    setEditing(false)
  }

  if (editing) return (
    <input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(false)}}
      style={{width:'100%',padding:'1px 3px',border:'1px solid var(--accent)',borderRadius:4,
        background:'var(--bg)',color:'var(--text)',fontSize:11,fontFamily:'var(--font-mono)',
        textAlign:'right',outline:'none',...style}}/>
  )
  return (
    <div onClick={start} title="Clicca per modificare"
      style={{cursor:'text',padding:'1px 2px',borderRadius:4,textAlign:'right',
        fontFamily:'var(--font-mono)',fontSize:11,color:value?'var(--text)':'var(--text3)',
        background:'transparent',whiteSpace:'nowrap',...style}}>
      {value ? fmtIT(value,0) : <span style={{opacity:.35}}>—</span>}
    </div>
  )
}

// ── Fund chart — stacked bar by L1 category ──────────────
const CAT_COLORS = ['#e07b3a','#4a90d9','#2a7a4a','#9b59b6','#c8780a','#e74c3c','#1abc9c','#f39c12']

function FundChart({ pot }) {
  const months = monthsRange(pot.startYM||nowYM()).slice(-12)
  const voci = (pot.voci||[]).map(migrateVoce)

  // Unique L1s (in order of first appearance)
  const l1s = useMemo(()=>[...new Set(voci.map(v=>v.cat1||'—').filter(l=>l!=='—'))], [pot.voci])

  const chartData = months.map(ym=>{
    const cells = pot.data?.[ym]?.cells || {}
    const entry = { label: ymLabel(ym) }
    l1s.forEach(l1=>{
      entry[l1] = voci.filter(v=>(v.cat1||'—')===l1).reduce((s,v)=>s+(parseFloat(cells[v.id])||0),0)
    })
    return entry
  })

  if (l1s.length === 0) return null

  return (
    <div>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={chartData} margin={{top:4,right:4,bottom:0,left:0}} barSize={48} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
          <XAxis dataKey="label" tick={{fontSize:9,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
          <YAxis hide/>
          <Tooltip formatter={(v,name)=>[`€ ${fmtIT(v,0)}`, name]}
            contentStyle={{fontSize:10,border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px'}}/>
          {l1s.map((l1,i)=>(
            <Bar key={l1} dataKey={l1} stackId="a"
              fill={CATS[l1]?.color || CAT_COLORS[i % CAT_COLORS.length]}
              radius={i===l1s.length-1?[3,3,0,0]:[0,0,0,0]}/>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:4,paddingLeft:4}}>
        {l1s.map((l1,i)=>(
          <div key={l1} style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:10,height:10,borderRadius:2,flexShrink:0,
              background:CATS[l1]?.color||CAT_COLORS[i%CAT_COLORS.length]}}/>
            <span style={{fontSize:10,color:'var(--text3)',fontWeight:600}}>{l1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Recon Rules Modal ─────────────────────────────────────
const RECON_FIELDS = [
  { value: 'merchant',    label: 'Merchant' },
  { value: 'description', label: 'Descrizione' },
  { value: 'descAI',      label: 'Descrizione AI' },
]
const RECON_OPS = [
  { value: 'contains',    label: 'contiene' },
  { value: 'equals',      label: 'uguale a' },
  { value: 'startsWith',  label: 'inizia con' },
]

function ReconRulesModal({ pot, onClose, onSave }) {
  const [rules, setRules] = useState(()=>(pot.reconRules||[]).map(r=>({...r})))

  function addRule() {
    setRules(rs=>[...rs, { id: uid(), field:'merchant', op:'contains', value:'' }])
  }
  function removeRule(id) {
    setRules(rs=>rs.filter(r=>r.id!==id))
  }
  function updateRule(id, patch) {
    setRules(rs=>rs.map(r=>r.id===id?{...r,...patch}:r))
  }
  function handleSave() {
    onSave(rules)
    onClose()
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.5)',
      display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'28px 30px',
        maxWidth:520,width:'94%',boxShadow:'0 16px 48px rgba(0,0,0,.25)'}}>

        <div style={{fontSize:17,fontWeight:800,marginBottom:4}}>⚙ Regole abbinamento automatico</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:18,lineHeight:1.5}}>
          Definisci le condizioni per abbinare automaticamente una transazione a questo fondo.
          Il sistema cerca una tx nello stesso mese con importo corrispondente (±€1) che soddisfa <strong>tutte</strong> le regole.
        </div>

        {/* Rules list */}
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
          {rules.length === 0 && (
            <div style={{fontSize:12,color:'var(--text3)',fontStyle:'italic',
              padding:'12px',border:'1px dashed var(--border)',borderRadius:8,textAlign:'center'}}>
              Nessuna regola — verrà usato il match automatico Satispay
            </div>
          )}
          {rules.map(rule=>(
            <div key={rule.id} style={{display:'flex',alignItems:'center',gap:6,
              padding:'8px 10px',background:'var(--surface2)',borderRadius:8,
              border:'1px solid var(--border)'}}>
              {/* Field */}
              <select value={rule.field} onChange={e=>updateRule(rule.id,{field:e.target.value})}
                style={{padding:'5px 7px',borderRadius:6,border:'1px solid var(--border)',
                  fontSize:12,background:'var(--surface)',color:'var(--text)',flex:'0 0 auto'}}>
                {RECON_FIELDS.map(f=>(
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              {/* Op */}
              <select value={rule.op} onChange={e=>updateRule(rule.id,{op:e.target.value})}
                style={{padding:'5px 7px',borderRadius:6,border:'1px solid var(--border)',
                  fontSize:12,background:'var(--surface)',color:'var(--text)',flex:'0 0 auto'}}>
                {RECON_OPS.map(o=>(
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {/* Value */}
              <input value={rule.value} onChange={e=>updateRule(rule.id,{value:e.target.value})}
                placeholder='es. satispay'
                style={{flex:1,padding:'5px 8px',borderRadius:6,
                  border:`1px solid ${rule.value?'var(--accent)':'var(--border)'}`,
                  fontSize:12,background:'var(--bg)',color:'var(--text)',outline:'none'}}/>
              {/* Remove */}
              <button onClick={()=>removeRule(rule.id)}
                style={{border:'none',background:'transparent',cursor:'pointer',
                  color:'var(--text3)',padding:3,display:'flex',alignItems:'center'}}>
                <X size={13}/>
              </button>
            </div>
          ))}
        </div>

        {/* Add condition */}
        <button onClick={addRule}
          style={{border:'1px dashed var(--accent)',background:'transparent',
            color:'var(--accent)',cursor:'pointer',borderRadius:7,padding:'6px 14px',
            fontSize:12,fontWeight:700,marginBottom:20,width:'100%'}}>
          + Aggiungi condizione
        </button>

        {/* Actions */}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={handleSave}>Salva regole</button>
        </div>

        <div style={{fontSize:11,color:'var(--text3)',marginTop:14,lineHeight:1.5}}>
          Se non ci sono regole, l'abbinamento automatico cerca transazioni con descrizione contenente "satispay" e importo identico.
        </div>
      </div>
    </div>
  )
}

// ── Auto-match helper: find a subset of txs summing exactly to target ──
function findExactSubset(txs, target) {
  const n = txs.length
  if (n === 0 || n > 20) return null
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0; const ids = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) { sum += Math.abs(txs[i].amount); ids.push(txs[i].txId) }
    }
    if (Math.abs(sum - target) < 0.01) return ids
  }
  return null
}

// ── Fund card ─────────────────────────────────────────────
function FundCard({ pot, allPots }) {
  const { updateSatiPot, deleteSatiPot, transactions, updateTransaction } = useStore()
  const [showEdit, setShowEdit]             = useState(false)
  const [abbina, setAbbina]                 = useState(null)
  const [showReconRules, setShowReconRules] = useState(false)
  const [dragOver, setDragOver]             = useState(null)
  const [hoveredCol, setHoveredCol]         = useState(null)
  const dragIdx = useRef(null)

  const voci    = (pot.voci || []).map(migrateVoce)
  const allYMs  = monthsRange(pot.startYM || nowYM())
  const now     = nowYM()

  // Year navigation — always include current year even if not all months have data yet
  const availYears = useMemo(()=>{
    const years = new Set(allYMs.map(ym=>parseInt(ym.split('-')[0])))
    years.add(new Date().getFullYear())
    return [...years].sort()
  }, [allYMs])
  const [viewYear, setViewYear] = useState(()=>new Date().getFullYear())

  // Always show all 12 months of selected year (from pot.startYM onwards, future months dimmed)
  const visYMs = useMemo(()=>
    Array.from({length:12},(_,i)=>`${viewYear}-${String(i+1).padStart(2,'0')}`)
      .filter(ym => ym >= (pot.startYM || nowYM()))
  , [viewYear, pot.startYM])

  // Cumulated expected (sum of cells, any month up to now)
  const totalAcc = useMemo(()=>{
    return allYMs.filter(m=>m<=now).reduce((s,ym)=>{
      const cells = pot.data?.[ym]?.cells || {}
      return s + voci.reduce((vs,v)=>vs+(parseFloat(cells[v.id])||0),0)
    }, 0)
  }, [pot, allYMs, voci, now])

  // Per-month cell total
  function monthTotal(ym) {
    const cells = pot.data?.[ym]?.cells || {}
    return voci.reduce((s,v)=>s+(parseFloat(cells[v.id])||0),0)
  }

  // Reconciliation status per month
  function reconcStatus(ym) {
    const linked = pot.data?.[ym]?.linked
    if (linked) {
      const linkedAmt = pot.data?.[ym]?.linkedAmt
      const mt = monthTotal(ym)
      const exact = linkedAmt!=null ? Math.abs(linkedAmt-mt)<0.01 : true
      return { linked, exact }
    }
    const mt = monthTotal(ym)
    if (mt <= 0) return null

    // Custom recon rules auto-match
    const reconRules = pot.reconRules || []
    if (reconRules.length > 0) {
      const match = transactions.find(t => {
        if (t.excluded || t.amount >= 0) return false
        if (!(t._effDate||(t._effDate||t.date||'')).startsWith(ym)) return false
        if (Math.abs(Math.abs(t.amount)-mt) >= 1) return false // within €1
        return reconRules.every(r => {
          const hay = ((t[r.field] || t.description || '')).toLowerCase()
          const val = (r.value||'').toLowerCase()
          if (!val) return true
          if (r.op === 'equals')     return hay === val
          if (r.op === 'startsWith') return hay.startsWith(val)
          return hay.includes(val) // 'contains' (default)
        })
      })
      if (match) return { linked: match.txId, exact: true, auto: true }
    }

    // Fallback: Satispay tx with exact amount
    const match = transactions.find(t=>
      !t.excluded && t.amount<0 &&
      (t._effDate||(t._effDate||t.date||'')).startsWith(ym) &&
      Math.abs(Math.abs(t.amount)-mt)<0.01 &&
      ((t.merchant||'').toLowerCase().includes('satispay')||
       (t.description||'').toLowerCase().includes('satispay'))
    )
    return match ? { linked: match.txId, exact: true, auto: true } : null
  }

  // ── Auto-match: learn from past linked txs, find exact subset per unlinked month ──
  // suggestion value: txIds[] (single-pot) | { txIds, otherPotId, otherAmt } (multi-pot)
  const autoSuggestions = useMemo(() => {
    const suggestions = {}

    // Learn account numbers from all past manual links for this pot
    const learnedAccounts = new Set()
    Object.entries(pot.data || {}).forEach(([, entry]) => {
      if (!entry?.linked) return
      const ids = Array.isArray(entry.linked) ? entry.linked : [entry.linked]
      ids.forEach(id => {
        const tx = transactions.find(t => t.txId === id)
        if (tx?.account) learnedAccounts.add(tx.account)
      })
    })

    // Use allYMs (all months from pot start to today) so past years are included
    allYMs.filter(ym => ym <= now).forEach(ym => {
      if (pot.data?.[ym]?.linked) return // already linked
      const mt = monthTotal(ym)
      if (mt <= 0) return

      // Exclude txs linked to this pot in other months
      const linkedOther = new Set(
        Object.entries(pot.data || {})
          .filter(([m, d]) => m !== ym && d?.linked)
          .flatMap(([, d]) => Array.isArray(d.linked) ? d.linked : [d.linked])
      )

      let candidates = transactions.filter(t =>
        !t.excluded && t.amount < 0 &&
        ((t._effDate||t.date||'')).startsWith(ym) &&
        !linkedOther.has(t.txId) &&
        (
          (t.merchant || '').toLowerCase().includes('satispay') ||
          (t.description || '').toLowerCase().includes('satispay')
        )
      )

      // Narrow by learned account fingerprint if available
      if (learnedAccounts.size > 0) {
        const narrowed = candidates.filter(t => learnedAccounts.has(t.account))
        if (narrowed.length > 0) candidates = narrowed
      }

      // 1. Try single-pot exact match
      const match = findExactSubset(candidates, mt)
      if (match) { suggestions[ym] = match; return }

      // 2. Try multi-pot: this pot + one other unlinked pot whose combined total matches
      const otherOptions = (allPots || [])
        .filter(p => p.id !== pot.id && !p.data?.[ym]?.linked)
        .map(p => {
          const voci = p.voci || []
          const cells = p.data?.[ym]?.cells || {}
          const total = voci.reduce((s, v) => s + (parseFloat(cells[v.id]) || 0), 0)
          return { id: p.id, monthTotal: total }
        })
        .filter(p => p.monthTotal > 0)

      for (const other of otherOptions) {
        const combined = findExactSubset(candidates, mt + other.monthTotal)
        if (combined) {
          suggestions[ym] = { txIds: combined, otherPotId: other.id, otherAmt: other.monthTotal }
          break
        }
      }
    })

    return suggestions
  }, [pot.data, transactions, allYMs, allPots, now]) // eslint-disable-line react-hooks/exhaustive-deps

  function autoLinkAll() {
    Object.entries(autoSuggestions).forEach(([ym, match]) => {
      const mt = monthTotal(ym)
      const txIds = Array.isArray(match) ? match : match.txIds
      const txArg = txIds.length === 1 ? txIds[0] : txIds
      linkMonth(ym, txArg, mt)
      if (!Array.isArray(match) && match.otherPotId) {
        linkOtherPot(match.otherPotId, ym, txArg, match.otherAmt)
      }
    })
  }

  function setCell(ym, voceId, val) {
    const prev  = pot.data?.[ym] || {}
    const cells = { ...(prev.cells||{}), [voceId]: val }
    updateSatiPot(pot.id, { data:{ ...(pot.data||{}), [ym]:{ ...prev, cells } } })
  }

  function copyColumn(fromYm, toYm) {
    if (!toYm) return
    const fromCells = pot.data?.[fromYm]?.cells || {}
    const prev = pot.data?.[toYm] || {}
    updateSatiPot(pot.id, { data: {
      ...(pot.data||{}),
      [toYm]: { ...prev, cells: { ...fromCells } }
    }})
  }

  // Compute per-voce category splits for a reconciled month
  function computeSatiSplits(ym, txAmt, totalLinkedAmt) {
    const voci = (pot.voci||[])
    const cells = pot.data?.[ym]?.cells || {}
    const ratio = totalLinkedAmt > 0 ? Math.abs(txAmt) / totalLinkedAmt : 1
    return voci
      .filter(v => v.cat1 && v.cat2)
      .map(v => ({
        cat1: v.cat1,
        cat2: v.cat2,
        amount: Math.round((parseFloat(cells[v.id])||0) * ratio * 100) / 100
      }))
      .filter(s => s.amount > 0)
  }

  function linkMonth(ym, txIds, amt) {
    // Save the link on the pot
    const prev = pot.data?.[ym] || {}
    updateSatiPot(pot.id, { data:{
      ...(pot.data||{}),
      [ym]: { ...prev, linked: txIds, linkedAmt: amt }
    }})

    // Auto-generate category splits on linked transactions
    const txIdArr = Array.isArray(txIds) ? txIds : (txIds ? [txIds] : [])
    const totalAmt = amt || 0
    txIdArr.forEach(txId => {
      const tx = transactions.find(t => t.txId === txId)
      if (!tx) return
      const splits = computeSatiSplits(ym, tx.amount, totalAmt)
      updateTransaction(txId, {
        splits,
        descAI: 'Accantonamento Satispay',
        _satiLinked: { potId: pot.id, potName: pot.name, ym }
      })
    })

    // If unlinked (txIds null), clear splits from previously linked transactions
    if (!txIds) {
      const oldLinked = pot.data?.[ym]?.linked
      const oldArr = Array.isArray(oldLinked) ? oldLinked : (oldLinked ? [oldLinked] : [])
      oldArr.forEach(txId => {
        updateTransaction(txId, { splits: null, _satiLinked: null })
      })
    }
  }

  // Link the same transactions to a DIFFERENT pot (delta coverage)
  function linkOtherPot(otherPotId, ym, txIds, amt) {
    const otherPot = (allPots||[]).find(p => p.id === otherPotId)
    if (!otherPot) return
    const prev = otherPot.data?.[ym] || {}
    updateSatiPot(otherPotId, { data:{
      ...(otherPot.data||{}),
      [ym]: { ...prev, linked: txIds, linkedAmt: amt }
    }})
    // compute splits for the other pot
    const txIdArr = Array.isArray(txIds) ? txIds : (txIds ? [txIds] : [])
    // total of all linked tx amounts — to distribute amt proportionally across txs
    const totalTxAmt = txIdArr.reduce((s, id) => {
      const t = transactions.find(x => x.txId === id)
      return s + Math.abs(t?.amount || 0)
    }, 0)
    const voci  = otherPot.voci || []
    const cells = otherPot.data?.[ym]?.cells || {}
    const total = voci.reduce((s,v) => s + (parseFloat(cells[v.id])||0), 0)
    txIdArr.forEach(txId => {
      const tx = transactions.find(t => t.txId === txId)
      if (!tx) return
      // each tx gets its proportional share of amt, scaled by voce cell fractions
      const txFraction = totalTxAmt > 0 ? Math.abs(tx.amount) / totalTxAmt : 1 / Math.max(txIdArr.length, 1)
      const ratio = total > 0 ? (amt * txFraction) / total : txFraction
      const splits = voci
        .filter(v => v.cat1)
        .map(v => ({ cat1:v.cat1, cat2:v.cat2, amount: Math.round((parseFloat(cells[v.id])||0)*ratio*100)/100 }))
        .filter(s => s.amount > 0)
      // merge splits with existing (from main pot) if present
      const existing = tx.splits || []
      const merged = [...existing, ...splits]
      updateTransaction(txId, { splits: merged.length ? merged : null, descAI: 'Accantonamento Satispay' })
    })
  }

  // ── One-time forced reset of ALL cat1/cat2 (runs once per pot, guarded by _catsReset flag) ──
  useEffect(() => {
    if (pot._catsReset) return
    const cleaned = (pot.voci||[]).map(v => ({ id: v.id, cat1:'', cat2:'' }))
    updateSatiPot(pot.id, { voci: cleaned, _catsReset: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pot.id])

  // ── Auto-reconciliation: find matching tx for unlinked months and save automatically ──
  useEffect(() => {
    if (!pot._catsReset) return // wait for reset
    const curNow = nowYM()
    const potVoci = pot.voci || []
    const updates = {}

    allYMs.filter(ym => ym <= curNow).forEach(ym => {
      if (pot.data?.[ym]?.linked) return // already linked

      const cells = pot.data?.[ym]?.cells || {}
      const mt = potVoci.reduce((s,v) => s + (parseFloat(cells[v.id])||0), 0)
      if (mt <= 0) return

      const reconRules = pot.reconRules || []
      let match = null

      if (reconRules.length > 0) {
        match = transactions.find(t => {
          if (t.excluded || t.amount >= 0) return false
          if (!(t._effDate||(t._effDate||t.date||'')).startsWith(ym)) return false
          if (Math.abs(Math.abs(t.amount) - mt) >= 1) return false
          return reconRules.every(r => {
            const hay = (t[r.field] || t.description || '').toLowerCase()
            const val = (r.value||'').toLowerCase()
            if (!val) return true
            if (r.op === 'equals') return hay === val
            if (r.op === 'startsWith') return hay.startsWith(val)
            return hay.includes(val)
          })
        })
      }

      if (!match) {
        match = transactions.find(t =>
          !t.excluded && t.amount < 0 &&
          (t._effDate||(t._effDate||t.date||'')).startsWith(ym) &&
          Math.abs(Math.abs(t.amount) - mt) < 0.01 &&
          ((t.merchant||'').toLowerCase().includes('satispay') ||
           (t.description||'').toLowerCase().includes('satispay'))
        )
      }

      if (match) {
        updates[ym] = { ...(pot.data?.[ym]||{}), linked: match.txId, linkedAmt: Math.abs(match.amount) }
        // Auto-generate category splits on matched transaction
        const cells = pot.data?.[ym]?.cells || {}
        const splits = potVoci
          .filter(v => v.cat1 && v.cat2)
          .map(v => ({ cat1: v.cat1, cat2: v.cat2, amount: parseFloat(cells[v.id])||0 }))
          .filter(s => s.amount > 0)
        if (splits.length > 0 && !match.splits) {
          updateTransaction(match.txId, {
            splits,
            _satiLinked: { potId: pot.id, potName: pot.name, ym }
          })
        }
      }
    })

    if (Object.keys(updates).length > 0) {
      updateSatiPot(pot.id, { data: { ...(pot.data||{}), ...updates } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pot.id, transactions])

  // ── Backfill _satiLinked on already-linked transactions that predate the field ──
  useEffect(() => {
    if (!pot._catsReset) return
    const potVoci = pot.voci || []
    Object.entries(pot.data || {}).forEach(([ym, entry]) => {
      if (!entry?.linked) return
      const txIds = Array.isArray(entry.linked) ? entry.linked : [entry.linked]
      txIds.forEach(txId => {
        const tx = transactions.find(t => t.txId === txId)
        if (!tx || tx._satiLinked) return // already set
        // Set _satiLinked and, if missing, compute splits from cell data
        const cells = entry.cells || {}
        const existingSplits = tx.splits && tx.splits.length > 0 ? tx.splits : null
        const computedSplits = existingSplits || potVoci
          .filter(v => v.cat1 && v.cat2)
          .map(v => ({ cat1: v.cat1, cat2: v.cat2, amount: parseFloat(cells[v.id])||0 }))
          .filter(s => s.amount > 0)
        updateTransaction(txId, {
          _satiLinked: { potId: pot.id, potName: pot.name, ym },
          ...(existingSplits ? {} : { splits: computedSplits.length > 0 ? computedSplits : null })
        })
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pot.id, transactions])

  // ── Always use pot.voci (raw Firestore data) as base for writes ──
  // Never use the migrated `voci` array to avoid accidentally persisting
  // converted old `cat` fields as cat1/cat2.
  const rawVoci = pot.voci || []

  function addVoce() {
    updateSatiPot(pot.id, { voci:[...rawVoci, { id:uid(), cat1:'', cat2:'' }] })
  }
  function deleteVoce(vid) {
    if(rawVoci.length<=1) return
    updateSatiPot(pot.id, { voci: rawVoci.filter(v=>v.id!==vid) })
  }
  function updateVoceCat1(vid, cat1) {
    // Changing L1 resets L2; also strip legacy `cat` field
    updateSatiPot(pot.id, { voci: rawVoci.map(v=>v.id===vid
      ? { id:v.id, cat1, cat2:'' }   // clean write: only id + cat1 + cat2
      : v) })
  }
  function updateVoceCat2(vid, cat2) {
    updateSatiPot(pot.id, { voci: rawVoci.map(v=>v.id===vid
      ? { id:v.id, cat1: v.cat1||'', cat2 }  // clean write
      : v) })
  }
  function updateVoceNote(vid, note) {
    updateSatiPot(pot.id, { voci: rawVoci.map(v=>v.id===vid
      ? { ...v, note }
      : v) })
  }
  function reorderVoci(fromIdx, toIdx) {
    if (fromIdx===toIdx) return
    const next = [...rawVoci]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    updateSatiPot(pot.id, { voci: next })
  }

  // Column width
  const COL_W = 56

  return (
    <div className="card" style={{padding:'18px 20px',marginBottom:18}}>

      {/* ── Card header ───────────────────────── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:28}}>{pot.icon}</span>
          <div>
            <div style={{fontSize:16,fontWeight:800}}>{pot.name}</div>
            <div style={{fontSize:12,color:'var(--text3)'}}>
              Accantonato totale:
              <strong style={{color:'var(--green)',marginLeft:4}}>€ {fmtIT(totalAcc,0)}</strong>
            </div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {/* Year navigation */}
          <div style={{display:'flex',alignItems:'center',gap:4,
            padding:'3px 8px',borderRadius:8,background:'var(--surface2)',border:'1px solid var(--border)'}}>
            <button onClick={()=>setViewYear(v=>v-1)} disabled={viewYear<=availYears[0]}
              style={{border:'none',background:'transparent',cursor:viewYear<=availYears[0]?'default':'pointer',
                color:viewYear<=availYears[0]?'var(--text3)':'var(--accent)',
                fontSize:12,lineHeight:1,padding:'2px 4px',fontWeight:700}}>◀</button>
            <span style={{fontSize:12,fontWeight:700,minWidth:32,textAlign:'center',
              color:'var(--text2)',letterSpacing:'.04em'}}>{viewYear}</span>
            <button onClick={()=>setViewYear(v=>v+1)} disabled={viewYear>=availYears[availYears.length-1]}
              style={{border:'none',background:'transparent',cursor:viewYear>=availYears[availYears.length-1]?'default':'pointer',
                color:viewYear>=availYears[availYears.length-1]?'var(--text3)':'var(--accent)',
                fontSize:12,lineHeight:1,padding:'2px 4px',fontWeight:700}}>▶</button>
          </div>
          {Object.keys(autoSuggestions).length > 0 && (
            <button className="btn btn-ghost"
              onClick={autoLinkAll}
              title={`${Object.keys(autoSuggestions).length} mes${Object.keys(autoSuggestions).length===1?'e':'i'} con match automatico — clicca per abbinarli tutti`}
              style={{padding:'4px 10px',fontSize:11,fontWeight:700,color:'var(--green)',
                border:'1px solid var(--green)',borderRadius:8,background:'var(--green-l)'}}>
              🤖 Auto-abbina ({Object.keys(autoSuggestions).length})
            </button>
          )}
          <button className="btn btn-ghost" style={{padding:'5px 8px'}}
            onClick={()=>setShowEdit(true)} title="Modifica"><Edit2 size={13}/></button>
          <button className="btn btn-ghost" style={{padding:'5px 8px',color:'var(--red)'}}
            onClick={()=>{if(confirm(`Eliminare "${pot.name}"?`))deleteSatiPot(pot.id)}}
            title="Elimina"><Trash2 size={13}/></button>
        </div>
      </div>

      {/* ── Area chart ────────────────────────── */}
      <div style={{marginBottom:14}}>
        <FundChart pot={pot}/>
      </div>

      {/* ── Monthly table ─────────────────────── */}
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',minWidth:400}}>
          <thead>
            <tr>
              {/* drag handle spacer */}
              <th style={{width:14,borderBottom:'2px solid var(--border)'}}/>
              <th style={{padding:'4px 5px',fontSize:10,fontWeight:700,textTransform:'uppercase',
                letterSpacing:'.06em',color:'var(--text3)',textAlign:'left',width:'1%',whiteSpace:'nowrap',
                borderBottom:'2px solid var(--border)'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button onClick={addVoce}
                    style={{border:'none',background:'transparent',color:'var(--accent)',cursor:'pointer',
                      fontSize:10,fontWeight:700,fontFamily:'var(--font-sans)',
                      display:'flex',alignItems:'center',gap:3,padding:0}}>
                    <Plus size={9}/> L1
                  </button>
                  <span style={{fontSize:9,color:'var(--text3)',opacity:.6,fontStyle:'italic'}}>€</span>
                </div>
              </th>
              <th style={{padding:'4px 5px',fontSize:10,fontWeight:700,textTransform:'uppercase',
                letterSpacing:'.06em',color:'var(--text3)',textAlign:'left',width:'1%',whiteSpace:'nowrap',
                borderBottom:'2px solid var(--border)'}}>
                L2
              </th>
              <th style={{padding:'4px 5px',fontSize:10,fontWeight:700,textTransform:'uppercase',
                letterSpacing:'.06em',color:'var(--text3)',textAlign:'left',width:'1%',whiteSpace:'nowrap',
                borderBottom:'2px solid var(--border)'}}>
                Note
              </th>
              {visYMs.map((ym, ymIdx)=>{
                const isCurrent = ym === now
                const isFuture  = ym > now
                const [,mm] = ym.split('-').map(Number)
                const shortLabel = MONTH_IT[mm-1].toUpperCase()
                const prevYm = ymIdx > 0 ? visYMs[ymIdx-1] : null
                const nextYm = ymIdx < visYMs.length-1 ? visYMs[ymIdx+1] : null
                const colHovered = hoveredCol === ym
                const hasData = monthTotal(ym) > 0
                return (
                  <th key={ym}
                    onMouseEnter={()=>setHoveredCol(ym)}
                    onMouseLeave={()=>setHoveredCol(null)}
                    style={{padding:'4px 4px',fontSize:10,fontWeight:700,textTransform:'uppercase',
                      letterSpacing:'.05em',textAlign:'right',width:COL_W,whiteSpace:'nowrap',
                      color:isCurrent?'var(--accent)':isFuture?'var(--text3)':'var(--text2)',
                      borderBottom:'2px solid var(--border)',position:'relative',userSelect:'none'}}>
                    {shortLabel}
                    {isCurrent && <span style={{marginLeft:3}}>⬤</span>}
                    {isFuture  && <span style={{marginLeft:3,opacity:.5}}>→</span>}
                    {colHovered && hasData && prevYm && (
                      <button onClick={e=>{e.stopPropagation();copyColumn(ym,prevYm)}}
                        title={`Copia ${ymLabel(ym)} → ${ymLabel(prevYm)}`}
                        style={{position:'absolute',left:0,top:0,bottom:0,border:'none',
                          background:'var(--accent)',color:'#fff',cursor:'pointer',
                          fontSize:9,padding:'0 3px',display:'flex',alignItems:'center',
                          borderRadius:'4px 0 0 0',opacity:.85,lineHeight:1}}>◀</button>
                    )}
                    {colHovered && hasData && nextYm && (
                      <button onClick={e=>{e.stopPropagation();copyColumn(ym,nextYm)}}
                        title={`Copia ${ymLabel(ym)} → ${ymLabel(nextYm)}`}
                        style={{position:'absolute',right:0,top:0,bottom:0,border:'none',
                          background:'var(--accent)',color:'#fff',cursor:'pointer',
                          fontSize:9,padding:'0 3px',display:'flex',alignItems:'center',
                          borderRadius:'0 4px 0 0',opacity:.85,lineHeight:1}}>▶</button>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {voci.map((voce, idx)=>{
              const isDragTarget = dragOver === idx
              return (
                <tr key={voce.id}
                  draggable
                  onDragStart={()=>{ dragIdx.current=idx }}
                  onDragOver={e=>{ e.preventDefault(); setDragOver(idx) }}
                  onDragLeave={()=>setDragOver(null)}
                  onDrop={()=>{ reorderVoci(dragIdx.current,idx); setDragOver(null) }}
                  onDragEnd={()=>{ dragIdx.current=null; setDragOver(null) }}
                  style={{
                    borderBottom:'1px solid var(--border)',
                    background:isDragTarget?'var(--accent-l)':'transparent',
                    transition:'background .1s',
                  }}>
                  {/* drag handle */}
                  <td style={{padding:'0 3px',textAlign:'center',cursor:'grab',color:'var(--text3)',
                    fontSize:12,lineHeight:1,userSelect:'none'}}>⠿</td>
                  <td style={{padding:'1px 3px',whiteSpace:'nowrap'}}>
                    <div style={{display:'flex',alignItems:'center',gap:2}}>
                      <L1Picker value={voce.cat1||''} onChange={v=>updateVoceCat1(voce.id,v)}/>
                      {voci.length > 1 && (
                        <button onClick={()=>deleteVoce(voce.id)}
                          style={{border:'none',background:'transparent',color:'var(--text3)',
                            cursor:'pointer',padding:'1px',opacity:.45,lineHeight:1,flexShrink:0}}>
                          <X size={9}/>
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{padding:'1px 3px',whiteSpace:'nowrap'}}>
                    <L2Picker l1={voce.cat1||''} value={voce.cat2||''}
                      onChange={v=>updateVoceCat2(voce.id,v)}/>
                  </td>
                  <td style={{padding:'1px 3px',whiteSpace:'nowrap'}}>
                    <input
                      value={voce.note||''}
                      onChange={e=>updateVoceNote(voce.id, e.target.value)}
                      placeholder="nota…"
                      maxLength={30}
                      style={{width:'100%',padding:'2px 4px',borderRadius:4,
                        border:'1px solid transparent',background:'transparent',
                        fontSize:10,fontFamily:'var(--font-sans)',color:'var(--text2)',
                        outline:'none',boxSizing:'border-box',
                        transition:'border .15s,background .15s'}}
                      onFocus={e=>{e.target.style.border='1px solid var(--accent)';e.target.style.background='var(--surface2)'}}
                      onBlur={e=>{e.target.style.border='1px solid transparent';e.target.style.background='transparent'}}
                    />
                  </td>
                  {visYMs.map(ym=>(
                    <td key={ym} style={{padding:'2px 6px',textAlign:'right',opacity:ym>now?.55:1}}>
                      <EditCell value={pot.data?.[ym]?.cells?.[voce.id]||0}
                        onChange={v=>setCell(ym,voce.id,v)}/>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            {/* Totale row */}
            <tr style={{borderTop:'2px solid var(--border)',background:'var(--surface2)'}}>
              <td/>
              <td style={{padding:'5px 6px',fontSize:10,fontWeight:800,textTransform:'uppercase',
                letterSpacing:'.06em',color:'var(--text2)'}}>Totale</td>
              <td/><td/>
              {visYMs.map(ym=>{
                const total = monthTotal(ym)
                return (
                  <td key={ym} style={{padding:'5px 6px',textAlign:'right',
                    fontFamily:'var(--font-mono)',fontWeight:800,fontSize:11,
                    whiteSpace:'nowrap',color:total>0?'var(--text)':'var(--text3)'}}>
                    {total>0 ? fmtIT(total,0) : '—'}
                  </td>
                )
              })}
            </tr>
            {/* Riconciliazione TX row */}
            <tr style={{background:'var(--surface)'}}>
              <td/>
              <td style={{padding:'4px 6px',whiteSpace:'nowrap'}}>
                <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'nowrap'}}>
                  <span style={{fontSize:9,fontWeight:700,color:'var(--text3)',
                    textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>Riconc. TX</span>
                  <button onClick={()=>setShowReconRules(true)}
                    title="Configura regole abbinamento automatico"
                    style={{border:'1px solid var(--border)',background:'var(--surface2)',
                      borderRadius:5,cursor:'pointer',padding:'2px 6px',
                      fontSize:10,color:'var(--accent)',fontWeight:700,flexShrink:0,
                      display:'inline-flex',alignItems:'center',gap:3,lineHeight:1.4}}>
                    ⚙ Regole
                  </button>
                </div>
              </td>
              <td/><td/>
              {visYMs.map(ym=>{
                const total  = monthTotal(ym)
                const status = reconcStatus(ym)
                const future = ym > now
                const cellStyle = {padding:'3px 6px',textAlign:'center',width:COL_W}
                if (future || total===0) return (
                  <td key={ym} style={{...cellStyle,color:'var(--text3)',fontSize:11}}>—</td>
                )
                if (status) return (
                  <td key={ym} style={cellStyle}>
                    <button onClick={()=>setAbbina(ym)} title="Abbinamento trovato — clicca per modificare"
                      style={{border:'none',background:'transparent',cursor:'pointer',padding:0,
                        display:'flex',alignItems:'center',justifyContent:'center',width:'100%'}}>
                      <span style={{fontSize:14,lineHeight:1}}>{status.exact ? '✅' : '⚠️'}</span>
                    </button>
                  </td>
                )
                // auto-match found → green 🤖 button
                if (autoSuggestions[ym]) return (
                  <td key={ym} style={cellStyle}>
                    <button
                      onClick={()=>{
                        const match = autoSuggestions[ym]
                        const txIds = Array.isArray(match) ? match : match.txIds
                        const txArg = txIds.length===1 ? txIds[0] : txIds
                        linkMonth(ym, txArg, total)
                        if (!Array.isArray(match) && match.otherPotId) linkOtherPot(match.otherPotId, ym, txArg, match.otherAmt)
                      }}
                      title={`Match automatico trovato${!Array.isArray(autoSuggestions[ym])?' (multi-fondo)':''} — clicca per abbinare`}
                      style={{display:'flex',alignItems:'center',justifyContent:'center',gap:2,
                        width:'100%',padding:'2px 4px',borderRadius:4,whiteSpace:'nowrap',
                        border:'1px solid var(--green)',background:'var(--green-l)',
                        color:'var(--green)',cursor:'pointer',boxSizing:'border-box',
                        fontSize:9,fontWeight:700,fontFamily:'var(--font-sans)'}}>
                      🤖 Auto
                    </button>
                  </td>
                )
                // no match found → warning button
                return (
                  <td key={ym} style={cellStyle}>
                    <button onClick={()=>setAbbina(ym)}
                      title="Nessuna transazione trovata — abbina manualmente"
                      style={{display:'flex',alignItems:'center',justifyContent:'center',gap:2,
                        width:'100%',padding:'2px 4px',borderRadius:4,whiteSpace:'nowrap',
                        border:'1px solid #c8780040',background:'#c8780012',
                        color:'#a86000',cursor:'pointer',boxSizing:'border-box',
                        fontSize:9,fontWeight:700,fontFamily:'var(--font-sans)'}}>
                      ⚠ Abbina
                    </button>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {showEdit && <PotFormModal pot={pot} onClose={()=>setShowEdit(false)}/>}
      {abbina && (
        <AbbinaModal
          pot={pot}
          ym={abbina}
          currentLinked={pot.data?.[abbina]?.linked}
          onClose={()=>setAbbina(null)}
          onLink={(txId, amt)=>linkMonth(abbina, txId, amt)}
          allPots={allPots}
          onLinkOther={(otherPotId, ym, txIds, amt)=>linkOtherPot(otherPotId, ym, txIds, amt)}
        />
      )}
      {showReconRules && (
        <ReconRulesModal
          pot={pot}
          onClose={()=>setShowReconRules(false)}
          onSave={rules=>updateSatiPot(pot.id, { reconRules: rules })}
        />
      )}
    </div>
  )
}

// ── SatiIncomeSection ─────────────────────────────────────
function SatiIncomeSection({ satiIncome, transactions, pot }) {
  const [abbina, setAbbina] = useState(null) // incomeEntry being linked
  const [compLinks, setCompLinks] = useState(getSatiComp)

  function refreshLinks() { setCompLinks(getSatiComp()) }

  const thisYear = String(new Date().getFullYear())

  // ── Strict L1+L2 match: BOTH must be explicitly saved (raw Firestore, no migration of old `cat`) ─
  const catFilters = useMemo(() =>
    (pot?.voci||[]).filter(v => v.cat1 && v.cat2)   // raw voci only — ignores old `cat` field
  , [pot])

  const speseDaComp = useMemo(() => {
    if (!catFilters.length) return []
    return transactions.filter(t => {
      if (t.excluded || t.amount >= 0) return false
      return catFilters.some(f => t.cat1 === f.cat1 && t.cat2 === f.cat2)
    }).sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  }, [transactions, catFilters])

  // ── Unified rows (sorted by date desc) ───────────────────
  const allRows = useMemo(() => {
    const rows = [
      ...satiIncome.map(t=>({...t, _rowType:'entrata'})),
      ...speseDaComp.map(t=>({...t, _rowType:'spesa'})),
    ]
    return rows.sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  }, [satiIncome, speseDaComp])

  const totEntrate   = satiIncome.reduce((s,t)=>s+t.amount, 0)
  const totSpese     = speseDaComp.reduce((s,t)=>s+Math.abs(t.amount), 0)
  const saldoNetto   = totEntrate - totSpese

  return (
    <div style={{marginTop:32}}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:700}}>📥 Spese e Entrate da Compensare</div>
        <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
          Entrate Satispay + spese nelle categorie L1›L2 configurate in tabella — ordinate per data
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:16}}>
        {[
          ['📥 Entrate ricevute',   `€ ${fmtIT(totEntrate,0)}`,                         'var(--green)'],
          ['🧾 Spese da compensare',`€ ${fmtIT(totSpese,0)}`,                            'var(--red)'],
          ['⚖️ Saldo netto',        `${saldoNetto>=0?'+':''}€ ${fmtIT(saldoNetto,0)}`,  saldoNetto>=0?'var(--green)':'var(--red)'],
          ['# Voci totali',         allRows.length,                                       'var(--text2)'],
        ].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:'12px 16px',borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--text3)',marginBottom:4}}>{l}</div>
            <div style={{fontSize:19,fontWeight:800,fontFamily:'var(--font-mono)',color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Unified table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              {['Data','Tipo','Descrizione','Abbina / Note','Categoria','Importo'].map(h=>(
                <th key={h} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                  textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                  borderBottom:'1px solid var(--border)',
                  textAlign:h==='Importo'?'right':'left',
                  minWidth:h==='Categoria'?180:undefined}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.length === 0 && (
              <tr><td colSpan={6} style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:13}}>
                Nessuna voce — aggiungi entrate Satispay o configura categorie L1›L2 in tabella
              </td></tr>
            )}
            {allRows.slice(0,80).map((t,i)=>{
              const isEntrata = t._rowType === 'entrata'
              const link      = isEntrata ? compLinks[t.txId] : null
              const catColor  = CATS[t.cat1]?.color || 'var(--accent)'
              return (
                <tr key={(t.txId||i)+t._rowType}
                  style={{borderBottom:'1px solid var(--border)',
                    background: isEntrata ? 'transparent' : '#fff4f420'}}>
                  {/* Data */}
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',
                    fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                    {fmtDate(t._effDate||t.date)}
                  </td>
                  {/* Tipo badge */}
                  <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}>
                    {isEntrata
                      ? <span style={{fontSize:10,padding:'2px 7px',borderRadius:10,fontWeight:700,
                          background:'#2a7a4a20',color:'var(--green)',border:'1px solid #2a7a4a30'}}>
                          📥 Entrata
                        </span>
                      : <span style={{fontSize:10,padding:'2px 7px',borderRadius:10,fontWeight:700,
                          background:'#e0242420',color:'var(--red)',border:'1px solid #e0242430'}}>
                          🧾 Da comp.
                        </span>
                    }
                  </td>
                  {/* Descrizione */}
                  <td style={{padding:'9px 14px'}}>
                    <div style={{fontSize:13,fontWeight:500}}>{t.descAI||t.description?.slice(0,50)}</div>
                    <div style={{fontSize:11,color:'var(--text3)'}}>{(t.description||'').slice(0,60)}</div>
                  </td>
                  {/* Abbina / Note (solo entrate) */}
                  <td style={{padding:'9px 10px'}}>
                    {isEntrata ? (
                      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                        {link ? (
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <span style={{fontSize:11,padding:'2px 8px',borderRadius:12,
                              background:'var(--green-l)',color:'var(--green)',fontWeight:700,
                              border:'1px solid var(--green)33'}}>🔗 Abbinata</span>
                            <button onClick={()=>setAbbina(t)}
                              style={{border:'none',background:'none',cursor:'pointer',
                                color:'var(--text3)',fontSize:11,padding:'2px 4px',borderRadius:4}}>✏️</button>
                          </div>
                        ) : (
                          <button onClick={()=>setAbbina(t)}
                            style={{padding:'2px 8px',borderRadius:6,border:'1px solid var(--border)',
                              background:'var(--surface2)',color:'var(--text2)',cursor:'pointer',
                              fontSize:11,fontFamily:'var(--font-sans)',fontWeight:600}}>
                            🔗 Abbina
                          </button>
                        )}
                        <SatiNoteCell txId={t.txId||i}/>
                      </div>
                    ) : <span style={{color:'var(--text3)',fontSize:11}}>—</span>}
                  </td>
                  {/* Categoria (solo spese, spostata prima di Importo) */}
                  <td style={{padding:'9px 14px',minWidth:180}}>
                    {!isEntrata && t.cat1
                      ? <span style={{fontSize:11,padding:'3px 10px',borderRadius:10,fontWeight:600,
                          background:catColor+'20',color:catColor,whiteSpace:'nowrap'}}>
                          {t.cat2 || t.cat1}
                        </span>
                      : <span style={{color:'var(--text3)',fontSize:11}}>—</span>}
                  </td>
                  {/* Importo */}
                  <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',
                    fontSize:13,fontWeight:700,color:isEntrata?'var(--green)':'var(--red)'}}>
                    {isEntrata
                      ? `+€ ${fmtIT(t.amount,2)}`
                      : `−€ ${fmtIT(Math.abs(t.amount),2)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {abbina && (
        <SatiCompensaModal
          incomeEntry={abbina}
          transactions={transactions}
          onClose={()=>{ setAbbina(null); refreshLinks() }}
        />
      )}
    </div>
  )
}

// ── date formatter ────────────────────────────────────────
function fmtDate(d) {
  const p = (d||'').split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d || ''
}

// ── Uscite Satispay ───────────────────────────────────────
function SatiUsciteSection({ satiUscite, satiPots }) {
  const thisYear = String(new Date().getFullYear())

  // Build txId → pot lookup from reconciliation data
  const reconMap = useMemo(() => {
    const map = {}
    satiPots.forEach(p => {
      Object.entries(p.data||{}).forEach(([ym, md]) => {
        if (md?.linked) map[md.linked] = { potName: p.name, potIcon: p.icon, ym }
      })
    })
    return map
  }, [satiPots])

  return (
    <div style={{marginTop:24}}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:700}}>📤 Uscite Satispay</div>
        <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>Bonifici e versamenti verso Satispay</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:16}}>
        {[
          ['Totale versato', `€ ${fmtIT(satiUscite.reduce((s,t)=>s+Math.abs(t.amount),0),0)}`, 'var(--red)'],
          ['Numero uscite', satiUscite.length, 'var(--accent)'],
          ['Anno corrente', `€ ${fmtIT(satiUscite.filter(t=>(t._effDate||(t._effDate||t.date||'')).startsWith(thisYear)).reduce((s,t)=>s+Math.abs(t.amount),0),0)}`, 'var(--text2)'],
        ].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:'12px 16px',borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--text3)',marginBottom:4}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-mono)',color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              {['Data','Descrizione','Fondo abbinato','Importo'].map(h=>(
                <th key={h} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                  textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                  borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {satiUscite.length === 0 && (
              <tr><td colSpan={4} style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:13}}>Nessuna uscita Satispay trovata</td></tr>
            )}
            {satiUscite.slice(0,50).map((t,i) => {
              const recon = reconMap[t.txId]
              return (
                <tr key={t.txId||i} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                    {fmtDate(t._effDate||t.date)}
                  </td>
                  <td style={{padding:'9px 14px'}}>
                    <div style={{fontSize:13,fontWeight:500}}>{t.descAI||t.description?.slice(0,50)}</div>
                    <div style={{fontSize:11,color:'var(--text3)'}}>{(t.description||'').slice(0,60)}</div>
                  </td>
                  <td style={{padding:'9px 14px'}}>
                    {recon ? (
                      <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',
                        borderRadius:12,background:'var(--accent-l)',border:'1px solid var(--accent)33',
                        fontSize:11,fontWeight:600,color:'var(--accent)'}}>
                        {recon.potIcon} {recon.potName}
                      </span>
                    ) : <span style={{fontSize:11,color:'var(--text3)'}}>—</span>}
                  </td>
                  <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',
                    fontSize:13,fontWeight:700,color:'var(--red)'}}>
                    −€ {fmtIT(Math.abs(t.amount),2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab pill ──────────────────────────────────────────────
function SatiTabPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'6px 16px',borderRadius:20,
      border:`1px solid ${active?'var(--accent)':'var(--border)'}`,
      background:active?'var(--accent)':'var(--surface)',
      color:active?'#fff':'var(--text2)',
      fontSize:13,fontWeight:700,cursor:'pointer',
      fontFamily:'var(--font-sans)',transition:'all .15s',whiteSpace:'nowrap',
    }}>{label}</button>
  )
}

// ── Overview tab ──────────────────────────────────────────
function SatiOverviewTab({ satiPots, satiIncome, satiUscite }) {
  const now = nowYM()
  const lm  = addMonth(now,-1)
  const lm2 = addMonth(now,-2)

  function potAcc(p, upTo) {
    const voci = p.voci||[]
    return monthsRange(p.startYM||now).filter(m=>m<=upTo).reduce((s,ym)=>{
      const cells = p.data?.[ym]?.cells||{}
      return s + voci.reduce((vs,v)=>vs+(parseFloat(cells[v.id])||0),0)
    }, 0)
  }
  function potMonth(p, ym) {
    const voci = p.voci||[]
    const cells = p.data?.[ym]?.cells||{}
    return voci.reduce((vs,v)=>vs+(parseFloat(cells[v.id])||0),0)
  }

  const totalAccLordo = satiPots.reduce((s,p)=>s+potAcc(p,now), 0)
  const meseCorr    = satiPots.reduce((s,p)=>s+potMonth(p,now), 0)
  const meseScorso  = satiPots.reduce((s,p)=>s+potMonth(p,lm), 0)
  const mesePre     = satiPots.reduce((s,p)=>s+potMonth(p,lm2), 0)
  const crescita    = meseScorso>0 ? ((meseCorr-meseScorso)/meseScorso*100).toFixed(1) : null
  const totEntrate  = satiIncome.reduce((s,t)=>s+t.amount,0)
  const totUscite   = satiUscite.reduce((s,t)=>s+Math.abs(t.amount),0)
  // Net total = gross accumulated - released entries
  const totalAcc    = Math.max(0, totalAccLordo - totEntrate)

  // Chart: last 12 months cumulative total
  const last12 = Array.from({length:12},(_,i)=>addMonth(now,i-11))
  const chartData = last12.map(ym => {
    const entry = { label: ymLabel(ym) }
    satiPots.forEach(p => { entry[p.name] = potAcc(p,ym) })
    entry.total = satiPots.reduce((s,p)=>s+potAcc(p,ym),0)
    return entry
  })

  // Monthly deposit bar chart (last 12 months)
  const barData = last12.map(ym => {
    const entry = { label: ymLabel(ym) }
    satiPots.forEach(p => { entry[p.name] = potMonth(p,ym) })
    entry.total = satiPots.reduce((s,p)=>s+potMonth(p,ym),0)
    return entry
  })

  const POT_COLORS = ['var(--accent)','var(--green)','var(--blue)','var(--gold)']

  return (
    <div>
      {/* KPI grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12,marginBottom:24}}>
        {[
          ['💰 Totale accantonato (netto)', `€ ${fmtIT(totalAcc,0)}`, 'var(--green)',
            totEntrate>0 ? { _note: `lordo €${fmtIT(totalAccLordo,0)} − rilasci €${fmtIT(totEntrate,0)}` } : null],
          ['📁 Fondi attivi', `${satiPots.length} fond${satiPots.length===1?'o':'i'}`, 'var(--accent)', null],
          ['📅 Mese corrente', meseCorr>0?`€ ${fmtIT(meseCorr,0)}`:'—', 'var(--accent)',
            crescita!==null ? { val: crescita, prev: meseScorso } : null],
          ['📅 Mese scorso', meseScorso>0?`€ ${fmtIT(meseScorso,0)}`:'—', 'var(--text2)', null],
          ['📥 Quanto accantonato', `€ ${fmtIT(totUscite,0)}`, 'var(--green)', null],
          ['📤 Quanto rilasciato', `€ ${fmtIT(totEntrate,0)}`, 'var(--red)', null],
        ].map(([l,v,c,meta])=>(
          <div key={l} className="card" style={{padding:'14px 18px',borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:5}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-mono)',color:c}}>{v}</div>
            {meta && meta._note && (
              <div style={{fontSize:10,marginTop:3,color:'var(--text3)'}}>
                {meta._note}
              </div>
            )}
            {meta && meta.val !== undefined && (
              <div style={{fontSize:11,marginTop:4,color:Number(meta.val)>=0?'var(--green)':'var(--red)',fontWeight:600}}>
                {Number(meta.val)>=0?'▲':'▼'} {Math.abs(meta.val)}% vs mese scorso
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Cumulative area chart */}
      <div className="card" style={{padding:'18px 20px',marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>📈 Patrimonio accumulato (ultimi 12 mesi)</div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>Totale cumulativo di tutti i fondi</div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{top:4,right:4,bottom:0,left:0}}>
            <defs>
              <linearGradient id="satiOverGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--green)" stopOpacity={0.28}/>
                <stop offset="95%" stopColor="var(--green)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={52}
              tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
            <Tooltip formatter={v=>[`€ ${fmtIT(v,0)}`,'Accantonato']}
              contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px'}}/>
            <Area type="monotone" dataKey="total" stroke="var(--green)" strokeWidth={2}
              fill="url(#satiOverGrad)" dot={false} activeDot={{r:4}}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly deposits bar chart */}
      <div className="card" style={{padding:'18px 20px',marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>📊 Versamenti mensili per fondo</div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>Importi accantonati mese per mese</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={barData} barCategoryGap="25%" margin={{top:4,right:4,bottom:0,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={52}
              tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
            <Tooltip formatter={(v,n)=>[`€ ${fmtIT(v,0)}`,n]}
              contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px'}}/>
            {satiPots.length > 1 && <Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:10}}>{v}</span>}/>}
            {satiPots.map((p,i)=>(
              <Bar key={p.id} dataKey={p.name} stackId="a"
                fill={POT_COLORS[i%POT_COLORS.length]} radius={i===satiPots.length-1?[3,3,0,0]:[0,0,0,0]}/>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-pot mini cards */}
      {satiPots.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
          {satiPots.map((p,i) => {
            const acc  = potAcc(p,now)
            const last = potMonth(p,lm)
            const curr = potMonth(p,now)
            const gr   = last>0 ? ((curr-last)/last*100).toFixed(1) : null
            return (
              <div key={p.id} className="card" style={{padding:'16px 18px',borderTop:`3px solid ${POT_COLORS[i%POT_COLORS.length]}`}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                  <span style={{fontSize:24}}>{p.icon}</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:800}}>{p.name}</div>
                    <div style={{fontSize:11,color:'var(--text3)'}}>da {ymLabel(p.startYM||now)}</div>
                  </div>
                </div>
                <div style={{fontSize:22,fontWeight:800,color:POT_COLORS[i%POT_COLORS.length],fontFamily:'var(--font-mono)',marginBottom:2}}>
                  € {fmtIT(acc,0)}
                </div>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:8}}>
                  Mese scorso: € {fmtIT(last,0)}
                  {gr!==null && <span style={{marginLeft:6,color:Number(gr)>=0?'var(--green)':'var(--red)',fontWeight:700}}>
                    {Number(gr)>=0?'▲':'▼'}{Math.abs(gr)}%
                  </span>}
                </div>
                <FundChart pot={p}/>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Altre Spese tab ───────────────────────────────────────
function AltreSpesePot({ altreSpeseTxs }) {
  const satiUscite = altreSpeseTxs   // alias for readability below
  const now    = nowYM()
  const last12 = Array.from({length:12},(_,i)=>addMonth(now,i-11))

  // Group uscite by month
  const byMonth = useMemo(() => {
    const map = {}
    satiUscite.forEach(t => {
      const ym = (t._effDate||(t._effDate||t.date||'')).slice(0,7)
      if (!map[ym]) map[ym] = { total:0, count:0, byCat:{} }
      map[ym].total += Math.abs(t.amount)
      map[ym].count++
      const cat = t.cat1||'Altro'
      map[ym].byCat[cat] = (map[ym].byCat[cat]||0) + Math.abs(t.amount)
    })
    return map
  }, [satiUscite])

  const monthsWithData  = last12.filter(ym => byMonth[ym])
  const avgMonthly      = monthsWithData.length
    ? monthsWithData.reduce((s,ym)=>s+(byMonth[ym]?.total||0),0) / monthsWithData.length
    : 0
  const maxMonth        = Math.max(0,...last12.map(ym=>byMonth[ym]?.total||0))
  const totalAll        = satiUscite.reduce((s,t)=>s+Math.abs(t.amount),0)
  const thisYearTotal   = satiUscite.filter(t=>(t._effDate||(t._effDate||t.date||'')).startsWith(now.slice(0,4)))
    .reduce((s,t)=>s+Math.abs(t.amount),0)

  // Category totals for the stacked chart (top 5)
  const catTotals = {}
  satiUscite.forEach(t => {
    const c = t.cat1||'Altro'
    catTotals[c] = (catTotals[c]||0) + Math.abs(t.amount)
  })
  const topCats = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c])=>c)
  const topCat  = topCats[0]

  // Bar chart data: monthly totals
  const chartData = last12.map(ym => ({
    label: ymLabel(ym),
    Spesa: Math.round((byMonth[ym]?.total||0)*100)/100,
  }))

  // Stacked by category
  const stackedData = last12.map(ym => {
    const entry = { label: ymLabel(ym) }
    topCats.forEach(cat => {
      entry[cat] = Math.round((byMonth[ym]?.byCat?.[cat]||0)*100)/100
    })
    return entry
  })

  const CAT_COLORS = ['var(--accent)','var(--green)','var(--blue)','var(--gold)','#e0497a']

  return (
    <div>
      {/* Filter note */}
      <div style={{display:'inline-flex',alignItems:'center',gap:8,
        padding:'6px 14px',borderRadius:20,marginBottom:20,
        background:'var(--surface2)',border:'1px solid var(--border)'}}>
        <span style={{fontSize:13}}>🔍</span>
        <span style={{fontSize:12,color:'var(--text3)'}}>
          Mostra solo le spese categorizzate come
          <strong style={{color:'var(--text2)',marginLeft:4}}>Altro › Satispay Varie</strong>
        </span>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:12,marginBottom:22}}>
        {[
          ['💸 Totale storico',     `€ ${fmtIT(totalAll,0)}`,       'var(--red)'],
          ['📅 Anno corrente',      `€ ${fmtIT(thisYearTotal,0)}`,  'var(--accent)'],
          ['📊 Media mensile',      avgMonthly>0?`€ ${fmtIT(avgMonthly,0)}`:'—', 'var(--blue)'],
          ['📈 Mese massimo',       maxMonth>0?`€ ${fmtIT(maxMonth,0)}`:'—',     'var(--text2)'],
          ['🔢 Transazioni totali', satiUscite.length,               'var(--text2)'],
          ...(topCat ? [['🏆 Top categoria', topCat, CATS[topCat]?.color||'var(--accent)']] : []),
        ].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:'14px 18px',borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
              color:'var(--text3)',marginBottom:5}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,fontFamily:'var(--font-mono)',color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Monthly total bar chart */}
      <div className="card" style={{padding:'18px 20px',marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>📊 Spese mensili Satispay</div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:14}}>Totale uscite per mese — ultimi 12 mesi</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barCategoryGap="30%" margin={{top:4,right:4,bottom:0,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={54}
              tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
            <Tooltip
              formatter={(v)=>[`€ ${fmtIT(v,0)}`,'Spesa']}
              contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px'}}/>
            <Bar dataKey="Spesa" fill="var(--red)" radius={[4,4,0,0]} opacity={0.82}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stacked by category */}
      {topCats.length > 0 && (
        <div className="card" style={{padding:'18px 20px',marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>📂 Per categoria (top 5)</div>
          <div style={{fontSize:11,color:'var(--text3)',marginBottom:14}}>Ultimi 12 mesi suddivisi per categoria di spesa</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={stackedData} barCategoryGap="30%" margin={{top:4,right:4,bottom:0,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={54}
                tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
              <Tooltip formatter={(v,n)=>[`€ ${fmtIT(v,0)}`,n]}
                contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px'}}/>
              <Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:10}}>{v}</span>}/>
              {topCats.map((cat,i)=>(
                <Bar key={cat} dataKey={cat} stackId="a"
                  fill={CATS[cat]?.color||CAT_COLORS[i%CAT_COLORS.length]}
                  radius={i===topCats.length-1?[3,3,0,0]:[0,0,0,0]}/>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent transactions table */}
      <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:14,fontWeight:700}}>📋 Ultime transazioni Satispay</div>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>Uscite più recenti collegate a Satispay</div>
          </div>
          <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,
            background:'var(--surface2)',color:'var(--text3)',fontWeight:600}}>
            {satiUscite.length} totali
          </span>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              {['Data','Descrizione','Categoria','Importo'].map(h=>(
                <th key={h} style={{padding:'8px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                  textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                  borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {satiUscite.length === 0 && (
              <tr><td colSpan={4} style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:13}}>Nessuna uscita Satispay trovata</td></tr>
            )}
            {satiUscite.slice(0,30).map((t,i)=>(
              <tr key={t.txId||i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'8px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                  {fmtDate(t._effDate||t.date)}
                </td>
                <td style={{padding:'8px 14px'}}>
                  <div style={{fontSize:13,fontWeight:500}}>{t.descAI||t.description?.slice(0,50)}</div>
                  {t.merchant && <div style={{fontSize:11,color:'var(--text3)'}}>{t.merchant}</div>}
                </td>
                <td style={{padding:'8px 14px'}}>
                  {t.cat1 ? (
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,fontWeight:600,
                      background:(CATS[t.cat1]?.color||'var(--accent)')+'20',
                      color:(CATS[t.cat1]?.color||'var(--accent)')}}>
                      {t.cat2&&t.cat2!==t.cat1?`${t.cat1} › ${t.cat2}`:t.cat1}
                    </span>
                  ) : <span style={{color:'var(--text3)',fontSize:11}}>—</span>}
                </td>
                <td style={{padding:'8px 14px',textAlign:'right',fontFamily:'var(--font-mono)',
                  fontSize:13,fontWeight:700,color:'var(--red)'}}>
                  −€ {fmtIT(Math.abs(t.amount),2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Non-abbinate modal ────────────────────────────────────
function NonAbbinateModal({ onClose }) {
  const { satiPots, transactions } = useStore()
  const [search, setSearch] = useState('')

  // All txIds linked to any fund
  const allLinked = useMemo(() => {
    const set = new Set()
    satiPots.forEach(p => {
      Object.values(p.data || {}).forEach(entry => {
        if (!entry?.linked) return
        const ids = Array.isArray(entry.linked) ? entry.linked : [entry.linked]
        ids.forEach(id => set.add(id))
      })
    })
    return set
  }, [satiPots])

  const rows = useMemo(() => {
    return transactions
      .filter(t => {
        if (t.excluded) return false
        if (t.amount >= 0) return false
        // must have satispay in description or merchant
        const desc  = (t.description || '').toLowerCase()
        const merch = (t.merchant || '').toLowerCase()
        if (!desc.includes('satispay') && !merch.includes('satispay')) return false
        // exclude "Altro > Satispay Varie"
        if (t.cat1 === 'Altro' && t.cat2 === 'Satispay Varie') return false
        // exclude already linked
        if (allLinked.has(t.txId)) return false
        return true
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [transactions, allLinked])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(t =>
      (t.description||'').toLowerCase().includes(q) ||
      (t.merchant||'').toLowerCase().includes(q) ||
      (t.descAI||'').toLowerCase().includes(q)
    )
  }, [rows, search])

  const total = filtered.reduce((s, t) => s + Math.abs(t.amount), 0)

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
      display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'24px 28px',
        width:680,maxHeight:'88vh',display:'flex',flexDirection:'column',
        boxShadow:'0 16px 48px rgba(0,0,0,.2)'}}>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div>
            <div style={{fontSize:16,fontWeight:800}}>🔍 Transazioni Satispay Non Abbinate</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              Uscite Satispay non collegate a nessun fondo (escluse Satispay Varie)
            </div>
          </div>
          <button onClick={onClose} style={{border:'none',background:'transparent',
            cursor:'pointer',fontSize:18,color:'var(--text3)'}}>✕</button>
        </div>

        {/* Summary bar */}
        <div style={{display:'flex',gap:20,padding:'8px 14px',borderRadius:8,
          background:'rgba(200,80,80,.07)',border:'1px solid rgba(200,80,80,.2)',
          marginBottom:12,fontSize:12}}>
          <span><strong style={{color:'var(--red)'}}>{filtered.length}</strong> <span style={{color:'var(--text3)'}}>transazioni</span></span>
          <span><strong style={{color:'var(--red)'}}>− € {fmtIT(total,2)}</strong> <span style={{color:'var(--text3)'}}>totale</span></span>
        </div>

        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cerca descrizione…"
          style={{marginBottom:10,padding:'6px 10px',borderRadius:7,
            border:'1px solid var(--border)',background:'var(--surface2)',
            fontSize:12,fontFamily:'var(--font-sans)',color:'var(--text)',outline:'none'}}
        />

        {/* Table */}
        <div style={{overflowY:'auto',flex:1,borderRadius:8,border:'1px solid var(--border)'}}>
          <table style={{borderCollapse:'collapse',width:'100%'}}>
            <thead>
              <tr style={{background:'var(--surface2)',position:'sticky',top:0,zIndex:1}}>
                <th style={{padding:'6px 10px',fontSize:10,fontWeight:700,textAlign:'left',
                  textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',
                  borderBottom:'1px solid var(--border)'}}>Data</th>
                <th style={{padding:'6px 10px',fontSize:10,fontWeight:700,textAlign:'left',
                  textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',
                  borderBottom:'1px solid var(--border)'}}>Descrizione AI</th>
                <th style={{padding:'6px 10px',fontSize:10,fontWeight:700,textAlign:'left',
                  textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',
                  borderBottom:'1px solid var(--border)'}}>Conto</th>
                <th style={{padding:'6px 10px',fontSize:10,fontWeight:700,textAlign:'right',
                  textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',
                  borderBottom:'1px solid var(--border)'}}>Importo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={4} style={{padding:'24px',textAlign:'center',
                  color:'var(--text3)',fontSize:13}}>
                  {rows.length === 0 ? '✅ Tutte le transazioni Satispay sono abbinate!' : 'Nessun risultato'}
                </td></tr>
              )}
              {filtered.map((t, i) => (
                <tr key={t.txId} style={{
                  background: i % 2 === 0 ? 'transparent' : 'var(--surface2)',
                  borderBottom:'1px solid var(--border2)'}}>
                  <td style={{padding:'6px 10px',fontSize:11,fontFamily:'var(--font-mono)',
                    color:'var(--text3)',whiteSpace:'nowrap'}}>{t._effDate||t.date}</td>
                  <td style={{padding:'6px 10px',maxWidth:260}}>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--text)',
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {t.descAI || t.description || '—'}
                    </div>
                    {t.descAI && (
                      <div style={{fontSize:10,color:'var(--text3)',overflow:'hidden',
                        textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>
                        {t.description}
                      </div>
                    )}
                  </td>
                  <td style={{padding:'6px 10px',fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}}>
                    {t.account || '—'}
                  </td>
                  <td style={{padding:'6px 10px',fontSize:12,fontWeight:700,fontFamily:'var(--font-mono)',
                    textAlign:'right',color:'var(--red)',whiteSpace:'nowrap'}}>
                    − € {fmtIT(Math.abs(t.amount),2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{marginTop:12,display:'flex',justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function SatispayPage() {
  const { satiPots, transactions } = useStore()
  const [showAdd,         setShowAdd]         = useState(false)
  const [showNonAbbinate, setShowNonAbbinate] = useState(false)
  const [tab, setTab]                         = useState('overview')

  const isSati = (t) => {
    const desc  = (t.description||'').toUpperCase()
    const merch = (t.merchant||'').toUpperCase()
    return t.cat1 === 'Satispay' || desc.includes('SATISPAY') || merch.includes('SATISPAY')
  }

  const satiIncome = useMemo(() =>
    transactions.filter(t => !t.excluded && t.amount > 0 && isSati(t))
      .sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  const satiUscite = useMemo(() =>
    transactions.filter(t => !t.excluded && t.amount < 0 && isSati(t))
      .sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  const currentPot = (tab !== 'overview' && tab !== 'altrespese') ? satiPots.find(p=>p.id===tab) : null

  // Altre Spese: only "Altro > Satispay Varie" expenses
  const altreSpeseTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && t.amount < 0
      && t.cat1 === 'Altro' && t.cat2 === 'Satispay Varie')
      .sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  // If current tab's pot was deleted, fall back to overview (keep 'altrespese' static tab)
  useEffect(() => {
    if (tab !== 'overview' && tab !== 'altrespese' && !satiPots.find(p=>p.id===tab)) setTab('overview')
  }, [satiPots, tab])

  return (
    <div style={{padding:'28px 32px',maxWidth:1280}}>

      {/* ── Header ──────────────────────────────── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600,margin:0}}>
            💚 Satispay — Fondi
          </h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>
            Accantonamenti mensili e riconciliazione transazioni
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button className="btn btn-ghost" onClick={()=>setShowNonAbbinate(true)}
            style={{display:'flex',alignItems:'center',gap:6,
              border:'1px solid var(--red)',color:'var(--red)',borderRadius:8,
              padding:'6px 12px',fontSize:12,fontWeight:700,background:'rgba(200,80,80,.07)'}}>
            🔍 Non abbinate
          </button>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}
            style={{display:'flex',alignItems:'center',gap:6}}>
            <Plus size={14}/> Nuovo Fondo
          </button>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────── */}
      <div style={{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap'}}>
        <SatiTabPill label="📊 Overview" active={tab==='overview'} onClick={()=>setTab('overview')}/>
        {satiPots.map(p=>(
          <SatiTabPill key={p.id} label={`${p.icon} ${p.name}`}
            active={tab===p.id} onClick={()=>setTab(p.id)}/>
        ))}
        <SatiTabPill label="💸 Altre Spese" active={tab==='altrespese'} onClick={()=>setTab('altrespese')}/>
      </div>

      {/* ── Empty state ──────────────────────────── */}
      {satiPots.length === 0 && (
        <div style={{textAlign:'center',padding:'60px 24px',background:'var(--surface)',
          border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
          <div style={{fontSize:40,marginBottom:12}}>💚</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>Nessun fondo Satispay</div>
          <div style={{fontSize:13,color:'var(--text3)',marginBottom:16}}>
            Crea fondi di accantonamento mensile.<br/>
            L'AI riconcilia automaticamente le transazioni trovando l'importo esatto.
          </div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}
            style={{display:'inline-flex',alignItems:'center',gap:6}}>
            <Plus size={14}/> Crea primo fondo
          </button>
        </div>
      )}

      {/* ── Tab content ──────────────────────────── */}
      {tab === 'overview' && satiPots.length > 0 && (
        <SatiOverviewTab
          satiPots={satiPots}
          satiIncome={satiIncome}
          satiUscite={satiUscite}
        />
      )}

      {currentPot && (
        <>
          <FundCard pot={currentPot} allPots={satiPots}/>
          <SatiIncomeSection satiIncome={satiIncome} transactions={transactions} pot={currentPot}/>
          <SatiUsciteSection satiUscite={satiUscite} satiPots={satiPots}/>
        </>
      )}

      {tab === 'altrespese' && (
        <AltreSpesePot altreSpeseTxs={altreSpeseTxs}/>
      )}

      {showAdd && <PotFormModal onClose={()=>setShowAdd(false)}/>}
      {showNonAbbinate && <NonAbbinateModal onClose={()=>setShowNonAbbinate(false)}/>}
    </div>
  )
}
