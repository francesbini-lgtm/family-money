import { useState, useMemo, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { fmtIT, fmtDate } from '../utils/format'
import { showToast } from '../services/notifications'
import { CATS, getMergedCats } from '../data/categories'
import { Plus, Trash2, Edit2, Check, X, Link } from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
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

// Returns array of {expTxId, compensatedAmt} for an income, normalizing old single-entry format
function getLinksArray(linksEntry) {
  if (!linksEntry) return []
  return Array.isArray(linksEntry) ? linksEntry : [linksEntry]
}

function SatiCompensaModal({ incomeEntry, transactions, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const [tab, setTab] = useState('list')
  const [search, setSearch] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeResult, setCodeResult] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saved, setSaved] = useState(false)

  const satiCompSnapshot = getSatiComp()
  const existingLinks = getLinksArray(satiCompSnapshot[incomeEntry.txId])
  const alreadyUsed = existingLinks.reduce((s, l) => s + (l.compensatedAmt || 0), 0)
  const availableForComp = Math.max(0, incomeEntry.amount - alreadyUsed)
  // keep backward compat: existingLink truthy = some link exists
  const existingLink = existingLinks.length > 0 ? existingLinks : null

  const eligible = useMemo(() => {
    const satiComp = getSatiComp()
    const linkedToThis = new Set(getLinksArray(satiComp[incomeEntry.txId]).map(l => l.expTxId))
    const linkedToOthers = new Set(
      Object.entries(satiComp)
        .filter(([id]) => id !== incomeEntry.txId)
        .flatMap(([,l]) => getLinksArray(l).map(x => x.expTxId))
    )
    return transactions
      .filter(t => {
        if (t.txId === incomeEntry.txId || t.excluded) return false
        if (linkedToOthers.has(t.txId)) return false
        if (linkedToThis.has(t.txId)) return false
        if (t.amount >= 0) return false  // only costs
        return true
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
    const links = { ...getSatiComp() }
    const existingLinksArr = getLinksArray(links[incomeEntry.txId])
    const usedSoFar = existingLinksArr.reduce((s, l) => s + (l.compensatedAmt || 0), 0)
    const available = Math.max(0, incomeEntry.amount - usedSoFar)
    // compensate up to what's available
    const compensateAmt = Math.min(absExp, available)
    if (compensateAmt <= 0) return  // nothing left to compensate

    links[incomeEntry.txId] = [...existingLinksArr, { expTxId: selected.txId, compensatedAmt: compensateAmt }]
    saveSatiComp(links)

    // expense: show as reduced by compensateAmt (net = 0* if full, or partial*)
    updateTransaction(selected.txId, { _compensatedAmt: compensateAmt, _compensatedBy: incomeEntry.txId })
    // income: total compensated = sum of all linked expenses (shows income - total*)
    updateTransaction(incomeEntry.txId, { _compensatedAmt: usedSoFar + compensateAmt })

    setSaved(true)
    setTimeout(onClose, 800)
  }

  function unlink() {
    const links = { ...getSatiComp() }
    if (links[incomeEntry.txId]) {
      // reset all linked expenses
      getLinksArray(links[incomeEntry.txId]).forEach(l => {
        updateTransaction(l.expTxId, { _compensatedAmt: null, _compensatedBy: null })
      })
      // reset income
      updateTransaction(incomeEntry.txId, { _compensatedAmt: null })
      delete links[incomeEntry.txId]
      saveSatiComp(links)
    }
    onClose()
  }

  const preview = selected ? (() => {
    const absExp = Math.abs(selected.amount)
    const compensateAmt = Math.min(absExp, availableForComp)
    const fmt = v => v.toLocaleString('it-IT', {minimumFractionDigits:2})
    if (compensateAmt <= 0) return { type:'warn', msg:`⛔ Entrata già usata al massimo — nessuna disponibilità residua` }
    if (absExp <= availableForComp) return { type:'full', msg:`✅ Spesa coperta completamente (€${fmt(compensateAmt)}) — mostrata come 0* nelle statistiche` }
    return { type:'partial', msg:`⚠️ Copertura parziale: spesa ridotta di €${fmt(compensateAmt)} (su €${fmt(absExp)})` }
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
          {alreadyUsed > 0 && (
            <span style={{marginLeft:8,fontSize:11,color: availableForComp > 0 ? 'var(--gold)' : 'var(--red)'}}>
              · Disponibile: <strong>€{availableForComp.toLocaleString('it-IT',{minimumFractionDigits:2})}</strong>
            </span>
          )}
        </div>
        {existingLinks.length > 0 && (
          <div style={{padding:'8px 12px',background:'var(--accent-l)',borderRadius:8,marginBottom:10,fontSize:12}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:existingLinks.length>0?4:0}}>
              <span style={{fontWeight:700}}>🔗 Abbinamenti attivi ({existingLinks.length})</span>
              <button className="btn btn-ghost" style={{fontSize:11,color:'var(--red)'}} onClick={unlink}>✕ Rimuovi tutti</button>
            </div>
            {existingLinks.map(l => {
              const expTx = transactions.find(t => t.txId === l.expTxId)
              return expTx ? (
                <div key={l.expTxId} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',color:'var(--text2)'}}>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:380}}>{expTx.descAI||expTx.description?.slice(0,50)}</span>
                  <strong style={{marginLeft:8,whiteSpace:'nowrap'}}>−€{(l.compensatedAmt||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</strong>
                </div>
              ) : null
            })}
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
                    const isFull = absAmt <= availableForComp
                    return (
                      <tr key={t.txId} onClick={()=>setSelected(t)} style={{borderBottom:'1px solid var(--border)',cursor:'pointer',background:isSel?'var(--accent-l)':'transparent'}}>
                        <td style={{padding:'6px 10px',fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
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
            background:preview.type==='full'?'var(--green-l)':preview.type==='warn'?'var(--red-l)':'rgba(200,150,42,.12)',
            color:preview.type==='full'?'var(--green)':preview.type==='warn'?'var(--red)':'var(--gold)',
            border:`1px solid ${preview.type==='full'?'var(--green)':preview.type==='warn'?'var(--red)':'var(--gold)'}`}}>
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
  while(cur <= end && i++ < 600){ list.push(cur); cur = addMonth(cur) }
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

  const deltaOk = delta >= -0.01  // ok se delta ≥ 0 (selezione sufficiente); negativo = hai selezionato troppo poco

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
              : deltaOk && delta > 0 && deltaMatchesOther
                ? `✅ Delta coperto da ${selectedOtherPot.name}`
                : deltaOk && delta > 0
                  ? `+€ ${fmtIT(delta,2)} eccedente`
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

// ── Fund projection KPIs (shown when noCompensazione is true) ─────────────
function FundProjectionKPIs({ pot }) {
  const now = nowYM()
  const voci = (pot.voci || []).map(migrateVoce)
  const allYMs = monthsRange(pot.startYM || nowYM())

  // Saldo accumulato ad oggi — solo mesi con abbinamento confermato
  const totalAcc = allYMs.filter(m => m <= now && pot.data?.[m]?.linked && !pot.data?.[m]?.explicitUnlinked).reduce((s, ym) => {
    const cells = pot.data?.[ym]?.cells || {}
    return s + voci.reduce((vs, v) => vs + (parseFloat(cells[v.id]) || 0), 0)
  }, 0)

  // Media mensile ultimi 6 mesi (mesi con dati > 0)
  const last6YMs = Array.from({length: 6}, (_, i) => {
    const base = new Date()
    const d = new Date(base.getFullYear(), base.getMonth() - (i + 1), 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  }).filter(ym => ym >= (pot.startYM || nowYM()))

  const monthlyAmounts = last6YMs.map(ym => {
    const cells = pot.data?.[ym]?.cells || {}
    return voci.reduce((s, v) => s + (parseFloat(cells[v.id]) || 0), 0)
  }).filter(v => v > 0)

  const monthlyAvg = monthlyAmounts.length > 0
    ? monthlyAmounts.reduce((s, v) => s + v, 0) / monthlyAmounts.length
    : 0

  const horizons = [1, 2, 5, 10, 15]

  return (
    <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:14,padding:'20px 20px 16px',marginTop:16}}>
      <div style={{fontSize:14,fontWeight:700,color:'var(--text1)',marginBottom:4}}>📈 Proiezione crescita fondo</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:18}}>
        Saldo attuale: <strong>€ {fmtIT(Math.round(totalAcc))}</strong>
        {monthlyAvg > 0 && <> · Versamento medio: <strong>€ {fmtIT(Math.round(monthlyAvg))}/mese</strong></>}
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {horizons.map(years => {
          const projected = Math.round(totalAcc + monthlyAvg * 12 * years)
          const gain = Math.round(monthlyAvg * 12 * years)
          return (
            <div key={years} style={{flex:'1 1 100px',minWidth:100,padding:'14px 16px',
              background:'var(--surface2,#f7f4f0)',border:'1px solid var(--border)',borderRadius:12}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',
                letterSpacing:'.07em',marginBottom:6}}>
                Tra {years === 1 ? '1 anno' : `${years} anni`}
              </div>
              <div style={{fontSize:20,fontWeight:800,color:'var(--text1)',fontVariantNumeric:'tabular-nums'}}>
                € {fmtIT(projected)}
              </div>
              {gain > 0 && (
                <div style={{fontSize:11,color:'var(--green)',marginTop:3}}>
                  +€ {fmtIT(gain)} versati
                </div>
              )}
            </div>
          )
        })}
      </div>
      {monthlyAvg === 0 && (
        <div style={{fontSize:12,color:'var(--text3)',marginTop:8}}>
          Nessun versamento registrato negli ultimi 6 mesi — inserisci dati nella tabella sopra per vedere la proiezione.
        </div>
      )}
    </div>
  )
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

  // Cumulated: solo mesi con abbinamento confermato (linked + non explicitUnlinked)
  const totalAcc = useMemo(()=>{
    return allYMs.filter(m => m <= now && pot.data?.[m]?.linked && !pot.data?.[m]?.explicitUnlinked).reduce((s,ym)=>{
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
    // If user explicitly unlinked this month, NEVER auto-detect (check this FIRST)
    if (pot.data?.[ym]?.explicitUnlinked) return null

    const linked = pot.data?.[ym]?.linked
    if (linked) {
      const linkedAmt = pot.data?.[ym]?.linkedAmt
      const mt = monthTotal(ym)
      const exact = linkedAmt!=null ? Math.abs(linkedAmt-mt)<0.01 : true
      const delta = pot.data?.[ym]?.linkedDelta || 0
      return { linked, exact, delta }
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
      if (pot.data?.[ym]?.explicitUnlinked) return // user explicitly removed link
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
    // Accumulate ALL month updates into a single object and save once,
    // otherwise each linkMonth call would spread the stale render-time
    // pot.data and clobber the links applied in previous iterations.
    const newData = { ...(pot.data || {}) }
    let changed = false

    Object.entries(autoSuggestions).forEach(([ym, match]) => {
      const mt = monthTotal(ym)
      const txIds = Array.isArray(match) ? match : match.txIds
      const txArg = txIds.length === 1 ? txIds[0] : txIds

      const prev = newData[ym] || {}
      newData[ym] = { ...prev, linked: txArg, linkedAmt: mt, explicitUnlinked: false }
      changed = true

      // Auto-generate category splits on linked transactions (same as linkMonth)
      txIds.forEach(txId => {
        const tx = transactions.find(t => t.txId === txId)
        if (!tx) return
        const splits = computeSatiSplits(ym, tx.amount, mt)
        updateTransaction(txId, {
          splits,
          descAI: 'Accantonamento Satispay',
          _satiLinked: { potId: pot.id, potName: pot.name, ym }
        })
      })

      if (!Array.isArray(match) && match.otherPotId) {
        linkOtherPot(match.otherPotId, ym, txArg, match.otherAmt)
      }
    })

    if (changed) updateSatiPot(pot.id, { data: newData })
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
    // If re-linking to new txs, clear splits/_satiLinked from the previously linked txs first
    if (txIds && pot.data?.[ym]?.linked) {
      const prevLinked = pot.data[ym].linked
      const prevArr = Array.isArray(prevLinked) ? prevLinked : [prevLinked]
      const newIds = new Set(Array.isArray(txIds) ? txIds : [txIds])
      prevArr.filter(id => id && !newIds.has(id)).forEach(oldTxId => {
        updateTransaction(oldTxId, { splits: null, _satiLinked: null })
      })
    }

    // Compute selectedTotal to detect delta (tx amounts may exceed the pot total)
    const txIdArr = Array.isArray(txIds) ? txIds : (txIds ? [txIds] : [])
    const totalAmt = amt || 0
    const selectedTotal = txIdArr.reduce((s, id) => {
      const tx = transactions.find(t => t.txId === id)
      return s + Math.abs(tx?.amount || 0)
    }, 0)
    const linkedDelta = selectedTotal > totalAmt + 0.01
      ? Math.round((selectedTotal - totalAmt) * 100) / 100
      : 0

    // Save the link on the pot
    const prev = pot.data?.[ym] || {}
    updateSatiPot(pot.id, { data:{
      ...(pot.data||{}),
      [ym]: {
        ...prev,
        linked: txIds,
        linkedAmt: amt,
        linkedDelta: linkedDelta || null,
        // Mark explicitly unlinked so auto-detection is suppressed
        explicitUnlinked: !txIds ? true : false
      }
    }})

    // Auto-generate category splits on linked transactions.
    // Use selectedTotal as the denominator so splits sum to totalAmt (accantonamento),
    // leaving the delta portion unattributed to any voce.
    const splitDenom = selectedTotal > 0 ? selectedTotal : totalAmt
    txIdArr.forEach(txId => {
      const tx = transactions.find(t => t.txId === txId)
      if (!tx) return
      const splits = computeSatiSplits(ym, tx.amount, splitDenom)
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
    // Read the freshest pot data from the store: when called repeatedly in a
    // loop (autoLinkAll), the render-time allPots snapshot is stale and each
    // spread of otherPot.data would clobber links from previous iterations.
    const otherPot = (useStore.getState().satiPots || allPots || []).find(p => p.id === otherPotId)
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
      if (pot.data?.[ym]?.linked || pot.data?.[ym]?.explicitUnlinked) return // already linked or explicitly unlinked by user

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
                const cellStyle = {padding:'3px 6px',textAlign:'right',width:COL_W}
                if (future || total===0) return (
                  <td key={ym} style={{...cellStyle,color:'var(--text3)',fontSize:11}}>—</td>
                )
                if (status) return (
                  <td key={ym} style={cellStyle}>
                    <button onClick={()=>setAbbina(ym)}
                      title={status.delta > 0.01 ? `Abbinato con delta +€${fmtIT(status.delta,2)} eccedente` : 'Abbinamento trovato — clicca per modificare'}
                      style={{border:'none',background:'transparent',cursor:'pointer',padding:0,
                        display:'flex',alignItems:'center',justifyContent:'flex-end',width:'100%'}}>
                      {status.exact && status.delta <= 0.01
                        ? <span style={{fontSize:14,lineHeight:1}}>✅</span>
                        : status.exact && status.delta > 0.01
                          ? <span style={{fontSize:15,lineHeight:1,fontWeight:900,color:'#ea580c'}}>✓</span>
                          : <span style={{fontSize:14,lineHeight:1}}>⚠️</span>}
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
            {/* Delta TX row — visible only when at least one month has a delta */}
            {visYMs.some(ym => (pot.data?.[ym]?.linkedDelta || 0) > 0.01) && (
              <tr style={{background:'var(--surface)'}}>
                <td/>
                <td style={{padding:'3px 6px',whiteSpace:'nowrap'}}>
                  <span style={{fontSize:9,fontWeight:700,color:'#ea580c',
                    textTransform:'uppercase',letterSpacing:'.06em'}}>Delta TX</span>
                </td>
                <td/><td/>
                {visYMs.map(ym => {
                  const delta = pot.data?.[ym]?.linkedDelta || 0
                  return (
                    <td key={ym} style={{padding:'3px 6px',textAlign:'right',
                      fontFamily:'var(--font-mono)',fontSize:11,
                      color: delta > 0.01 ? '#ea580c' : 'var(--text3)'}}>
                      {delta > 0.01 ? `+${fmtIT(delta,2)}` : '—'}
                    </td>
                  )
                })}
              </tr>
            )}
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

// ── Auto-match helper ─────────────────────────────────────
// Regola: importo esatto ≤15 giorni → auto | ±3€ ≤20 giorni → da confermare
function autoMatchSati(expenses, incomeEntries, existingMatches = {}) {
  const result = {}
  const usedIncomeIds = new Set(
    Object.values(existingMatches)
      .filter(m => m.status === 'matched' && m.incomeTxId)
      .map(m => m.incomeTxId)
  )

  for (const exp of expenses) {
    const existing = existingMatches[exp.txId]
    if (existing?.status === 'matched' && existing?.incomeTxId) {
      // Re-hydrate compensatedAmt if stale/missing (old records stored 0)
      if (!existing.compensatedAmt) {
        const inc = incomeEntries.find(t => t.txId === existing.incomeTxId)
        result[exp.txId] = { ...existing, compensatedAmt: inc ? Math.abs(inc.amount) : 0 }
      } else {
        result[exp.txId] = existing
      }
      usedIncomeIds.add(existing.incomeTxId)
      continue
    }
    if (existing?.status === 'pending_approval') {
      result[exp.txId] = existing
      continue
    }
    if (existing?.status === 'unmatched') {
      // User explicitly rejected this match — do not re-propose it
      result[exp.txId] = existing
      continue
    }

    const expDate = new Date(exp._effDate || exp.date)
    const expAmt  = Math.abs(exp.amount)
    let autoInc = null, pendingInc = null
    let autoDiff = Infinity, pendingScore = Infinity

    for (const inc of incomeEntries) {
      if (usedIncomeIds.has(inc.txId)) continue
      const incDate  = new Date(inc._effDate || inc.date)
      const incAmt   = Math.abs(inc.amount)
      const dateDiff = Math.abs(expDate - incDate) / 86400000
      const amtDiff  = Math.abs(expAmt - incAmt)

      if (amtDiff < 0.02 && dateDiff <= 15 && dateDiff < autoDiff) {
        autoDiff = dateDiff; autoInc = inc
      } else if (amtDiff <= 3 && dateDiff <= 20 && dateDiff < pendingScore) {
        pendingScore = dateDiff; pendingInc = inc
      }
    }

    if (autoInc) {
      result[exp.txId] = { status: 'matched', incomeTxId: autoInc.txId, pendingIncomeTxId: null, compensatedAmt: autoInc.amount }
      usedIncomeIds.add(autoInc.txId)
    } else if (pendingInc) {
      result[exp.txId] = { status: 'pending_approval', incomeTxId: null, pendingIncomeTxId: pendingInc.txId, compensatedAmt: 0 }
    } else {
      result[exp.txId] = { status: 'unmatched', incomeTxId: null, pendingIncomeTxId: null, compensatedAmt: 0 }
    }
  }
  return result
}

// ── Sati pending approval modal ───────────────────────────
function SatiPendingModal({ expense, incomeEntry, onApprove, onReject, onSkip, onClose, current, total }) {
  if (!expense || !incomeEntry) return null
  const diff = Math.round(Math.abs(new Date(expense._effDate||expense.date) - new Date(incomeEntry._effDate||incomeEntry.date)) / 86400000)
  const amtDiff = Math.abs(Math.abs(expense.amount) - Math.abs(incomeEntry.amount))

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'var(--surface)',borderRadius:16,padding:'26px 28px',width:'100%',maxWidth:680,
        maxHeight:'90vh',overflowY:'auto',position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,.28)'}}>
        <button onClick={onClose} style={{position:'absolute',top:14,right:16,background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text3)'}}>✕</button>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
          <div style={{fontSize:16,fontWeight:800}}>⏳ Abbinamento da confermare</div>
          {total > 1 && (
            <span style={{fontSize:12,fontWeight:700,padding:'2px 9px',borderRadius:12,
              background:'var(--surface2)',color:'var(--text3)',border:'1px solid var(--border)'}}>
              {current} / {total}
            </span>
          )}
        </div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:20}}>
          {diff} {diff===1?'giorno':'giorni'} di distanza{amtDiff > 0.01 ? ` · differenza €${fmtIT(amtDiff,2)}` : ''}. Conferma se si tratta della stessa operazione.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:4}}>
          <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:12,padding:'14px 16px'}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--red)',marginBottom:10}}>🧾 Spesa da compensare</div>
            {[
              ['Descrizione', expense.descAI||expense.description?.slice(0,40)||'—'],
              ['Data', fmtDate(expense._effDate||expense.date)],
              ['Importo', `−€ ${fmtIT(Math.abs(expense.amount),2)}`],
              ...(expense.cat1?[['Categoria',`${expense.cat1}${expense.cat2?' › '+expense.cat2:''}`]]:[]),
            ].map(([l,v])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'4px 0',borderBottom:'1px solid rgba(0,0,0,.05)',fontSize:13}}>
                <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',flexShrink:0}}>{l}</span>
                <span style={{textAlign:'right'}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{background:'#f0fdf4',border:'1px solid #6ee7b7',borderRadius:12,padding:'14px 16px'}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--green)',marginBottom:10}}>📥 Entrata Satispay</div>
            {[
              ['Descrizione', incomeEntry.descAI||incomeEntry.description?.slice(0,40)||'—'],
              ['Data', fmtDate(incomeEntry._effDate||incomeEntry.date)],
              ['Importo', `+€ ${fmtIT(incomeEntry.amount,2)}`],
              ...(incomeEntry.cat1?[['Categoria',`${incomeEntry.cat1}${incomeEntry.cat2?' › '+incomeEntry.cat2:''}`]]:[]),
            ].map(([l,v])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'4px 0',borderBottom:'1px solid rgba(0,0,0,.05)',fontSize:13}}>
                <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',flexShrink:0}}>{l}</span>
                <span style={{textAlign:'right'}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:'flex',gap:10,marginTop:20,flexWrap:'wrap',alignItems:'center'}}>
          <button onClick={onApprove}
            style={{padding:'9px 20px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
            ✅ Approva abbinamento
          </button>
          <button onClick={onReject}
            style={{padding:'9px 18px',background:'transparent',color:'var(--text2)',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
            ❌ Rifiuta
          </button>
          {total > 1 && (
            <button onClick={onSkip}
              style={{marginLeft:'auto',padding:'9px 16px',background:'transparent',color:'var(--text3)',
                border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              Salta →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sati abbina expense → income modal ────────────────────
function SatiAbbinaTxModal({ expense, availableIncome, onLink, onClose }) {
  const [chosen, setChosen] = useState('')
  const expDate = new Date(expense._effDate || expense.date)

  const sorted = useMemo(() =>
    [...availableIncome].sort((a,b) =>
      Math.abs(new Date(a._effDate||a.date) - expDate) - Math.abs(new Date(b._effDate||b.date) - expDate)
    ), [availableIncome])

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'var(--surface)',borderRadius:16,padding:'24px 26px',width:'100%',maxWidth:560,
        maxHeight:'90vh',overflowY:'auto',position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,.28)'}}>
        <button onClick={onClose} style={{position:'absolute',top:14,right:16,background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text3)'}}>✕</button>
        <div style={{fontSize:16,fontWeight:800,marginBottom:12}}>🔗 Abbina spesa a entrata Satispay</div>
        <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13}}>
          <span style={{fontWeight:700}}>{expense.descAI||expense.description?.slice(0,40)||'—'}</span>
          <span style={{marginLeft:10,fontSize:12,color:'var(--text3)'}}>{fmtDate(expense._effDate||expense.date)} · </span>
          <span style={{color:'var(--red)',fontWeight:600}}>−€{fmtIT(Math.abs(expense.amount),2)}</span>
        </div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:8}}>Seleziona l'entrata Satispay corrispondente:</div>
        {sorted.length === 0 ? (
          <div style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:13}}>Nessuna entrata Satispay disponibile</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:320,overflowY:'auto',border:'1px solid var(--border)',borderRadius:10,padding:6}}>
            {sorted.map(inc => {
              const diff = Math.round(Math.abs(new Date(inc._effDate||inc.date) - expDate) / 86400000)
              const amtMatch = Math.abs(Math.abs(inc.amount) - Math.abs(expense.amount)) < 0.02
              const isSel = chosen === inc.txId
              return (
                <div key={inc.txId} onClick={() => setChosen(inc.txId)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,cursor:'pointer',
                    background:isSel?'#eff6ff':'transparent',border:`1px solid ${isSel?'#3b82f6':'transparent'}`,transition:'all .1s'}}>
                  <input type="radio" readOnly checked={isSel} style={{flexShrink:0}} onChange={()=>{}}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13}}>{inc.descAI||inc.description?.slice(0,40)||'—'}</div>
                    <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                      {fmtDate(inc._effDate||inc.date)} · {diff===0?'stesso giorno':`${diff}gg di distanza`}
                      {amtMatch && <span style={{marginLeft:6,color:'#16a34a',fontWeight:600}}>✓ stesso importo</span>}
                    </div>
                  </div>
                  <div style={{fontWeight:700,color:'var(--green)',fontSize:13,flexShrink:0}}>+€{fmtIT(inc.amount,2)}</div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{display:'flex',gap:10,marginTop:16}}>
          <button disabled={!chosen} onClick={() => onLink(expense.txId, chosen)}
            style={{padding:'9px 20px',background:chosen?'#16a34a':'var(--border)',color:'#fff',border:'none',borderRadius:8,
              fontSize:13,fontWeight:700,cursor:chosen?'pointer':'not-allowed',fontFamily:'var(--font-sans)'}}>
            🔗 Abbina selezionato
          </button>
          <button onClick={onClose}
            style={{padding:'9px 18px',background:'transparent',color:'var(--text2)',border:'1px solid var(--border)',
              borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Non abbinate income overlay ───────────────────────────
function SatiNonAbbinateOverlay({ incomeEntries, satiMatches, onClose }) {
  const matchedIds = new Set(Object.values(satiMatches).filter(m => m.status==='matched' && m.incomeTxId).map(m => m.incomeTxId))
  const unmatched = incomeEntries
    .filter(t => t.cat1 === 'Entrate' && t.cat2 === 'SATISPAY' && !matchedIds.has(t.txId))
    .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'var(--surface)',borderRadius:16,padding:'24px 28px',width:'100%',maxWidth:740,
        maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 16px 48px rgba(0,0,0,.25)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <span style={{fontSize:18}}>⚠️</span>
          <div style={{fontSize:16,fontWeight:800}}>Entrate non abbinate ({unmatched.length})</div>
          <div style={{fontSize:12,color:'var(--text3)',marginLeft:4}}>· L1 = Entrate · L2 = SATISPAY</div>
          <button onClick={onClose} style={{marginLeft:'auto',border:'none',background:'transparent',cursor:'pointer',fontSize:18,color:'var(--text3)'}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:'auto',border:'1px solid var(--border)',borderRadius:10}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'var(--surface2)',position:'sticky',top:0}}>
                {['Data','Descrizione','Importo','Stato'].map(h => (
                  <th key={h} style={{padding:'9px 14px',fontSize:10,fontWeight:700,textTransform:'uppercase',
                    letterSpacing:'.07em',color:'var(--text3)',borderBottom:'1px solid var(--border)',
                    textAlign:h==='Importo'?'right':'left'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unmatched.length === 0 && (
                <tr><td colSpan={4} style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:13}}>
                  ✅ Tutte le entrate Satispay sono abbinate
                </td></tr>
              )}
              {unmatched.map(t => (
                <tr key={t.txId} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
                  <td style={{padding:'9px 14px'}}>
                    <div style={{fontSize:13,fontWeight:500}}>{t.descAI||t.description?.slice(0,50)}</div>
                    <div style={{fontSize:11,color:'var(--text3)'}}>{(t.description||'').slice(0,60)}</div>
                  </td>
                  <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--green)'}}>
                    +€ {fmtIT(t.amount,2)}
                  </td>
                  <td style={{padding:'9px 14px'}}>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:12,fontWeight:700,
                      background:'#fef3c7',color:'#92400e',border:'1px solid #f59e0b'}}>
                      ⚠️ non abbinata
                    </span>
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

// ── Tx Detail Modal (Spese da compensare) ────────────────
function SatiTxDetailModal({ tx, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const updateVehExpense  = useStore(s => s.updateVehExpense)
  const customCats        = useStore(s => s.customCats)
  const allCats           = useMemo(() => getMergedCats(customCats), [customCats])
  const [cat1, setCat1]   = useState(tx.cat1 || '')
  const [cat2, setCat2]   = useState(tx.cat2 || '')
  const [saved, setSaved] = useState(false)
  const [toReview, setToReview] = useState(tx?._flagged || false)
  function toggleReview() {
    const n=!toReview; setToReview(n)
    if (tx._source !== 'veh') updateTransaction(tx.txId,{_flagged:n})
  }
  const [nonRecurring, setNonRecurring] = useState(tx?._nonRecurring || false)
  function toggleNonRecurring() {
    const n=!nonRecurring; setNonRecurring(n)
    if (tx._source !== 'veh') updateTransaction(tx.txId,{_nonRecurring:n})
  }
  const [editDescAI, setEditDescAI]       = useState(tx.descAI || '')
  const [editingTitle, setEditingTitle]   = useState(false)

  const cat2Options = cat1 && allCats[cat1]?.sub ? allCats[cat1].sub : []
  const merchant    = tx.merchant || tx.descAI || tx.description?.slice(0,50) || '—'
  const effDate     = tx._effDate || tx.date || ''
  const amtStr      = `−€ ${fmtIT(Math.abs(tx.amount), 2)}`

  function saveDescAI() {
    setEditingTitle(false)
    if (!editDescAI.trim()) return
    if (tx._source === 'veh') {
      updateVehExpense(tx._vehId, { desc: editDescAI.trim() })
    } else {
      updateTransaction(tx.txId, { descAI: editDescAI.trim() })
    }
  }

  function handleSave() {
    if (tx._source !== 'veh') {
      updateTransaction(tx.txId, { cat1, cat2 })
    }
    setSaved(true)
    setTimeout(onClose, 1000)
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
        display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'var(--surface)',borderRadius:16,padding:'28px 32px',
        width:480,maxHeight:'88vh',overflowY:'auto',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)',position:'relative'}}>
        <button onClick={onClose}
          style={{position:'absolute',top:16,right:16,border:'none',background:'none',
            cursor:'pointer',fontSize:18,color:'var(--text3)',lineHeight:1}}>✕</button>

        {/* Title + pencil to edit AI descr */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,paddingRight:28}}>
          {editingTitle ? (
            <input value={editDescAI} onChange={e=>setEditDescAI(e.target.value)}
              onBlur={saveDescAI}
              onKeyDown={e=>{if(e.key==='Enter')saveDescAI();if(e.key==='Escape')setEditingTitle(false)}}
              autoFocus
              style={{flex:1,fontSize:16,fontWeight:700,color:'var(--text)',
                border:'none',borderBottom:'2px solid var(--accent)',
                background:'transparent',outline:'none',fontFamily:'var(--font-sans)',padding:'0 2px'}}/>
          ) : (
            <div style={{fontSize:17,fontWeight:700,color:'var(--text)',flex:1}}>
              {editDescAI || merchant}
            </div>
          )}
          <button onClick={()=>setEditingTitle(v=>!v)}
            title="Modifica descrizione AI"
            style={{border:'none',background:'none',cursor:'pointer',
              color:editingTitle?'var(--accent)':'var(--text3)',
              fontSize:14,lineHeight:1,padding:'2px',flexShrink:0,opacity:.7}}>
            ✏️
          </button>
        </div>
        <div style={{fontSize:22,fontWeight:800,color:'var(--red)',fontFamily:'var(--font-mono)',marginBottom:20}}>
          {amtStr}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
          {[
            ['Data', effDate ? fmtDate(effDate) : '—'],
            ['Conto', tx.account || '—'],
            ['Categoria attuale', tx.cat1 ? `${tx.cat1}${tx.cat2 ? ' › '+tx.cat2 : ''}` : '—'],
            ['Importo originale', `−€ ${fmtIT(Math.abs(tx.amount),2)}`],
          ].map(([l,v]) => (
            <div key={l}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',
                color:'var(--text3)',marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,color:'var(--text)',fontWeight:500}}>{v}</div>
            </div>
          ))}
          <div style={{gridColumn:'1/-1'}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',
              color:'var(--text3)',marginBottom:3}}>Descrizione originale</div>
            <div style={{fontSize:12,color:'var(--text2)',wordBreak:'break-word'}}>{tx.description || tx.descAI || '—'}</div>
          </div>
          {tx._compensatedAmt > 0 && (
            <div style={{gridColumn:'1/-1',padding:'8px 12px',background:'rgba(200,160,0,.1)',
              borderRadius:8,border:'1px solid var(--gold)'}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',
                color:'var(--gold)',marginBottom:3}}>Compensazione Satispay</div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--gold)'}}>
                −€ {fmtIT(tx._compensatedAmt,2)} compensati
              </div>
            </div>
          )}
        </div>

        {/* ── To Review flag ── */}
        <div onClick={toggleReview}
          style={{marginBottom:8,display:'flex',alignItems:'center',justifyContent:'space-between',
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

        {/* ── Non Recurring flag ── */}
        <div onClick={toggleNonRecurring}
          style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'10px 14px',borderRadius:8,cursor:'pointer',userSelect:'none',
            background:nonRecurring?'rgba(99,102,241,.08)':'var(--surface2)',
            border:`1px solid ${nonRecurring?'#6366f1':'var(--border)'}`}}>
          <span style={{fontSize:13,fontWeight:600,color:nonRecurring?'#4338ca':'var(--text2)'}}>
            ⚡ Non ricorrente
          </span>
          <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,fontWeight:700,
            background:nonRecurring?'#6366f1':'var(--border)',
            color:nonRecurring?'#fff':'var(--text3)'}}>
            {nonRecurring ? 'Attivo' : 'Off'}
          </span>
        </div>

        <div style={{borderTop:'1px solid var(--border)',paddingTop:16}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:10}}>Modifica Categoria</div>
          {tx._source === 'veh' ? (
            <div style={{fontSize:12,color:'var(--text3)',padding:'8px 12px',background:'var(--surface2)',borderRadius:8}}>
              Spesa manuale veicoli — la categoria si modifica nella sezione Veicoli
            </div>
          ) : (
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <select value={cat1} onChange={e=>{setCat1(e.target.value);setCat2('')}}
                style={{padding:'6px 10px',borderRadius:7,border:'1px solid var(--border)',
                  background:'var(--surface2)',color:'var(--text)',fontSize:12,fontFamily:'var(--font-sans)',flex:1,minWidth:120}}>
                <option value="">— L1 —</option>
                {Object.keys(allCats).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={cat2} onChange={e=>setCat2(e.target.value)} disabled={!cat2Options.length}
                style={{padding:'6px 10px',borderRadius:7,border:'1px solid var(--border)',
                  background:'var(--surface2)',color:'var(--text)',fontSize:12,fontFamily:'var(--font-sans)',flex:1,minWidth:120}}>
                <option value="">— L2 —</option>
                {cat2Options.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={handleSave}
                style={{padding:'6px 16px',borderRadius:7,border:'none',cursor:'pointer',
                  background: saved ? 'var(--green)' : 'var(--accent)',
                  color:'#fff',fontWeight:700,fontSize:12,fontFamily:'var(--font-sans)',
                  transition:'background .2s',whiteSpace:'nowrap'}}>
                {saved ? '✓ Salvato' : 'Salva'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Custom tooltip for "Spese non compensate" bar chart ──
function SatiBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  const hasTx = (d.totalTxs?.length || 0) + (d.incomeTxs?.length || 0) > 0
  if (!hasTx) return null
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,
      padding:'10px 14px',fontSize:11,maxWidth:290,maxHeight:240,overflowY:'auto',
      boxShadow:'0 4px 20px rgba(0,0,0,.15)',lineHeight:1.5,pointerEvents:'none'}}>
      <div style={{fontWeight:700,marginBottom:8,color:'var(--text)',fontSize:12}}>{label}</div>
      {d.totalTxs?.length > 0 && (
        <>
          <div style={{color:'var(--red)',fontWeight:700,marginBottom:4,fontSize:10,
            textTransform:'uppercase',letterSpacing:'.05em'}}>Addebiti non compensati</div>
          {d.totalTxs.map((t,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',gap:10,paddingBottom:2}}>
              <span style={{color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',
                whiteSpace:'nowrap',maxWidth:200}}>
                {t.descAI || t.description || '—'}
              </span>
              <span style={{fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:700,flexShrink:0}}>
                -{fmtIT(t._residual ?? Math.abs(t.amount),2)}
              </span>
            </div>
          ))}
        </>
      )}
      {d.incomeTxs?.length > 0 && (
        <>
          <div style={{color:'var(--green)',fontWeight:700,
            margin:`${(d.totalTxs?.length||0)>0?8:0}px 0 4px`,
            fontSize:10,textTransform:'uppercase',letterSpacing:'.05em'}}>Accrediti non abbinati</div>
          {d.incomeTxs.map((t,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',gap:10,paddingBottom:2}}>
              <span style={{color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',
                whiteSpace:'nowrap',maxWidth:200}}>
                {t.descAI || t.description || '—'}
              </span>
              <span style={{fontFamily:'var(--font-mono)',color:'var(--green)',fontWeight:700,flexShrink:0}}>
                +{fmtIT(Math.abs(t.amount),2)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function SatiBarTotalTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  const hasTx = (d.totalTxs?.length || 0) + (d.incomeTxs?.length || 0) > 0
  if (!hasTx) return null
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,
      padding:'10px 14px',fontSize:11,maxWidth:290,maxHeight:240,overflowY:'auto',
      boxShadow:'0 4px 20px rgba(0,0,0,.15)',lineHeight:1.5,pointerEvents:'none'}}>
      <div style={{fontWeight:700,marginBottom:8,color:'var(--text)',fontSize:12}}>{label}</div>
      {d.totalTxs?.length > 0 && (
        <>
          <div style={{color:'var(--red)',fontWeight:700,marginBottom:4,fontSize:10,
            textTransform:'uppercase',letterSpacing:'.05em'}}>Addebiti totali</div>
          {d.totalTxs.map((t,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',gap:10,paddingBottom:2}}>
              <span style={{color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',
                whiteSpace:'nowrap',maxWidth:200}}>
                {t.descAI || t.description || '—'}
              </span>
              <span style={{fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:700,flexShrink:0}}>
                -{fmtIT(Math.abs(t.amount),2)}
              </span>
            </div>
          ))}
        </>
      )}
      {d.incomeTxs?.length > 0 && (
        <>
          <div style={{color:'var(--green)',fontWeight:700,
            margin:`${(d.totalTxs?.length||0)>0?8:0}px 0 4px`,
            fontSize:10,textTransform:'uppercase',letterSpacing:'.05em'}}>Accrediti totali</div>
          {d.incomeTxs.map((t,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',gap:10,paddingBottom:2}}>
              <span style={{color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',
                whiteSpace:'nowrap',maxWidth:200}}>
                {t.descAI || t.description || '—'}
              </span>
              <span style={{fontFamily:'var(--font-mono)',color:'var(--green)',fontWeight:700,flexShrink:0}}>
                +{fmtIT(Math.abs(t.amount),2)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── SatiIncomeSection ─────────────────────────────────────
function SatiIncomeSection({ satiIncome, transactions, vehExpenses = [], pot }) {
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const updateTransaction = useStore(s => s.updateTransaction)

  // ── Regole configurate nel pot ──────────────────────────
  const satiCompCats = appPrefs?.satiCompCats?.[pot?.id]
  const catFilters = useMemo(() => {
    if (satiCompCats) return satiCompCats.filter(c => c.cat1 && c.cat2)
    return (pot?.voci||[]).filter(v => v.cat1 && v.cat2)
  }, [pot, satiCompCats])

  // ── Spese manuali veicoli — sempre incluse, indipendentemente da catFilters ──
  const vehSpese = useMemo(() =>
    (vehExpenses || [])
      .filter(e => e.amount > 0)
      .map(e => ({
        txId: `veh-${e.id}`,
        _vehId: e.id,
        _source: 'veh',
        amount: -(e.amount || 0),
        date: e.date || '',
        _effDate: e.date || '',
        description: e.desc || '',
        descAI: e.desc || '',
        cat1: 'Veicoli',
        cat2: e.cat || '',
        account: 'Cash (Veicoli)',
      }))
  , [vehExpenses])

  // ── Spese bancarie che rispettano le catFilters configurate ──
  const speseDaComp = useMemo(() => {
    const txRows = catFilters.length > 0 ? transactions.filter(t => {
      if (t.amount >= 0) return false
      if (t.excluded && !t._compensatedBy) return false
      return catFilters.some(f => t.cat1 === f.cat1 && t.cat2 === f.cat2)
    }) : []
    return [...txRows, ...vehSpese]
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  }, [transactions, vehSpese, catFilters])

  // ── Matches storage ─────────────────────────────────────
  const satiMatches = useMemo(() => appPrefs?.satiMatches || {}, [appPrefs?.satiMatches])
  function saveMatches(m) { setAppPref('satiMatches', m) }

  // ── Auto-match on data change ───────────────────────────
  const prevMatchesRef = useRef(null)
  useEffect(() => {
    if (!speseDaComp.length || !satiIncome.length) return
    const computed = autoMatchSati(speseDaComp, satiIncome, satiMatches)
    const key = JSON.stringify(computed)
    if (prevMatchesRef.current === key) return
    prevMatchesRef.current = key

    // Check for NEW pending approvals
    const newPending = Object.entries(computed).filter(([id, m]) =>
      m.status === 'pending_approval' && (!satiMatches[id] || satiMatches[id].status !== 'pending_approval')
    )
    if (newPending.length > 0) {
      showToast(`${newPending.length} compensazione da confermare`, 'warning', 6000)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('💚 Satispay — Compensazioni da confermare', {
          body: `${newPending.length} spese trovate con entrata simile, conferma l'abbinamento`,
          icon: '/icon.svg', tag: 'sati-pending',
        })
      }
    }
    saveMatches({ ...satiMatches, ...computed })

    // Apply newly auto-matched pairs to the transactions themselves
    // (exclude + rename income, compensate expense — same as manual applyMatch).
    // Skip pairs that were already matched with the same income tx.
    Object.entries(computed).forEach(([expTxId, m]) => {
      if (m.status !== 'matched' || !m.incomeTxId) return
      const prev = satiMatches[expTxId]
      if (prev?.status === 'matched' && prev?.incomeTxId === m.incomeTxId) return
      applyMatch(expTxId, m.incomeTxId)
    })
  }, [speseDaComp, satiIncome])

  // ── State ────────────────────────────────────────────────
  const [pendingModal, setPendingModal] = useState(null)  // expense txId
  const [abbinaTx, setAbbinaTx]         = useState(null)  // expense tx
  const [detailTx, setDetailTx]         = useState(null)  // detail popup tx
  const [showNonAbb, setShowNonAbb]     = useState(false)
  const [hideComm, setHideComm]         = useState(true)
  const [hideCompensate, setHideCompensate] = useState(false)
  const [showUnmatchedIncome, setShowUnmatchedIncome] = useState(false)
  const [search, setSearch]             = useState('')
  const [showCatConfig, setShowCatConfig] = useState(false)
  const [selectedRows, setSelectedRows]   = useState(new Set())
  const [showTotalsTable, setShowTotalsTable] = useState(false)
  const [catDraftL1, setCatDraftL1]     = useState('')
  const [catDraftL2, setCatDraftL2]     = useState('')
  const customCats = useStore(s => s.customCats)
  const allCats = useMemo(() => getMergedCats(customCats), [customCats])

  // ── Commission detection ────────────────────────────────
  const isComm = t => t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'

  // ── Filtered rows ───────────────────────────────────────
  const filteredRows = useMemo(() => {
    let list = speseDaComp
    if (hideComm) list = list.filter(t => !isComm(t))
    if (hideCompensate) list = list.filter(t => {
      const match = satiMatches[t.txId]
      const isMatchedInState = match?.status === 'matched' || match?.status === 'pending_approval'
      const isCompensatedOnTx = (t._compensatedAmt || 0) > 0 || !!t._compensatedBy
      return !(isMatchedInState || isCompensatedOnTx)
    })
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(t =>
      (t.descAI||'').toLowerCase().includes(q) ||
      (t.description||'').toLowerCase().includes(q) ||
      (t.cat1||'').toLowerCase().includes(q) ||
      (t.cat2||'').toLowerCase().includes(q) ||
      String(Math.abs(t.amount)).includes(q)
    )
  }, [speseDaComp, hideComm, hideCompensate, search, satiMatches])

  // ── Unmatched income rows ────────────────────────────────
  const unmatchedIncomeRows = useMemo(() => {
    if (!showUnmatchedIncome) return []
    let list = satiIncome.filter(t =>
      !t.excluded &&
      (!satiMatches[t.txId] || satiMatches[t.txId]?.status === 'unmatched')
    )
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        (t.descAI||'').toLowerCase().includes(q) ||
        (t.description||'').toLowerCase().includes(q) ||
        (t.cat1||'').toLowerCase().includes(q) ||
        (t.cat2||'').toLowerCase().includes(q) ||
        String(Math.abs(t.amount)).includes(q)
      )
    }
    return list
  }, [showUnmatchedIncome, satiIncome, satiMatches, search])

  // Combined rows: spese + accrediti non abbinati, sorted by date desc
  const combinedRows = useMemo(() => {
    const spese = filteredRows.map(r => ({...r, _rowType: 'spesa'}))
    if (!showUnmatchedIncome || !unmatchedIncomeRows.length) return spese
    const accrediti = unmatchedIncomeRows.map(r => ({...r, _rowType: 'accredito'}))
    return [...spese, ...accrediti].sort((a, b) => {
      const da = (a._effDate || a.date || '')
      const db = (b._effDate || b.date || '')
      return db.localeCompare(da)
    })
  }, [filteredRows, unmatchedIncomeRows, showUnmatchedIncome])

  // ── Multi-select abbinamento ──────────────────────────────
  const selectedAccrediti = useMemo(() => [...selectedRows].filter(id => combinedRows.find(r => r.txId === id && r._rowType === 'accredito')), [selectedRows, combinedRows])
  const selectedSpese     = useMemo(() => [...selectedRows].filter(id => combinedRows.find(r => r.txId === id && r._rowType === 'spesa')), [selectedRows, combinedRows])
  const canAbbina = selectedAccrediti.length >= 1 && selectedSpese.length >= 1

  // ── KPIs ─────────────────────────────────────────────────
  const totSpese      = speseDaComp.reduce((s,t) => s + Math.abs(t.amount), 0)
  const totCompensate = speseDaComp.reduce((s,t) => {
    const m = satiMatches[t.txId]
    return s + (m?.status === 'matched' ? (m.compensatedAmt || 0) : 0)
  }, 0)
  const saldoNetto    = totCompensate - totSpese  // negative = still to pay
  // Scope pending count to expenses actually in this pot's speseDaComp (not global)
  const pendingCount  = speseDaComp.filter(t => satiMatches[t.txId]?.status === 'pending_approval').length
  const unmatchedIncomeCount = satiIncome.filter(t =>
    t.cat1 === 'Entrate' && t.cat2 === 'SATISPAY' &&
    !Object.values(satiMatches).some(m => m.status === 'matched' && m.incomeTxId === t.txId)
  ).length

  // ── Available income for manual linking ─────────────────
  const matchedIncomeIds = new Set(Object.values(satiMatches).filter(m => m.status==='matched' && m.incomeTxId).map(m => m.incomeTxId))
  const availableIncome  = satiIncome.filter(t => !matchedIncomeIds.has(t.txId))

  // ── Migration: fix all matched income/expense txs to current rules ──
  const migrationDoneRef = useRef(false)
  useEffect(() => {
    if (migrationDoneRef.current) return
    migrationDoneRef.current = true

    // 1) Fix satiMatches-tracked pairs
    const matched = Object.entries(satiMatches).filter(([,m]) => m.status === 'matched' && m.incomeTxId)
    matched.forEach(([expTxId, m]) => {
      // Fix income: ensure excluded + correct name 'Accredito Satispay'
      const inc = transactions.find(t => t.txId === m.incomeTxId)
      if (inc) {
        const patch = {}
        if (!inc.excluded) patch.excluded = true
        if (inc.descAI !== 'Accredito Satispay') patch.descAI = 'Accredito Satispay'
        if (Object.keys(patch).length) updateTransaction(m.incomeTxId, patch)
      }
      // Fix expense: un-exclude, keep _compensatedAmt
      const exp = transactions.find(t => t.txId === expTxId)
      if (exp && exp.excluded) {
        const absExp = Math.abs(exp.amount)
        const comp = exp._compensatedAmt || Math.min(m.compensatedAmt || 0, absExp)
        updateTransaction(expTxId, { excluded: false, _compensatedAmt: comp })
      }
    })

    // 2) Broad historical fix: ANY excluded expense with _compensatedBy set
    //    (old applyMatch excluded fully-covered expenses — undo that)
    transactions.forEach(t => {
      if (t.excluded && t.amount < 0 && t._compensatedBy) {
        // Find the matching income to get compensatedAmt
        const incTx = transactions.find(i => i.txId === t._compensatedBy)
        const comp = t._compensatedAmt || (incTx ? Math.min(Math.abs(incTx.amount), Math.abs(t.amount)) : Math.abs(t.amount))
        updateTransaction(t.txId, { excluded: false, _compensatedAmt: comp })
      }
    })

    // 3) Fix income txs that were renamed 'Accantonamento Satispay' by old code
    //    — rename to 'Accredito Satispay' (keep excluded: true)
    transactions.forEach(t => {
      if (t.excluded && t.amount > 0 && t.descAI === 'Accantonamento Satispay' && t._compensatedBy === undefined) {
        // Only rename abbinamento ones (not pot-linked ones — pot-linked have _satiLinked)
        if (!t._satiLinked) {
          updateTransaction(t.txId, { descAI: 'Accredito Satispay' })
        }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────────
  function applyMatch(expTxId, incTxId) {
    const inc = satiIncome.find(t => t.txId === incTxId)
    const compensatedAmt = inc?.amount || 0
    // 1) Exclude the income + rename to 'Accredito Satispay'
    if (inc) {
      updateTransaction(incTxId, { excluded: true, descAI: 'Accredito Satispay' })
    }
    // 2) Compensate expense — veh expenses tracked via satiMatches only; bank txs also updated
    if (!expTxId.startsWith('veh-')) {
      const exp = transactions.find(t => t.txId === expTxId)
      if (exp) {
        const absExp = Math.abs(exp.amount)
        const comp = Math.min(compensatedAmt, absExp)
        updateTransaction(expTxId, { excluded: false, _compensatedAmt: comp, _compensatedBy: incTxId })
        // Sanity check: if somehow net becomes positive, warn
        const net = absExp - compensatedAmt
        if (net < -0.01) {
          showToast(`⚠️ Eccedenza: €${fmtIT(Math.abs(net),2)} in più rispetto alla spesa`, 'warning')
        }
      }
    }
  }

  function removeMatch(expTxId, incTxId) {
    // Restore income tx
    if (incTxId) {
      updateTransaction(incTxId, { excluded: false, descAI: 'Accredito Satispay' })
    }
    // Restore expense tx (bank txs only — veh expenses tracked via satiMatches)
    if (!expTxId.startsWith('veh-')) {
      updateTransaction(expTxId, { excluded: false, _compensatedAmt: null, _compensatedBy: null })
    }
  }

  function advanceToNextPending(currentExpTxId, updatedMatches) {
    const pendingList = speseDaComp.filter(t =>
      t.txId !== currentExpTxId &&
      (updatedMatches[t.txId]?.status === 'pending_approval')
    )
    setPendingModal(pendingList.length > 0 ? pendingList[0].txId : null)
  }

  function handleSkip(expTxId) {
    // Cycle to next pending without changing match status
    const allPending = speseDaComp.filter(t => satiMatches[t.txId]?.status === 'pending_approval')
    if (allPending.length <= 1) return
    const idx = allPending.findIndex(t => t.txId === expTxId)
    const nextIdx = (idx + 1) % allPending.length
    setPendingModal(allPending[nextIdx].txId)
  }

  function handleApprove(expTxId) {
    const m = satiMatches[expTxId]
    if (!m?.pendingIncomeTxId) return
    const inc = satiIncome.find(t => t.txId === m.pendingIncomeTxId)
    const newMatches = { ...satiMatches, [expTxId]: { status: 'matched', incomeTxId: m.pendingIncomeTxId, pendingIncomeTxId: null, compensatedAmt: inc?.amount || 0 } }
    saveMatches(newMatches)
    applyMatch(expTxId, m.pendingIncomeTxId)
    advanceToNextPending(expTxId, newMatches)
    showToast('Abbinamento approvato ✅', 'success')
  }

  function handleReject(expTxId) {
    const newMatches = { ...satiMatches, [expTxId]: { status: 'unmatched', incomeTxId: null, pendingIncomeTxId: null, compensatedAmt: 0 } }
    saveMatches(newMatches)
    advanceToNextPending(expTxId, newMatches)
    showToast('Abbinamento rifiutato', 'info')
  }

  function handleLink(expTxId, incTxId) {
    const inc = satiIncome.find(t => t.txId === incTxId)
    const newMatches = { ...satiMatches, [expTxId]: { status: 'matched', incomeTxId: incTxId, pendingIncomeTxId: null, compensatedAmt: inc?.amount || 0 } }
    saveMatches(newMatches)
    applyMatch(expTxId, incTxId)
    setAbbinaTx(null)
    showToast('Transazione abbinata con successo', 'success')
  }

  function handleUnlink(expTxId) {
    const prevMatch = satiMatches[expTxId]
    const newMatches = { ...satiMatches, [expTxId]: { status: 'unmatched', incomeTxId: null, pendingIncomeTxId: null, compensatedAmt: 0 } }
    saveMatches(newMatches)
    removeMatch(expTxId, prevMatch?.incomeTxId || null)
  }

  function handleQuickAbbina() {
    if (selectedAccrediti.length !== 1) { showToast('Seleziona esattamente 1 accredito', 'warning'); return }
    if (selectedSpese.length === 0) { showToast('Seleziona almeno 1 spesa', 'warning'); return }
    selectedSpese.forEach(expId => handleLink(expId, selectedAccrediti[0]))
    setSelectedRows(new Set())
  }

  function saveCatFilters(filters) {
    const existing = appPrefs?.satiCompCats || {}
    setAppPref('satiCompCats', { ...existing, [pot.id]: filters })
  }
  function removeCatFilter(cat1, cat2) {
    const next = catFilters.filter(f => !(f.cat1===cat1 && f.cat2===cat2))
    saveCatFilters(next)
  }
  function addCatFilter(cat1, cat2) {
    if (!cat1 || !cat2) return
    if (catFilters.some(f => f.cat1===cat1 && f.cat2===cat2)) return
    saveCatFilters([...catFilters, {cat1, cat2}])
    setCatDraftL1(''); setCatDraftL2('')
  }

  // Se non ci sono catFilters MA ci sono spese veicoli manuali, mostra comunque la sezione
  if (!catFilters.length && !vehSpese.length) {
    return (
      <div style={{marginTop:32,padding:'20px 24px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>📥 Spese e Entrate da Compensare</div>
        <div style={{fontSize:13,color:'var(--text3)'}}>Configura le categorie L1›L2 nelle voci del fondo per abilitare la compensazione automatica.</div>
      </div>
    )
  }

  return (
    <div style={{marginTop:32}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,gap:12,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:16,fontWeight:700}}>📥 Spese e Entrate da Compensare</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
            Spese nelle categorie configurate · abbinamento automatico: importo esatto ≤15 giorni | ±3€ ≤20 giorni da confermare
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {pendingCount > 0 && (
            <button onClick={() => {
              const first = speseDaComp.find(t => satiMatches[t.txId]?.status === 'pending_approval')
              if (first) setPendingModal(first.txId)
            }}
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',
                border:'1px solid #f59e0b',borderRadius:20,background:'#fef3c7',color:'#92400e',
                fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              ⏳ Da confermare ({pendingCount})
            </button>
          )}
          {unmatchedIncomeCount > 0 && (
            <button onClick={() => setShowNonAbb(true)}
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',
                border:'1px solid #f59e0b',borderRadius:20,background:'#fef3c7',color:'#92400e',
                fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              ⚠️ Non abbinate ({unmatchedIncomeCount})
            </button>
          )}
          <button onClick={() => setShowCatConfig(v=>!v)}
            title="Configura categorie da compensare"
            style={{border:`1px solid ${showCatConfig?'var(--accent)':'var(--border)'}`,
              borderRadius:8,padding:'5px 9px',background:showCatConfig?'var(--accent)':'var(--surface)',
              color:showCatConfig?'#fff':'var(--text3)',cursor:'pointer',fontSize:13,
              fontFamily:'var(--font-sans)'}}>
            ⚙️
          </button>
        </div>
      </div>

      {showCatConfig && (
        <div style={{marginBottom:14,padding:'14px 16px',background:'var(--surface2)',
          borderRadius:10,border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:10,color:'var(--text2)'}}>
            ⚙️ Categorie da compensare
            {satiCompCats && (
              <button onClick={() => { const copy = {...(appPrefs?.satiCompCats||{})}; delete copy[pot.id]; setAppPref('satiCompCats', copy); }}
                style={{marginLeft:12,fontSize:10,padding:'1px 8px',borderRadius:6,
                  border:'1px solid var(--border)',background:'var(--surface)',
                  color:'var(--text3)',cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                Ripristina da fondo
              </button>
            )}
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
            {catFilters.map(f => (
              <span key={`${f.cat1}-${f.cat2}`}
                style={{display:'inline-flex',alignItems:'center',gap:4,
                  padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600,
                  background:'var(--accent)20',color:'var(--accent)',
                  border:'1px solid var(--accent)40'}}>
                {f.cat1} › {f.cat2}
                <button onClick={() => removeCatFilter(f.cat1, f.cat2)}
                  style={{border:'none',background:'none',cursor:'pointer',
                    color:'var(--accent)',fontSize:13,lineHeight:1,padding:'0 0 0 2px'}}>×</button>
              </span>
            ))}
            {catFilters.length === 0 && (
              <span style={{fontSize:11,color:'var(--text3)'}}>Nessuna categoria configurata</span>
            )}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <select value={catDraftL1} onChange={e=>{setCatDraftL1(e.target.value);setCatDraftL2('')}}
              style={{padding:'5px 8px',borderRadius:7,border:'1px solid var(--border)',
                background:'var(--surface)',color:'var(--text)',fontSize:12,outline:'none',
                fontFamily:'var(--font-sans)'}}>
              <option value="">— L1 —</option>
              {Object.keys(allCats).map(c1=><option key={c1} value={c1}>{c1}</option>)}
            </select>
            <select value={catDraftL2} onChange={e=>setCatDraftL2(e.target.value)}
              style={{padding:'5px 8px',borderRadius:7,border:'1px solid var(--border)',
                background:'var(--surface)',color:'var(--text)',fontSize:12,outline:'none',
                fontFamily:'var(--font-sans)'}}>
              <option value="">— L2 —</option>
              {(() => {
                const baseSubs = allCats[catDraftL1]?.sub || []
                // Also include any L2 values used in pot voci for this L1 (e.g. "Ormeggio")
                const vociSubs = (pot?.voci||[]).filter(v=>v.cat1===catDraftL1&&v.cat2).map(v=>v.cat2)
                const allSubs = [...new Set([...baseSubs, ...vociSubs])]
                return allSubs.map(c2=><option key={c2} value={c2}>{c2}</option>)
              })()}
            </select>
            <button onClick={() => {
                if (!catDraftL1||!catDraftL2) return
                if (catFilters.some(f=>f.cat1===catDraftL1&&f.cat2===catDraftL2)) {
                  showToast('Categoria già presente nella lista', 'info'); return
                }
                addCatFilter(catDraftL1, catDraftL2)
              }}
              disabled={!catDraftL1||!catDraftL2}
              style={{padding:'5px 14px',borderRadius:7,border:'none',
                background:'var(--accent)',color:'#fff',fontSize:12,fontWeight:700,
                cursor:!catDraftL1||!catDraftL2?'default':'pointer',opacity:!catDraftL1||!catDraftL2?0.4:1,
                fontFamily:'var(--font-sans)'}}>
              + Aggiungi
            </button>
          </div>
        </div>
      )}



      {/* ── Istogramma importi totali annuali ── */}
      {(() => {
        const currentYear = new Date().getFullYear()
        const years = []
        for (let y = 2022; y <= currentYear; y++) years.push(y)

        const barAnnual = years.map(year => {
          const yr = String(year)
          const totalTxs  = speseDaComp.filter(t => (t._effDate||t.date||'').startsWith(yr))
          const total     = totalTxs.reduce((s,t) => s + Math.abs(t.amount), 0)
          const incomeTxs = satiIncome.filter(t => (t._effDate||t.date||'').startsWith(yr))
          const income    = incomeTxs.reduce((s,t) => s + Math.abs(t.amount), 0)
          return {
            label: yr,
            total:  Math.round(total  * 100) / 100,
            income: Math.round(income * 100) / 100,
            totalTxs,
            incomeTxs,
          }
        })

        if (barAnnual.every(b => b.total === 0 && b.income === 0)) return null

        // unique cat pairs for breakdown table
        const catKeys = [...new Map(
          speseDaComp
            .filter(t => t.cat1)
            .map(t => [`${t.cat1}|${t.cat2||''}`, { cat1: t.cat1, cat2: t.cat2||'' }])
        ).values()].sort((a,b) => `${a.cat1}${a.cat2}`.localeCompare(`${b.cat1}${b.cat2}`))

        return (
          <>
            <div className="card" style={{padding:'16px 20px',marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text2)'}}>
                  📊 Spese e accrediti totali per anno
                </div>
                <button onClick={() => setShowTotalsTable(v => !v)}
                  title="Breakdown per categoria"
                  style={{border:`1px solid ${showTotalsTable?'var(--accent)':'var(--border)'}`,
                    background:showTotalsTable?'var(--accent-l,#e8f0ff)':'var(--surface2)',
                    borderRadius:6,padding:'4px 9px',cursor:'pointer',fontSize:13,
                    color:showTotalsTable?'var(--accent)':'var(--text3)'}}>
                  ▦
                </button>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barAnnual} margin={{top:8,right:8,bottom:0,left:0}} barSize={40} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
                  <YAxis hide/>
                  <Legend iconType="circle" iconSize={8} verticalAlign="top" align="right"
                    wrapperStyle={{paddingBottom:6}}
                    formatter={v=><span style={{fontSize:10,color:'var(--text2)'}}>{v}</span>}/>
                  <Tooltip content={<SatiBarTotalTooltip />} cursor={{fill:'var(--surface2)'}}/>
                  <Bar dataKey="total"  fill="var(--red)"   opacity={0.75} radius={[4,4,0,0]} name="Addebiti totali"/>
                  <Bar dataKey="income" fill="var(--green)" opacity={0.7}  radius={[4,4,0,0]} name="Accrediti totali"/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Tabella breakdown per categoria/anno ── */}
            {showTotalsTable && (
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,
                display:'flex',alignItems:'center',justifyContent:'center'}}
                onClick={() => setShowTotalsTable(false)}>
                <div style={{background:'var(--surface)',borderRadius:14,
                  maxWidth:920,width:'92%',maxHeight:'82vh',overflow:'hidden',
                  display:'flex',flexDirection:'column',boxShadow:'0 8px 40px rgba(0,0,0,.3)'}}
                  onClick={e => e.stopPropagation()}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'14px 20px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>Spese per categoria e anno</div>
                    <button onClick={() => setShowTotalsTable(false)}
                      style={{border:'none',background:'none',cursor:'pointer',fontSize:18,color:'var(--text3)',lineHeight:1}}>✕</button>
                  </div>
                  <div style={{overflowY:'auto',flex:1}}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead>
                        <tr>
                          <th style={{padding:'9px 16px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                            textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                            borderBottom:'1px solid var(--border)',position:'sticky',top:0,zIndex:2,textAlign:'left',
                            minWidth:180}}>Categoria</th>
                          {years.map(y => (
                            <th key={y} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                              textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                              borderBottom:'1px solid var(--border)',position:'sticky',top:0,zIndex:2,
                              textAlign:'right',whiteSpace:'nowrap'}}>{y}</th>
                          ))}
                          <th style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                            textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                            borderBottom:'1px solid var(--border)',position:'sticky',top:0,zIndex:2,
                            textAlign:'right',whiteSpace:'nowrap'}}>Totale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catKeys.map(({ cat1, cat2 }) => {
                          const rowAmts = years.map(year =>
                            speseDaComp
                              .filter(t => t.cat1 === cat1 && (t.cat2||'') === cat2 && (t._effDate||t.date||'').startsWith(String(year)))
                              .reduce((s,t) => s + Math.abs(t.amount), 0)
                          )
                          const rowTotal = rowAmts.reduce((s,v) => s + v, 0)
                          if (rowTotal < 0.01) return null
                          const catColor = CATS[cat1]?.color || 'var(--accent)'
                          return (
                            <tr key={`${cat1}|${cat2}`} style={{borderBottom:'1px solid var(--border)'}}>
                              <td style={{padding:'9px 16px',fontSize:12}}>
                                <span style={{fontSize:11,padding:'2px 9px',borderRadius:10,fontWeight:600,
                                  background:catColor+'20',color:catColor,whiteSpace:'nowrap'}}>
                                  {cat2 || cat1}
                                </span>
                                {cat2 && <span style={{fontSize:10,color:'var(--text3)',marginLeft:5}}>{cat1}</span>}
                              </td>
                              {rowAmts.map((amt,i) => (
                                <td key={i} style={{padding:'9px 14px',fontSize:12,textAlign:'right',
                                  fontFamily:'var(--font-mono)',color:amt>0.01?'var(--text)':'var(--text3)'}}>
                                  {amt > 0.01 ? `−€ ${fmtIT(amt,2)}` : '—'}
                                </td>
                              ))}
                              <td style={{padding:'9px 14px',fontSize:12,textAlign:'right',
                                fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--red)'}}>
                                −€&nbsp;{fmtIT(rowTotal,2)}
                              </td>
                            </tr>
                          )
                        })}
                        {/* Totals row */}
                        {(() => {
                          const colTotals = years.map(year =>
                            speseDaComp
                              .filter(t => (t._effDate||t.date||'').startsWith(String(year)))
                              .reduce((s,t) => s + Math.abs(t.amount), 0)
                          )
                          const grand = colTotals.reduce((s,v) => s + v, 0)
                          return (
                            <tr style={{borderTop:'2px solid var(--border)',background:'var(--surface2)'}}>
                              <td style={{padding:'9px 16px',fontSize:12,fontWeight:700}}>Totale</td>
                              {colTotals.map((amt,i) => (
                                <td key={i} style={{padding:'9px 14px',fontSize:12,textAlign:'right',
                                  fontFamily:'var(--font-mono)',fontWeight:700,color:amt>0.01?'var(--red)':'var(--text3)'}}>
                                  {amt > 0.01 ? `−€ ${fmtIT(amt,2)}` : '—'}
                                </td>
                              ))}
                              <td style={{padding:'9px 14px',fontSize:12,textAlign:'right',
                                fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--red)'}}>
                                −€&nbsp;{fmtIT(grand,2)}
                              </td>
                            </tr>
                          )
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* ── Istogramma spese non compensate ultimi 24 mesi ── */}
      {(() => {
        const now = new Date()
        const bar24 = Array.from({length:24}, (_,i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - 23 + i, 1)
          const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
          const label = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][d.getMonth()] + ' ' + String(d.getFullYear()).slice(2)
          // sum expenses in this month that are NOT compensated (or only partially)
          const totalTxsForMonth = speseDaComp
            .filter(t => (t._effDate||t.date||'').slice(0,7) === ym)
            .map(t => {
              const m = satiMatches[t.txId]
              const orig = Math.abs(t.amount)
              const comp = t._compensatedAmt || (m?.status==='matched' ? (m.compensatedAmt||0) : 0)
              return { ...t, _residual: Math.max(0, orig - comp) }
            })
            .filter(t => t._residual > 0.01)
          const total = totalTxsForMonth.reduce((s,t) => s + t._residual, 0)
          const incomeTxsForMonth = satiIncome.filter(t =>
            !t.excluded &&
            (!satiMatches[t.txId] || satiMatches[t.txId]?.status === 'unmatched') &&
            (t._effDate||t.date||'').slice(0,7) === ym
          )
          const income = incomeTxsForMonth.reduce((s,t) => s + Math.abs(t.amount), 0)
          return {
            label,
            total: Math.round(total * 100) / 100,
            income: Math.round(income * 100) / 100,
            totalTxs: totalTxsForMonth,
            incomeTxs: incomeTxsForMonth,
          }
        })

        if (bar24.every(b => b.total === 0 && b.income === 0)) return null

        return (
          <div className="card" style={{padding:'16px 20px',marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:10}}>
              📊 Spese non compensate e accrediti per mese
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bar24} margin={{top:8,right:8,bottom:0,left:0}} barSize={14} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
                <YAxis hide/>
                <Legend iconType="circle" iconSize={8} verticalAlign="top" align="right"
                  wrapperStyle={{paddingBottom:6}}
                  formatter={v=><span style={{fontSize:10,color:'var(--text2)'}}>{v}</span>}/>
                <Tooltip content={<SatiBarTooltip />} cursor={{fill:'var(--surface2)'}}/>
                <Bar dataKey="total" fill="var(--red)" opacity={0.75} radius={[4,4,0,0]} name="Addebiti non compensati"/>
                <Bar dataKey="income" fill="var(--green)" opacity={0.7} radius={[4,4,0,0]} name="Accrediti non abbinati"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* Table card */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {/* Table header bar */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid var(--border)',gap:10,flexWrap:'wrap'}}>
          <div style={{fontSize:14,fontWeight:700}}>
            Spese da compensare ({filteredRows.length}{(search||hideComm)?`/${speseDaComp.length}`:''})</div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <button onClick={() => setHideComm(v => !v)}
              style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 11px',
                border:`1px solid ${hideComm?'#f59e0b':'var(--border)'}`,borderRadius:20,
                background:hideComm?'#fef3c7':'transparent',
                color:hideComm?'#92400e':'var(--text3)',fontSize:11,fontWeight:600,
                cursor:'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>
              🚫 Commissioni
            </button>
            <button
              onClick={() => setHideCompensate(v => !v)}
              style={{
                padding:'4px 10px', borderRadius:20, fontSize:12, cursor:'pointer',
                border: hideCompensate ? 'none' : '1px solid var(--border)',
                background: hideCompensate ? 'var(--green)' : 'var(--surface2)',
                color: hideCompensate ? '#fff' : 'var(--text2)',
                fontWeight: hideCompensate ? 700 : 400,
              }}>
              Compensate
            </button>
            <button
              onClick={() => setShowUnmatchedIncome(v => !v)}
              style={{
                display:'inline-flex',alignItems:'center',gap:5,padding:'5px 11px',
                border:`1px solid ${showUnmatchedIncome?'var(--blue)':'var(--border)'}`,
                borderRadius:20,
                background:showUnmatchedIncome?'var(--blue-l,#e0f0ff)':'transparent',
                color:showUnmatchedIncome?'var(--blue)':'var(--text3)',
                fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
              }}>
              💳 Accrediti
            </button>
            {selectedRows.size > 0 && (
              <button onClick={handleQuickAbbina} disabled={!canAbbina}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 13px',
                  border:`1px solid ${canAbbina?'var(--green)':'var(--border)'}`,borderRadius:20,
                  background:canAbbina?'var(--green-l,#d1fae5)':'var(--surface2)',
                  color:canAbbina?'var(--green)':'var(--text3)',
                  fontSize:11,fontWeight:700,cursor:canAbbina?'pointer':'default',fontFamily:'var(--font-sans)',
                  opacity:canAbbina?1:0.5}}>
                🔗 Abbina ({selectedRows.size})
              </button>
            )}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca..."
              style={{padding:'5px 10px',border:'1px solid var(--border)',borderRadius:8,
                background:'var(--bg)',color:'var(--text)',fontSize:12,fontFamily:'var(--font-sans)',
                outline:'none',width:200}}/>
          </div>
        </div>

        {/* Table */}
        <div style={{overflowY:'auto',maxHeight:'calc(100vh - 420px)'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={{padding:'9px 14px',background:'var(--surface2)',borderBottom:'1px solid var(--border)',
                position:'sticky',top:0,zIndex:2,width:36}}>
                <input type="checkbox"
                  checked={combinedRows.length > 0 && combinedRows.every(r => selectedRows.has(r.txId))}
                  onChange={e => setSelectedRows(e.target.checked ? new Set(combinedRows.map(r => r.txId)) : new Set())}
                  style={{cursor:'pointer'}}/>
              </th>
              {['Data','Descrizione','Categoria','Stato','Importo originale','Residuo','Note'].map(h => (
                <th key={h} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                  textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                  borderBottom:'1px solid var(--border)',
                  position:'sticky',top:0,zIndex:2,
                  textAlign:h.startsWith('Importo')?'right':'left'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {combinedRows.length === 0 && (
              <tr><td colSpan={8} style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:13}}>
                {search ? 'Nessun risultato' : 'Nessuna spesa da compensare — configura le categorie L1›L2 nel fondo'}
              </td></tr>
            )}
            {combinedRows.map(t => {
              if (t._rowType === 'accredito') {
                return (
                  <tr key={t.txId} style={{borderBottom:'1px solid var(--border)', background:'var(--blue-l,#e8f4ff)'}}>
                    <td style={{padding:'9px 14px'}} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedRows.has(t.txId)}
                        onChange={e => setSelectedRows(prev => { const n = new Set(prev); e.target.checked ? n.add(t.txId) : n.delete(t.txId); return n })}
                        style={{cursor:'pointer'}}/>
                    </td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>
                      {fmtDate(t._effDate||t.date)}
                    </td>
                    <td style={{padding:'10px 14px',fontSize:12}}>
                      <div style={{fontWeight:600,color:'var(--blue)'}}>💳 {t.descAI || t.description?.slice(0,50) || '—'}</div>
                      <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>{t.description?.slice(0,60)}</div>
                    </td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'var(--text3)'}}>
                      {t.cat1}{t.cat2?` › ${t.cat2}`:''}
                    </td>
                    <td style={{padding:'10px 14px',fontSize:11}}>
                      <span style={{background:'var(--blue-l,#dbeafe)',color:'var(--blue)',padding:'2px 8px',borderRadius:12,fontWeight:700}}>
                        💳 Accredito
                      </span>
                    </td>
                    <td style={{padding:'10px 14px',fontSize:13,fontWeight:700,color:'var(--green)',textAlign:'right'}}>
                      +€ {fmtIT(Math.abs(t.amount),2)}
                    </td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'var(--text3)',textAlign:'right'}}>—</td>
                    <td style={{padding:'10px 14px'}} onClick={e => e.stopPropagation()}>
                      <SatiNoteCell txId={t.txId}/>
                    </td>
                  </tr>
                )
              }
              // spesa row
              const match  = satiMatches[t.txId]
              const status = match?.status || 'unmatched'
              const origAmt = Math.abs(t.amount)
              // compensatedAmt: try _compensatedAmt on tx, then match record, then direct income lookup
              const incTx = (status === 'matched' && match?.incomeTxId)
                ? satiIncome.find(i => i.txId === match.incomeTxId)
                : null
              const compensatedAmt = t._compensatedAmt
                || (match?.compensatedAmt || 0)
                || (incTx ? Math.abs(incTx.amount) : 0)
              const residual = Math.max(0, origAmt - compensatedAmt)
              const catColor = CATS[t.cat1]?.color || 'var(--accent)'

              const isVeh = t._source === 'veh'
              return (
                <tr key={t.txId}
                  style={{borderBottom:'1px solid var(--border)',transition:'background .1s',cursor:'pointer',
                    background: isVeh ? 'rgba(184,148,42,.06)' : 'transparent'}}
                  onClick={() => setDetailTx(t)}
                  onMouseEnter={e => e.currentTarget.style.background = isVeh ? 'rgba(184,148,42,.13)' : 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = isVeh ? 'rgba(184,148,42,.06)' : 'transparent'}>
                  <td style={{padding:'9px 14px'}} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedRows.has(t.txId)}
                      onChange={e => setSelectedRows(prev => { const n = new Set(prev); e.target.checked ? n.add(t.txId) : n.delete(t.txId); return n })}
                      style={{cursor:'pointer'}}/>
                  </td>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                    {fmtDate(t._effDate||t.date)}
                  </td>
                  <td style={{padding:'9px 14px'}}>
                    <div style={{fontSize:13,fontWeight:500}}>{t.descAI||t.description?.slice(0,50)}</div>
                    <div style={{fontSize:11,color:'var(--text3)',display:'flex',gap:6,alignItems:'center'}}>
                      {isVeh && <span style={{fontSize:10,padding:'1px 6px',borderRadius:8,fontWeight:700,
                        background:'rgba(184,148,42,.15)',color:'var(--gold,#b8942a)',border:'1px solid rgba(184,148,42,.3)'}}>
                        🚗 Cash Veicoli
                      </span>}
                      <span>{(t.description||'').slice(0,60)}</span>
                    </div>
                  </td>
                  <td style={{padding:'9px 14px'}}>
                    {t.cat1 && (
                      <span style={{fontSize:11,padding:'3px 10px',borderRadius:10,fontWeight:600,
                        background:catColor+'20',color:catColor,whiteSpace:'nowrap'}}>
                        {t.cat2 || t.cat1}
                      </span>
                    )}
                  </td>
                  <td style={{padding:'9px 14px'}}>
                    {residual < 0.01 ? (
                      /* Fully compensated — regardless of satiMatches status */
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:11,padding:'2px 8px',borderRadius:12,fontWeight:700,
                          background:'var(--green-l)',color:'var(--green)',border:'1px solid var(--green)33'}}>
                          ✅ compensata
                        </span>
                        {(status === 'matched') && <button onClick={e => { e.stopPropagation(); handleUnlink(t.txId) }}
                          style={{border:'none',background:'none',cursor:'pointer',color:'var(--text3)',fontSize:11,padding:'2px 4px',borderRadius:4}}>✏️</button>}
                      </div>
                    ) : residual < origAmt ? (
                      /* Partially compensated */
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:11,padding:'2px 8px',borderRadius:12,fontWeight:700,
                          background:'rgba(200,160,0,.12)',color:'var(--gold)',border:'1px solid var(--gold)55'}}>
                          ≈ parziale
                        </span>
                        {(status === 'matched') && <button onClick={e => { e.stopPropagation(); handleUnlink(t.txId) }}
                          style={{border:'none',background:'none',cursor:'pointer',color:'var(--text3)',fontSize:11,padding:'2px 4px',borderRadius:4}}>✏️</button>}
                      </div>
                    ) : status === 'pending_approval' ? (
                      <button onClick={e => { e.stopPropagation(); setPendingModal(t.txId) }}
                        style={{fontSize:11,padding:'3px 9px',borderRadius:12,fontWeight:700,
                          background:'#fef3c7',color:'#92400e',border:'1px solid #f59e0b',cursor:'pointer',
                          fontFamily:'var(--font-sans)'}}>
                        ⏳ da confermare
                      </button>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setAbbinaTx(t) }}
                        style={{fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600,
                          background:'transparent',color:'var(--text3)',border:'1px solid var(--border)',
                          cursor:'pointer',fontFamily:'var(--font-sans)',transition:'all .1s'}}
                        onMouseEnter={e => { e.currentTarget.style.borderColor='#3b82f6'; e.currentTarget.style.color='#2563eb' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text3)' }}>
                        🔗 Abbina
                      </button>
                    )}
                  </td>
                  <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--red)'}}>
                    −€ {fmtIT(origAmt,2)}
                  </td>
                  <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,
                    color: residual < 0.01 ? 'var(--green)' : residual < origAmt ? 'var(--gold,#b8942a)' : 'var(--text2)'}}>
                    {residual < 0.01
                      ? <span style={{color:'var(--green)'}}>✅ — €0</span>
                      : residual < origAmt
                        ? <span title={`Compensato: €${fmtIT(compensatedAmt,2)}`}>−€{fmtIT(residual,2)}</span>
                        : `−€ ${fmtIT(origAmt,2)}`}
                  </td>
                  <td style={{padding:'9px 14px'}} onClick={e => e.stopPropagation()}>
                    <SatiNoteCell txId={t.txId}/>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>{/* end scroll wrapper */}
      </div>

      {/* Modals */}
      {detailTx && <SatiTxDetailModal tx={detailTx} onClose={() => setDetailTx(null)}/>}
      {pendingModal && (() => {
        const exp = speseDaComp.find(t => t.txId === pendingModal)
        const m   = exp && satiMatches[exp.txId]
        // Search in satiIncome first; fallback to all transactions in case the tx was excluded
        const inc = m?.pendingIncomeTxId
          ? (satiIncome.find(t => t.txId === m.pendingIncomeTxId) || transactions.find(t => t.txId === m.pendingIncomeTxId))
          : null
        if (!exp || !inc) return null
        const allPending = speseDaComp.filter(t => satiMatches[t.txId]?.status === 'pending_approval')
        const currentIdx = allPending.findIndex(t => t.txId === pendingModal) + 1
        return (
          <SatiPendingModal
            expense={exp} incomeEntry={inc}
            onApprove={() => handleApprove(exp.txId)}
            onReject={() => handleReject(exp.txId)}
            onSkip={() => handleSkip(exp.txId)}
            onClose={() => setPendingModal(null)}
            current={currentIdx} total={allPending.length}
          />
        )
      })()}

      {abbinaTx && (
        <SatiAbbinaTxModal
          expense={abbinaTx}
          availableIncome={availableIncome}
          onLink={handleLink}
          onClose={() => setAbbinaTx(null)}
        />
      )}

      {showNonAbb && (
        <SatiNonAbbinateOverlay
          incomeEntries={satiIncome}
          satiMatches={satiMatches}
          onClose={() => setShowNonAbb(false)}
        />
      )}
    </div>
  )
}

// ── date formatter (legacy dd/MM/yyyy — kept for compatibility) ──
function fmtDateLong(d) {
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
        if (md?.linked) {
          // md.linked can be an array (multi-tx link) — add an entry per txId,
          // otherwise the array is coerced to "id1,id2" and per-tx lookups fail
          const keys = Array.isArray(md.linked) ? md.linked : [md.linked]
          keys.forEach(key => { map[key] = { potName: p.name, potIcon: p.icon, ym } })
        }
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
  const { appPrefs, setAppPref } = useStore()
  const satiNetOverride = appPrefs?.satiNetOverride ?? null
  const [editingNet, setEditingNet] = useState(false)
  const [netDraft, setNetDraft] = useState('')
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

  const displayAcc = satiNetOverride !== null ? satiNetOverride : totalAcc

  // Chart: all months from data start to now, per fund line (net of cumulative releases)
  const allChartMonths = []
  const potStarts = satiPots.map(p => p.startYM).filter(Boolean)
  const chartStart = potStarts.length > 0
    ? potStarts.reduce((a, b) => (a < b ? a : b))
    : `${new Date().getFullYear() - 4}-01`
  let chartCur = chartStart
  while (chartCur <= now) { allChartMonths.push(chartCur); chartCur = addMonth(chartCur) }

  const chartActual = allChartMonths.map(ym => {
    const entry = { label: ymLabel(ym), ym }
    const cumReleases = satiIncome.reduce((s, t) => {
      const tYM = (t._effDate || t.date || '').slice(0, 7)
      return tYM <= ym ? s + t.amount : s
    }, 0)
    const totalGross = satiPots.reduce((s, p) => s + potAcc(p, ym), 0)
    const scale = totalGross > 0 ? Math.max(0, totalGross - cumReleases) / totalGross : 1
    satiPots.forEach(p => {
      entry[p.name] = Math.round(potAcc(p, ym) * scale)
    })
    entry.total = Math.max(0, Math.round(totalGross - cumReleases))
    return entry
  })

  // Forecast: from next month to Dec 2026, dashed
  const last3 = Array.from({length:3}, (_, i) => addMonth(now, -(i+1))).reverse()
  const avgDeposit = {}
  satiPots.forEach(p => {
    const vals = last3.map(ym => potMonth(p, ym)).filter(v => v > 0)
    avgDeposit[p.id] = vals.length > 0 ? vals.reduce((s,v)=>s+v,0)/vals.length : 0
  })
  const currentScale = (() => {
    const lastEntry = chartActual[chartActual.length - 1]
    const grossNow = satiPots.reduce((s,p)=>s+potAcc(p,now),0)
    return grossNow > 0 ? (lastEntry?.total || 0) / grossNow : 1
  })()
  const forecastMonths = []
  let fc = addMonth(now, 1)
  const forecastEnd = `${new Date().getFullYear() + 2}-12`
  while (fc <= forecastEnd) { forecastMonths.push(fc); fc = addMonth(fc) }
  const chartForecast = forecastMonths.map((ym, i) => {
    const entry = { label: ymLabel(ym), ym }
    satiPots.forEach(p => {
      const lastActual = chartActual[chartActual.length-1]?.[p.name] || 0
      entry[`${p.name}_f`] = Math.round(lastActual + avgDeposit[p.id] * currentScale * (i+1))
    })
    return entry
  })
  // Connect last actual point to first forecast for smooth dashed start
  if (chartForecast.length > 0 && chartActual.length > 0) {
    const last = chartActual[chartActual.length - 1]
    const junction = { ...chartForecast[0], label: last.label }
    satiPots.forEach(p => { junction[`${p.name}_f`] = last[p.name] })
    chartForecast.unshift(junction)
  }
  // Nullify zero points where next month is also zero (hide leading/trailing zeros per fund)
  satiPots.forEach(p => {
    for (let i = 0; i < chartActual.length; i++) {
      const val = chartActual[i][p.name] || 0
      const nextVal = i + 1 < chartActual.length ? (chartActual[i+1][p.name] || 0) : 0
      if (val === 0 && nextVal === 0) chartActual[i][p.name] = null
    }
  })

  const chartData = [...chartActual, ...chartForecast]

  // Last 12 months for bar chart (monthly deposits)
  const last12 = Array.from({length:12},(_,i)=>addMonth(now,i-11))

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
        {/* Special KPI: Totale accantonato (netto) with override */}
        <div className="card" style={{padding:'14px 18px',borderLeft:'3px solid var(--green)',gridColumn:'span 1'}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:5}}>
            💰 Totale accantonato (netto)
          </div>
          {editingNet ? (
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <input type="number" autoFocus value={netDraft} onChange={e=>setNetDraft(e.target.value)}
                style={{width:100,fontSize:15,fontWeight:700,fontFamily:'var(--font-mono)',
                  border:'1px solid var(--accent)',borderRadius:6,padding:'2px 6px',background:'var(--surface)',color:'var(--text)'}}/>
              <button onClick={()=>{setAppPref('satiNetOverride',Number(netDraft));setEditingNet(false)}}
                style={{border:'none',background:'var(--green)',color:'#fff',borderRadius:5,padding:'3px 8px',cursor:'pointer',fontWeight:700,fontSize:12}}>✓</button>
              <button onClick={()=>{setAppPref('satiNetOverride',null);setEditingNet(false)}}
                style={{border:'1px solid var(--border)',background:'var(--surface)',borderRadius:5,padding:'3px 8px',cursor:'pointer',fontSize:12,color:'var(--text3)'}}>✕ Reset</button>
            </div>
          ) : (
            <div style={{display:'flex',alignItems:'baseline',gap:8}}>
              <div style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--green)'}}>
                € {fmtIT(displayAcc,0)}
              </div>
              <button onClick={()=>{setNetDraft(String(displayAcc));setEditingNet(true)}}
                style={{border:'none',background:'none',cursor:'pointer',fontSize:12,color:'var(--text3)',padding:'0 2px'}}
                title="Rettifica manuale">✏️</button>
            </div>
          )}
          {satiNetOverride !== null && (
            <div style={{fontSize:10,marginTop:3,color:'var(--gold)'}}>
              rettifica manuale · calcolato: €{fmtIT(totalAcc,0)}
            </div>
          )}
          {satiNetOverride === null && totEntrate>0 && (
            <div style={{fontSize:10,marginTop:3,color:'var(--text3)'}}>
              lordo €{fmtIT(totalAccLordo,0)} − rilasci €{fmtIT(totEntrate,0)}
            </div>
          )}
        </div>

        {/* Remaining KPI cards */}
        {[
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

      {/* Cumulative line chart from 2022 */}
      <div className="card" style={{padding:'18px 20px',marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:4}}>
          <div style={{fontSize:14,fontWeight:700}}>📈 Patrimonio accumulato (dal 2022)</div>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--text3)'}}>
            <span style={{display:'flex',alignItems:'center',gap:4}}>
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="var(--text3)" strokeWidth="2"/></svg>
              storico
            </span>
            <span style={{display:'flex',alignItems:'center',gap:4}}>
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="var(--text3)" strokeWidth="2" strokeDasharray="4 2"/></svg>
              previsione
            </span>
          </div>
        </div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>Saldo cumulativo netto per fondo</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{top:4,right:4,bottom:0,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:9,fill:'var(--text3)'}} axisLine={false} tickLine={false}
              interval={2}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={52}
              tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
            <Tooltip formatter={(v,n)=>[`€ ${fmtIT(v,0)}`,n.replace('_f',' (prev)')]}
              contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px'}}
              labelStyle={{fontWeight:700,color:'var(--text2)'}}/>
            {satiPots.length > 1 && (
              <Legend iconType="circle" iconSize={7}
                formatter={v=><span style={{fontSize:10}}>{v.replace('_f',' (prev)')}</span>}/>
            )}
            {satiPots.map((p,i)=>(
              <Line key={p.id} type="monotone" dataKey={p.name}
                stroke={POT_COLORS[i%POT_COLORS.length]} strokeWidth={2}
                dot={{r:2.5, fill:POT_COLORS[i%POT_COLORS.length], strokeWidth:0}}
                activeDot={{r:5}} isAnimationActive={false} connectNulls={false}/>
            ))}
            {satiPots.map((p,i)=>(
              <Line key={`${p.id}_f`} type="monotone" dataKey={`${p.name}_f`}
                stroke={POT_COLORS[i%POT_COLORS.length]} strokeWidth={2}
                strokeDasharray="6 3" strokeOpacity={0.6}
                dot={false} activeDot={{r:4}} isAnimationActive={false} connectNulls={false}/>
            ))}
          </LineChart>
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
  const [hideComm, setHideComm] = useState(true)  // default: commissioni hidden
  const [search, setSearch] = useState('')
  const [selectedTx, setSelectedTx] = useState(null)
  const { updateTransaction, customCats } = useStore()
  const allCats = getMergedCats(customCats)

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

  const isComm = t => t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'

  const filteredTxs = useMemo(() => {
    let rows = satiUscite
    if (hideComm) rows = rows.filter(t => !isComm(t))
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(t =>
        (t.descAI||'').toLowerCase().includes(q) ||
        (t.description||'').toLowerCase().includes(q) ||
        (t.merchant||'').toLowerCase().includes(q) ||
        (t.cat1||'').toLowerCase().includes(q) ||
        (t.cat2||'').toLowerCase().includes(q)
      )
    }
    return rows
  }, [satiUscite, hideComm, search])

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

      {/* Transactions table */}
      <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
        <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:14,fontWeight:700}}>📋 Transazioni — Altro</div>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
              {filteredTxs.length}{(hideComm||search)?`/${satiUscite.length}`:''} transazioni
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button
              onClick={() => setHideComm(v => !v)}
              style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:16,cursor:'pointer',
                fontFamily:'var(--font-sans)',border: hideComm ? '1px solid var(--gold)' : '1px solid var(--border)',
                background: hideComm ? 'rgba(200,160,0,.1)' : 'var(--surface)',
                color: hideComm ? 'var(--gold)' : 'var(--text3)'}}>
              🚫 Commissioni
            </button>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca…"
              style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',
                background:'var(--surface2)',fontSize:12,fontFamily:'var(--font-sans)',
                color:'var(--text)',outline:'none',width:160}}
            />
          </div>
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
            {filteredTxs.length === 0 && (
              <tr><td colSpan={4} style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:13}}>
                {satiUscite.length === 0 ? 'Nessuna uscita trovata' : 'Nessun risultato per la ricerca'}
              </td></tr>
            )}
            {filteredTxs.map((t,i)=>(
              <tr key={t.txId||i} onClick={() => setSelectedTx(t)}
                style={{borderBottom:'1px solid var(--border)',cursor:'pointer',transition:'background .1s'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
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

      {/* Detail modal */}
      {selectedTx && (
        <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={e=>{ if(e.target===e.currentTarget) setSelectedTx(null) }}>
          <div style={{background:'var(--surface)',borderRadius:14,padding:'24px 28px',
            width:480,maxHeight:'88vh',overflowY:'auto',
            boxShadow:'0 16px 48px rgba(0,0,0,.2)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div style={{fontSize:16,fontWeight:800}}>{selectedTx.descAI||selectedTx.description?.slice(0,40)}</div>
              <button onClick={()=>setSelectedTx(null)} style={{border:'none',background:'transparent',
                cursor:'pointer',fontSize:18,color:'var(--text3)'}}>✕</button>
            </div>
            {/* Fields */}
            {[
              ['Data',        fmtDate(selectedTx._effDate||selectedTx.date)],
              ['Importo',     `−€ ${fmtIT(Math.abs(selectedTx.amount),2)}`],
              ['Descrizione', selectedTx.description||'—'],
              ['Merchant',    selectedTx.merchant||'—'],
              ['Account',     selectedTx.account||'—'],
              ['Note AI',     selectedTx.descAI||'—'],
            ].map(([label, val]) => (
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',
                padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',
                  color:'var(--text3)',minWidth:90}}>{label}</span>
                <span style={{fontSize:13,color:'var(--text)',textAlign:'right',flex:1,marginLeft:12}}>
                  {label==='Importo'?<strong style={{color:'var(--red)'}}>{val}</strong>:val}
                </span>
              </div>
            ))}
            {/* Category edit */}
            <div style={{marginTop:16}}>
              <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',
                color:'var(--text3)',marginBottom:8}}>Categoria</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <select
                  value={selectedTx.cat1||''}
                  onChange={e => {
                    const c1 = e.target.value
                    updateTransaction(selectedTx.txId, { cat1: c1, cat2: '' })
                    setSelectedTx(prev => ({ ...prev, cat1: c1, cat2: '' }))
                  }}
                  style={{padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',
                    background:'var(--surface2)',color:'var(--text)',fontSize:13,outline:'none',
                    fontFamily:'var(--font-sans)'}}>
                  <option value="">— L1 —</option>
                  {Object.keys(allCats).map(c1 => <option key={c1} value={c1}>{c1}</option>)}
                </select>
                <select
                  value={selectedTx.cat2||''}
                  onChange={e => {
                    const c2 = e.target.value
                    updateTransaction(selectedTx.txId, { cat2: c2 })
                    setSelectedTx(prev => ({ ...prev, cat2: c2 }))
                  }}
                  style={{padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',
                    background:'var(--surface2)',color:'var(--text)',fontSize:13,outline:'none',
                    fontFamily:'var(--font-sans)'}}>
                  <option value="">— L2 —</option>
                  {(allCats[selectedTx.cat1]?.sub||[]).map(c2 => <option key={c2} value={c2}>{c2}</option>)}
                </select>
              </div>
            </div>
            <div style={{marginTop:18,display:'flex',justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={()=>setSelectedTx(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Accrediti non abbinati modal ──────────────────────────
function AccreditiNonAbbinatiModal({ satiIncome, satiMatches, onClose }) {
  const [search, setSearch] = useState('')
  const [hideComm, setHideComm] = useState(true)
  const [abbinaTx, setAbbinaTx] = useState(null)
  const { transactions, satiPots, setAppPref, appPrefs, updateTransaction } = useStore()

  const matchedIds = new Set(
    Object.values(satiMatches).filter(m => m.status==='matched' && m.incomeTxId).map(m => m.incomeTxId)
  )
  const rows = satiIncome.filter(t => !matchedIds.has(t.txId))

  const isComm = t => t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'

  const filtered = useMemo(() => {
    let list = rows
    if (hideComm) list = list.filter(t => !isComm(t))
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(t =>
      (t.description||'').toLowerCase().includes(q) ||
      (t.merchant||'').toLowerCase().includes(q) ||
      (t.descAI||'').toLowerCase().includes(q)
    )
  }, [rows, search, hideComm])

  const total = filtered.reduce((s, t) => s + t.amount, 0)

  const unmatchedExpenses = useMemo(() => {
    const allCatFilters = []
    satiPots.forEach(p => {
      (p.voci||[]).forEach(v => { if(v.cat1&&v.cat2) allCatFilters.push({cat1:v.cat1,cat2:v.cat2}) })
    })
    const compCats = appPrefs?.satiCompCats || {}
    Object.values(compCats).forEach(cats => {
      (cats||[]).forEach(c => { if(c.cat1&&c.cat2) allCatFilters.push(c) })
    })
    const matchedExpIds = new Set(
      Object.entries(satiMatches).filter(([,m])=>m.status==='matched').map(([id])=>id)
    )
    return transactions.filter(t => {
      if (t.excluded || t.amount >= 0 || matchedExpIds.has(t.txId)) return false
      return allCatFilters.some(f => t.cat1===f.cat1 && t.cat2===f.cat2)
    }).sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  }, [transactions, satiPots, satiMatches, appPrefs])

  function handleLink(incomeTxId, expTxId) {
    const inc = satiIncome.find(t => t.txId === incomeTxId)
    const newMatches = { ...(appPrefs?.satiMatches||{}), [expTxId]: {
      status: 'matched', incomeTxId, pendingIncomeTxId: null, compensatedAmt: inc?.amount||0
    }}
    setAppPref('satiMatches', newMatches)
    // Apply the same side-effects as SatiIncomeSection's link path (applyMatch)
    const compensatedAmt = inc?.amount || 0
    if (inc) {
      updateTransaction(incomeTxId, { excluded: true, descAI: 'Accredito Satispay' })
    }
    if (!expTxId.startsWith('veh-')) {
      const exp = transactions.find(t => t.txId === expTxId)
      if (exp) {
        const comp = Math.min(compensatedAmt, Math.abs(exp.amount))
        updateTransaction(expTxId, { excluded: false, _compensatedAmt: comp, _compensatedBy: incomeTxId })
      }
    }
    setAbbinaTx(null)
    showToast('Abbinamento salvato', 'success')
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
      display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'24px 28px',
        width:900,maxHeight:'88vh',display:'flex',flexDirection:'column',
        boxShadow:'0 16px 48px rgba(0,0,0,.2)'}}>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div>
            <div style={{fontSize:16,fontWeight:800}}>⚠️ Accrediti non abbinati ({rows.length})</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              Entrate Satispay (+) non ancora abbinate a una spesa
            </div>
          </div>
          <button onClick={onClose} style={{border:'none',background:'transparent',
            cursor:'pointer',fontSize:18,color:'var(--text3)'}}>✕</button>
        </div>

        <div style={{display:'flex',gap:20,padding:'8px 14px',borderRadius:8,
          background:'rgba(200,160,0,.07)',border:'1px solid rgba(200,160,0,.25)',
          marginBottom:12,fontSize:12}}>
          <span><strong style={{color:'var(--gold)'}}>{filtered.length}</strong> <span style={{color:'var(--text3)'}}>accrediti</span></span>
          <span><strong style={{color:'var(--green)'}}>+ € {fmtIT(total,2)}</strong> <span style={{color:'var(--text3)'}}>totale</span></span>
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
          <button onClick={()=>setHideComm(v=>!v)}
            style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:16,cursor:'pointer',
              fontFamily:'var(--font-sans)',
              border: hideComm?'1px solid var(--gold)':'1px solid var(--border)',
              background: hideComm?'rgba(200,160,0,.1)':'var(--surface)',
              color: hideComm?'var(--gold)':'var(--text3)'}}>
            🚫 Commissioni
          </button>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Cerca descrizione…"
            style={{flex:1,padding:'6px 10px',borderRadius:7,
              border:'1px solid var(--border)',background:'var(--surface2)',
              fontSize:12,fontFamily:'var(--font-sans)',color:'var(--text)',outline:'none'}}/>
        </div>

        <div style={{overflowY:'auto',flex:1,borderRadius:8,border:'1px solid var(--border)'}}>
          <table style={{borderCollapse:'collapse',width:'100%'}}>
            <thead>
              <tr style={{background:'var(--surface2)',position:'sticky',top:0,zIndex:1}}>
                {['Data','Descrizione','Importo','Azioni','Nota'].map(h => (
                  <th key={h} style={{padding:'6px 10px',fontSize:10,fontWeight:700,textAlign:h==='Importo'?'right':'left',
                    textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',
                    borderBottom:'1px solid var(--border)'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{padding:'24px',textAlign:'center',
                  color:'var(--text3)',fontSize:13}}>
                  {rows.length === 0 ? '✅ Tutti gli accrediti Satispay sono abbinati!' : 'Nessun risultato'}
                </td></tr>
              )}
              {filtered.map((t, i) => (
                <tr key={t.txId} style={{
                  background: i % 2 === 0 ? 'transparent' : 'var(--surface2)',
                  borderBottom:'1px solid var(--border2)'}}>
                  <td style={{padding:'6px 10px',fontSize:11,fontFamily:'var(--font-mono)',
                    color:'var(--text3)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
                  <td style={{padding:'6px 10px',maxWidth:240}}>
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
                  <td style={{padding:'6px 10px',fontSize:12,fontWeight:700,fontFamily:'var(--font-mono)',
                    textAlign:'right',color:'var(--green)',whiteSpace:'nowrap'}}>
                    + € {fmtIT(t.amount,2)}
                  </td>
                  <td style={{padding:'6px 10px'}}>
                    <button onClick={()=>setAbbinaTx(abbinaTx?.txId===t.txId?null:t)}
                      style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:14,
                        border:'1px solid var(--border)',background:'var(--surface)',
                        cursor:'pointer',fontFamily:'var(--font-sans)',color:'var(--text2)',
                        whiteSpace:'nowrap'}}>
                      🔗 Abbina
                    </button>
                  </td>
                  <td style={{padding:'6px 10px',minWidth:140,maxWidth:200}}>
                    <SatiNoteCell txId={t.txId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {abbinaTx && (
          <div style={{marginTop:10,padding:'12px 14px',borderRadius:8,
            border:'1px solid var(--accent)',background:'var(--accent)08'}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:'var(--accent)'}}>
              🔗 Abbina accredito +€{fmtIT(abbinaTx.amount,2)} a una spesa:
            </div>
            {unmatchedExpenses.length === 0 ? (
              <div style={{fontSize:12,color:'var(--text3)'}}>Nessuna spesa non abbinata trovata</div>
            ) : (
              <div style={{maxHeight:200,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
                {unmatchedExpenses.map(exp => {
                  const daysDiff = Math.abs(new Date(exp._effDate||exp.date) - new Date(abbinaTx._effDate||abbinaTx.date)) / 86400000
                  return (
                    <div key={exp.txId}
                      onClick={() => handleLink(abbinaTx.txId, exp.txId)}
                      style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                        padding:'7px 10px',borderRadius:6,border:'1px solid var(--border)',
                        background:'var(--surface)',cursor:'pointer',transition:'background .1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='var(--surface)'}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600}}>{exp.descAI||exp.description?.slice(0,40)}</div>
                        <div style={{fontSize:10,color:'var(--text3)'}}>
                          {exp._effDate||exp.date} · {exp.cat1} › {exp.cat2}
                          {daysDiff <= 30 && <span style={{marginLeft:6,color:'var(--green)',fontWeight:700}}>
                            {Math.round(daysDiff)}g fa
                          </span>}
                        </div>
                      </div>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,
                        color:'var(--red)',whiteSpace:'nowrap',marginLeft:12}}>
                        −€{fmtIT(Math.abs(exp.amount),2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={() => setAbbinaTx(null)}
              style={{marginTop:8,fontSize:11,padding:'3px 10px',borderRadius:6,
                border:'1px solid var(--border)',background:'var(--surface)',
                cursor:'pointer',fontFamily:'var(--font-sans)',color:'var(--text3)'}}>
              Annulla
            </button>
          </div>
        )}

        <div style={{marginTop:12,display:'flex',justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}

// ── Non-abbinate modal ────────────────────────────────────
function NonAbbinateModal({ onClose }) {
  const { satiPots, transactions, updateSatiPot } = useStore()
  const [search, setSearch] = useState('')
  const [hideComm, setHideComm] = useState(true)
  const [abbinaTx, setAbbinaTx] = useState(null)

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
        // exclude "Altro > Satispay Varie" (case-insensitive)
        if ((t.cat1||'').toLowerCase() === 'altro' && (t.cat2||'').toLowerCase() === 'satispay varie') return false
        // exclude already linked
        if (allLinked.has(t.txId)) return false
        return true
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [transactions, allLinked])

  const isComm = t => t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'

  const filtered = useMemo(() => {
    let list = rows
    if (hideComm) list = list.filter(t => !isComm(t))
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(t =>
      (t.description||'').toLowerCase().includes(q) ||
      (t.merchant||'').toLowerCase().includes(q) ||
      (t.descAI||'').toLowerCase().includes(q)
    )
  }, [rows, search, hideComm])

  const total = filtered.reduce((s, t) => s + Math.abs(t.amount), 0)

  const availablePotMonths = useMemo(() => {
    const result = []
    satiPots.forEach(p => {
      Object.entries(p.data||{}).forEach(([ym, md]) => {
        if (!md?.linked && md?.cells && Object.values(md.cells).some(v=>parseFloat(v)>0)) {
          result.push({ potId: p.id, potName: p.name, potIcon: p.icon||'💚', ym })
        }
      })
    })
    return result.sort((a,b)=>b.ym.localeCompare(a.ym))
  }, [satiPots])

  function handleLink(txId, potId, ym) {
    const pot = satiPots.find(p=>p.id===potId)
    if (!pot) return
    const existing = pot.data?.[ym] || {}
    // Set linkedAmt and clear explicitUnlinked, consistently with the other link paths,
    // otherwise the month keeps showing as unreconciled after a re-link
    const mt = (pot.voci||[]).reduce((s,v)=>s+(parseFloat(existing.cells?.[v.id])||0),0)
    updateSatiPot(potId, { data: { ...(pot.data||{}), [ym]: { ...existing, linked: txId, linkedAmt: mt, explicitUnlinked: false } } })
    setAbbinaTx(null)
    showToast('Transazione abbinata al fondo', 'success')
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
      display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'24px 28px',
        width:680,maxHeight:'88vh',display:'flex',flexDirection:'column',
        boxShadow:'0 16px 48px rgba(0,0,0,.2)'}}>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div>
            <div style={{fontSize:16,fontWeight:800}}>
              ⚠️ Accantonamenti non abbinati ({filtered.length}{filtered.length < rows.length ? ` di ${rows.length}` : ''})
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              Uscite Satispay (−) non collegate a nessun fondo di accantonamento
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
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
          <button onClick={()=>setHideComm(v=>!v)}
            style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:16,cursor:'pointer',
              fontFamily:'var(--font-sans)',
              border: hideComm?'1px solid var(--gold)':'1px solid var(--border)',
              background: hideComm?'rgba(200,160,0,.1)':'var(--surface)',
              color: hideComm?'var(--gold)':'var(--text3)'}}>
            🚫 Commissioni
          </button>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Cerca descrizione…"
            style={{flex:1,padding:'6px 10px',borderRadius:7,
              border:'1px solid var(--border)',background:'var(--surface2)',
              fontSize:12,fontFamily:'var(--font-sans)',color:'var(--text)',outline:'none'}}/>
        </div>

        {/* Table */}
        <div style={{overflowY:'auto',flex:1,borderRadius:8,border:'1px solid var(--border)'}}>
          <table style={{borderCollapse:'collapse',width:'100%'}}>
            <thead>
              <tr style={{background:'var(--surface2)',position:'sticky',top:0,zIndex:1}}>
                {['Data','Descrizione AI','Conto','Importo','Azioni'].map(h => (
                  <th key={h} style={{padding:'6px 10px',fontSize:10,fontWeight:700,
                    textAlign:h==='Importo'?'right':'left',
                    textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',
                    borderBottom:'1px solid var(--border)'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{padding:'24px',textAlign:'center',
                  color:'var(--text3)',fontSize:13}}>
                  {rows.length === 0 ? '✅ Tutte le transazioni Satispay sono abbinate!' : 'Nessun risultato'}
                </td></tr>
              )}
              {filtered.map((t, i) => (
                <tr key={t.txId} style={{
                  background: i % 2 === 0 ? 'transparent' : 'var(--surface2)',
                  borderBottom:'1px solid var(--border2)'}}>
                  <td style={{padding:'6px 10px',fontSize:11,fontFamily:'var(--font-mono)',
                    color:'var(--text3)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
                  <td style={{padding:'6px 10px',maxWidth:220}}>
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
                  <td style={{padding:'6px 10px'}}>
                    <button onClick={()=>setAbbinaTx(abbinaTx?.txId===t.txId?null:t)}
                      style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:14,
                        border:'1px solid var(--border)',background:'var(--surface)',
                        cursor:'pointer',fontFamily:'var(--font-sans)',color:'var(--text2)',
                        whiteSpace:'nowrap'}}>
                      🔗 Abbina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {abbinaTx && (
          <div style={{marginTop:10,padding:'12px 14px',borderRadius:8,
            border:'1px solid var(--accent)',background:'var(--accent)08'}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:'var(--accent)'}}>
              🔗 Abbina −€{fmtIT(Math.abs(abbinaTx.amount),2)} a un fondo:
            </div>
            {availablePotMonths.length === 0 ? (
              <div style={{fontSize:12,color:'var(--text3)'}}>Nessun mese fondo disponibile</div>
            ) : (
              <div style={{maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
                {availablePotMonths.map(({potId,potName,potIcon,ym}) => (
                  <div key={`${potId}-${ym}`}
                    onClick={() => handleLink(abbinaTx.txId, potId, ym)}
                    style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                      padding:'7px 10px',borderRadius:6,border:'1px solid var(--border)',
                      background:'var(--surface)',cursor:'pointer',transition:'background .1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                    onMouseLeave={e=>e.currentTarget.style.background='var(--surface)'}>
                    <div style={{fontSize:12,fontWeight:600}}>
                      {potIcon} {potName}
                    </div>
                    <span style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{ymLabel(ym)}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setAbbinaTx(null)}
              style={{marginTop:8,fontSize:11,padding:'3px 10px',borderRadius:6,
                border:'1px solid var(--border)',background:'var(--surface)',
                cursor:'pointer',fontFamily:'var(--font-sans)',color:'var(--text3)'}}>
              Annulla
            </button>
          </div>
        )}

        <div style={{marginTop:12,display:'flex',justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function SatispayPage() {
  const { satiPots, transactions, vehExpenses, appPrefs } = useStore()
  const [showAdd,             setShowAdd]             = useState(false)
  const [showAccrediti,       setShowAccrediti]       = useState(false)
  const [showAccantonamenti,  setShowAccantonamenti]  = useState(false)
  const [tab, setTab]                                 = useState('overview')

  const isSati = (t) => {
    const desc  = (t.description||'').toUpperCase()
    const merch = (t.merchant||'').toUpperCase()
    return t.cat1 === 'Satispay' || desc.includes('SATISPAY') || merch.includes('SATISPAY')
  }

  // Case-insensitive check for "Altro > Satispay Varie" category
  const isAltroSatiVarie = (t) =>
    (t.cat1||'').toLowerCase() === 'altro' &&
    (t.cat2||'').toLowerCase() === 'satispay varie'

  const satiIncome = useMemo(() =>
    transactions.filter(t => !t.excluded && t.amount > 0 && isSati(t))
      .sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  const satiUscite = useMemo(() =>
    transactions.filter(t => !t.excluded && t.amount < 0 && isSati(t))
      .sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  // Counts for header buttons
  const satiMatches = appPrefs?.satiMatches || {}
  const matchedIncomeIds = new Set(
    Object.values(satiMatches).filter(m => m.status==='matched' && m.incomeTxId).map(m => m.incomeTxId)
  )
  const accreditiNonAbbinati = satiIncome.filter(t => !matchedIncomeIds.has(t.txId))

  // Accantonamenti non abbinati: negative Satispay txs not linked to any fund
  const allLinkedToFund = new Set()
  satiPots.forEach(p => {
    Object.values(p.data || {}).forEach(entry => {
      if (!entry?.linked) return
      const ids = Array.isArray(entry.linked) ? entry.linked : [entry.linked]
      ids.forEach(id => allLinkedToFund.add(id))
    })
  })
  const accantonamentiNonAbbinati = satiUscite.filter(t => {
    if (isAltroSatiVarie(t)) return false
    if (t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca') return false
    return !allLinkedToFund.has(t.txId)
  })

  const currentPot = (tab !== 'overview' && tab !== 'altrespese') ? satiPots.find(p=>p.id===tab) : null

  // Altre Spese: only "Altro > Satispay Varie" expenses (case-insensitive)
  const altreSpeseTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && t.amount < 0 && isAltroSatiVarie(t))
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
          {accreditiNonAbbinati.length > 0 && (
            <button onClick={()=>setShowAccrediti(true)}
              style={{display:'flex',alignItems:'center',gap:6,border:'1px solid var(--gold)',
                color:'var(--gold)',borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:700,
                background:'rgba(200,160,0,.08)',cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              ⚠️ Accrediti non abbinati ({accreditiNonAbbinati.length})
            </button>
          )}
          {accantonamentiNonAbbinati.length > 0 && (
            <button onClick={()=>setShowAccantonamenti(true)}
              style={{display:'flex',alignItems:'center',gap:6,border:'1px solid var(--gold)',
                color:'var(--gold)',borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:700,
                background:'rgba(200,160,0,.08)',cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              ⚠️ Accantonamenti non abbinati ({accantonamentiNonAbbinati.length})
            </button>
          )}
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
          {currentPot.name?.toLowerCase() === 'cecilia'
            ? <FundProjectionKPIs pot={currentPot}/>
            : <>
                <SatiIncomeSection satiIncome={satiIncome} transactions={transactions} vehExpenses={vehExpenses} pot={currentPot}/>
              </>
          }
        </>
      )}

      {tab === 'altrespese' && (
        <AltreSpesePot altreSpeseTxs={altreSpeseTxs}/>
      )}

      {showAdd && <PotFormModal onClose={()=>setShowAdd(false)}/>}
      {showAccrediti && (
        <AccreditiNonAbbinatiModal
          satiIncome={satiIncome}
          satiMatches={satiMatches}
          onClose={()=>setShowAccrediti(false)}
        />
      )}
      {showAccantonamenti && <NonAbbinateModal onClose={()=>setShowAccantonamenti(false)}/>}
    </div>
  )
}
