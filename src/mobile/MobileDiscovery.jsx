import { useState, useMemo, useEffect } from 'react'
import { useStore }   from '../store/useStore'
import { useAuth }    from '../auth/AuthContext'
import { getMergedCats } from '../data/categories'
import { fmtIT }     from '../utils/format'
import { enrichBatch, lookupPlaceForMerchant } from '../data/aiService'
import {
  learnException,
  autoDetectMatch,
  txMatchesRule,
  generateSmartRule,
  RuleApplyPopup,
} from '../pages/TransactionsPage'
import VehicleQuickPicker from '../components/VehicleQuickPicker'

// ── localStorage helpers ──────────────────────────────────
const SEEN_KEY = 'fm-disc-seen-v2'
const LOG_KEY  = 'fm-disc-log'
function loadSeen()     { try { return JSON.parse(localStorage.getItem(SEEN_KEY)||'{}') } catch { return {} } }
function markSeen(id)   { const s=loadSeen(); s[id]=Date.now(); localStorage.setItem(SEEN_KEY,JSON.stringify(s)) }
function removeSeen(id) { const s=loadSeen(); delete s[id]; localStorage.setItem(SEEN_KEY,JSON.stringify(s)) }
function loadLog()      { try { return JSON.parse(localStorage.getItem(LOG_KEY)||'null') } catch { return null } }
function saveLog(log)   { localStorage.setItem(LOG_KEY, JSON.stringify(log)) }

// ── Helpers ───────────────────────────────────────────────
function isCommission(t) { return t.cat1 === 'Altro' && t.cat2 === 'Commissioni' }
const fmtAmt = n => '€ ' + fmtIT(Math.abs(n), 2)
function dateValuta(t) {
  const d = t.date || ''
  if (!d) return ''
  return new Date(d).toLocaleDateString('it-IT', { day:'numeric', month:'short', year:'2-digit' })
}

// ── Mode definitions ──────────────────────────────────────
const MODES = [
  { id:'nocat',   emoji:'❓', label:'Senza categoria',     filter: t => (!t.cat1 || t.cat1==='Non Categorizzato' || !t.cat2 || t.cat2==='') && !t._flagged },
  { id:'noloc',   emoji:'📍', label:'Senza location',      filter: t => !t.city && !t._flagged },
  { id:'altro',   emoji:'📦', label:'In "Altro › Altro"',   filter: t => t.cat1==='Altro' && t.cat2==='Altro' && !t._flagged },
  { id:'flagged', emoji:'🚩', label:'Flaggate (to review)', filter: t => t._flagged },
]
function matchesAnyMode(t, modeSet) {
  if (t.excluded) return false
  if (isCommission(t)) return false
  if (t.userEditedCat) return false
  return MODES.some(m => modeSet.has(m.id) && m.filter(t))
}

// ── CatPickerInline ───────────────────────────────────────
function CatPickerInline({ current, merged, customCats, onSelect, onClose, onAddL2 }) {
  const [selL1,    setSelL1]    = useState(current?.cat1 || null)
  const [newL2,    setNewL2]    = useState('')
  const [addingL2, setAddingL2] = useState(false)
  const cats = Object.entries(merged).filter(([n]) => n !== 'Entrate' && n !== 'Non Categorizzato')

  if (selL1) {
    const subs  = merged[selL1]?.sub || []
    const color = merged[selL1]?.color || '#888'
    return (
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        <button onClick={()=>{setSelL1(null);setAddingL2(false);setNewL2('')}}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:12,fontWeight:700,
            color:'var(--accent)',fontFamily:'var(--font-sans)',textAlign:'left',
            padding:'4px 0',display:'flex',alignItems:'center',gap:4}}>
          ← {selL1}
        </button>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          <button onClick={()=>{onSelect(selL1,'');onClose()}}
            style={{padding:'5px 12px',borderRadius:16,border:'1px solid var(--border)',
              background:!current?.cat2&&current?.cat1===selL1?color+'22':'var(--surface)',
              color:'var(--text3)',fontSize:12,fontWeight:600,cursor:'pointer',
              fontFamily:'var(--font-sans)',fontStyle:'italic'}}>
            — Nessuna
          </button>
          {subs.map(sub => {
            const isAct = current?.cat1===selL1 && current?.cat2===sub
            return (
              <button key={sub} onClick={()=>{onSelect(selL1,sub);onClose()}}
                style={{padding:'5px 12px',borderRadius:16,
                  border:`1px solid ${isAct?color:'var(--border)'}`,
                  background:isAct?color+'22':'var(--surface)',
                  color:isAct?color:'var(--text2)',
                  fontSize:12,fontWeight:isAct?700:500,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                {sub}
              </button>
            )
          })}
        </div>
        {addingL2 ? (
          <div style={{display:'flex',gap:6,marginTop:4}}>
            <input value={newL2} onChange={e=>setNewL2(e.target.value)} autoFocus
              placeholder="Nome nuova categoria…"
              onKeyDown={e=>{
                if(e.key==='Enter'&&newL2.trim()){onAddL2(selL1,newL2.trim());onSelect(selL1,newL2.trim());onClose()}
                if(e.key==='Escape'){setAddingL2(false);setNewL2('')}
              }}
              style={{flex:1,padding:'6px 10px',borderRadius:8,border:'1.5px solid var(--accent)',
                background:'var(--bg)',color:'var(--text1)',fontSize:13,
                fontFamily:'var(--font-sans)',outline:'none'}}/>
            <button onClick={()=>{if(!newL2.trim())return;onAddL2(selL1,newL2.trim());onSelect(selL1,newL2.trim());onClose()}}
              style={{padding:'6px 12px',borderRadius:8,border:'none',background:'var(--accent)',
                color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✓</button>
            <button onClick={()=>{setAddingL2(false);setNewL2('')}}
              style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',
                background:'var(--bg)',color:'var(--text3)',fontSize:12,cursor:'pointer',
                fontFamily:'var(--font-sans)'}}>✕</button>
          </div>
        ) : (
          <button onClick={()=>setAddingL2(true)}
            style={{padding:'5px 12px',borderRadius:16,border:`1px dashed ${color}88`,
              background:'none',color:color,fontSize:11,fontWeight:600,cursor:'pointer',
              fontFamily:'var(--font-sans)',display:'inline-flex',alignItems:'center',gap:4,
              alignSelf:'flex-start',marginTop:2}}>
            + Nuova categoria
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
      {cats.map(([name, info]) => {
        const isAct = current?.cat1 === name
        return (
          <button key={name}
            onClick={()=>{
              if((info.sub||[]).length===0){onSelect(name,'');onClose()}
              else setSelL1(name)
            }}
            style={{padding:'5px 12px',borderRadius:16,
              border:`1px solid ${isAct?info.color:'var(--border)'}`,
              background:isAct?info.color+'22':'var(--surface)',
              color:isAct?info.color:'var(--text2)',
              fontSize:12,fontWeight:isAct?700:500,cursor:'pointer',fontFamily:'var(--font-sans)',
              display:'flex',alignItems:'center',gap:5}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:info.color,flexShrink:0}}/>
            {name}
            {(info.sub||[]).length>0&&<span style={{fontSize:9,opacity:.5}}>›</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── LocPickerInline ───────────────────────────────────────
function LocPickerInline({ currentCity, quickCities, onSelect, onClose }) {
  const [custom, setCustom] = useState('')
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
        <button onClick={()=>{onSelect('');onClose()}}
          style={{padding:'5px 12px',borderRadius:16,border:'1px solid var(--border)',
            background:currentCity===''||!currentCity?'rgba(200,50,50,.1)':'var(--surface)',
            color:currentCity===''||!currentCity?'var(--red)':'var(--text3)',
            fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',fontStyle:'italic'}}>
          ✕ Nessuna location
        </button>
        {quickCities.map(city => {
          const isAct = city === currentCity
          return (
            <button key={city} onClick={()=>{onSelect(city);onClose()}}
              style={{padding:'5px 12px',borderRadius:16,
                border:`1px solid ${isAct?'var(--blue)':'var(--border)'}`,
                background:isAct?'rgba(59,130,246,.15)':'var(--surface)',
                color:isAct?'var(--blue)':'var(--text2)',
                fontSize:12,fontWeight:isAct?700:500,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              📍 {city}
            </button>
          )
        })}
      </div>
      <div style={{display:'flex',gap:6}}>
        <input value={custom} onChange={e=>setCustom(e.target.value)}
          placeholder="Altra città…"
          onKeyDown={e=>{if(e.key==='Enter'&&custom.trim()){onSelect(custom.trim());onClose()}}}
          style={{flex:1,padding:'7px 12px',borderRadius:10,border:'1.5px solid var(--border)',
            background:'var(--bg)',color:'var(--text1)',fontSize:13,
            fontFamily:'var(--font-sans)',outline:'none'}}/>
        <button onClick={()=>{if(custom.trim()){onSelect(custom.trim());onClose()}}}
          style={{padding:'7px 14px',borderRadius:10,border:'none',background:'var(--accent)',
            color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
          ✓
        </button>
      </div>
    </div>
  )
}

// ── AiResultBox ───────────────────────────────────────────
function AiResultBox({ result, onClose }) {
  const hasMap = !!(result.place?.lat && result.place?.lng)
  return (
    <div style={{background:'rgba(80,120,220,.07)',borderRadius:10,
      border:'1px solid rgba(80,120,220,.2)',fontSize:13,color:'var(--text2)',overflow:'hidden'}}>
      {/* Info row */}
      <div style={{padding:'10px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
          <div style={{fontWeight:700,color:'var(--text1)',fontSize:14}}>
            🤖 {result.merchantName || '—'}
          </div>
          <button onClick={onClose}
            style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',
              fontSize:14,padding:0,flexShrink:0,marginLeft:8}}>✕</button>
        </div>
        {result.category && (
          <div style={{fontSize:12,color:'var(--text3)',marginBottom:result.city?2:0}}>
            {result.category}
          </div>
        )}
        {result.city && (
          <div style={{fontSize:12,color:'var(--text3)',display:'flex',alignItems:'center',gap:4}}>
            <span>📍 {result.city}</span>
            {result.place?.address && <span style={{opacity:.7}}>— {result.place.address}</span>}
            {hasMap && (
              <a href={`https://maps.google.com/?q=${result.place.lat},${result.place.lng}`}
                target="_blank" rel="noreferrer"
                style={{color:'var(--accent)',fontWeight:600,fontSize:11,flexShrink:0,marginLeft:4}}>
                Apri ↗
              </a>
            )}
          </div>
        )}
      </div>
      {/* Map panel — always shown */}
      {hasMap ? (
        <iframe
          title="merchant-map"
          src={`https://maps.google.com/maps?q=${result.place.lat},${result.place.lng}&z=15&output=embed`}
          width="100%" height="180" frameBorder="0"
          style={{display:'block',borderTop:'1px solid rgba(80,120,220,.2)'}}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div style={{borderTop:'1px solid rgba(80,120,220,.2)',padding:'12px 14px',
          textAlign:'center',fontSize:12,color:'var(--text3)',
          background:'rgba(0,0,0,.03)',display:'flex',alignItems:'center',
          justifyContent:'center',gap:6,minHeight:60}}>
          🗺️ No geolocalization
        </div>
      )}
    </div>
  )
}

// ── CatRulePopup ──────────────────────────────────────────
function CatRulePopup({ tx, cat1, cat2, transactions, onSave, onClose }) {
  const match   = autoDetectMatch(tx)
  const others  = transactions.filter(t => t.txId !== tx.txId && !t.excluded && txMatchesRule(t, match))
  const future  = others.filter(t => (t.date || '') >= (tx.date || ''))

  const btnBase = {
    width:'100%', padding:'12px 14px', borderRadius:12,
    fontSize:13, fontWeight:700, cursor:'pointer',
    fontFamily:'var(--font-sans)', textAlign:'left',
  }
  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.55)',
      display:'flex',alignItems:'flex-end'}}
      onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div style={{background:'var(--surface)',borderRadius:'18px 18px 0 0',
        padding:'20px 16px',width:'100%',boxSizing:'border-box',
        paddingBottom:'calc(16px + env(safe-area-inset-bottom,0px))'}}>
        <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>🏷️ Regola categoria</div>
        <div style={{fontSize:13,color:'var(--text2)',marginBottom:10}}>
          Applicare <strong>{cat1}{cat2 ? ` › ${cat2}` : ''}</strong> alle transazioni simili?
        </div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:16,
          padding:'8px 12px',borderRadius:8,background:'var(--surface2)',
          border:'1px solid var(--border)'}}>
          Match: <em>{match.label}</em> include <em>"{match.value}"</em>
          {' — '}<strong>{others.length}</strong> altre tx ({future.length} future)
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <button style={{...btnBase,border:'none',background:'var(--green)',color:'#fff'}}
            onClick={()=>onSave('all', match)}>
            ✅ Applica a tutti ({others.length + 1}) — anche retroattivamente
          </button>
          <button style={{...btnBase,border:'1px solid var(--border)',background:'var(--surface2)',color:'var(--text2)'}}
            onClick={()=>onSave('future', match)}>
            ⏩ Solo i prossimi ({future.length + 1})
          </button>
          <button style={{...btnBase,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text3)'}}
            onClick={onClose}>
            🔒 Solo questa transazione
          </button>
        </div>
      </div>
    </div>
  )
}

// ── StartScreen ───────────────────────────────────────────
function StartScreen({ modeCounts, selectedModes, onToggleMode, onStart, discLog }) {
  const total = MODES.filter(m=>selectedModes.has(m.id)).reduce((acc,m)=>acc+(modeCounts[m.id]||0),0)
  const canStart = selectedModes.size > 0 && total > 0
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'20px 16px',
      paddingBottom:'calc(20px + env(safe-area-inset-bottom,0px))'}}>
      <div style={{fontSize:20,fontWeight:800,color:'var(--text1)',marginBottom:16}}>🔍 Discovery</div>

      {discLog && (
        <div style={{padding:'10px 14px',borderRadius:10,background:'var(--surface)',
          border:'1px solid var(--border)',fontSize:12,color:'var(--text3)',marginBottom:16}}>
          Ultimo discovery:{' '}
          <strong style={{color:'var(--text2)'}}>
            {new Date(discLog.date).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'})}
          </strong>
          {discLog.user ? ` da ${discLog.user}` : ''}
          {discLog.resolved != null ? ` • ${discLog.resolved} risolte` : ''}
        </div>
      )}

      <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'.06em',
        textTransform:'uppercase',marginBottom:10}}>
        Cosa vuoi revisionare?
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
        {MODES.map(mode => {
          const count = modeCounts[mode.id] || 0
          const isOn  = selectedModes.has(mode.id)
          return (
            <button key={mode.id} onClick={()=>onToggleMode(mode.id)}
              style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderRadius:14,
                border:`2px solid ${isOn?'var(--accent)':'var(--border)'}`,
                background:isOn?'rgba(100,100,220,.08)':'var(--surface)',
                cursor:'pointer',textAlign:'left',fontFamily:'var(--font-sans)',
                transition:'border-color .15s,background .15s',width:'100%'}}>
              <span style={{fontSize:22,flexShrink:0}}>{mode.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text1)'}}>{mode.label}</div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
                  {count} transazioni
                </div>
              </div>
              <div style={{width:22,height:22,borderRadius:6,flexShrink:0,
                border:`2px solid ${isOn?'var(--accent)':'var(--border)'}`,
                background:isOn?'var(--accent)':'transparent',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
                {isOn && <span style={{color:'#fff',fontSize:13,lineHeight:1}}>✓</span>}
              </div>
            </button>
          )
        })}
      </div>

      <button onClick={onStart} disabled={!canStart}
        style={{width:'100%',padding:'16px',borderRadius:14,border:'none',
          background:canStart?'var(--accent)':'var(--border)',
          color:canStart?'#fff':'var(--text3)',
          fontSize:16,fontWeight:800,cursor:canStart?'pointer':'default',
          fontFamily:'var(--font-sans)',opacity:canStart?1:.6}}>
        {canStart ? `Inizia Discovery (${total} tx)` : 'Seleziona almeno una categoria'}
      </button>
    </div>
  )
}

// ── DoneScreen ────────────────────────────────────────────
function DoneScreen({ resolved, onBack }) {
  return (
    <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:24}}>
        <div style={{fontSize:52,marginBottom:12}}>✅</div>
        <div style={{fontSize:18,fontWeight:800,color:'var(--text1)',marginBottom:8}}>
          Discovery completato!
        </div>
        <div style={{fontSize:14,color:'var(--text3)',marginBottom:28}}>
          {resolved > 0 ? `${resolved} transazioni risolte in questa sessione.` : 'Nessuna transazione risolta.'}
        </div>
        <button onClick={onBack}
          style={{padding:'12px 28px',borderRadius:12,border:'none',background:'var(--accent)',
            color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
          Torna all'inizio
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────
export default function MobileDiscovery() {
  const transactions         = useStore(s => s.transactions)
  const updateTransaction    = useStore(s => s.updateTransaction)
  const customCats           = useStore(s => s.customCats)
  const setCustomCats        = useStore(s => s.setCustomCats)
  const addDiscoverySkipRule  = useStore(s => s.addDiscoverySkipRule)
  const discoverySkipRules    = useStore(s => s.discoverySkipRules) || []
  const appPrefs              = useStore(s => s.appPrefs) || {}
  const setAppPref            = useStore(s => s.setAppPref)
  const { user }              = useAuth()

  // Token-based skip matching: rule "Ksny6fu Satispay" extracts tokens ["Ksny6fu","Satispay"]
  // → matches any tx whose descAI or merchant contains ANY of those tokens (case-insensitive)
  const skipMatchFn = useMemo(() => {
    const tokenLists = discoverySkipRules
      .map(r => (r.descAI || '').split(/[\s,\-\/]+/).filter(t => t.length >= 3).map(t => t.toLowerCase()))
      .filter(toks => toks.length > 0)
    if (!tokenLists.length) return () => false
    return (t) => {
      const txText = `${t.descAI || ''} ${t.merchant || ''}`.toLowerCase()
      return tokenLists.some(tokens => tokens.some(tok => txText.includes(tok)))
    }
  }, [discoverySkipRules])

  const merged = getMergedCats(customCats)

  // ── Phase ─────────────────────────────────────────────────
  const [phase, setPhase]               = useState('start') // 'start' | 'review'
  const [selectedModes, setSelectedModes] = useState(() => new Set(['nocat']))

  // ── Queue ─────────────────────────────────────────────────
  const [queuedIds, setQueuedIds]         = useState(() => new Set())
  const [seenVer, setSeenVer]             = useState(0)
  const [currentTxId, setCurrentTxId]     = useState(null) // explicit nav — NOT driven by queue[0]
  const [resolvedCount, setResolvedCount] = useState(0)

  // ── Undo ──────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState([])

  // ── UI ────────────────────────────────────────────────────
  const [activeSection, setActiveSection]   = useState(null) // null | 'cat' | 'loc'
  const [saltaSempreOpen, setSaltaSempreOpen] = useState(false)
  const [saltaSempreText, setSaltaSempreText] = useState('')
  const [saltaSempreNote, setSaltaSempreNote] = useState('')
  const [editingDesc, setEditingDesc]         = useState(false)
  const [descDraft, setDescDraft]             = useState('')

  // ── Similar txs panel ────────────────────────────────────
  const [similarOpen,     setSimilarOpen]     = useState(false)
  const [similarSelected, setSimilarSelected] = useState(new Set()) // checked rows in simili panel
  const [bulkEditPeers,   setBulkEditPeers]   = useState(new Set()) // txIds to co-patch with current

  // ── Note ──────────────────────────────────────────────────
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft,   setNoteDraft]   = useState('')

  // ── AI ────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult]   = useState(null)
  const [aiError, setAiError]     = useState(null)

  // ── Rule popups ───────────────────────────────────────────
  const [descRulePopup, setDescRulePopup] = useState(null) // { tx, match, newDesc }
  const [catRulePopup,  setCatRulePopup]  = useState(null) // { tx, cat1, cat2 }

  // ── Discovery log ─────────────────────────────────────────
  const [discLog] = useState(() => loadLog())

  // ── Mode counts ───────────────────────────────────────────
  const modeCounts = useMemo(() => {
    const c = {}
    MODES.forEach(m => {
      c[m.id] = transactions.filter(t => !isCommission(t) && !t.userEditedCat && m.filter(t)).length
    })
    return c
  }, [transactions])

  // ── Computed queue (ordering only — does NOT drive current) ──
  const queue = useMemo(() => {
    if (phase !== 'review') return []
    const seen = loadSeen()
    const cands = transactions.filter(t =>
      queuedIds.has(t.txId) && !t.userEditedCat && !skipMatchFn(t)
    )
    const unseen  = cands.filter(t => !seen[t.txId])
    const seenTxs = cands.filter(t =>  seen[t.txId]).sort((a,b)=>(seen[a.txId]||0)-(seen[b.txId]||0))
    return [...unseen, ...seenTxs]
  }, [transactions, queuedIds, seenVer, phase, skipMatchFn])

  const total = queuedIds.size

  // current is ALWAYS the live data of currentTxId — never driven by queue position
  const current = useMemo(
    () => (currentTxId ? transactions.find(t => t.txId === currentTxId) || null : null),
    [transactions, currentTxId]
  )

  // ── Quick cities ──────────────────────────────────────────
  const quickCities = useMemo(() => {
    const freq = {}
    transactions.filter(t=>t.city).forEach(t=>{freq[t.city]=(freq[t.city]||0)+1})
    return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c])=>c)
  }, [transactions])

  // ── Transactions with same descAI (for "simili" panel) ───
  const sameNameTxs = useMemo(() => {
    if (!current?.descAI) return []
    return transactions
      .filter(t => t.txId !== current.txId && t.descAI === current.descAI)
      .sort((a, b) => (b._effDate || b.date || '').localeCompare(a._effDate || a.date || ''))
  }, [transactions, current?.txId, current?.descAI])

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => { if (current) markSeen(current.txId) }, [current?.txId])
  useEffect(() => {
    setActiveSection(null)
    setAiResult(null)
    setAiError(null)
    setSaltaSempreOpen(false)
    setEditingDesc(false)
    setSimilarOpen(false)
    setSimilarSelected(new Set())
    setEditingNote(false)
  }, [current?.txId])

  // ── Actions ───────────────────────────────────────────────
  function toggleMode(id) {
    setSelectedModes(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function startDiscovery() {
    const ids = new Set(
      transactions.filter(t => matchesAnyMode(t, selectedModes)).map(t => t.txId)
    )
    if (!ids.size) return
    setQueuedIds(ids)
    // Start at first tx NOT matched by a skip rule (respect "Salta sempre" immediately)
    const firstTx = transactions.find(t => ids.has(t.txId) && !skipMatchFn(t))
    setCurrentTxId(firstTx?.txId || null)
    setResolvedCount(0)
    setUndoStack([])
    setSeenVer(0)
    setActiveSection(null)
    setAiResult(null)
    setAiError(null)
    setSaltaSempreOpen(false)
    setPhase('review')
  }

  function pushUndo() {
    if (!current) return
    setUndoStack(s => [{
      txId: current.txId,
      prevCat1: current.cat1,
      prevCat2: current.cat2,
      prevCity: current.city,
      prevDescAI: current.descAI,
      prevUserEditedCat: current.userEditedCat,
      prevFlagged: current._flagged,
    }, ...s].slice(0, 10))
  }

  async function saveDescAI(newDesc) {
    if (!newDesc.trim() || !current) return
    const txSnapshot = { ...current }
    patchWithPeers(current.txId, { descAI: newDesc.trim(), userEditedDesc: true })
    setEditingDesc(false)
    await learnException(txSnapshot, newDesc.trim())
    const match = autoDetectMatch(txSnapshot)
    setDescRulePopup({ tx: { ...txSnapshot, descAI: newDesc.trim() }, match, newDesc: newDesc.trim() })
  }

  function handleApplyDescRule(mode, ruleText, cat1, cat2, updateDescAI) {
    if (!descRulePopup || mode === 'none') { setDescRulePopup(null); return }
    const { tx, match, newDesc } = descRulePopup
    // Save naming rule
    const existingRules = appPrefs?.aiNamingRules || []
    const newRule = {
      id: `nr-${Date.now()}`,
      matchField: match.field,
      matchValue: match.value,
      matchLabel: ruleText,
      description: newDesc,
      enabled: true,
      createdAt: new Date().toISOString(),
    }
    setAppPref('aiNamingRules', [...existingRules, newRule])
    // Apply to matching transactions
    const now = tx.date || ''
    const targets = transactions.filter(t => {
      if (t.txId === tx.txId || t.excluded) return false
      if (!txMatchesRule(t, match)) return false
      if (mode === 'future') return (t.date || '') >= now
      return true
    })
    targets.forEach(t => {
      const patch = {}
      if (updateDescAI) { patch.descAI = newDesc; patch.userEditedDesc = true }
      if (cat1) { patch.cat1 = cat1; if (cat2) patch.cat2 = cat2 }
      if (Object.keys(patch).length) updateTransaction(t.txId, patch)
    })
    setDescRulePopup(null)
  }

  function applyCategory(cat1, cat2 = '') {
    if (!current) return
    const prevCat1 = current.cat1
    const prevCat2 = current.cat2
    patchWithPeers(current.txId, { cat1, cat2: cat2 || null })
    setActiveSection(null)
    // Show cat rule popup if meaningful category change
    if (cat1 && (cat1 !== prevCat1 || (cat2 || '') !== (prevCat2 || ''))) {
      setCatRulePopup({ tx: { ...current, cat1, cat2 }, cat1, cat2 })
    }
  }

  function handleSaveCatRule(mode, match) {
    if (!catRulePopup) { setCatRulePopup(null); return }
    const { tx, cat1, cat2 } = catRulePopup
    // Save cat rule
    const existingRules = appPrefs?.catRules || []
    const newRule = {
      id: `cr-${Date.now()}`,
      matchField: match.field,
      matchValue: match.value,
      cat1, cat2: cat2 || '',
      enabled: true,
      createdAt: new Date().toISOString(),
    }
    setAppPref('catRules', [...existingRules, newRule])
    // Apply to matching transactions
    const now = tx.date || ''
    const targets = transactions.filter(t => {
      if (t.txId === tx.txId || t.excluded) return false
      if (!txMatchesRule(t, match)) return false
      if (mode === 'future') return (t.date || '') >= now
      return true
    })
    targets.forEach(t => updateTransaction(t.txId, { cat1, cat2: cat2 || null }))
    setCatRulePopup(null)
  }

  function applyCity(city) {
    if (!current) return
    patchWithPeers(current.txId, { city: city || null })
    setActiveSection(null)
  }

  function addL2Category(cat1, newSub) {
    const existing = customCats[cat1]?.sub || merged[cat1]?.sub || []
    if (existing.includes(newSub)) return
    setCustomCats({ ...customCats, [cat1]: { sub: [...existing, newSub] } })
  }

  // Applies a patch to current tx AND all bulkEditPeers simultaneously
  function patchWithPeers(txId, patch) {
    updateTransaction(txId, patch)
    bulkEditPeers.forEach(id => { if (id !== txId) updateTransaction(id, patch) })
  }

  function advance() {
    if (!current) return
    markSeen(current.txId)
    setBulkEditPeers(new Set())
    // Pick next from queue (excluding current) — use snapshot of current queue
    const next = queue.find(t => t.txId !== current.txId)
    setCurrentTxId(next?.txId || null)
    setSeenVer(v => v + 1) // force queue recompute for ordering
    setActiveSection(null)
    setAiResult(null)
    setAiError(null)
    setSaltaSempreOpen(false)
  }

  function handleOK() {
    if (!current) return
    pushUndo()
    setQueuedIds(prev => {
      const n = new Set(prev)
      n.delete(current.txId)
      bulkEditPeers.forEach(id => n.delete(id))
      return n
    })
    updateTransaction(current.txId, { userEditedCat: true })
    bulkEditPeers.forEach(id => updateTransaction(id, { userEditedCat: true }))
    setResolvedCount(c => c + 1 + bulkEditPeers.size)
    advance()
  }

  function handleSalta() {
    if (!current) return
    advance()
  }

  function handleSaltaSempre() {
    if (!current) return
    setSaltaSempreText(current.descAI || '')
    setSaltaSempreNote('')
    setSaltaSempreOpen(true)
  }

  function confirmSaltaSempre() {
    if (!saltaSempreText.trim()) return
    addDiscoverySkipRule({ descAI: saltaSempreText.trim(), note: saltaSempreNote.trim() })
    // La regola è ora in store → la tx sparirà dal queue al prossimo render.
    // Avanziamo subito così la prossima tx viene caricata (già filtrata da skipSet).
    advance()
  }

  function handleFlagga() {
    if (!current) return
    pushUndo()
    updateTransaction(current.txId, { _flagged: !current._flagged })
    advance()
  }

  function handleUndo() {
    if (!undoStack.length) return
    const [last, ...rest] = undoStack
    setUndoStack(rest)
    updateTransaction(last.txId, {
      cat1: last.prevCat1,
      cat2: last.prevCat2 || null,
      city: last.prevCity || null,
      descAI: last.prevDescAI,
      userEditedCat: last.prevUserEditedCat || false,
      _flagged: last.prevFlagged || false,
    })
    // Re-add to queue (in case it was removed by OK)
    setQueuedIds(prev => { const n = new Set(prev); n.add(last.txId); return n })
    removeSeen(last.txId)
    setCurrentTxId(last.txId) // jump directly to restored tx
    setSeenVer(v => v + 1)
  }

  async function handleAiLookup() {
    if (!current || aiLoading) return
    setAiLoading(true)
    setAiResult(null)
    setAiError(null)
    try {
      // Full enrichment (same logic as TransactionsPage desktop)
      const enriched = await enrichBatch([current], { force: true, throwOnError: true })
      if (!enriched.length) throw new Error('Nessun risultato')
      const tx = enriched[0]

      // Save enriched fields to DB
      const patch = {}
      if (tx.merchant    != null) patch.merchant    = tx.merchant
      if (tx.counterpart != null) patch.counterpart = tx.counterpart
      if (tx.descAI      != null) patch.descAI      = tx.descAI
      if (tx.city        != null) patch.city        = tx.city
      if (tx.cat1        != null) patch.cat1        = tx.cat1
      if (tx.cat2        != null) patch.cat2        = tx.cat2
      if (Object.keys(patch).length) updateTransaction(current.txId, patch)

      // Places lookup for map
      const merchantForPlace = tx.merchant || tx.descAI || current.merchant || current.descAI
      const place = await lookupPlaceForMerchant(merchantForPlace, tx.city || current.city)

      setAiResult({
        merchantName: tx.merchant || tx.descAI || '—',
        category: tx.cat1 && tx.cat2 ? `${tx.cat1} › ${tx.cat2}` : (tx.cat1 || null),
        city: tx.city || null,
        place: place || null,
      })
    } catch(e) {
      setAiError(e.message || 'Errore sconosciuto')
    } finally {
      setAiLoading(false)
    }
  }

  function exitReview() {
    saveLog({
      date: new Date().toISOString(),
      user: user?.displayName || null,
      resolved: resolvedCount,
    })
    setPhase('start')
    setQueuedIds(new Set())
    setUndoStack([])
    setActiveSection(null)
  }

  // ── Render: start ─────────────────────────────────────────
  if (phase === 'start') {
    return (
      <StartScreen
        modeCounts={modeCounts}
        selectedModes={selectedModes}
        onToggleMode={toggleMode}
        onStart={startDiscovery}
        discLog={discLog}
      />
    )
  }

  // ── Render: done (no more txs in queue, or currentTxId is gone) ──
  if (!current || queue.length === 0) {
    return <DoneScreen resolved={resolvedCount} onBack={exitReview} />
  }

  // ── Render: review ────────────────────────────────────────
  const done     = Math.max(0, total - queue.length)
  const pct      = total > 0 ? Math.round(done / total * 100) : 0
  const catColor = current?.cat1 ? (merged[current.cat1]?.color || '#888') : '#bbb'

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden',
      paddingBottom:'calc(6px + env(safe-area-inset-bottom,0px))'}}>

      {/* ── Header ── */}
      <div style={{flexShrink:0,padding:'10px 14px 6px',display:'flex',alignItems:'center',gap:8}}>
        <button onClick={exitReview}
          style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',
            fontSize:13,fontWeight:700,fontFamily:'var(--font-sans)',padding:'2px 4px 2px 0',flexShrink:0}}>
          ← Esci
        </button>
        <div style={{flex:1,height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
          <div style={{height:'100%',borderRadius:2,background:'var(--green)',
            width:`${pct}%`,transition:'width .3s'}}/>
        </div>
        <span style={{fontSize:11,color:'var(--text3)',flexShrink:0,minWidth:40,textAlign:'right'}}>
          {done}/{total}
        </span>
      </div>

      {/* ── Similar txs panel (overlays the card) ── */}
      {similarOpen && current && (
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',
          margin:'0 12px',background:'var(--surface)',borderRadius:16,
          border:'1px solid var(--border)',boxShadow:'0 4px 20px rgba(0,0,0,.07)'}}>
          {/* Header */}
          <div style={{flexShrink:0,padding:'12px 14px 10px',borderBottom:'1px solid var(--border)',
            display:'flex',alignItems:'center',gap:10}}>
            <button onClick={()=>{setSimilarOpen(false);setSimilarSelected(new Set())}}
              style={{background:'none',border:'none',cursor:'pointer',color:'var(--accent)',
                fontSize:13,fontWeight:700,fontFamily:'var(--font-sans)',padding:0,flexShrink:0}}>
              ← Indietro
            </button>
            <div style={{flex:1,fontSize:13,fontWeight:700,color:'var(--text1)',
              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {current.descAI || current.merchant}
            </div>
            <span style={{fontSize:11,color:'var(--text3)',flexShrink:0}}>
              {sameNameTxs.length} tx
            </span>
          </div>
          {/* Select-all bar */}
          <div style={{flexShrink:0,padding:'8px 14px',borderBottom:'1px solid var(--border)',
            display:'flex',alignItems:'center',gap:10,background:'var(--surface2)'}}>
            <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',flex:1,
              fontSize:12,fontWeight:600,color:'var(--text2)',fontFamily:'var(--font-sans)'}}>
              <input type="checkbox"
                checked={similarSelected.size === sameNameTxs.length && sameNameTxs.length > 0}
                onChange={e => setSimilarSelected(e.target.checked
                  ? new Set(sameNameTxs.map(t => t.txId))
                  : new Set()
                )}
                style={{width:16,height:16,cursor:'pointer',accentColor:'var(--accent)'}}
              />
              Seleziona tutte ({sameNameTxs.length})
            </label>
            {similarSelected.size > 0 && (
              <button
                onClick={() => {
                  setBulkEditPeers(new Set(similarSelected))
                  setSimilarOpen(false)
                  setSimilarSelected(new Set())
                }}
                style={{padding:'6px 14px',borderRadius:10,border:'none',
                  background:'var(--accent)',color:'#fff',
                  fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'var(--font-sans)',
                  flexShrink:0}}>
                ✏️ Modifica Multipla ({similarSelected.size})
              </button>
            )}
          </div>
          {/* List */}
          <div style={{flex:1,overflowY:'auto'}}>
            {sameNameTxs.map(t => {
              const d = (t._effDate || t.date || '').slice(0,10)
              const disp = d.length >= 10
                ? `${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(2,4)}`
                : d
              const isNeg = t.amount < 0
              const isSel = similarSelected.has(t.txId)
              return (
                <div key={t.txId}
                  onClick={() => setSimilarSelected(prev => {
                    const n = new Set(prev); isSel ? n.delete(t.txId) : n.add(t.txId); return n
                  })}
                  style={{display:'flex',alignItems:'center',
                    padding:'11px 14px',borderBottom:'1px solid var(--border)',gap:10,
                    cursor:'pointer',
                    background:isSel?'rgba(100,100,220,.07)':'transparent',
                    transition:'background .1s'}}>
                  <input type="checkbox" readOnly checked={isSel}
                    style={{width:16,height:16,flexShrink:0,accentColor:'var(--accent)',cursor:'pointer'}}/>
                  <span style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',
                    flexShrink:0,minWidth:64}}>{disp}</span>
                  {t.city && (
                    <span style={{fontSize:12,color:'var(--text2)',flex:1,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      📍 {t.city}
                    </span>
                  )}
                  {!t.city && <span style={{flex:1}}/>}
                  <span style={{fontSize:13,fontWeight:700,fontFamily:'var(--font-mono)',
                    color:isNeg?'var(--red)':'var(--green)',flexShrink:0}}>
                    {isNeg ? '-' : '+'}€ {fmtIT(Math.abs(t.amount), 2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Main card ── */}
      {current && !similarOpen && (
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',
          margin:'0 12px',background:'var(--surface)',borderRadius:16,
          border:'1px solid var(--border)',boxShadow:'0 4px 20px rgba(0,0,0,.07)'}}>

          {/* Bulk edit banner */}
          {bulkEditPeers.size > 0 && (
            <div style={{flexShrink:0,margin:'10px 12px 0',padding:'8px 12px',borderRadius:10,
              background:'rgba(100,100,220,.1)',border:'1px solid rgba(100,100,220,.25)',
              display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:'var(--accent)',flex:1}}>
                ✏️ Modifica multipla attiva — le modifiche si applicano anche a {bulkEditPeers.size} transazion{bulkEditPeers.size===1?'e':'i'} simili
              </span>
              <button onClick={()=>setBulkEditPeers(new Set())}
                style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',
                  fontSize:14,padding:0,flexShrink:0}}>✕</button>
            </div>
          )}

          {/* Amount row */}
          <div style={{flexShrink:0,padding:'14px 16px 0',display:'flex',alignItems:'center',gap:8}}>
            <div style={{flex:1}}>
              <div style={{fontSize:28,fontWeight:900,color:'var(--red)',letterSpacing:'-.04em',lineHeight:1}}>
                {fmtAmt(current.amount)}
              </div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:3,display:'flex',alignItems:'center',gap:8}}>
                <span>data valuta: {dateValuta(current)}</span>
                {current.user && (
                  <span style={{fontWeight:700,color:'var(--accent)'}}>👤 {current.user}</span>
                )}
              </div>
            </div>
            {current._flagged && <span style={{fontSize:16,flexShrink:0}}>🚩</span>}
            <button onClick={handleAiLookup} disabled={aiLoading}
              style={{padding:'6px 12px',borderRadius:10,border:'1px solid var(--border)',
                background:aiLoading?'var(--surface2)':'var(--bg)',
                fontSize:12,fontWeight:700,cursor:aiLoading?'default':'pointer',
                color:'var(--accent)',fontFamily:'var(--font-sans)',
                display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
              {aiLoading ? '⏳' : '🔍'} AI
            </button>
          </div>

          {/* Merchant / descAI — editable */}
          <div style={{flexShrink:0,padding:'6px 16px 0'}}>
            {editingDesc ? (
              <div style={{display:'flex',gap:6,alignItems:'flex-start'}}>
                <input
                  autoFocus
                  value={descDraft}
                  onChange={e=>setDescDraft(e.target.value)}
                  onKeyDown={e=>{
                    if(e.key==='Enter'&&descDraft.trim()) saveDescAI(descDraft.trim())
                    if(e.key==='Escape') setEditingDesc(false)
                  }}
                  style={{flex:1,padding:'6px 10px',borderRadius:8,
                    border:'1.5px solid var(--accent)',background:'var(--bg)',
                    color:'var(--text1)',fontSize:16,fontWeight:700,
                    fontFamily:'var(--font-sans)',outline:'none'}}
                />
                <button onClick={()=>{ if(descDraft.trim()) saveDescAI(descDraft.trim()) }}
                  style={{padding:'7px 12px',borderRadius:8,border:'none',background:'var(--accent)',
                    color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)',flexShrink:0}}>
                  ✓
                </button>
                <button onClick={()=>setEditingDesc(false)}
                  style={{padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',
                    background:'var(--bg)',color:'var(--text3)',fontSize:13,cursor:'pointer',
                    fontFamily:'var(--font-sans)',flexShrink:0}}>
                  ✕
                </button>
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:700,color:'var(--text1)',
                    wordBreak:'break-word',lineHeight:1.35}}>
                    {current.descAI || current.merchant || 'Transazione'}
                  </div>
                  {sameNameTxs.length > 0 && (
                    <button onClick={()=>setSimilarOpen(true)}
                      style={{marginTop:4,padding:'2px 8px',borderRadius:10,
                        border:'1px solid rgba(100,100,220,.3)',background:'rgba(100,100,220,.07)',
                        color:'var(--accent)',fontSize:11,fontWeight:700,cursor:'pointer',
                        fontFamily:'var(--font-sans)'}}>
                      ×{sameNameTxs.length} simili →
                    </button>
                  )}
                </div>
                <button onClick={()=>{setDescDraft(current.descAI||current.merchant||'');setEditingDesc(true)}}
                  style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',
                    fontSize:14,padding:'2px 4px',flexShrink:0,marginTop:1}}>
                  ✏️
                </button>
              </div>
            )}
          </div>

          {/* Scrollable body */}
          <div style={{flex:1,overflowY:'auto',padding:'8px 14px 10px',
            display:'flex',flexDirection:'column',gap:10}}>

            {/* AI error */}
            {aiError && (
              <div style={{padding:'8px 12px',background:'rgba(220,50,50,.08)',borderRadius:8,
                border:'1px solid rgba(220,50,50,.2)',fontSize:12,color:'var(--red)',
                display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                <span>⚠️ {aiError}</span>
                <button onClick={()=>setAiError(null)}
                  style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',
                    fontSize:14,padding:0,flexShrink:0}}>✕</button>
              </div>
            )}

            {/* AI result */}
            {aiResult && <AiResultBox result={aiResult} onClose={()=>setAiResult(null)}/>}

            {/* CATEGORIA */}
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',
                  textTransform:'uppercase',color:'var(--text3)'}}>Categoria</span>
                {activeSection==='cat' && (
                  <button onClick={()=>setActiveSection(null)}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:11,
                      color:'var(--text3)',fontFamily:'var(--font-sans)'}}>✕ chiudi</button>
                )}
              </div>
              {activeSection === 'cat' ? (
                <CatPickerInline
                  current={current}
                  merged={merged}
                  customCats={customCats}
                  onSelect={applyCategory}
                  onClose={()=>setActiveSection(null)}
                  onAddL2={addL2Category}
                />
              ) : (
                <button onClick={()=>setActiveSection(activeSection==='cat'?null:'cat')}
                  style={{padding:'8px 14px',borderRadius:12,cursor:'pointer',width:'100%',
                    border:`1.5px solid ${catColor}44`,background:`${catColor}12`,
                    color:catColor,fontSize:13,fontWeight:700,fontFamily:'var(--font-sans)',
                    display:'flex',alignItems:'center',gap:6,textAlign:'left'}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:catColor,flexShrink:0}}/>
                  <span style={{flex:1}}>{current.cat1||'?'}{current.cat2?` › ${current.cat2}`:''}</span>
                  <span style={{fontSize:10,opacity:.5}}>▼</span>
                </button>
              )}
            </div>

            {/* VEICOLO (solo se cat1 = Veicoli) */}
            {current.cat1 === 'Veicoli' && activeSection === null && (
              <VehicleQuickPicker txId={current.txId} cat1={current.cat1} />
            )}

            {/* LOCATION */}
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',
                    textTransform:'uppercase',color:'var(--text3)'}}>Location</span>
                  {/* Google search button */}
                  {(current.merchant || current.descAI || current.city || current.counterpart) && (() => {
                    const q = [current.merchant || current.descAI, current.city, current.counterpart]
                      .filter(Boolean).join(' ')
                    return (
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                        target="_blank" rel="noreferrer"
                        style={{padding:'2px 7px',borderRadius:8,
                          border:'1px solid rgba(66,133,244,.3)',background:'rgba(66,133,244,.07)',
                          color:'#4285f4',fontSize:10,fontWeight:700,textDecoration:'none',
                          display:'flex',alignItems:'center',gap:3}}>
                        🔍 Google
                      </a>
                    )
                  })()}
                </div>
                {activeSection==='loc' && (
                  <button onClick={()=>setActiveSection(null)}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:11,
                      color:'var(--text3)',fontFamily:'var(--font-sans)'}}>✕ chiudi</button>
                )}
              </div>
              {activeSection === 'loc' ? (
                <LocPickerInline
                  currentCity={current.city}
                  quickCities={quickCities}
                  onSelect={applyCity}
                  onClose={()=>setActiveSection(null)}
                />
              ) : (
                <button onClick={()=>setActiveSection(activeSection==='loc'?null:'loc')}
                  style={{padding:'8px 14px',borderRadius:12,cursor:'pointer',width:'100%',
                    border:`1.5px solid ${current.city?'rgba(59,130,246,.35)':'var(--border)'}`,
                    background:current.city?'rgba(59,130,246,.08)':'var(--surface2)',
                    color:current.city?'var(--blue)':'var(--text3)',
                    fontSize:13,fontWeight:600,fontFamily:'var(--font-sans)',
                    display:'flex',alignItems:'center',gap:6,textAlign:'left'}}>
                  <span style={{flex:1}}>📍 {current.city||'Nessuna location'}</span>
                  <span style={{fontSize:10,opacity:.5}}>▼</span>
                </button>
              )}
            </div>

            {/* NOTE */}
            {activeSection === null && (
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',
                    textTransform:'uppercase',color:'var(--text3)'}}>Nota</span>
                  {!editingNote && (
                    <button onClick={()=>{setNoteDraft(current.note||'');setEditingNote(true)}}
                      style={{background:'none',border:'none',cursor:'pointer',
                        color:'var(--accent)',fontSize:11,fontWeight:700,padding:0,
                        fontFamily:'var(--font-sans)'}}>
                      {current.note ? '✏️ modifica' : '+ aggiungi'}
                    </button>
                  )}
                </div>
                {editingNote ? (
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    <textarea
                      autoFocus
                      value={noteDraft}
                      onChange={e=>setNoteDraft(e.target.value)}
                      rows={3}
                      placeholder="Scrivi una nota…"
                      style={{width:'100%',padding:'8px 12px',borderRadius:10,
                        border:'1.5px solid var(--accent)',background:'var(--bg)',
                        color:'var(--text1)',fontSize:13,fontFamily:'var(--font-sans)',
                        outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.5}}
                    />
                    <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                      <button onClick={()=>setEditingNote(false)}
                        style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--border)',
                          background:'var(--bg)',color:'var(--text3)',fontSize:12,cursor:'pointer',
                          fontFamily:'var(--font-sans)'}}>Annulla</button>
                      <button onClick={()=>{
                        patchWithPeers(current.txId, { note: noteDraft.trim() || null })
                        setEditingNote(false)
                      }}
                        style={{padding:'6px 14px',borderRadius:8,border:'none',background:'var(--accent)',
                          color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                        ✓ Salva
                      </button>
                    </div>
                  </div>
                ) : current.note ? (
                  <div
                    onClick={()=>{setNoteDraft(current.note||'');setEditingNote(true)}}
                    style={{padding:'8px 12px',borderRadius:10,background:'rgba(100,100,220,.06)',
                      border:'1px solid rgba(100,100,220,.15)',fontSize:13,color:'var(--text2)',
                      lineHeight:1.5,wordBreak:'break-word',whiteSpace:'pre-wrap',cursor:'pointer'}}>
                    {current.note}
                  </div>
                ) : null}
              </div>
            )}

            {/* Descrizione originale (solo se nessun picker aperto) */}
            {activeSection === null && current.description && (
              <div style={{padding:'10px 14px',borderRadius:12,background:'var(--bg)',
                border:'1px solid var(--border)',borderLeft:'4px solid rgba(100,100,200,.2)'}}>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',
                  textTransform:'uppercase',color:'var(--text3)',marginBottom:6}}>ORIGINALE</div>
                <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.7,
                  wordBreak:'break-word',whiteSpace:'pre-wrap'}}>
                  {current.description}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Popups ── */}
      {descRulePopup && (
        <RuleApplyPopup
          tx={descRulePopup.tx}
          match={descRulePopup.match}
          newDesc={descRulePopup.newDesc}
          txId={descRulePopup.tx.txId}
          txDate={descRulePopup.tx.date}
          onApply={handleApplyDescRule}
          onClose={()=>setDescRulePopup(null)}
        />
      )}
      {catRulePopup && (
        <CatRulePopup
          tx={catRulePopup.tx}
          cat1={catRulePopup.cat1}
          cat2={catRulePopup.cat2}
          transactions={transactions}
          onSave={(mode, match) => handleSaveCatRule(mode, match)}
          onClose={()=>setCatRulePopup(null)}
        />
      )}

      {/* ── Bottom bar ── */}
      <div style={{flexShrink:0,padding:'8px 12px 2px'}}>
        {saltaSempreOpen ? (
          <div style={{background:'var(--surface)',borderRadius:14,border:'1px solid var(--border)',padding:'12px 14px'}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:8}}>
              🚫 Salta sempre le transazioni come:
            </div>
            <input value={saltaSempreText} onChange={e=>setSaltaSempreText(e.target.value)}
              style={{width:'100%',padding:'8px 12px',borderRadius:8,
                border:'1.5px solid var(--accent)',background:'var(--bg)',
                color:'var(--text1)',fontSize:13,fontFamily:'var(--font-sans)',
                outline:'none',boxSizing:'border-box',marginBottom:6}}/>
            <input value={saltaSempreNote} onChange={e=>setSaltaSempreNote(e.target.value)}
              placeholder="Motivazione (opzionale)…"
              style={{width:'100%',padding:'8px 12px',borderRadius:8,
                border:'1px solid var(--border)',background:'var(--bg)',
                color:'var(--text1)',fontSize:12,fontFamily:'var(--font-sans)',
                outline:'none',boxSizing:'border-box',marginBottom:10}}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <button onClick={()=>setSaltaSempreOpen(false)}
                style={{padding:'10px',borderRadius:10,border:'1px solid var(--border)',
                  background:'var(--surface2)',color:'var(--text2)',fontSize:13,
                  fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                Annulla
              </button>
              <button onClick={confirmSaltaSempre} disabled={!saltaSempreText.trim()}
                style={{padding:'10px',borderRadius:10,border:'none',
                  background:saltaSempreText.trim()?'rgba(220,50,50,.85)':'var(--border)',
                  color:'#fff',fontSize:13,fontWeight:700,
                  cursor:saltaSempreText.trim()?'pointer':'default',fontFamily:'var(--font-sans)'}}>
                🚫 Salta sempre
              </button>
            </div>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1.6fr',gap:6}}>
            <button onClick={handleUndo} disabled={!undoStack.length}
              style={{padding:'11px 4px',borderRadius:10,
                border:'1px solid var(--border)',background:'var(--surface)',
                color:undoStack.length?'var(--blue)':'var(--text3)',
                fontSize:18,fontWeight:700,cursor:undoStack.length?'pointer':'default',
                fontFamily:'var(--font-sans)',opacity:undoStack.length?1:.35}}>
              ←
            </button>
            <button onClick={handleSalta}
              style={{padding:'11px 4px',borderRadius:10,
                border:'1px solid var(--border)',background:'var(--surface)',
                color:'var(--text2)',fontSize:11,fontWeight:700,cursor:'pointer',
                fontFamily:'var(--font-sans)'}}>
              ⏭ Salta
            </button>
            <button onClick={handleSaltaSempre}
              style={{padding:'11px 4px',borderRadius:10,
                border:'1px dashed rgba(220,50,50,.35)',background:'rgba(220,50,50,.05)',
                color:'var(--red)',fontSize:10,fontWeight:700,cursor:'pointer',
                fontFamily:'var(--font-sans)'}}>
              🚫 Sempre
            </button>
            <button onClick={handleFlagga}
              style={{padding:'11px 4px',borderRadius:10,
                border:`1px solid ${current?._flagged?'rgba(220,50,50,.3)':'rgba(200,150,0,.3)'}`,
                background:current?._flagged?'rgba(220,50,50,.08)':'rgba(200,150,0,.07)',
                color:current?._flagged?'var(--red)':'var(--gold)',
                fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              🚩 Flagga
            </button>
            <button onClick={handleOK}
              style={{padding:'11px 4px',borderRadius:10,border:'none',
                background:'var(--green)',color:'#fff',
                fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              ✓ OK
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
