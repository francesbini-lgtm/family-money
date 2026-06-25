import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { getMergedCats } from '../data/categories'
import { fmtIT } from '../utils/format'

const SEEN_KEY = 'fm-discovery-seen'

function loadSeen()        { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} } }
function markSeen(txId)    { const s = loadSeen(); s[txId] = Date.now(); localStorage.setItem(SEEN_KEY, JSON.stringify(s)) }
function removeSeen(txId)  { const s = loadSeen(); delete s[txId]; localStorage.setItem(SEEN_KEY, JSON.stringify(s)) }

function isLowConfidence(t) {
  if (t.excluded) return false
  if (t.amount >= 0) return false
  if (t.userEditedCat) return false
  const cat = t.cat1 || ''
  return !cat || cat === 'Non Categorizzato' || cat === 'Altro' || !t.aiEnriched
}

const fmtAmt = n => '€ ' + fmtIT(Math.abs(n), 2)

function dateLabel(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('it-IT', { day:'numeric', month:'short', year:'2-digit' })
}

// ── Edit description modal ────────────────────────────────
function EditDescModal({ tx, onSave, onClose }) {
  const [val, setVal] = useState(tx.descAI || '')
  return (
    <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-modal">
        <div className="m-modal-handle"/>
        <div className="m-modal-title">✏️ Modifica Descrizione AI</div>
        <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10, lineHeight:1.5 }}>
          Originale: {tx.description?.slice(0, 100)}
        </div>
        <input className="m-input" value={val} onChange={e => setVal(e.target.value)} autoFocus style={{ marginBottom:16 }}/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <button className="m-btn m-btn-ghost" onClick={onClose}>Annulla</button>
          <button className="m-btn m-btn-primary" onClick={() => onSave(val)}>✓ Salva</button>
        </div>
      </div>
    </div>
  )
}

// ── Full category picker modal ────────────────────────────
function CatPickerModal({ onSelect, onClose, customCats }) {
  const merged = getMergedCats(customCats)
  const cats = Object.entries(merged).filter(([n]) => n !== 'Entrate' && n !== 'Non Categorizzato')
  const [selL1, setSelL1] = useState(null)

  if (selL1) {
    const info = merged[selL1] || {}
    const subs = info.sub || []
    return (
      <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="m-modal">
          <div className="m-modal-handle"/>
          <button onClick={() => setSelL1(null)}
            style={{ background:'none', border:'none', color:'var(--accent)', fontSize:13, fontWeight:700, cursor:'pointer', marginBottom:10, fontFamily:'var(--font-sans)' }}>
            ← {selL1}
          </button>
          <div className="m-modal-title">📂 Sottocategoria</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <button onClick={() => { onSelect(selL1, ''); onClose() }}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                border:'1px solid var(--border)', borderRadius:10, background:'var(--surface)',
                cursor:'pointer', fontFamily:'var(--font-sans)', textAlign:'left' }}>
              <span style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic' }}>— Nessuna sottocategoria</span>
            </button>
            {subs.map(sub => (
              <button key={sub} onClick={() => { onSelect(selL1, sub); onClose() }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                  border:'1px solid var(--border)', borderRadius:10, background:'var(--surface)',
                  cursor:'pointer', fontFamily:'var(--font-sans)', textAlign:'left' }}>
                <span style={{ fontSize:14, fontWeight:600, color:'var(--text1)' }}>{sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-modal">
        <div className="m-modal-handle"/>
        <div className="m-modal-title">📂 Seleziona Categoria</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {cats.map(([name, info]) => (
            <button key={name} onClick={() => setSelL1(name)}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                border:'1px solid var(--border)', borderRadius:10, background:'var(--surface)',
                cursor:'pointer', fontFamily:'var(--font-sans)', textAlign:'left',
                justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:info.color, flexShrink:0 }}/>
                <span style={{ fontSize:14, fontWeight:600, color:'var(--text1)' }}>{name}</span>
              </div>
              {(info.sub || []).length > 0 && (
                <span style={{ fontSize:11, color:'var(--text3)' }}>›</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MobileDiscovery() {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats        = useStore(s => s.customCats)

  const [seenVer,       setSeenVer]       = useState(0)
  const [undoStack,     setUndoStack]     = useState([])
  const [showEditDesc,  setShowEditDesc]  = useState(false)
  const [showCatPicker, setShowCatPicker] = useState(false)
  // Pending L1 for L2 selection (inline)
  const [pendingL1,     setPendingL1]     = useState(null)

  const merged = getMergedCats(customCats)

  // ── Queue ─────────────────────────────────────────────────
  const queue = useMemo(() => {
    const seen = loadSeen()
    const isComm = t => t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'
    const cands = transactions.filter(t => isLowConfidence(t) && !isComm(t))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    const unseen  = cands.filter(t => !seen[t.txId])
    const seenTxs = cands.filter(t =>  seen[t.txId])
      .sort((a, b) => (seen[a.txId] || 0) - (seen[b.txId] || 0))
    return [...unseen, ...seenTxs]
  }, [transactions, seenVer])

  const total   = transactions.filter(t => isLowConfidence(t) && !(t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca')).length
  const done    = Math.max(0, total - queue.length)
  const current = queue[0] || null

  useMemo(() => { if (current) markSeen(current.txId) }, [current?.txId])

  // ── Top 8 quick categories (learned) ─────────────────────
  const quickCats = useMemo(() => {
    const freq = {}
    transactions.filter(t => t.userEditedCat && t.amount < 0 && t.cat1)
      .forEach(t => { freq[t.cat1] = (freq[t.cat1] || 0) + 1 })
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([c]) => c)
    const defaults = ['Casa','Spesa e Alimentari','Tempo Libero','Shopping','Veicoli','Altro']
    return [...new Set([...sorted, ...defaults])].slice(0, 8)
  }, [transactions])

  // ── Top 5 quick locations ─────────────────────────────────
  const quickCities = useMemo(() => {
    const freq = {}
    transactions.filter(t => t.city).forEach(t => { freq[t.city] = (freq[t.city] || 0) + 1 })
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c)
  }, [transactions])

  // ── Actions ───────────────────────────────────────────────
  function pushUndo() {
    if (!current) return
    setUndoStack(s => [{
      txId: current.txId, prevCat1: current.cat1, prevCat2: current.cat2,
      prevDescAI: current.descAI, prevUserEditedCat: current.userEditedCat, prevFlagged: current._flagged
    }, ...s].slice(0, 10))
  }

  // Apply category WITHOUT advancing to next tx
  function applyCategory(cat1, cat2 = '') {
    if (!current) return
    pushUndo()
    updateTransaction(current.txId, { cat1, cat2: cat2 || null, userEditedCat: true })
    setPendingL1(null)
    // Do NOT call removeSeen / setSeenVer — user must explicitly press OK/SALTA/FLAGGA
  }

  function applyCity(city) {
    if (!current) return
    pushUndo()
    updateTransaction(current.txId, { city })
  }

  // Only these three advance the queue
  function advance() {
    removeSeen(current.txId)
    setSeenVer(v => v + 1)
    setPendingL1(null)
  }

  function skipCurrent() {
    if (!current) return
    markSeen(current.txId)
    setSeenVer(v => v + 1)
    setPendingL1(null)
  }

  function confirmCurrent() {
    if (!current) return
    pushUndo()
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
      descAI: last.prevDescAI, userEditedCat: last.prevUserEditedCat || false,
      _flagged: last.prevFlagged || false
    })
    removeSeen(last.txId)
    setSeenVer(v => v + 1)
    setPendingL1(null)
  }

  function handleSaveDesc(newDesc) {
    if (!current) return
    updateTransaction(current.txId, { descAI: newDesc, userEditedDesc: true })
    setShowEditDesc(false)
  }

  const catColor = cat => merged[cat]?.color || '#888'

  // ── Empty state ───────────────────────────────────────────
  if (queue.length === 0) {
    return (
      <div className="m-content">
        <div className="m-empty" style={{ marginTop:60 }}>
          <div className="m-empty-icon">✅</div>
          <div className="m-empty-title">Tutto in ordine!</div>
          <div className="m-empty-sub">Nessuna transazione da revisionare. Ottimo lavoro!</div>
        </div>
      </div>
    )
  }

  const pendingL1Subs = pendingL1 ? (merged[pendingL1]?.sub || []) : []

  return (
    // paddingBottom grande per non sovrapporre i bottoni sticky
    <div className="m-content" style={{ paddingBottom:120 }}>

      {/* Progress + Undo */}
      <div className="m-disc-progress">
        <span style={{ fontWeight:700, color:'var(--text2)', flexShrink:0 }}>{queue.length} da rivedere</span>
        <div className="m-disc-progress-bar">
          <div className="m-disc-progress-fill"
            style={{ width: total > 0 ? `${Math.round(done / total * 100)}%` : '0%' }}/>
        </div>
        <span style={{ flexShrink:0 }}>{total > 0 ? Math.round(done / total * 100) : 0}%</span>
        {undoStack.length > 0 && (
          <button onClick={handleUndo}
            style={{ marginLeft:4, padding:'3px 10px', borderRadius:8, border:'1px solid var(--border)',
              background:'var(--surface)', fontSize:11, fontWeight:700, cursor:'pointer',
              color:'var(--blue)', fontFamily:'var(--font-sans)', flexShrink:0 }}>
            ↩ Undo
          </button>
        )}
      </div>

      {/* Main card */}
      {current && (
        <div className="m-disc-card">
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:4 }}>
            <div className="m-disc-amount">{fmtAmt(current.amount)}</div>
            {current._flagged && <span style={{ fontSize:18 }}>🚩</span>}
          </div>

          <div className="m-disc-merchant">
            {current.merchant || current.descAI || 'Transazione'}
          </div>

          <div onClick={() => setShowEditDesc(true)}
            style={{ fontSize:13, color:'var(--text3)', marginBottom:6,
              cursor:'pointer', textDecoration:'underline dotted', lineHeight:1.4 }}>
            {current.descAI || '— nessuna descrizione AI —'}
            <span style={{ marginLeft:5, fontSize:10, color:'var(--accent)' }}>✏️</span>
          </div>

          {current.description && (
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10,
              padding:'6px 10px', background:'var(--surface2)', borderRadius:8,
              borderLeft:'2px solid var(--border)', lineHeight:1.4, wordBreak:'break-word' }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
                color:'var(--text3)', marginRight:6 }}>ORIGINALE</span>
              {current.description.slice(0, 120)}
            </div>
          )}

          {/* Meta tags */}
          <div className="m-disc-meta">
            <span className="m-disc-tag">{dateLabel(current.date)}</span>
            {current.account && <span className="m-disc-tag">{current.account}</span>}
            {current.city && (
              <span className="m-disc-tag" style={{ background:'rgba(59,130,246,.1)', color:'var(--blue)', borderColor:'rgba(59,130,246,.2)' }}>
                📍 {current.city}
              </span>
            )}
            {current.time && <span className="m-disc-tag">🕐 {current.time}</span>}
            {current.cat1 && (
              <span className="m-disc-tag"
                style={{ background: catColor(current.cat1) + '22', color: catColor(current.cat1),
                  borderColor: catColor(current.cat1) + '44' }}>
                {current.cat1}{current.cat2 ? ` › ${current.cat2}` : ''}
              </span>
            )}
            {!current.aiEnriched && (
              <span className="m-disc-tag" style={{ background:'rgba(230,150,0,.12)', color:'var(--gold)', borderColor:'rgba(230,150,0,.2)' }}>
                ⚠️ Non AI
              </span>
            )}
          </div>
        </div>
      )}

      {/* L1 category quick buttons */}
      <div style={{ padding:'10px 14px 4px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase',
          letterSpacing:'.04em', marginBottom:8 }}>Assegna categoria</div>
        <div className="m-quickcat-grid">
          {quickCats.map(cat => {
            const color    = catColor(cat)
            const isActive = current?.cat1 === cat && !pendingL1
            const isPending = pendingL1 === cat
            return (
              <button key={cat} className="m-quickcat-btn"
                onClick={() => {
                  if (pendingL1 === cat) { setPendingL1(null); return }
                  const subs = merged[cat]?.sub || []
                  if (subs.length > 0) {
                    setPendingL1(cat)
                  } else {
                    applyCategory(cat, '')
                  }
                }}
                style={ isPending
                  ? { background: color+'33', borderColor:color, color, fontWeight:800 }
                  : isActive
                    ? { background: color+'22', borderColor:color, color }
                    : {} }>
                <span style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }}/>
                {cat}
                {(merged[cat]?.sub||[]).length > 0 && <span style={{ fontSize:9, opacity:.6 }}>›</span>}
              </button>
            )
          })}
          <button className="m-quickcat-btn" onClick={() => setShowCatPicker(true)}
            style={{ color:'var(--accent)', borderColor:'var(--accent)', background:'rgba(100,120,200,.08)' }}>
            ＋ Altra
          </button>
        </div>
      </div>

      {/* L2 subcategory buttons (shown when L1 pending) */}
      {pendingL1 && (
        <div style={{ padding:'4px 14px 8px', margin:'0 14px', background:'var(--surface2)', borderRadius:10, border:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.04em', padding:'8px 0 6px' }}>
            Sottocategoria · {pendingL1}
          </div>
          <div className="m-quickcat-grid">
            <button className="m-quickcat-btn"
              onClick={() => applyCategory(pendingL1, '')}
              style={{ fontStyle:'italic', color:'var(--text3)' }}>
              — Nessuna
            </button>
            {pendingL1Subs.map(sub => {
              const isActive = current?.cat1 === pendingL1 && current?.cat2 === sub
              return (
                <button key={sub} className="m-quickcat-btn"
                  onClick={() => applyCategory(pendingL1, sub)}
                  style={ isActive ? { background:'var(--accent)22', borderColor:'var(--accent)', color:'var(--accent)' } : {} }>
                  {sub}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Location quick buttons */}
      {quickCities.length > 0 && (
        <div style={{ padding:'8px 14px 4px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase',
            letterSpacing:'.04em', marginBottom:8 }}>Assegna location</div>
          <div className="m-quickcat-grid">
            {quickCities.map(city => {
              const isActive = current?.city === city
              return (
                <button key={city} className="m-quickcat-btn" onClick={() => applyCity(city)}
                  style={ isActive ? { background:'rgba(59,130,246,.15)', borderColor:'var(--blue)', color:'var(--blue)' } : {} }>
                  📍 {city}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sticky bottom action bar ─────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        padding: `10px 14px calc(10px + env(safe-area-inset-bottom, 0px) + 72px)`,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        zIndex: 15,
      }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <button className="m-btn m-btn-ghost" onClick={skipCurrent} style={{ fontSize:13 }}>
            ⏭ Salta
          </button>
          <button className="m-btn m-btn-green" onClick={confirmCurrent} style={{ fontSize:13, fontWeight:800 }}>
            ✓ OK
          </button>
          <button className="m-btn" onClick={toggleFlag}
            style={{ fontSize:13,
              background: current?._flagged ? 'rgba(220,50,50,.12)' : 'rgba(200,150,0,.1)',
              color: current?._flagged ? 'var(--red)' : 'var(--gold)',
              border: `1px solid ${current?._flagged ? 'rgba(220,50,50,.2)' : 'rgba(200,150,0,.2)'}` }}>
            {current?._flagged ? '🚩 Flaggata' : '🚩 Flagga'}
          </button>
        </div>
      </div>

      {showEditDesc && (
        <EditDescModal tx={current} onSave={handleSaveDesc} onClose={() => setShowEditDesc(false)}/>
      )}
      {showCatPicker && (
        <CatPickerModal
          onSelect={(cat1, cat2) => applyCategory(cat1, cat2 || '')}
          onClose={() => setShowCatPicker(false)}
          customCats={customCats}
        />
      )}
    </div>
  )
}
