import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { getMergedCats } from '../data/categories'
import { fmtIT } from '../utils/format'
import { lookupMerchantInfo } from '../data/aiService'

// ── Seen-key helpers (localStorage) ──────────────────────
const SEEN_KEY = 'fm-discovery-seen'
function loadSeen()       { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} } }
function markSeen(txId)   { const s = loadSeen(); s[txId] = Date.now(); localStorage.setItem(SEEN_KEY, JSON.stringify(s)) }
function removeSeen(txId) { const s = loadSeen(); delete s[txId]; localStorage.setItem(SEEN_KEY, JSON.stringify(s)) }

// Entry condition: which transactions belong in Discovery
function isLowConfidence(t) {
  if (t.excluded) return false
  if (t.amount >= 0) return false
  if (t.userEditedCat) return false
  const cat = t.cat1 || ''
  return !cat || cat === 'Non Categorizzato' || cat === 'Altro' || !t.aiEnriched
}

function isCommission(t) {
  return t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'
}

const fmtAmt = n => '€ ' + fmtIT(Math.abs(n), 2)

function dateValuta(t) {
  const d = t.date || ''
  if (!d) return ''
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ── Inline category picker (L1 → L2 + nuova L2) ──────────
function CatPickerInline({ current, merged, customCats, onSelect, onClose, onAddL2 }) {
  const [selL1,    setSelL1]    = useState(current?.cat1 || null)
  const [newL2,    setNewL2]    = useState('')
  const [addingL2, setAddingL2] = useState(false)
  const cats = Object.entries(merged).filter(([n]) => n !== 'Entrate' && n !== 'Non Categorizzato')

  if (selL1) {
    const subs = merged[selL1]?.sub || []
    const color = merged[selL1]?.color || '#888'
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        <button onClick={() => { setSelL1(null); setAddingL2(false); setNewL2('') }}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
            color:'var(--accent)', fontFamily:'var(--font-sans)', textAlign:'left',
            padding:'4px 0', display:'flex', alignItems:'center', gap:4 }}>
          ← {selL1}
        </button>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          <button onClick={() => { onSelect(selL1, ''); onClose() }}
            style={{ padding:'5px 12px', borderRadius:16, border:'1px solid var(--border)',
              background: !current?.cat2 && current?.cat1===selL1 ? color+'22' : 'var(--surface)',
              color: 'var(--text3)', fontSize:12, fontWeight:600, cursor:'pointer',
              fontFamily:'var(--font-sans)', fontStyle:'italic' }}>
            — Nessuna
          </button>
          {subs.map(sub => {
            const isAct = current?.cat1 === selL1 && current?.cat2 === sub
            return (
              <button key={sub} onClick={() => { onSelect(selL1, sub); onClose() }}
                style={{ padding:'5px 12px', borderRadius:16, border:`1px solid ${isAct ? color : 'var(--border)'}`,
                  background: isAct ? color+'22' : 'var(--surface)', color: isAct ? color : 'var(--text2)',
                  fontSize:12, fontWeight: isAct ? 700 : 500, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                {sub}
              </button>
            )
          })}
        </div>
        {/* Nuova categoria L2 */}
        {addingL2 ? (
          <div style={{ display:'flex', gap:6, marginTop:4 }}>
            <input value={newL2} onChange={e => setNewL2(e.target.value)}
              autoFocus placeholder="Nome nuova categoria…"
              onKeyDown={e => {
                if (e.key === 'Enter' && newL2.trim()) {
                  onAddL2(selL1, newL2.trim())
                  onSelect(selL1, newL2.trim())
                  onClose()
                }
                if (e.key === 'Escape') { setAddingL2(false); setNewL2('') }
              }}
              style={{ flex:1, padding:'6px 10px', borderRadius:8, border:'1.5px solid var(--accent)',
                background:'var(--bg)', color:'var(--text1)', fontSize:13,
                fontFamily:'var(--font-sans)', outline:'none' }}/>
            <button onClick={() => {
                if (!newL2.trim()) return
                onAddL2(selL1, newL2.trim())
                onSelect(selL1, newL2.trim())
                onClose()
              }}
              style={{ padding:'6px 12px', borderRadius:8, border:'none',
                background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:700,
                cursor:'pointer', fontFamily:'var(--font-sans)' }}>✓</button>
            <button onClick={() => { setAddingL2(false); setNewL2('') }}
              style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)',
                background:'var(--bg)', color:'var(--text3)', fontSize:12, cursor:'pointer',
                fontFamily:'var(--font-sans)' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setAddingL2(true)}
            style={{ padding:'5px 12px', borderRadius:16, border:`1px dashed ${color}88`,
              background:'none', color: color, fontSize:11, fontWeight:600, cursor:'pointer',
              fontFamily:'var(--font-sans)', display:'inline-flex', alignItems:'center', gap:4,
              alignSelf:'flex-start', marginTop:2 }}>
            + Nuova categoria
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
      {cats.map(([name, info]) => {
        const isAct = current?.cat1 === name
        return (
          <button key={name}
            onClick={() => {
              if ((info.sub || []).length === 0) { onSelect(name, ''); onClose() }
              else setSelL1(name)
            }}
            style={{ padding:'5px 12px', borderRadius:16,
              border:`1px solid ${isAct ? info.color : 'var(--border)'}`,
              background: isAct ? info.color+'22' : 'var(--surface)',
              color: isAct ? info.color : 'var(--text2)',
              fontSize:12, fontWeight: isAct ? 700 : 500, cursor:'pointer', fontFamily:'var(--font-sans)',
              display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:info.color, flexShrink:0 }}/>
            {name}
            {(info.sub||[]).length > 0 && <span style={{ fontSize:9, opacity:.5 }}>›</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Inline location picker ────────────────────────────────
function LocPickerInline({ currentCity, quickCities, onSelect, onClose }) {
  const [custom, setCustom] = useState('')
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        <button onClick={() => { onSelect(''); onClose() }}
          style={{ padding:'5px 12px', borderRadius:16, border:'1px solid var(--border)',
            background: !currentCity ? 'rgba(200,50,50,.12)' : 'var(--surface)',
            color: !currentCity ? 'var(--red)' : 'var(--text3)',
            fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-sans)', fontStyle:'italic' }}>
          ✕ No location
        </button>
        {quickCities.map(city => {
          const isAct = city === currentCity
          return (
            <button key={city} onClick={() => { onSelect(city); onClose() }}
              style={{ padding:'5px 12px', borderRadius:16,
                border:`1px solid ${isAct ? 'var(--blue)' : 'var(--border)'}`,
                background: isAct ? 'rgba(59,130,246,.15)' : 'var(--surface)',
                color: isAct ? 'var(--blue)' : 'var(--text2)',
                fontSize:12, fontWeight: isAct ? 700 : 500, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
              📍 {city}
            </button>
          )
        })}
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <input value={custom} onChange={e => setCustom(e.target.value)}
          placeholder="Altra città…"
          onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { onSelect(custom.trim()); onClose() } }}
          style={{ flex:1, padding:'7px 12px', borderRadius:10, border:'1.5px solid var(--border)',
            background:'var(--bg)', color:'var(--text1)', fontSize:13, fontFamily:'var(--font-sans)', outline:'none' }}/>
        <button onClick={() => { if (custom.trim()) { onSelect(custom.trim()); onClose() } }}
          style={{ padding:'7px 14px', borderRadius:10, border:'none', background:'var(--accent)',
            color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
          ✓
        </button>
      </div>
    </div>
  )
}

// ── AI merchant info bubble ───────────────────────────────
function AiInfoBubble({ info, onClose }) {
  return (
    <div style={{ padding:'10px 14px', background:'rgba(100,120,220,.08)', borderRadius:10,
      border:'1px solid rgba(100,120,220,.2)', fontSize:13, color:'var(--text2)', lineHeight:1.5,
      display:'flex', gap:8, alignItems:'flex-start' }}>
      <span style={{ fontSize:16, flexShrink:0 }}>🤖</span>
      <div style={{ flex:1 }}>{info}</div>
      <button onClick={onClose}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14, padding:0, flexShrink:0 }}>✕</button>
    </div>
  )
}

export default function MobileDiscovery() {
  const transactions            = useStore(s => s.transactions)
  const updateTransaction       = useStore(s => s.updateTransaction)
  const customCats              = useStore(s => s.customCats)
  const setCustomCats           = useStore(s => s.setCustomCats)
  const discoverySkipRules      = useStore(s => s.discoverySkipRules) || []
  const addDiscoverySkipRule    = useStore(s => s.addDiscoverySkipRule)

  const [seenVer,      setSeenVer]      = useState(0)
  const [undoStack,    setUndoStack]    = useState([])
  const [activeMode,   setActiveMode]   = useState(null) // null | 'cat' | 'loc'
  const [showEditDesc, setShowEditDesc] = useState(false)
  const [aiInfo,       setAiInfo]       = useState(null)
  const [aiLoading,    setAiLoading]    = useState(false)
  const [descEdit,     setDescEdit]     = useState('')
  const [forceFront,   setForceFront]   = useState(null)

  // ── queuedIds: usa useState (non useRef!) così le modifiche triggherano re-render ──
  // Le tx ENTRANO quando isLowConfidence al momento del caricamento.
  // Le tx ESCONO solo quando si preme OK (confirmCurrent).
  // Assegnare categoria/location non modifica queuedIds → tx resta in coda.
  const [queuedIds, setQueuedIds] = useState(() => new Set())

  // Aggiungi le tx low-confidence man mano che arrivano da Firestore.
  // Usa updater funzionale per non ricreare il Set se non cambia nulla.
  useEffect(() => {
    setQueuedIds(prev => {
      let changed = false
      const next = new Set(prev)
      transactions.forEach(t => {
        if (!prev.has(t.txId) && isLowConfidence(t) && !isCommission(t)) {
          next.add(t.txId)
          changed = true
        }
      })
      return changed ? next : prev  // se non cambia, ritorna lo stesso set → nessun re-render
    })
  }, [transactions])

  const merged  = getMergedCats(customCats)
  const skipSet = useMemo(() => new Set(discoverySkipRules.map(r => r.descAI)), [discoverySkipRules])

  // ── Queue ─────────────────────────────────────────────────
  // Gate di uscita: solo userEditedCat===true (impostato da OK).
  // Cambiare categoria non tocca queuedIds → la tx resta.
  const queue = useMemo(() => {
    const seen = loadSeen()
    let cands = transactions
      .filter(t =>
        queuedIds.has(t.txId) &&    // era low-confidence quando è arrivata
        !t.userEditedCat &&          // non ancora confermata con OK
        !isCommission(t) &&
        !skipSet.has(t.descAI)
      )
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    // forceFront: metti quella tx in testa dopo undo
    if (forceFront) {
      const idx = cands.findIndex(t => t.txId === forceFront)
      if (idx > 0) {
        const [item] = cands.splice(idx, 1)
        cands.unshift(item)
      }
    }

    const unseen  = cands.filter(t => !seen[t.txId])
    const seenTxs = cands.filter(t =>  seen[t.txId])
      .sort((a, b) => (seen[a.txId] || 0) - (seen[b.txId] || 0))
    return [...unseen, ...seenTxs]
  }, [transactions, queuedIds, seenVer, skipSet, forceFront])

  const total   = queuedIds.size
  const done    = Math.max(0, total - queue.length)
  const current = queue[0] || null

  useEffect(() => { if (current) markSeen(current.txId) }, [current?.txId])
  useEffect(() => { if (forceFront && current?.txId === forceFront) setForceFront(null) }, [current?.txId, forceFront])
  useEffect(() => { setActiveMode(null); setAiInfo(null) }, [current?.txId])

  // Top 8 locations
  const quickCities = useMemo(() => {
    const freq = {}
    transactions.filter(t => t.city).forEach(t => { freq[t.city] = (freq[t.city] || 0) + 1 })
    return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,8).map(([c]) => c)
  }, [transactions])

  // ── Actions ───────────────────────────────────────────────
  function pushUndo() {
    if (!current) return
    setUndoStack(s => [{
      txId: current.txId, prevCat1: current.cat1, prevCat2: current.cat2,
      prevDescAI: current.descAI, prevCity: current.city,
      prevUserEditedCat: current.userEditedCat, prevFlagged: current._flagged,
    }, ...s].slice(0, 10))
  }

  function applyCategory(cat1, cat2 = '') {
    if (!current) return
    pushUndo()
    // NON setta userEditedCat — lo fa solo OK
    // NON modifica queuedIds — la tx resta in coda
    updateTransaction(current.txId, { cat1, cat2: cat2 || null })
    setActiveMode(null)
  }

  function applyCity(city) {
    if (!current) return
    pushUndo()
    updateTransaction(current.txId, { city: city || null })
    setActiveMode(null)
  }

  function addL2Category(cat1, newSub) {
    if (!cat1 || !newSub) return
    const existing = customCats[cat1]?.sub || merged[cat1]?.sub || []
    if (existing.includes(newSub)) return
    const updatedCats = {
      ...customCats,
      [cat1]: { sub: [...existing, newSub] }
    }
    setCustomCats(updatedCats)
  }

  function advance() {
    markSeen(current.txId)
    setSeenVer(v => v + 1)
    setActiveMode(null)
    setAiInfo(null)
  }

  function skipCurrent() {
    if (!current) return
    markSeen(current.txId)
    setSeenVer(v => v + 1)
    setActiveMode(null)
  }

  function confirmCurrent() {
    if (!current) return
    pushUndo()
    // Rimuovi da queuedIds — unico modo per uscire dalla coda
    setQueuedIds(prev => { const next = new Set(prev); next.delete(current.txId); return next })
    updateTransaction(current.txId, { userEditedCat: true })
    advance()
  }

  function toggleFlag() {
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
      cat1: last.prevCat1, cat2: last.prevCat2 || null,
      descAI: last.prevDescAI, city: last.prevCity || null,
      userEditedCat: last.prevUserEditedCat || false,
      _flagged: last.prevFlagged || false,
    })
    // Rimetti in coda (se era stata confermata con OK)
    setQueuedIds(prev => { const next = new Set(prev); next.add(last.txId); return next })
    removeSeen(last.txId)
    setForceFront(last.txId)
    setSeenVer(v => v + 1)
  }

  function saltaSempre() {
    if (!current?.descAI) return
    addDiscoverySkipRule(current.descAI)
    advance()
  }

  async function handleAiLookup() {
    if (!current || aiLoading) return
    setAiLoading(true)
    setAiInfo(null)
    try {
      const info = await lookupMerchantInfo(current.merchant || current.descAI, current.description, current.amount)
      setAiInfo(info || '(nessuna risposta)')
    } catch(e) {
      const msg = e.message || 'errore sconosciuto'
      console.error('[AI lookup]', msg)
      setAiInfo(`⚠️ ${msg}`)
    } finally {
      setAiLoading(false)
    }
  }

  function saveDesc() {
    if (!current || !descEdit.trim()) return
    updateTransaction(current.txId, { descAI: descEdit.trim(), userEditedDesc: true })
    setShowEditDesc(false)
  }

  const catColor = cat => merged[cat]?.color || '#888'

  // ── Empty state ───────────────────────────────────────────
  if (queue.length === 0) {
    return (
      <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', padding:24 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:17, fontWeight:700, color:'var(--text1)', marginBottom:8 }}>Tutto in ordine!</div>
          <div style={{ fontSize:13, color:'var(--text3)' }}>Nessuna transazione da revisionare.</div>
        </div>
      </div>
    )
  }

  const curCatColor = current ? catColor(current.cat1) : '#888'

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
    }}>

      {/* Progress bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px 8px', flexShrink:0 }}>
        <span style={{ fontWeight:700, color:'var(--text2)', fontSize:12, flexShrink:0 }}>{queue.length} rimaste</span>
        <div style={{ flex:1, height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
          <div style={{ height:'100%', borderRadius:2, background:'var(--green)',
            width: total > 0 ? `${Math.round(done/total*100)}%` : '0%', transition:'width .3s' }}/>
        </div>
        <span style={{ fontSize:11, color:'var(--text3)', flexShrink:0 }}>{total > 0 ? Math.round(done/total*100) : 0}%</span>
        {undoStack.length > 0 && (
          <button onClick={handleUndo}
            style={{ padding:'3px 10px', borderRadius:8, border:'1px solid var(--border)',
              background:'var(--surface)', fontSize:11, fontWeight:700, cursor:'pointer',
              color:'var(--blue)', fontFamily:'var(--font-sans)', flexShrink:0 }}>
            ↩
          </button>
        )}
      </div>

      {/* Main card */}
      {current && (
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column',
          margin:'0 14px', background:'var(--surface)', borderRadius:16,
          border:'1px solid var(--border)', boxShadow:'0 4px 20px rgba(0,0,0,.07)' }}>

          {/* Amount + AI button */}
          <div style={{ padding:'14px 16px 0', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ fontSize:28, fontWeight:900, color:'var(--red)', letterSpacing:'-.04em', lineHeight:1 }}>
              {fmtAmt(current.amount)}
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {current._flagged && <span style={{ fontSize:16 }}>🚩</span>}
              <button onClick={handleAiLookup} disabled={aiLoading}
                style={{ padding:'4px 10px', borderRadius:10, border:'1px solid var(--border)',
                  background: aiLoading ? 'var(--surface2)' : 'var(--bg)',
                  fontSize:11, fontWeight:700, cursor: aiLoading ? 'default' : 'pointer',
                  color:'var(--accent)', fontFamily:'var(--font-sans)', display:'flex', alignItems:'center', gap:4 }}>
                {aiLoading ? '⏳' : '🔍'} AI
              </button>
            </div>
          </div>

          {/* Merchant */}
          <div style={{ padding:'4px 16px 0', fontSize:15, fontWeight:700, color:'var(--text1)',
            flexShrink:0, wordBreak:'break-word', lineHeight:1.3 }}>
            {current.merchant || current.descAI || 'Transazione'}
          </div>

          {/* AI info bubble */}
          {aiInfo && (
            <div style={{ padding:'6px 12px 0', flexShrink:0 }}>
              <AiInfoBubble info={aiInfo} onClose={() => setAiInfo(null)}/>
            </div>
          )}

          {/* Tags row */}
          <div style={{ padding:'8px 12px 0', display:'flex', flexWrap:'wrap', gap:5, flexShrink:0 }}>
            <button onClick={() => setActiveMode(m => m === 'cat' ? null : 'cat')}
              style={{ padding:'4px 10px', borderRadius:12, fontSize:12, fontWeight:700, cursor:'pointer',
                border:`1px solid ${curCatColor}44`, background:`${curCatColor}18`, color: curCatColor,
                fontFamily:'var(--font-sans)', display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:curCatColor, flexShrink:0 }}/>
              {current.cat1 || '?'}{current.cat2 ? ` › ${current.cat2}` : ''}
              <span style={{ fontSize:9, opacity:.6 }}>▼</span>
            </button>

            <span style={{ padding:'4px 10px', borderRadius:12, fontSize:12, fontWeight:600,
              border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text2)' }}>
              {dateValuta(current)}
            </span>

            <button onClick={() => setActiveMode(m => m === 'loc' ? null : 'loc')}
              style={{ padding:'4px 10px', borderRadius:12, fontSize:12, fontWeight:600, cursor:'pointer',
                border:`1px solid ${current.city ? 'rgba(59,130,246,.3)' : 'var(--border)'}`,
                background: current.city ? 'rgba(59,130,246,.1)' : 'var(--surface2)',
                color: current.city ? 'var(--blue)' : 'var(--text3)',
                fontFamily:'var(--font-sans)', display:'flex', alignItems:'center', gap:4 }}>
              📍 {current.city || 'Luogo?'}
              <span style={{ fontSize:9, opacity:.6 }}>▼</span>
            </button>

            {current.time && (
              <span style={{ padding:'4px 10px', borderRadius:12, fontSize:12, fontWeight:600,
                border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text3)' }}>
                🕐 {current.time}
              </span>
            )}
            {!current.aiEnriched && (
              <span style={{ padding:'4px 8px', borderRadius:12, fontSize:11, fontWeight:700,
                border:'1px solid rgba(230,150,0,.2)', background:'rgba(230,150,0,.1)', color:'var(--gold)' }}>
                ⚠️ Non AI
              </span>
            )}
          </div>

          {/* Inline picker or description */}
          <div style={{ flex:1, overflow:'hidden', padding:'6px 14px 8px', display:'flex', flexDirection:'column', gap:6 }}>
            {activeMode === 'cat' && (
              <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em',
                  textTransform:'uppercase', color:'var(--text3)', marginBottom:6, flexShrink:0 }}>
                  Seleziona categoria
                </div>
                <div style={{ flex:1, overflowY:'auto' }}>
                  <CatPickerInline
                    current={current}
                    merged={merged}
                    customCats={customCats}
                    onSelect={applyCategory}
                    onClose={() => setActiveMode(null)}
                    onAddL2={addL2Category}
                  />
                </div>
              </div>
            )}
            {activeMode === 'loc' && (
              <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em',
                  textTransform:'uppercase', color:'var(--text3)', marginBottom:6, flexShrink:0 }}>
                  Seleziona location
                </div>
                <div style={{ flex:1, overflowY:'auto' }}>
                  <LocPickerInline
                    currentCity={current.city}
                    quickCities={quickCities}
                    onSelect={applyCity}
                    onClose={() => setActiveMode(null)}
                  />
                </div>
              </div>
            )}
            {activeMode === null && (
              <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', gap:6 }}>
                {/* descAI editable */}
                {showEditDesc ? (
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                    <textarea value={descEdit} onChange={e => setDescEdit(e.target.value)}
                      autoFocus rows={4}
                      style={{ flex:1, padding:'8px 12px', borderRadius:10, border:'1.5px solid var(--accent)',
                        background:'var(--bg)', color:'var(--text1)', fontSize:13, resize:'none',
                        fontFamily:'var(--font-sans)', outline:'none', lineHeight:1.5 }}/>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button onClick={saveDesc}
                        style={{ flex:1, padding:'8px', borderRadius:8, border:'none',
                          background:'var(--accent)', color:'#fff', fontSize:13, fontWeight:700,
                          cursor:'pointer', fontFamily:'var(--font-sans)' }}>✓ Salva</button>
                      <button onClick={() => setShowEditDesc(false)}
                        style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)',
                          background:'var(--bg)', color:'var(--text3)', fontSize:13, cursor:'pointer',
                          fontFamily:'var(--font-sans)' }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setShowEditDesc(true); setDescEdit(current.descAI || '') }}
                    style={{ background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left',
                      fontFamily:'var(--font-sans)', width:'100%', flexShrink:0 }}>
                    <div style={{ padding:'8px 12px', borderRadius:10, background:'var(--surface2)',
                      border:'1px solid var(--border)' }}>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
                        color:'var(--accent)', marginBottom:4 }}>descAI ✏️</div>
                      <div style={{ fontSize:14, color:'var(--text1)', lineHeight:1.5, fontWeight:500,
                        wordBreak:'break-word', whiteSpace:'pre-wrap' }}>
                        {current.descAI || '—'}
                      </div>
                    </div>
                  </button>
                )}
                {/* Descrizione originale */}
                {current.description && !showEditDesc && (
                  <div style={{ flex:1, minHeight:140, overflowY:'auto', padding:'10px 14px',
                    borderRadius:12, background:'var(--bg)', border:'1px solid var(--border)',
                    borderLeft:'4px solid rgba(100,100,200,.3)' }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em',
                      textTransform:'uppercase', color:'var(--text3)', marginBottom:8 }}>ORIGINALE</div>
                    <div style={{ fontSize:14, color:'var(--text2)', lineHeight:1.7,
                      wordBreak:'break-word', whiteSpace:'pre-wrap' }}>
                      {current.description}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div style={{ flexShrink:0, padding:'8px 14px 4px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:6 }}>
          <button className="m-btn m-btn-ghost" onClick={skipCurrent} style={{ fontSize:13, padding:'11px 0' }}>
            ⏭ Salta
          </button>
          <button className="m-btn m-btn-green" onClick={confirmCurrent} style={{ fontSize:13, padding:'11px 0', fontWeight:800 }}>
            ✓ OK
          </button>
          <button className="m-btn" onClick={toggleFlag}
            style={{ fontSize:13, padding:'11px 0',
              background: current?._flagged ? 'rgba(220,50,50,.12)' : 'rgba(200,150,0,.1)',
              color: current?._flagged ? 'var(--red)' : 'var(--gold)',
              border: `1px solid ${current?._flagged ? 'rgba(220,50,50,.2)' : 'rgba(200,150,0,.2)'}` }}>
            {current?._flagged ? '🚩 Flaggata' : '🚩 Flagga'}
          </button>
        </div>
        {current?.descAI && (
          <button onClick={saltaSempre}
            style={{ width:'100%', padding:'6px', background:'none',
              border:'1px dashed var(--border)', borderRadius:8,
              fontSize:11, fontWeight:600, cursor:'pointer', color:'var(--text3)',
              fontFamily:'var(--font-sans)' }}>
            🚫 Salta sempre "{current.descAI?.slice(0,30)}{current.descAI?.length > 30 ? '…' : ''}"
          </button>
        )}
      </div>
    </div>
  )
}
