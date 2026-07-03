import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { useAuth } from '../auth/AuthContext'
import { CATS, CAT_NAMES, getMergedCats, getMergedCatNames } from '../data/categories'
import { Upload, Search, X, TrendingUp, TrendingDown, Banknote, Tag, ChevronDown, Filter, Plus } from 'lucide-react'
import ImportModal from '../components/ImportModal'
import VehicleQuickPicker from '../components/VehicleQuickPicker'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import { exportTransactionsCSV } from '../services/export'
import { categorizeOne, enrichBatch, enrichCitiesBatch, processFeedback, computeDescAI, callGemini } from '../data/aiService'
// aiRules.js removed — AI naming rules now stored in Firestore via appPrefs
import './TransactionsPage.css'
import { fmtIT, fmtDate } from '../utils/format'

const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

// fmtDate imported from utils/format

// ── KPI bar ───────────────────────────────────────────────
const SALDO_PIN = '182218'

// ── Forced balance modal ──────────────────────────────────
function ForcedBalanceModal({ currentSaldo, onClose }) {
  const addTransactions   = useStore(s => s.addTransactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const allTxs            = useStore(s => s.transactions)
  const [step,   setStep]   = useState('pin')
  const [pin,    setPin]    = useState('')
  const [pinErr, setPinErr] = useState('')
  const [target, setTarget] = useState('')
  const [saved,  setSaved]  = useState(false)
  const existingForced = allTxs.find(t => t._forcedBalance)

  function confirmPin() {
    if (pin !== SALDO_PIN) { setPinErr('Codice errato'); return }
    setPinErr('')
    const base = existingForced ? currentSaldo - existingForced.amount + existingForced.amount : currentSaldo
    setTarget(String(Math.round(currentSaldo * 100) / 100))
    setStep('amount')
  }

  function save() {
    const targetNum = parseFloat(target.replace(',', '.'))
    if (isNaN(targetNum)) return
    const delta = Math.round((targetNum - currentSaldo) * 100) / 100
    // Date = 1 day before the oldest real (non-forced) transaction
    const realTxs = allTxs.filter(t => !t._forcedBalance && t.date).map(t => t.date).sort()
    const oldest = realTxs[0]
    let tappoDate
    if (oldest) {
      const d = new Date(oldest); d.setDate(d.getDate() - 1)
      tappoDate = d.toISOString().slice(0, 10)
    } else {
      tappoDate = new Date().toISOString().slice(0, 10)
    }
    if (existingForced) {
      // currentSaldo already includes the old forced amount, so the new forced
      // amount must be the old amount plus the delta, not the delta alone.
      updateTransaction(existingForced.txId, {
        amount: Math.round((existingForced.amount + delta) * 100) / 100,
        description: 'Saldo forzato — obiettivo € ' + fmtIT(targetNum, 2),
        descAI: 'Saldo forzato',
        date: tappoDate,
        excluded: true,
        _forcedBalance: true,
      })
    } else {
      const txId = '0000-' + Date.now().toString(36).toUpperCase()
      addTransactions([{
        txId, date: tappoDate, amount: delta,
        description: 'Saldo forzato — obiettivo € ' + fmtIT(targetNum, 2),
        descAI: 'Saldo forzato',
        cat1: 'Altro', cat2: 'Altro',
        account: 'Rettifica', conf: 100, aiEnriched: true,
        excluded: true,
        _forcedBalance: true,
      }])
    }
    setSaved(true)
    setTimeout(onClose, 1200)
  }

  const targetNum  = parseFloat((target||'').replace(',','.'))
  const delta      = isNaN(targetNum) ? null : Math.round((targetNum - currentSaldo)*100)/100
  const deltaColor = delta === null ? 'var(--text3)' : delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--green)'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:380,padding:'24px 28px'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:17,marginBottom:4}}>⚖️ Forza saldo conto</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:20}}>
          Saldo attuale: <strong style={{color:'var(--blue)'}}>€ {fmtIT(currentSaldo,2)}</strong>
          {existingForced && <span style={{marginLeft:8,color:'var(--gold)',fontSize:11}}>(rettifica attiva: {existingForced.amount>=0?'+':''}{fmtIT(existingForced.amount,2)})</span>}
        </div>
        {saved ? (
          <div style={{textAlign:'center',padding:'16px 0',fontSize:15,color:'var(--green)',fontWeight:700}}>✓ Saldo aggiornato</div>
        ) : step === 'pin' ? (
          <>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:10}}>Inserisci PIN di conferma:</div>
            <div style={{display:'flex',gap:8}}>
              <input type="password" value={pin} maxLength={6} autoFocus
                onChange={e=>{setPin(e.target.value);setPinErr('')}}
                onKeyDown={e=>e.key==='Enter'&&confirmPin()}
                placeholder="PIN"
                style={{flex:1,padding:'9px 12px',border:'1px solid '+(pinErr?'var(--red)':'var(--border)'),
                  borderRadius:'var(--radius-sm)',fontSize:15,letterSpacing:'4px',
                  background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-mono)'}}/>
              <button className="btn btn-primary" onClick={confirmPin} disabled={pin.length!==6}>Avanti →</button>
            </div>
            {pinErr && <div style={{fontSize:12,color:'var(--red)',marginTop:6}}>{pinErr}</div>}
          </>
        ) : (
          <>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:6}}>Saldo target (€):</div>
            <input type="number" value={target} autoFocus step="0.01"
              onChange={e=>setTarget(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&!(!delta||delta===0)&&save()}
              placeholder="Es. 12500.00"
              style={{width:'100%',padding:'10px 12px',border:'1px solid var(--border)',
                borderRadius:'var(--radius-sm)',fontSize:16,fontWeight:700,
                background:'var(--surface)',color:'var(--text)',outline:'none',
                fontFamily:'var(--font-mono)',marginBottom:12}}/>
            {delta !== null && (
              <div style={{fontSize:13,marginBottom:16,padding:'8px 12px',
                background:'var(--surface2)',borderRadius:'var(--radius-sm)'}}>
                Rettifica inserita come tx 0000:{' '}
                <strong style={{color:deltaColor}}>{delta>=0?'+':''}{fmtIT(delta,2)} €</strong>
                {delta===0&&' — nessuna modifica'}
              </div>
            )}
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={!delta||delta===0}>
                {existingForced?'Aggiorna rettifica':'Inserisci rettifica'}
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KPIBar({ txs }) {
  const allTxs   = useStore(s => s.transactions)
  const nowYM    = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })()
  const monthTxs = allTxs.filter(t => !t.excluded && (t._effDate||t.date)?.startsWith(nowYM))
  const income   = monthTxs.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)
  const expense  = Math.abs(monthTxs.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))
  const saldoConto = allTxs.reduce((s,t)=>s+t.amount,0)
  const fmt = n => '€ ' + fmtIT(Math.abs(Math.round(n)), 0)
  const [showForce, setShowForce] = useState(false)
  const hasForced = allTxs.some(t => t._forcedBalance)
  return (
    <>
      <div className="tx-kpi-bar">
        <div className="tx-kpi"><TrendingUp size={16} color="var(--green)"/><div><div className="tx-kpi-label">Entrate <span style={{fontSize:9,opacity:.6}}>mese corrente</span></div><div className="tx-kpi-value" style={{color:'var(--green)'}}>{fmt(income)}</div></div></div>
        <div className="tx-kpi"><TrendingDown size={16} color="var(--red)"/><div><div className="tx-kpi-label">Uscite <span style={{fontSize:9,opacity:.6}}>mese corrente</span></div><div className="tx-kpi-value" style={{color:'var(--red)'}}>{fmt(expense)}</div></div></div>
        <div className="tx-kpi" style={{cursor:'pointer'}} onClick={()=>setShowForce(true)}>
          <Banknote size={16} color={saldoConto>=0?'var(--blue)':'var(--red)'}/>
          <div>
            <div className="tx-kpi-label">
              Saldo Conto
              {hasForced && <span style={{marginLeft:5,fontSize:9,padding:'1px 4px',borderRadius:4,background:'var(--gold-l)',color:'var(--gold)',fontWeight:700}}>rettificato</span>}
              <span style={{marginLeft:6,fontSize:10,color:'var(--accent)',opacity:.7}}>✏️</span>
            </div>
            <div className="tx-kpi-value" style={{color:saldoConto>=0?'var(--blue)':'var(--red)'}}>{saldoConto>=0?'+':'-'}{fmt(saldoConto)}</div>
          </div>
        </div>
        <div className="tx-kpi"><Tag size={16} color="var(--gold)"/><div><div className="tx-kpi-label">Transazioni</div><div className="tx-kpi-value">{txs.filter(t=>!t.excluded).length}</div></div></div>
      </div>
      {showForce && <ForcedBalanceModal currentSaldo={saldoConto} onClose={()=>setShowForce(false)}/>}
    </>
  )
}

// ── Category pill + dropdown ──────────────────────────────
function CatPill({ cat1, cat2, mixCats, onClick, pillRef }) {
  const isMix  = cat1 === 'MIX' && mixCats?.length > 0
  const color  = isMix ? '#8b5cf6' : (CATS[cat1]?.color || '#aaa')
  const label  = isMix
    ? `⊕ ${mixCats.length} categorie`
    : (!cat1 || cat1 === 'Non Categorizzato') ? 'n/a' : (cat2 ? `${cat1} › ${cat2}` : cat1)
  const isNA   = !isMix && (!cat1 || cat1 === 'Non Categorizzato')
  return (
    <button ref={pillRef} className="cat-pill" style={{'--cat-color': color, opacity: isNA ? 0.6 : 1}} onClick={onClick}>
      <span className="cat-dot"/><span>{label}</span><ChevronDown size={10}/>
    </button>
  )
}

// ── helpers for multi-condition rule matching ────────────
function conditionMatches(cond, t) {
  const { field, op, value } = cond
  if (!value.trim()) return true // empty condition → always matches (ignore it)
  if (field === 'importo') {
    const amt = Math.abs(t.amount)
    const num = parseFloat(value)
    if (isNaN(num)) return false
    if (op === '=') return Math.abs(amt - num) < 0.01
    if (op === '>') return amt > num
    if (op === '<') return amt < num
    return false
  }
  const hay = (t[field]||'').toLowerCase()
  const val = value.trim().toLowerCase()
  if (op === 'contiene') return hay.includes(val)
  if (op === 'è')        return hay === val
  return false
}
function allConditionsMatch(conditions, t) {
  return conditions.every(c => conditionMatches(c, t))
}

const SEL_STYLE = {padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',fontSize:11,
  background:'var(--surface)',color:'var(--text)',outline:'none',cursor:'pointer'}

function ConditionRow({ cond, idx, total, onChange, onRemove }) {
  const isText = cond.field !== 'importo'
  return (
    <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:4}}>
      {idx > 0
        ? <span style={{fontSize:9,fontWeight:800,color:'var(--text3)',width:18,textAlign:'center',flexShrink:0,letterSpacing:'.04em'}}>E</span>
        : <span style={{width:18,flexShrink:0}}/>}
      <select value={cond.field}
        onChange={e=>{const f=e.target.value; onChange({...cond,field:f,op:f==='importo'?'=':'contiene',value:''})}}
        style={SEL_STYLE}>
        <option value="merchant">Merchant</option>
        <option value="description">Descrizione</option>
        <option value="counterpart">Controparte</option>
        <option value="importo">Importo</option>
      </select>
      <select value={cond.op} onChange={e=>onChange({...cond,op:e.target.value})} style={SEL_STYLE}>
        {isText ? <>
          <option value="contiene">contiene</option>
          <option value="è">= uguale</option>
        </> : <>
          <option value="=">=</option>
          <option value=">">{'>'}</option>
          <option value="<">{'<'}</option>
        </>}
      </select>
      <input type={isText?'text':'number'} value={cond.value}
        onChange={e=>onChange({...cond,value:e.target.value})}
        placeholder={isText?'es. Netflix…':'50'}
        step={isText?undefined:'any'}
        style={{flex:1,minWidth:60,padding:'4px 7px',borderRadius:5,border:'1px solid var(--border)',
          fontSize:11,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}
      />
      {total > 1 && (
        <button onClick={onRemove} style={{background:'none',border:'none',cursor:'pointer',
          color:'var(--text3)',fontSize:14,lineHeight:1,padding:'0 2px',flexShrink:0}}>×</button>
      )}
    </div>
  )
}

// ── Bulk Edit Modal ───────────────────────────────────────
function BulkEditModal({ txIds, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const addAiRule         = useStore(s => s.addAiRule)
  const allTxs            = useStore(s => s.transactions)
  const customCats        = useStore(s => s.customCats)
  const allCats           = getMergedCats(customCats)
  const allCatNames       = getMergedCatNames(customCats)
  const setCustomCats     = useStore(s => s.setCustomCats)
  const isKingProtected   = useStore(s => s.isKingProtected)

  const txList = allTxs.filter(t => txIds.has(t.txId))
  const n = txList.length
  const refDate = txList.reduce((min, t) => {
    const d = t._effDate || t.date || ''
    return (!min || (d && d < min)) ? d : min
  }, '')

  const [descEdit,  setDescEdit]  = useState('')
  const [sel1,      setSel1]      = useState('')
  const [sel2,      setSel2]      = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [addingL1,  setAddingL1]  = useState(false)
  const [newL1,     setNewL1]     = useState('')
  const [addingL2,  setAddingL2]  = useState(false)
  const [newL2,     setNewL2]     = useState('')
  const [applied,   setApplied]   = useState(false)
  const [conditions, setConditions] = useState([{ field: 'merchant', op: 'contiene', value: '' }])
  const [scope,      setScope]      = useState('all')

  const ruleActive = conditions.some(c => c.value.trim())
  const matchCount = (rulesOpen && ruleActive) ? allTxs.filter(t => {
    if (txIds.has(t.txId) || t.excluded) return false
    if (scope === 'future' && (t._effDate || t.date || '') < refDate) return false
    return allConditionsMatch(conditions, t)
  }).length : 0

  function updateCond(idx, nc) { setConditions(cs => cs.map((c, i) => i === idx ? nc : c)) }
  function removeCond(idx)     { setConditions(cs => cs.filter((_, i) => i !== idx)) }
  function addCond()           { setConditions(cs => [...cs, { field: 'merchant', op: 'contiene', value: '' }]) }

  function confirmAddL1() {
    const name = newL1.trim()
    if (!name || allCatNames.includes(name)) return
    setCustomCats({ ...customCats, [name]: { color: '#888', sub: [] } })
    setSel1(name); setSel2('')
    setNewL1(''); setAddingL1(false)
  }
  function confirmAddL2() {
    const sub = newL2.trim()
    if (!sub || !sel1) return
    const existing = allCats[sel1]?.sub || []
    if (existing.includes(sub)) { setSel2(sub); setNewL2(''); setAddingL2(false); return }
    const updatedSub = [...existing, sub]
    setCustomCats({ ...customCats, [sel1]: { ...(customCats[sel1] || {}), color: allCats[sel1]?.color || '#888', sub: updatedSub } })
    setSel2(sub)
    setNewL2(''); setAddingL2(false)
  }

  function save() {
    const patch = {}
    if (descEdit.trim())  { patch.descAI = descEdit.trim(); patch.aiEnriched = true }
    if (sel1)             { patch.cat1 = sel1; patch.cat2 = sel2; patch.conf = 100 }
    if (Object.keys(patch).length === 0) { onClose(); return }

    txList.forEach(t => updateTransaction(t.txId, patch))

    if (rulesOpen && ruleActive && sel1) {
      const opMap = { 'contiene': 'contains', 'non contiene': 'not_contains', 'inizia con': 'starts_with', 'finisce con': 'ends_with', 'uguale a': 'equals', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }
      addAiRule({
        conditions: conditions.filter(c => c.value.trim()).map(c => ({
          field: c.field,
          op:    opMap[c.op] || c.op,
          value: c.value.trim(),
        })),
        action: 'categorize',
        cats:   [{ cat1: sel1, cat2: sel2 || '', pct: 100 }],
        scope,
        descAI: descEdit.trim() || null,
        name:   `${sel1}${sel2 ? '/' + sel2 : ''} — ${conditions.filter(c => c.value.trim()).map(c => `${c.field} ${c.op} "${c.value}"`).join(' + ')}`,
      })
      allTxs.forEach(t => {
        if (txIds.has(t.txId) || t.excluded) return
        if (scope === 'future' && (t._effDate || t.date || '') < refDate) return
        if (!allConditionsMatch(conditions, t)) return
        if (isKingProtected(t.description, t.amount)) return
        updateTransaction(t.txId, patch)
      })
    }
    setApplied(true)
    setTimeout(onClose, 600)
  }

  const modalW = rulesOpen ? 720 : 420

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.35)' }} />
      <div className="cat-dropdown" onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: modalW, maxWidth: '96vw',
          maxHeight: '90vh', overflowY: 'auto',
          zIndex: 1000,
          transition: 'width .18s ease',
          display: 'flex', flexDirection: 'column',
        }}>

        {/* Header */}
        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>✏️ Modifica Multipla</span>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{n} transazion{n === 1 ? 'e' : 'i'} selezionate</span>
        </div>

        {/* descAI */}
        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>
            ✨ Descrizione AI (lascia vuoto per non modificare)
          </div>
          <input
            value={descEdit}
            onChange={e => setDescEdit(e.target.value)}
            placeholder="Es. Spesa supermercato…"
            style={{
              width: '100%', padding: '6px 9px', borderRadius: 6,
              border: `1.5px solid ${descEdit.trim() ? 'var(--accent)' : 'var(--border)'}`,
              fontSize: 12, background: 'var(--surface)', color: 'var(--text)',
              outline: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Cat L1 + L2 + optional rules */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* L1 */}
          <div className="cat-dropdown-l1" style={{ flex: '0 0 160px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              Categoria (opzionale)
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {allCatNames.map(name => (
                <button key={name} className={'cat-dropdown-item' + (name === sel1 ? ' active' : '')}
                  style={{ '--cat-color': allCats[name]?.color || '#888' }}
                  onClick={() => { setSel1(name === sel1 ? '' : name); setSel2(''); setAddingL2(false) }}>
                  <span className="cat-dot" />{name}
                </button>
              ))}
            </div>
            {addingL1 ? (
              <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border)', display: 'flex', gap: 4 }}>
                <input autoFocus value={newL1} onChange={e => setNewL1(e.target.value)}
                  placeholder="Nome…"
                  onKeyDown={e => { if (e.key === 'Enter') confirmAddL1(); if (e.key === 'Escape') { setAddingL1(false); setNewL1('') } }}
                  style={{ flex: 1, padding: '4px 7px', borderRadius: 6, border: '1.5px solid var(--accent)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)', minWidth: 0 }} />
                <button onClick={confirmAddL1} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>✓</button>
                <button onClick={() => { setAddingL1(false); setNewL1('') }} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setAddingL1(true)} style={{ padding: '7px 10px', borderTop: '1px solid var(--border)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12, fontWeight: 600, textAlign: 'left', fontFamily: 'var(--font-sans)', width: '100%', flexShrink: 0 }}>
                + nuova categoria
              </button>
            )}
          </div>

          {/* L2 */}
          <div className="cat-dropdown-l2" style={{ flex: 1, minWidth: 0, padding: '8px 0 0', borderRight: rulesOpen ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 4px' }}>
              {sel1 ? (
                (allCats[sel1]?.sub || []).length > 0
                  ? allCats[sel1].sub.map(s => (
                    <button key={s} className={'cat-dropdown-sub' + (s === sel2 ? ' active' : '')}
                      onClick={() => setSel2(s === sel2 ? '' : s)}
                      style={{ display: 'block', width: '100%', textAlign: 'left' }}>
                      {sel2 === s ? '✓ ' : ''}{s}
                    </button>
                  ))
                  : <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Nessuna sottocategoria</div>
              ) : (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Seleziona una categoria L1</div>
              )}
            </div>
            {sel1 && (addingL2 ? (
              <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border)', display: 'flex', gap: 4 }}>
                <input autoFocus value={newL2} onChange={e => setNewL2(e.target.value)}
                  placeholder="Nome…"
                  onKeyDown={e => { if (e.key === 'Enter') confirmAddL2(); if (e.key === 'Escape') { setAddingL2(false); setNewL2('') } }}
                  style={{ flex: 1, padding: '4px 7px', borderRadius: 6, border: '1.5px solid var(--accent)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)', minWidth: 0 }} />
                <button onClick={confirmAddL2} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>✓</button>
                <button onClick={() => { setAddingL2(false); setNewL2('') }} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setAddingL2(true)} style={{ padding: '7px 10px', borderTop: '1px solid var(--border)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12, fontWeight: 600, textAlign: 'left', fontFamily: 'var(--font-sans)', width: '100%', flexShrink: 0 }}>
                + nuova sottocategoria
              </button>
            ))}
          </div>

          {/* Rules panel */}
          {rulesOpen && (
            <div style={{ flex: '0 0 280px', padding: '14px 16px', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                🔁 Applica anche ad altre transazioni
              </div>
              <div>
                {conditions.map((cond, idx) => (
                  <ConditionRow key={idx} cond={cond} idx={idx} total={conditions.length}
                    onChange={nc => updateCond(idx, nc)} onRemove={() => removeCond(idx)} />
                ))}
                <button onClick={addCond} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: 'var(--accent)', padding: '3px 10px', marginTop: 4, fontWeight: 600 }}>
                  + Aggiungi condizione
                </button>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }}>Applica a</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[['future', '→ Da adesso in avanti'], ['all', '⟳ Tutte le transazioni']].map(([v, l]) => (
                    <button key={v} onClick={() => setScope(v)} style={{
                      padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${scope === v ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left',
                      background: scope === v ? 'var(--accent)' : 'var(--surface)',
                      color: scope === v ? '#fff' : 'var(--text2)',
                      transition: 'all .12s',
                    }}>{l}</button>
                  ))}
                </div>
              </div>
              {ruleActive
                ? <div style={{ fontSize: 12, fontWeight: 700, color: matchCount > 0 ? 'var(--accent)' : 'var(--text3)', marginTop: 4 }}>
                    {matchCount > 0 ? `✓ ${matchCount} altre transazioni corrispondenti` : '⚠️ 0 transazioni corrispondenti'}
                  </div>
                : <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>Imposta almeno una condizione sopra</div>
              }
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cat-dropdown-footer" style={{ borderTop: '1px solid var(--border)' }}>
          {applied
            ? <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>✓ Salvato!</span>
            : <>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={save}>
                  Applica a {n} transazion{n === 1 ? 'e' : 'i'}{rulesOpen && ruleActive && matchCount > 0 ? ` + ${matchCount} altre` : ''}
                </button>
                <button onClick={() => setRulesOpen(o => !o)} style={{
                  padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${rulesOpen ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'var(--surface)',
                  color: rulesOpen ? 'var(--accent)' : 'var(--text3)',
                }}>
                  🔁 Regole {rulesOpen ? '◀' : '▶'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={onClose}>✕</button>
              </>
          }
        </div>
      </div>
    </>
  )
}

function CatDropdown({ txId, cat1, cat2, tx, onClose, onOpenMix }) {
  const updateTransaction  = useStore(s=>s.updateTransaction)
  const addAiRule          = useStore(s=>s.addAiRule)
  const isKingProtected    = useStore(s=>s.isKingProtected)
  const allTxs        = useStore(s=>s.transactions)
  const customCats    = useStore(s=>s.customCats)
  const setCustomCats = useStore(s=>s.setCustomCats)
  const allCats       = getMergedCats(customCats)
  const allCatNames   = getMergedCatNames(customCats)
  const [sel1, setSel1]       = useState(cat1)
  const [sel2, setSel2]       = useState(cat2 || '')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [addingL1, setAddingL1] = useState(false)
  const [newL1,    setNewL1]    = useState('')
  const [addingL2, setAddingL2] = useState(false)
  const [newL2,    setNewL2]    = useState('')
  const [applied,   setApplied]   = useState(false)
  const [descEdit,  setDescEdit]  = useState(tx?.descAI || '')

  // Multi-condition rule state (only used when rulesOpen)
  // Auto-detect best "controparte" field: prefer merchant if populated, else description
  const _initCond = (() => {
    const m = (tx?.merchant || '').trim().replace(/^null$/i,'')
    const d = (tx?.descAI   || '').trim()
    if (m) return { field: 'merchant', op: 'contiene', value: m }
    // try to extract first meaningful word from descAI
    if (d) {
      const word = d.split(/\s+/).slice(0,3).join(' ')
      return { field: 'description', op: 'contiene', value: word }
    }
    return { field: 'merchant', op: 'contiene', value: '' }
  })()
  const [conditions, setConditions] = useState([_initCond])
  const [scope,      setScope]      = useState('all')

  const txDate = tx?.date || ''
  const ruleActive = conditions.some(c => c.value.trim())

  const matchCount = (rulesOpen && ruleActive && scope !== 'solo') ? allTxs.filter(t => {
    if (t.txId === txId || t.excluded) return false
    if (scope === 'future' && (t._effDate||(t._effDate||t.date||'')) < txDate) return false
    return allConditionsMatch(conditions, t)
  }).length : 0

  function updateCond(idx, nc) { setConditions(cs => cs.map((c,i) => i===idx ? nc : c)) }
  function removeCond(idx)     { setConditions(cs => cs.filter((_,i) => i!==idx)) }
  function addCond()           { setConditions(cs => [...cs, {field:'merchant', op:'contiene', value:''}]) }

  function confirmAddL1() {
    const name = newL1.trim()
    if (!name || allCatNames.includes(name)) return
    setCustomCats({ ...customCats, [name]: { color: '#888', sub: [] } })
    setSel1(name); setSel2('')
    setNewL1(''); setAddingL1(false)
  }

  function confirmAddL2() {
    const sub = newL2.trim()
    if (!sub || !sel1) return
    const existing = allCats[sel1]?.sub || []
    if (existing.includes(sub)) { setSel2(sub); setNewL2(''); setAddingL2(false); return }
    const updatedSub = [...existing, sub]
    setCustomCats({ ...customCats, [sel1]: { ...(customCats[sel1]||{}), color: allCats[sel1]?.color||'#888', sub: updatedSub } })
    setSel2(sub)
    setNewL2(''); setAddingL2(false)
  }

  function save() {
    const patch = { cat1: sel1, cat2: sel2, conf: 100, ...(descEdit.trim() ? { descAI: descEdit.trim(), aiEnriched: true } : {}) }
    updateTransaction(txId, patch)
    if (rulesOpen && ruleActive && scope !== 'solo') {
      // Persist the rule to Firestore (visible in Impostazioni → Regole AI)
      const opMap = { 'contiene':'contains', 'non contiene':'not_contains', 'inizia con':'starts_with', 'finisce con':'ends_with', 'uguale a':'equals', '>':'gt', '>=':'gte', '<':'lt', '<=':'lte' }
      addAiRule({
        conditions: conditions.filter(c=>c.value.trim()).map(c=>({
          field: c.field,
          op:    opMap[c.op] || c.op,
          value: c.value.trim(),
        })),
        action: 'categorize',
        cats:   [{ cat1: sel1, cat2: sel2||'', pct: 100 }],
        scope,
        descAI: descEdit.trim() || null,
        name:   `${sel1}${sel2?'/'+sel2:''} — ${conditions.filter(c=>c.value.trim()).map(c=>`${c.field} ${c.op} "${c.value}"`).join(' + ')}`,
      })
      allTxs.forEach(t => {
        if (t.txId === txId || t.excluded) return
        if (scope === 'future' && (t._effDate||(t._effDate||t.date||'')) < txDate) return
        if (!allConditionsMatch(conditions, t)) return
        if (isKingProtected(t.description, t.amount)) return
        updateTransaction(t.txId, patch)
      })
    }
    setApplied(true)
    setTimeout(onClose, 500)
  }

  const modalW = rulesOpen ? 720 : 360

  return (
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:999}}/>
      <div className="cat-dropdown" onClick={e=>e.stopPropagation()}
        style={{
          position:'fixed', top:'50%', left:'50%',
          transform:'translate(-50%,-50%)',
          width:modalW, maxWidth:'96vw',
          maxHeight:'90vh', overflowY:'auto',
          zIndex:1000,
          transition:'width .18s ease',
          display:'flex', flexDirection:'column',
        }}>

        {/* ── Main body: cat cols + optional rules panel ── */}
        <div style={{display:'flex', flex:1, overflow:'hidden'}}>

          {/* L1 — categories */}
          <div className="cat-dropdown-l1" style={{flex:'0 0 160px',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
            <div style={{flex:1,overflowY:'auto'}}>
              {allCatNames.map(name=>(
                <button key={name} className={'cat-dropdown-item'+(name===sel1?' active':'')}
                  style={{'--cat-color':allCats[name]?.color||'#888'}} onClick={()=>{setSel1(name);setSel2('');setAddingL2(false)}}>
                  <span className="cat-dot"/>{name}
                </button>
              ))}
            </div>
            {/* + nuova categoria L1 */}
            {addingL1 ? (
              <div style={{padding:'6px 8px',borderTop:'1px solid var(--border)',display:'flex',gap:4}}>
                <input autoFocus value={newL1} onChange={e=>setNewL1(e.target.value)}
                  placeholder="Nome…"
                  onKeyDown={e=>{ if(e.key==='Enter') confirmAddL1(); if(e.key==='Escape'){setAddingL1(false);setNewL1('')} }}
                  style={{flex:1,padding:'4px 7px',borderRadius:6,border:'1.5px solid var(--accent)',
                    background:'var(--surface)',color:'var(--text)',fontSize:12,outline:'none',
                    fontFamily:'var(--font-sans)',minWidth:0}}/>
                <button onClick={confirmAddL1}
                  style={{padding:'4px 8px',borderRadius:6,border:'none',background:'var(--accent)',
                    color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>✓</button>
                <button onClick={()=>{setAddingL1(false);setNewL1('')}}
                  style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)',
                    background:'none',color:'var(--text3)',fontSize:12,cursor:'pointer',flexShrink:0}}>✕</button>
              </div>
            ) : (
              <button onClick={()=>setAddingL1(true)}
                style={{padding:'7px 10px',borderTop:'1px solid var(--border)',background:'none',
                  border:'none',cursor:'pointer',color:'var(--text3)',fontSize:12,fontWeight:600,
                  textAlign:'left',fontFamily:'var(--font-sans)',width:'100%',flexShrink:0}}>
                + nuova categoria
              </button>
            )}
          </div>

          {/* L2 — subcategories */}
          <div className="cat-dropdown-l2" style={{flex:1, minWidth:0, padding:'8px 0 0', borderRight: rulesOpen ? '1px solid var(--border)' : 'none', display:'flex', flexDirection:'column'}}>
            <div style={{flex:1,overflowY:'auto',padding:'0 0 4px'}}>
              {(allCats[sel1]?.sub||[]).length > 0 ? allCats[sel1].sub.map(s=>(
                <button key={s} className={'cat-dropdown-sub'+(s===sel2?' active':'')}
                  onClick={()=>setSel2(s===sel2?'':s)} style={{display:'block',width:'100%',textAlign:'left'}}>
                  {sel2===s ? '✓ ' : ''}{s}
                </button>
              )) : (
                <div style={{padding:'12px 16px',fontSize:12,color:'var(--text3)',fontStyle:'italic'}}>Nessuna sottocategoria</div>
              )}
            </div>
            {/* + nuova subcategoria L2 */}
            {sel1 && (addingL2 ? (
              <div style={{padding:'6px 8px',borderTop:'1px solid var(--border)',display:'flex',gap:4}}>
                <input autoFocus value={newL2} onChange={e=>setNewL2(e.target.value)}
                  placeholder="Nome…"
                  onKeyDown={e=>{ if(e.key==='Enter') confirmAddL2(); if(e.key==='Escape'){setAddingL2(false);setNewL2('')} }}
                  style={{flex:1,padding:'4px 7px',borderRadius:6,border:'1.5px solid var(--accent)',
                    background:'var(--surface)',color:'var(--text)',fontSize:12,outline:'none',
                    fontFamily:'var(--font-sans)',minWidth:0}}/>
                <button onClick={confirmAddL2}
                  style={{padding:'4px 8px',borderRadius:6,border:'none',background:'var(--accent)',
                    color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>✓</button>
                <button onClick={()=>{setAddingL2(false);setNewL2('')}}
                  style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)',
                    background:'none',color:'var(--text3)',fontSize:12,cursor:'pointer',flexShrink:0}}>✕</button>
              </div>
            ) : (
              <button onClick={()=>setAddingL2(true)}
                style={{padding:'7px 10px',borderTop:'1px solid var(--border)',background:'none',
                  border:'none',cursor:'pointer',color:'var(--text3)',fontSize:12,fontWeight:600,
                  textAlign:'left',fontFamily:'var(--font-sans)',width:'100%',flexShrink:0}}>
                + nuova sottocategoria
              </button>
            ))}
          </div>

          {/* Rules panel — shown only when rulesOpen */}
          {rulesOpen && (
            <div style={{flex:'0 0 300px', padding:'14px 16px', background:'var(--surface2)', display:'flex', flexDirection:'column', gap:10}}>
              {/* ── Descrizione AI (editabile) ── */}
              <div style={{paddingBottom:12,borderBottom:'1px solid var(--border)',marginBottom:2}}>
                <div style={{fontSize:10,fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:6}}>
                  ✨ Descrizione AI
                </div>
                <input
                  value={descEdit}
                  onChange={e=>setDescEdit(e.target.value)}
                  placeholder={tx?.description?.slice(0,50)||'—'}
                  style={{width:'100%',padding:'6px 9px',borderRadius:6,
                    border:`1.5px solid ${descEdit !== (tx?.descAI||'') ? 'var(--accent)' : 'var(--border)'}`,
                    fontSize:12,background:'var(--surface)',color:'var(--text)',
                    outline:'none',fontFamily:'var(--font-sans)',boxSizing:'border-box'}}
                />
                {descEdit !== (tx?.descAI||'') && (
                  <div style={{fontSize:10,color:'var(--accent)',marginTop:3,fontWeight:600}}>
                    ✎ Modificata — verrà salvata con la categoria
                  </div>
                )}
                {tx?.description && (
                  <div style={{marginTop:6}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:3}}>
                      Descrizione Originale
                    </div>
                    <div style={{fontSize:11,color:'var(--text2)',background:'var(--surface2)',borderRadius:5,
                      padding:'4px 8px',border:'1px solid var(--border)',wordBreak:'break-word',lineHeight:1.5,
                      fontFamily:'var(--font-mono)',userSelect:'all'}}>
                      {tx.description}
                    </div>
                  </div>
                )}
              </div>

              <div style={{fontSize:10,fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--text3)'}}>
                🔁 Applica anche ad altre transazioni
              </div>

              {/* Conditions */}
              <div>
                {conditions.map((cond, idx) => (
                  <ConditionRow key={idx} cond={cond} idx={idx} total={conditions.length}
                    onChange={nc=>updateCond(idx,nc)} onRemove={()=>removeCond(idx)}/>
                ))}
                <button onClick={addCond} style={{
                  background:'none',border:'1px dashed var(--border)',borderRadius:5,
                  cursor:'pointer',fontSize:11,color:'var(--accent)',padding:'3px 10px',marginTop:4,
                  fontWeight:600}}>+ Aggiungi condizione</button>
              </div>

              {/* Scope */}
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',marginBottom:6,letterSpacing:'.04em',textTransform:'uppercase'}}>Applica a</div>
                <div style={{display:'flex',flexDirection:'column',gap:5}}>
                  {[
                    ['future', '→ Da adesso in avanti'],
                    ['all',    '⟳ Tutte le transazioni'],
                  ].map(([v,l])=>(
                    <button key={v} onClick={()=>setScope(v)} style={{
                      padding:'6px 12px',borderRadius:8,border:`1.5px solid ${scope===v?'var(--accent)':'var(--border)'}`,
                      cursor:'pointer',fontSize:12,fontWeight:600,textAlign:'left',
                      background: scope===v ? 'var(--accent)' : 'var(--surface)',
                      color:       scope===v ? '#fff' : 'var(--text2)',
                      transition:'all .12s',
                    }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Match preview */}
              {ruleActive && (
                <div style={{fontSize:12,fontWeight:700,color:matchCount>0?'var(--accent)':'var(--text3)',marginTop:4}}>
                  {matchCount > 0 ? `✓ ${matchCount} transazioni corrispondenti` : '⚠️ 0 transazioni corrispondenti'}
                </div>
              )}
              {!ruleActive && (
                <div style={{fontSize:11,color:'var(--text3)',fontStyle:'italic'}}>
                  Imposta almeno una condizione sopra
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Vehicle picker (when Veicoli selected) ── */}
        {sel1 === 'Veicoli' && (
          <div style={{padding:'4px 12px 8px'}}>
            <VehicleQuickPicker txId={txId} cat1={sel1} />
          </div>
        )}

        {/* ── Footer ── */}
        <div className="cat-dropdown-footer" style={{borderTop:'1px solid var(--border)'}}>
          {applied
            ? <span style={{fontSize:12,color:'var(--green)',fontWeight:700}}>✓ Salvato!</span>
            : <>
                <button className="btn btn-primary" style={{fontSize:12}} onClick={save}>
                  {!rulesOpen || !ruleActive
                    ? 'Salva'
                    : `Salva${matchCount>0?` + ${matchCount} tx`:''}`}
                </button>
                {/* Expand/collapse rules panel */}
                <button onClick={()=>setRulesOpen(o=>!o)} style={{
                  padding:'5px 12px',borderRadius:8,border:'1.5px solid var(--border)',
                  cursor:'pointer',fontSize:11,fontWeight:700,background:'var(--surface)',
                  color: rulesOpen ? 'var(--accent)' : 'var(--text3)',
                  display:'flex',alignItems:'center',gap:5,
                  borderColor: rulesOpen ? 'var(--accent)' : 'var(--border)',
                }}>
                  🔁 Regole {rulesOpen ? '◀' : '▶'}
                </button>
                <button className="btn btn-ghost" style={{fontSize:12,color:'var(--accent)'}} onClick={()=>{onClose();onOpenMix?.()}}>⊕ Split</button>
                <button className="btn btn-ghost" style={{fontSize:12,marginLeft:'auto'}} onClick={onClose}>✕</button>
              </>
          }
        </div>
      </div>
    </>
  )
}

// ── Mix Categories Modal ──────────────────────────────────
function MixCatModal({ tx, onClose }) {
  const updateTransaction = useStore(s=>s.updateTransaction)
  const customCats   = useStore(s=>s.customCats)
  const allCats      = getMergedCats(customCats)
  const allCatNames  = getMergedCatNames(customCats)
  const txAmt        = Math.abs(tx.amount)

  // Init: support legacy pct format OR new amount format
  const initSplits = () => {
    if (tx.mixCats?.length > 0) {
      return tx.mixCats.map(sp => ({
        cat1: sp.cat1 || '',
        cat2: sp.cat2 || '',
        amount: sp.amount != null ? sp.amount : Math.round(txAmt * (sp.pct||0) / 100 * 100) / 100
      }))
    }
    const c1 = tx.cat1 && tx.cat1 !== 'MIX' ? tx.cat1 : ''
    return [{ cat1: c1, cat2: tx.cat2||'', amount: txAmt }]
  }

  const [splits, setSplits] = useState(initSplits)

  const totalAmt  = splits.reduce((s,sp)=>s+(parseFloat(sp.amount)||0),0)
  const remaining = Math.round((txAmt - totalAmt)*100)/100
  const isValid   = splits.length >= 1 && Math.abs(remaining) < 0.01

  function update(i, field, val) {
    setSplits(s => s.map((x,j) => j===i ? {...x, [field]: val} : x))
  }

  function addRow() {
    if (splits.length >= 20) return
    setSplits(s => [...s, { cat1: '', cat2: '', amount: Math.max(0, remaining) }])
  }

  function distributeEvenly() {
    const n = splits.length
    const each = Math.floor(txAmt / n * 100) / 100
    const last = Math.round((txAmt - each*(n-1))*100)/100
    setSplits(s => s.map((x,i) => ({...x, amount: i<n-1 ? each : last})))
  }

  function fillRemaining(i) {
    const otherSum = splits.reduce((s,sp,j)=> j===i ? s : s+(parseFloat(sp.amount)||0), 0)
    const fill = Math.round((txAmt - otherSum)*100)/100
    update(i, 'amount', Math.max(0, fill))
  }

  function save() {
    if (splits.length === 1) {
      updateTransaction(tx.txId, { cat1: splits[0].cat1||'Non Categorizzato', cat2: splits[0].cat2, mixCats: null, conf: 100 })
    } else {
      updateTransaction(tx.txId, { cat1: 'MIX', cat2: 'Multiple', mixCats: splits, conf: 100 })
    }
    onClose()
  }

  const remainColor = Math.abs(remaining)<0.01 ? 'var(--green)' : remaining>0 ? 'var(--gold)' : 'var(--red)'

  return (
    <Modal title="⊕ Split Categorie" onClose={onClose} width={540}>
      {/* Transaction header */}
      <div style={{marginBottom:14,padding:'10px 14px',background:'var(--surface2)',borderRadius:'var(--radius-sm)',fontSize:13,
        display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <strong style={{maxWidth:320,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {tx.merchant||tx.descAI||tx.description}
        </strong>
        <span style={{fontWeight:700,color:'var(--text)'}}>€ {fmtIT(txAmt,2)}</span>
      </div>

      {/* Remaining indicator */}
      {splits.length > 1 && (
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12,padding:'6px 12px',
          background:'var(--surface2)',borderRadius:'var(--radius-sm)',fontSize:12}}>
          <span style={{color:'var(--text3)'}}>Totale split:</span>
          <span style={{fontWeight:700}}>{fmtIT(totalAmt,2)}</span>
          <span style={{color:'var(--text3)'}}>Rimanente:</span>
          <span style={{fontWeight:700,color:remainColor}}>
            {remaining > 0 ? '+' : ''}{fmtIT(remaining,2)}
            {Math.abs(remaining)<0.01 && ' ✓'}
          </span>
          <button className="btn btn-ghost" style={{fontSize:11,marginLeft:'auto'}}
            onClick={distributeEvenly}>÷ Dividi equamente</button>
        </div>
      )}

      {/* Split rows */}
      <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:340,overflowY:'auto',paddingRight:2}}>
        {splits.map((sp,i)=>{
          const l2opts = (allCats[sp.cat1]?.sub || [])
          return (
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 90px auto',gap:6,alignItems:'center',
              padding:'6px 8px',background:'var(--surface2)',borderRadius:'var(--radius-sm)'}}>
              {/* L1 */}
              <select value={sp.cat1} style={{fontSize:12,padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)'}}
                onChange={e=>setSplits(s=>s.map((x,j)=>j===i?{...x,cat1:e.target.value,cat2:''}:x))}>
                <option value="">— L1 —</option>
                {allCatNames.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
              {/* L2 */}
              <select value={sp.cat2} style={{fontSize:12,padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',opacity:l2opts.length?1:.45}}
                disabled={!l2opts.length}
                onChange={e=>update(i,'cat2',e.target.value)}>
                <option value="">— L2 —</option>
                {l2opts.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              {/* Amount */}
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:7,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'var(--text3)'}}>€</span>
                <input type="number" min="0" step="0.01" value={sp.amount}
                  style={{width:'100%',paddingLeft:18,paddingRight:4,paddingTop:4,paddingBottom:4,fontSize:12,
                    border:'1px solid var(--border)',borderRadius:6,background:'var(--surface)',color:'var(--text)'}}
                  onChange={e=>update(i,'amount',e.target.value)}
                  onDoubleClick={()=>fillRemaining(i)}
                  title="Doppio click = assegna rimanente"
                />
              </div>
              {/* Remove */}
              <button className="btn btn-ghost" style={{fontSize:13,color:'var(--red)',padding:'2px 6px'}}
                onClick={()=>setSplits(s=>s.filter((_,j)=>j!==i))}
                disabled={splits.length===1}>✕</button>
            </div>
          )
        })}
      </div>

      {/* Add row */}
      <div style={{display:'flex',gap:8,marginTop:10,alignItems:'center'}}>
        <button className="btn btn-ghost" style={{fontSize:12}} onClick={addRow} disabled={splits.length>=20}>
          + Aggiungi ({splits.length}/20)
        </button>
        {splits.length > 1 && (
          <span style={{fontSize:11,color:'var(--text3)'}}>doppio click su importo = assegna rimanente</span>
        )}
      </div>

      <ModalFooter>
        <button className="btn btn-primary" onClick={save} disabled={!isValid}>Salva split</button>
        {tx.mixCats?.length > 0 && (
          <button className="btn btn-ghost" style={{color:'var(--red)',fontSize:12}} onClick={()=>{
            const c1 = tx.mixCats?.[0]?.cat1 || 'Non Categorizzato'
            const c2 = tx.mixCats?.[0]?.cat2 || ''
            updateTransaction(tx.txId, { cat1: c1, cat2: c2, mixCats: null, conf: 100 })
            onClose()
          }}>Rimuovi split</button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── All family members with names + nicknames ────────────
function getAllMembers() {
  try {
    const appPrefs  = useStore.getState()?.appPrefs || {}
    const ownerNick = appPrefs.ownerNickname || 'Admin'
    const family    = appPrefs.family || []
    const members   = []
    members.push({ name: ownerNick.toLowerCase(), nick: ownerNick })
    family.forEach(m => {
      if (m.name) members.push({ name: m.name.toLowerCase(), nick: m.nickname || m.name.split(' ')[0] })
    })
    return members
  } catch { return [] }
}

// ── Resolve user: card → cat2 → merchant/description name ──
function resolveUserByCard(card, userAccounts, merchantStr, descriptionStr, cat2) {
  // 1. Try card match
  if (card) {
    const acc = (userAccounts||[]).find(a => a.card4 === card)
    if (acc?.memberId) {
      try {
        if (acc.memberId === 'owner') {
          const appPrefs = useStore.getState()?.appPrefs || {}
          if (appPrefs.ownerNickname) return appPrefs.ownerNickname
          const name = useStore.getState()?.user?.displayName || null
          return name ? name.split(' ')[0] : 'Admin'
        }
        const family = (useStore.getState()?.appPrefs?.family) || []
        const member = family.find(m => String(m.id) === String(acc.memberId))
        if (member) return member.nickname || member.name?.split(' ')[0] || null
      } catch {}
    }
  }
  // 2. cat2 match — se la transazione ha cat2 = nome/soprannome di un membro
  if (cat2) {
    const members = getAllMembers()
    for (const m of members) {
      if (m.nick.toLowerCase() === cat2.toLowerCase() ||
          m.name.split(' ')[0] === cat2.toLowerCase()) return m.nick
    }
  }
  // 3. Try name match in merchant or description
  const haystack = `${merchantStr||''} ${descriptionStr||''}`.toLowerCase()
  if (haystack.trim()) {
    const members = getAllMembers()
    for (const m of members) {
      if (m.name && haystack.includes(m.name)) return m.nick
    }
  }
  return null
}

// ── Column value as display string (for Excel-style filters) ──
function getColValueStr(tx, colId, userAccounts) {
  const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  switch(colId) {
    case 'date': {
      const m = (tx._effDate||(tx._effDate||tx.date||'')).match(/(\d{4})-(\d{2})/)
      if (!m) return '—'
      return `${MONTHS[parseInt(m[2])-1]} ${m[1]}`
    }
    case 'descAI':      return tx.descAI || '—'
    case 'description': return (tx.description||'').slice(0,40) || '—'
    case 'counterpart': return (tx.counterpart && tx.counterpart !== 'null') ? tx.counterpart : '—'
    case 'merchant':    return (tx.merchant && tx.merchant !== 'null') ? tx.merchant : '—'
    case 'city':        return (tx.city && tx.city !== 'null') ? tx.city : '—'
    case 'card':        return tx.card ? `*${tx.card}` : '—'
    case 'cat':         return tx.cat1 && tx.cat1 !== 'Non Categorizzato'
                          ? `${tx.cat1}${tx.cat2 ? ' › ' + tx.cat2 : ''}`
                          : 'Non Categorizzato'
    case 'user': {
      const u = tx.user || resolveUserByCard(tx.card, userAccounts, tx.merchant, tx.description, tx.cat2)
      return u || '—'
    }
    case 'isBonifico':  return tx.isBonifico ? 'Sì' : 'No'
    default:            return '—'
  }
}

// ── Column filter popup (Excel-style) ─────────────────────
function ColFilterPopup({ popup, onApply, onClose }) {
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(new Set(popup.selected))

  const filtered = popup.values.filter(v => v.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{
      position:'fixed', top: popup.rect.bottom + 4, left: popup.rect.left,
      zIndex: 9999, background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:10, boxShadow:'0 8px 28px rgba(0,0,0,.18)', padding:12, minWidth:220, maxWidth:280,
    }} onClick={e=>e.stopPropagation()}>
      {/* Search */}
      <input
        autoFocus
        value={search}
        onChange={e=>setSearch(e.target.value)}
        placeholder="Cerca..."
        style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',
          fontSize:12,background:'var(--surface)',color:'var(--text)',outline:'none',
          fontFamily:'var(--font-sans)',boxSizing:'border-box',marginBottom:8}}
      />
      {/* Quick buttons */}
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <button onClick={()=>setSelected(new Set(popup.values))}
          style={{flex:1,padding:'3px 8px',borderRadius:6,border:'1px solid var(--border)',
            background:'var(--surface2)',fontSize:11,cursor:'pointer',color:'var(--text2)'}}>Tutti</button>
        <button onClick={()=>setSelected(new Set())}
          style={{flex:1,padding:'3px 8px',borderRadius:6,border:'1px solid var(--border)',
            background:'var(--surface2)',fontSize:11,cursor:'pointer',color:'var(--text2)'}}>Nessuno</button>
      </div>
      {/* Scrollable list */}
      <div style={{maxHeight:200,overflowY:'auto',marginBottom:10,display:'flex',flexDirection:'column',gap:2}}>
        {filtered.map(v => (
          <label key={v} style={{display:'flex',alignItems:'center',gap:7,padding:'3px 4px',
            borderRadius:5,cursor:'pointer',fontSize:12,color:'var(--text2)',
            background:selected.has(v)?'var(--accent-l)':'transparent'}}>
            <input type="checkbox" checked={selected.has(v)}
              onChange={()=>{const n=new Set(selected);n.has(v)?n.delete(v):n.add(v);setSelected(n)}}
              style={{accentColor:'var(--accent)',cursor:'pointer'}}/>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v}</span>
          </label>
        ))}
        {filtered.length === 0 && <div style={{fontSize:11,color:'var(--text3)',textAlign:'center',padding:'8px 0'}}>Nessun valore</div>}
      </div>
      {/* Footer buttons */}
      <div style={{display:'flex',gap:6}}>
        <button onClick={()=>onApply(popup.colId, new Set())}
          style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',
            background:'var(--surface2)',fontSize:11,cursor:'pointer',color:'var(--text3)'}}>Reset</button>
        <button onClick={()=>onApply(popup.colId, selected)}
          style={{flex:1,padding:'4px 10px',borderRadius:6,border:'none',
            background:'var(--accent)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>
          Applica ({selected.size})
        </button>
      </div>
    </div>
  )
}

// ── Full description modal ───────────────────────────────
function DescModal({ text, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:600,padding:'20px 24px'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:700}}>Descrizione originale</div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{fontSize:13,lineHeight:1.7,color:'var(--text2)',whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:400,overflowY:'auto',background:'var(--surface2)',padding:'12px 14px',borderRadius:'var(--radius-sm)',fontFamily:'var(--font-mono)'}}>
          {text}
        </div>
      </div>
    </div>
  )
}





// ── Learn from user correction ────────────────────────────
export async function learnException(tx, userDescAI) {
  if (!userDescAI || !tx.description) return
  // Add exception to AI Prompt for descAI
  const { getAIPrompts, saveAIPrompts } = await import('../data/aiPrompts')
  const prompts = getAIPrompts()
  const existing = prompts.descAI || ''
  // Build exception line
  const line = `"${tx.description.slice(0,80)}" → "${userDescAI}"`
  // Check if already exists
  if (existing.includes(line)) return
  // Add to exceptions section
  const exceptions = existing.includes('EXCEPTIONS:')
    ? existing
    : existing + '\n\nEXCEPTIONS (user-defined, always use these):'
  const updated = exceptions + `\n${line}`
  saveAIPrompts({ ...prompts, descAI: updated })
}

// ── DateCell — proper component (hooks cannot go in IIFE) ──
function DateCell({ tx, showRegDate, updateTransaction }) {
  const [editDate, setEditDate] = useState(false)
  const baseDate    = showRegDate ? (tx.date_reg || tx.date) : tx.date
  const displayDate = tx.competenza || baseDate
  const isOverride  = tx.competenza && tx.competenza !== baseDate

  return (
    <td className="tx-date" style={{whiteSpace:'nowrap',position:'relative',cursor:'pointer'}}
      title={isOverride ? `Data originale: ${tx._effDate||tx.date}\nCompetenza: ${tx.competenza}` : 'Clicca per cambiare competenza'}>
      {editDate ? (
        <input
          type="date"
          defaultValue={tx.competenza || baseDate}
          autoFocus
          style={{width:110,fontSize:11,border:'1px solid var(--accent)',borderRadius:4,padding:'2px 4px',
            background:'var(--surface)',color:'var(--accent)',outline:'none',fontFamily:'var(--font-mono)'}}
          onChange={e=>{
            if(e.target.value) {
              updateTransaction(tx.txId, { competenza: e.target.value === tx.date ? null : e.target.value })
            }
          }}
          onBlur={()=>setEditDate(false)}
          onKeyDown={e=>{ if(e.key==='Escape'||e.key==='Enter') setEditDate(false) }}
        />
      ) : (
        <span
          onClick={()=>setEditDate(true)}
          style={{
            color: isOverride ? 'var(--red)' : 'var(--text)',
            fontWeight: isOverride ? 700 : 400,
            textDecoration: isOverride ? 'underline dotted' : 'none',
          }}>
          {fmtDate(displayDate)}
          {isOverride && <span style={{fontSize:9,marginLeft:2,color:'var(--red)'}}>✎</span>}
        </span>
      )}
    </td>
  )
}


// ── Column definitions ───────────────────────────────────
const ALL_COLUMNS = [
  { id:'date',        label:'📅 Data',                 alwaysOn:true  },
  { id:'emoji',       label:'😀 Emoji Cat.'                            },
  { id:'descAI',      label:'✨ AI Descrizione',        alwaysOn:true  },
  { id:'description', label:'📄 Desc. Originale'                       },
  { id:'counterpart', label:'🔄 Controparte'                            },
  { id:'merchant',    label:'🏪 Merchant'                               },
  { id:'note',        label:'📝 Note'                                   },
  { id:'city',        label:'🏙️ Città'                                 },
  { id:'time',        label:'🕐 Ora'                                    },
  { id:'card',        label:'💳 Carta'                                  },
  { id:'user',        label:'👤 Utente'                                 },
  { id:'cat',         label:'🏷️ Categoria',            alwaysOn:true  },
  { id:'conf',        label:'📊 Confidenza %'                           },
  { id:'isBonifico',  label:'🔵 Bonifico'                               },
  { id:'amount',      label:'💰 Importo',              alwaysOn:true  },
]
const DEFAULT_VISIBLE = new Set(['date','emoji','descAI','note','city','time','card','user','cat','amount'])
const DEFAULT_ORDER   = ALL_COLUMNS.map(c=>c.id)

function EditColonneModal({ visibleCols, colOrder, onApply, onClose }) {
  const [draft,    setDraft]    = useState(new Set(visibleCols))
  const [order,    setOrder]    = useState([...colOrder])
  const [dragIdx,  setDragIdx]  = useState(null)
  const [overIdx,  setOverIdx]  = useState(null)

  const toggle = (id) => setDraft(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  function onDragStart(i) { setDragIdx(i) }
  function onDragOver(e, i) { e.preventDefault(); setOverIdx(i) }
  function onDrop(i) {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return }
    const next = [...order]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(i, 0, moved)
    setOrder(next)
    setDragIdx(null); setOverIdx(null)
  }

  const ordered = order.map(id => ALL_COLUMNS.find(c=>c.id===id)).filter(Boolean)

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--surface)',borderRadius:12,padding:24,width:360,boxShadow:'0 8px 32px rgba(0,0,0,.2)',maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>⚙️ Colonne</div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:14}}>Trascina per riordinare • Toggle per mostrare/nascondere</div>
        <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:4}}>
          {ordered.map((col, i) => (
            <div key={col.id}
              draggable={!col.alwaysOn}
              onDragStart={()=>onDragStart(i)}
              onDragOver={e=>onDragOver(e,i)}
              onDrop={()=>onDrop(i)}
              onDragEnd={()=>{setDragIdx(null);setOverIdx(null)}}
              style={{
                display:'flex',alignItems:'center',gap:10,padding:'8px 10px',
                borderRadius:6,cursor:col.alwaysOn?'default':'grab',
                background: overIdx===i ? 'var(--accent-l)' : dragIdx===i ? 'var(--surface2)' : 'var(--surface)',
                border: overIdx===i ? '1px solid var(--accent)' : '1px solid var(--border)',
                opacity: dragIdx===i ? 0.5 : 1,
                transition:'background .1s',
              }}>
              <span style={{color:'var(--text3)',fontSize:14,userSelect:'none'}}>{col.alwaysOn ? '⊘' : '⋮⋮'}</span>
              <label style={{display:'flex',alignItems:'center',gap:8,flex:1,cursor:col.alwaysOn?'default':'pointer'}}>
                <input type="checkbox"
                  checked={col.alwaysOn || draft.has(col.id)}
                  disabled={col.alwaysOn}
                  onChange={()=>!col.alwaysOn&&toggle(col.id)}
                  style={{width:15,height:15,accentColor:'var(--accent)'}}
                />
                <span style={{fontSize:13}}>{col.label}</span>
              </label>
              {col.alwaysOn && <span style={{fontSize:10,color:'var(--text3)'}}>fisso</span>}
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
          <button className="btn btn-ghost" style={{fontSize:13}} onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" style={{fontSize:13}}
            onClick={()=>{onApply(new Set(draft), order); onClose()}}>
            ✓ Applica
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Smart match detection ────────────────────────────────
export function autoDetectMatch(tx) {
  const candidates = [
    { field: 'merchant',     label: 'Merchant',     val: tx.merchant },
    { field: 'description',  label: 'Descrizione',  val: tx.description },
    { field: 'counterpart',  label: 'Controparte',  val: tx.counterpart },
    { field: 'city',         label: 'Città',         val: tx.city },
  ]
  for (const c of candidates) {
    if (c.val && c.val !== 'null' && c.val.trim().length > 2) {
      const token = (c.val.split(/[\s,\/\-]+/).find(t => t.length >= 3 && /[a-zA-Z]/.test(t)) || c.val).slice(0, 40)
      return { field: c.field, label: c.label, value: token }
    }
  }
  return { field: 'description', label: 'Descrizione', value: (tx.description||'').slice(0, 40) }
}

export function txMatchesRule(tx, match) {
  const val = (match.value||'').toLowerCase()
  if (!val) return false
  // For description field, also check descAI (AI-generated description)
  const raw = match.field === 'description'
    ? (tx.description || tx.descAI || '')
    : (tx[match.field] || '')
  const hay = raw.toLowerCase()
  return hay.includes(val)
}

// ── Rule text parser (Bug #25) ────────────────────────────
// Parses the user-editable rule text (e.g. `Descrizione includes "AMAZON"`,
// `descrizione contiene 'NETFLIX'`) back into a { field, label, value } match
// object, so the saved rule reflects what the user actually sees/edits.
const RULE_FIELD_MAP = {
  'descrizione': 'description', 'description': 'description',
  'merchant':    'merchant',
  'controparte': 'counterpart', 'counterpart': 'counterpart',
  'città':       'city', 'citta': 'city', 'city': 'city',
}
const RULE_FIELD_LABELS = {
  description: 'Descrizione', merchant: 'Merchant',
  counterpart: 'Controparte', city: 'Città',
}
export function parseRuleText(text, fallbackMatch) {
  if (!text || !text.trim()) return fallbackMatch
  // First condition of the form: CAMPO includes|contiene|include "VALORE"
  const re = /([A-Za-zÀ-ÿ]+)\s+(?:includes|include|contiene)\s+["'“”‘’]([^"'“”‘’]+)["'“”‘’]/i
  const m = text.match(re)
  if (m) {
    const field = RULE_FIELD_MAP[m[1].toLowerCase()]
    const value = (m[2] || '').trim().slice(0, 60)
    if (field && value) {
      return { field, label: RULE_FIELD_LABELS[field], value }
    }
  }
  return fallbackMatch
}

// ── AI smart rule generator ───────────────────────────────
export async function generateSmartRule(tx, newDesc) {
  const fields = [
    tx.merchant    && tx.merchant    !== 'null' ? `Merchant: "${tx.merchant}"`       : null,
    tx.description && tx.description !== 'null' ? `Descrizione: "${tx.description.slice(0,100)}"` : null,
    tx.counterpart && tx.counterpart !== 'null' ? `Controparte: "${tx.counterpart}"` : null,
    tx.city        && tx.city        !== 'null' ? `Città: "${tx.city}"`              : null,
    `Importo: ${tx.amount}`,
    tx.cat1 ? `Categoria attuale: ${tx.cat1}${tx.cat2 ? ' / '+tx.cat2 : ''}` : null,
  ].filter(Boolean).join('\n')

  const _customCats = useStore.getState().customCats || {}
  const _allCats = getMergedCats(_customCats)
  const _allCatNames = getMergedCatNames(_customCats)
  const catList = _allCatNames.filter(n=>n!=='Non Categorizzato').map(n=>{
    const subs = _allCats[n]?.sub||[]
    return subs.length ? `${n} (${subs.join(', ')})` : n
  }).join(' | ')

  const prompt = `Sei un esperto di finanza personale. Una transazione bancaria è stata rinominata dall'utente.
Devi proporre una regola di classificazione automatica intelligente e una categoria appropriata.

DATI TRANSAZIONE:
${fields}

NUOVA DESCRIZIONE SCELTA DALL'UTENTE: "${newDesc}"

CATEGORIE DISPONIBILI:
${catList}

COMPITO:
1. Proponi una regola di matching precisa usando i campi della transazione. La regola deve usare la sintassi:
   CAMPO includes "VALORE" [AND CAMPO includes "VALORE2"] [AND importo OPERATORE NUMERO]
   dove CAMPO è uno tra: Descrizione, Merchant, Controparte, Città
   dove OPERATORE è > o < o =
   Esempio: Descrizione includes "NETFLIX" AND importo < 20
   Esempio: Merchant includes "ENI" AND Città includes "MILANO"
   Usa 1-3 condizioni, scegli i token più identificativi (5+ lettere, non parole generiche).

2. Proponi la categoria più appropriata per questa transazione.

Rispondi SOLO con questo JSON (nessun altro testo):
{"rule":"...", "cat1":"...", "cat2":"..."}`

  try {
    const raw = await callGemini(prompt)
    const obj = JSON.parse(raw)
    return {
      rule: obj.rule || '',
      cat1: obj.cat1 || tx.cat1 || '',
      cat2: obj.cat2 || tx.cat2 || '',
    }
  } catch(e) {
    // Fallback: simple rule from autoDetectMatch
    const match = autoDetectMatch(tx)
    return {
      rule: `${match.label} includes "${match.value}"`,
      cat1: tx.cat1 || '',
      cat2: tx.cat2 || '',
    }
  }
}

// ── Rule apply popup (shown after user renames AI description) ────
export function RuleApplyPopup({ tx, match, newDesc, txId, txDate, onApply, onClose }) {
  const allTxs    = useStore(s => s.transactions)
  const customCats = useStore(s => s.customCats)
  const ruleAllCats     = getMergedCats(customCats)
  const ruleAllCatNames = getMergedCatNames(customCats)
  const now    = txDate || ''

  // AI-generated rule state
  const [ruleText,      setRuleText]      = useState('')
  const [cat1,          setCat1]          = useState(tx?.cat1 || '')
  const [cat2,          setCat2]          = useState(tx?.cat2 || '')
  const [loading,       setLoading]       = useState(true)
  const [aiError,       setAiError]       = useState(false)
  const [updateDescAI,  setUpdateDescAI]  = useState(true)

  // Derive effective match from the (possibly edited) ruleText so the count + saved rule
  // reflect what the user actually sees in the textarea, not just the auto-detected default.
  const effectiveMatch = parseRuleText(ruleText, match)
  const others = allTxs.filter(t => t.txId !== txId && !t.excluded && txMatchesRule(t, effectiveMatch))
  const future    = others.filter(t => (t._effDate||(t._effDate||t.date||'')) >= now)
  const allOthers = others

  // Duplicate-rule conflict state
  const [pending,    setPending]    = useState(null)   // { mode, ruleText, cat1, cat2, updateDescAI }
  const [conflicts,  setConflicts]  = useState([])     // similar existing rules

  useMemo(() => {
    setLoading(true)
    setAiError(false)
    generateSmartRule(tx, newDesc).then(res => {
      setRuleText(res.rule)
      if (res.cat1) setCat1(res.cat1)
      if (res.cat2) setCat2(res.cat2)
      setLoading(false)
    }).catch(() => {
      const m = autoDetectMatch(tx)
      setRuleText(`${m.label} includes "${m.value}"`)
      setLoading(false)
      setAiError(true)
    })
  }, [tx?.txId, newDesc])

  const cat2Options = cat1 ? (ruleAllCats[cat1]?.sub || []) : []

  // Find rules with similar matchField + matchValue (based on current edited ruleText)
  function findConflicts() {
    const existing = useStore.getState()?.appPrefs?.aiNamingRules || []
    const em  = parseRuleText(ruleText, match)
    const val = (em.value || '').toLowerCase()
    return existing.filter(r => {
      if (!r.enabled) return false
      const rv = (r.matchValue || '').toLowerCase()
      return r.matchField === em.field && (rv.includes(val) || val.includes(rv))
    })
  }

  function requestSave(mode, rt, c1, c2, upd) {
    if (mode === 'none') { onApply('none'); onClose(); return }
    const em = parseRuleText(rt, match)  // parse the (possibly edited) text
    const found = findConflicts()
    if (found.length > 0) {
      setPending({ mode, ruleText: rt, cat1: c1, cat2: c2, updateDescAI: upd, parsedMatch: em })
      setConflicts(found)
    } else {
      onApply(mode, rt, c1, c2, upd, em)  // pass parsed match
      onClose()
    }
  }

  function resolveConflict(resolution) {
    if (resolution === 'replace') {
      const existing = useStore.getState()?.appPrefs?.aiNamingRules || []
      const ids = new Set(conflicts.map(r => r.id))
      useStore.getState()?.setAppPref?.('aiNamingRules', existing.filter(r => !ids.has(r.id)))
    }
    // 'keep_both' → just proceed without deleting
    onApply(pending.mode, pending.ruleText, pending.cat1, pending.cat2, pending.updateDescAI, pending.parsedMatch)
    onClose()
  }

  // ── Conflict resolution view ──────────────────────────────
  if (pending && conflicts.length > 0) {
    return (
      <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center'}}
        onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
        <div style={{background:'var(--surface)',borderRadius:14,padding:'28px 32px',maxWidth:520,width:'94%',
          boxShadow:'0 16px 48px rgba(0,0,0,.25)'}}>
          <div style={{fontSize:18,fontWeight:800,marginBottom:8}}>⚠️ Regola già esistente</div>
          <div style={{fontSize:13,color:'var(--text2)',marginBottom:14}}>
            Esiste già {conflicts.length === 1 ? 'una regola simile' : `${conflicts.length} regole simili`} con la stessa condizione di match:
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
            {conflicts.map(r => (
              <div key={r.id} style={{padding:'10px 14px',borderRadius:10,
                background:'rgba(250,180,0,.08)',border:'1.5px solid rgba(250,180,0,.35)'}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text1)',marginBottom:2}}>
                  "{r.description}"
                </div>
                <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>
                  {r.matchLabel || `${r.matchField} includes "${r.matchValue}"`}
                </div>
              </div>
            ))}
          </div>
          <div style={{fontSize:12,color:'var(--text2)',marginBottom:16,padding:'10px 14px',
            borderRadius:8,background:'var(--surface2)',border:'1px solid var(--border)'}}>
            Nuova regola: <strong>"{newDesc}"</strong>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button className="btn btn-primary"
              style={{justifyContent:'flex-start',padding:'10px 16px',fontSize:13}}
              onClick={()=>resolveConflict('replace')}>
              🔄 Sostituisci la vecchia con quella nuova
            </button>
            <button className="btn btn-secondary"
              style={{justifyContent:'flex-start',padding:'10px 16px',fontSize:13}}
              onClick={()=>resolveConflict('keep_both')}>
              📋 Tieni entrambe
            </button>
            <button className="btn btn-ghost"
              style={{justifyContent:'flex-start',padding:'10px 16px',fontSize:13}}
              onClick={()=>{ setPending(null); setConflicts([]) }}>
              ← Torna indietro
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Normal popup ──────────────────────────────────────────
  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'28px 32px',maxWidth:560,width:'94%',
        boxShadow:'0 16px 48px rgba(0,0,0,.25)'}}>
        <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>📋 Regola AI</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
          Descrizione applicata: <strong>"{newDesc}"</strong>
        </div>

        {/* Flag: aggiorna descrizione AI nelle altre tx */}
        <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,cursor:'pointer',
          padding:'8px 12px',borderRadius:8,background:'var(--surface2)',border:'1px solid var(--border)'}}>
          <input type="checkbox" checked={updateDescAI} onChange={e=>setUpdateDescAI(e.target.checked)}
            style={{width:15,height:15,accentColor:'var(--accent)',cursor:'pointer'}}/>
          <span style={{fontSize:12,color:'var(--text2)'}}>
            Aggiorna anche la <strong>descrizione AI</strong> nelle transazioni corrispondenti
          </span>
          <span style={{marginLeft:'auto',fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}}>
            {updateDescAI ? '✏️ sì' : '🔒 no'}
          </span>
        </label>

        {/* Editable rule */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',
            color:'var(--text3)',marginBottom:6}}>
            Condizione regola {loading && '✨ AI sta generando...'}{aiError && '⚠️ fallback'}
          </div>
          {loading ? (
            <div style={{height:48,background:'var(--surface2)',borderRadius:8,border:'1px solid var(--border)',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'var(--text3)'}}>
              ⏳ Generando regola intelligente…
            </div>
          ) : (
            <textarea value={ruleText} onChange={e=>setRuleText(e.target.value)} rows={2}
              style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--accent)',
                fontSize:12,fontFamily:'var(--font-mono)',background:'var(--bg)',color:'var(--text)',
                resize:'vertical',lineHeight:1.5,boxSizing:'border-box'}}/>
          )}
          <div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>
            Puoi modificare la regola prima di salvare. Sintassi: <em>Campo includes "valore" AND importo {'>'} 100</em>
          </div>
        </div>

        {/* Category proposal */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:4}}>Categoria</div>
            <select value={cat1} onChange={e=>{setCat1(e.target.value);setCat2('')}}
              style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',
                fontSize:12,background:'var(--surface)',color:'var(--text)'}}>
              <option value="">— nessuna —</option>
              {ruleAllCatNames.filter(n=>n!=='Non Categorizzato').map(n=>(
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:4}}>Sottocategoria</div>
            <select value={cat2} onChange={e=>setCat2(e.target.value)}
              disabled={!cat2Options.length}
              style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',
                fontSize:12,background:'var(--surface)',color:'var(--text)',opacity:cat2Options.length?1:.5}}>
              <option value="">— nessuna —</option>
              {cat2Options.map(s=>(<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
        </div>

        {/* Counts */}
        <div style={{fontSize:13,marginBottom:18,color:'var(--text2)'}}>
          Trovate <strong>{allOthers.length}</strong> altre transazioni simili
          {allOthers.length > 0 && (
            <span style={{color:'var(--text3)',fontSize:12}}>
              {' '}({future.length} future, {allOthers.length - future.length} passate)
            </span>
          )}.
          {allOthers.length === 0 && <span style={{color:'var(--text3)'}}> — nessun'altra da aggiornare.</span>}
        </div>

        {/* Actions */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <button className="btn btn-primary" disabled={loading}
            style={{justifyContent:'flex-start',padding:'10px 16px',fontSize:13}}
            onClick={()=>requestSave('all', ruleText, cat1, cat2, updateDescAI)}>
            ✅ Salva regola + applica a tutti ({allOthers.length + 1}) — anche retroattivamente
          </button>
          <button className="btn btn-secondary" disabled={loading}
            style={{justifyContent:'flex-start',padding:'10px 16px',fontSize:13}}
            onClick={()=>requestSave('future', ruleText, cat1, cat2, updateDescAI)}>
            ⏩ Salva regola + questo e i prossimi ({future.length + 1})
          </button>
          <button className="btn btn-ghost"
            style={{justifyContent:'flex-start',padding:'10px 16px',fontSize:13}}
            onClick={()=>{ onApply('none'); onClose() }}>
            🔒 Solo questa transazione — non salvare regola
          </button>
        </div>

        <div style={{fontSize:11,color:'var(--text3)',marginTop:14}}>
          La regola viene salvata in Impostazioni → Regole AI solo se scegli una delle prime due opzioni.
        </div>
      </div>
    </div>
  )
}

// ── NoteCell — pallino nero → textarea inline ─────────────
function NoteCell({ tx, updateTransaction }) {
  const [open, setOpen] = useState(false)
  const [val,  setVal]  = useState(tx.note || '')
  const hasNote = !!(tx.note && tx.note.trim())

  // Keep editing draft in sync if tx.note changes externally (e.g. from another session)
  useEffect(() => { if (!open) setVal(tx.note || '') }, [tx.note, open])

  function commit() {
    const note = val.trim() || null
    updateTransaction(tx.txId, { note })
    setOpen(false)
  }

  return (
    <div style={{ position:'relative' }}>
      <button
        onClick={() => { setVal(tx.note || ''); setOpen(o => !o) }}
        title={hasNote ? tx.note : 'Aggiungi nota'}
        style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 6px',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: hasNote ? 'var(--text1)' : 'transparent',
          display: 'inline-block', flexShrink: 0,
          border: `1.5px solid ${hasNote ? 'var(--text1)' : 'var(--text3)'}`,
          boxSizing: 'border-box',
        }}/>
      </button>
      {open && (
        <div style={{ position:'fixed', zIndex:200, background:'var(--surface)',
          border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,.18)',
          padding:12, width:260, display:'flex', flexDirection:'column', gap:8 }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', letterSpacing:'.06em', textTransform:'uppercase' }}>
            Nota transazione
          </div>
          <textarea
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            rows={4}
            placeholder="Scrivi una nota…"
            style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--accent)',
              background:'var(--bg)', color:'var(--text1)', fontSize:13, resize:'vertical',
              fontFamily:'var(--font-sans)', outline:'none', lineHeight:1.5 }}
          />
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={commit}
              style={{ flex:1, padding:'6px', borderRadius:8, border:'none',
                background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:700,
                cursor:'pointer', fontFamily:'var(--font-sans)' }}>✓ Salva</button>
            <button onClick={() => setOpen(false)}
              style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)',
                background:'var(--bg)', color:'var(--text3)', fontSize:12,
                cursor:'pointer', fontFamily:'var(--font-sans)' }}>✕</button>
            {hasNote && <button onClick={() => { setVal(''); updateTransaction(tx.txId, { note: null }); setOpen(false) }}
              style={{ padding:'6px 8px', borderRadius:8, border:'1px solid var(--red)',
                background:'rgba(220,50,50,.08)', color:'var(--red)', fontSize:11,
                cursor:'pointer', fontFamily:'var(--font-sans)' }}>🗑</button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── CityCell — inline editable ───────────────────────────
function CityCell({ tx, updateTransaction }) {
  const [editing, setEditing] = useState(false)
  const cityVal = (tx.city && tx.city !== 'null') ? tx.city : ''
  const [val, setVal] = useState(cityVal)

  async function commit(raw) {
    const city = raw.trim() || null
    // cityUserEdited=true means: AI enrichment will never overwrite this value
    updateTransaction(tx.txId, { city, cityUserEdited: !!city })
    setEditing(false)

    // Write to Places cache so other transactions with the same merchant benefit
    if (city && tx.merchant) {
      try {
        const { setCachedPlace } = await import('../services/placesCache')
        await setCachedPlace(tx.merchant, { city, address: null, placeId: null })
        console.log(`[places] Manual override cached: "${tx.merchant}" → ${city}`)
      } catch(e) { console.warn('[places] cache write failed:', e.message) }
    }
  }

  if (editing) return (
    <input
      autoFocus
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={e  => commit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.target.blur() }
        if (e.key === 'Escape') { setVal(cityVal); setEditing(false) }
      }}
      style={{
        width:'100%', border:'1px solid var(--accent)', borderRadius:4,
        padding:'2px 6px', fontSize:12, background:'var(--surface)',
        color:'var(--text)', outline:'none', fontFamily:'var(--font-sans)',
      }}
    />
  )

  return (
    <span
      onClick={() => { setVal(cityVal); setEditing(true) }}
      title={cityVal ? (tx.cityUserEdited ? `${cityVal} ✏️ modificato manualmente` : cityVal) : 'Clicca per modificare'}
      style={{
        fontSize:12, cursor:'text', display:'block',
        maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        color: tx.cityUserEdited ? 'var(--accent)' : 'var(--text3)',
        fontWeight: tx.cityUserEdited ? 600 : 400,
      }}
    >
      {cityVal || <span style={{opacity:.3}}>—</span>}
    </span>
  )
}

// ── AiDescCell component ─────────────────────────────────
function AiDescCell({ tx, updateTransaction }) {
  const allTxs = useStore(s => s.transactions)
  const [aiEdit,    setAiEdit]    = useState(false)
  const [rulePopup, setRulePopup] = useState(null) // { match, newDesc } — no rule yet

  function normalizeDesc(s) {
    if (!s) return s
    const trimmed = s.slice(0, 40)
    const letters = trimmed.replace(/[^a-zA-Z]/g,'')
    const uppers  = trimmed.replace(/[^A-Z]/g,'').length
    if (letters.length > 3 && uppers / letters.length > 0.7)
      return trimmed.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    return trimmed
  }
  const [aiVal, setAiVal] = useState(() => { const v = normalizeDesc(tx.descAI)||''; return (v==='null'||v==='undefined')?'':v })
  useEffect(()=>{ if(!aiEdit) setAiVal(normalizeDesc(tx.descAI)||'') }, [tx.descAI, aiEdit])

  function handleApplyRule(mode, ruleText, cat1, cat2, updateDescAI = true, parsedMatch = null) {
    // mode 'none' → do nothing (rule NOT created)
    if (mode === 'none') return
    const match   = rulePopup?.match
    const newDesc = rulePopup?.newDesc
    if (!match || !newDesc) return
    // Use the parsed match from the edited rule text (if available), else fall back to auto-detected
    const effectiveMatch = parsedMatch || parseRuleText(ruleText, match)

    // Create the AI naming rule (Firestore via appPrefs.aiNamingRules)
    const existingRules = useStore.getState()?.appPrefs?.aiNamingRules || []
    const newNamingRule = {
      id:          `nr-${Date.now()}`,
      matchField:  effectiveMatch.field,
      matchValue:  effectiveMatch.value,
      matchLabel:  ruleText || `${effectiveMatch.label} includes "${effectiveMatch.value}"`,
      description: newDesc,
      enabled:     true,
      createdAt:   new Date().toISOString(),
    }
    useStore.getState()?.setAppPref?.('aiNamingRules', [...existingRules, newNamingRule])

    // Apply description to other matching transactions (batched undo)
    const targets = allTxs.filter(t => {
      if (t.txId === tx.txId || t.excluded) return false
      if (!txMatchesRule(t, effectiveMatch)) return false
      if (mode === 'future') return (t._effDate||(t._effDate||t.date||'')) >= (tx._effDate||(tx._effDate||tx.date||''))
      return true // 'all'
    })
    const batchLabel = `Regola "${newDesc}" su ${targets.length + 1} tx`
    useStore.getState()?.beginTxUndoBatch?.()
    targets.forEach(t => {
      const patch = {}
      if (updateDescAI) { patch.descAI = newDesc; patch.userEditedDesc = true }
      if (cat1) { patch.cat1 = cat1; if (cat2) patch.cat2 = cat2 }
      if (Object.keys(patch).length) updateTransaction(t.txId, patch)
    })
    useStore.getState()?.commitTxUndoBatch?.(batchLabel)
  }

  if (aiEdit) return (
    <>
      <input autoFocus value={aiVal}
        onChange={e=>setAiVal(e.target.value)}
        onBlur={()=>{
          const newDescAI = normalizeDesc(aiVal)
          updateTransaction(tx.txId, { descAI: newDescAI, userEditedDesc: true })
          learnException(tx, newDescAI)
          if (newDescAI && newDescAI !== (tx.descAI||'')) {
            const match = autoDetectMatch(tx)
            // Show popup BEFORE creating any rule — rule created inside handleApplyRule
            setRulePopup({ match, newDesc: newDescAI })
          }
          setAiEdit(false)
        }}
        onKeyDown={e=>{if(e.key==='Escape'){setAiVal(normalizeDesc(tx.descAI)||'');setAiEdit(false)}if(e.key==='Enter')e.target.blur()}}
        style={{width:'100%',border:'1px solid var(--accent)',borderRadius:4,padding:'2px 6px',fontSize:12,
          background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}
      />
      {rulePopup && (
        <RuleApplyPopup
          tx={tx}
          match={rulePopup.match}
          newDesc={rulePopup.newDesc}
          txId={tx.txId}
          txDate={tx._effDate||tx.date}
          onApply={handleApplyRule}
          onClose={()=>setRulePopup(null)}
        />
      )}
    </>
  )
  return (
    <>
      <span onClick={()=>setAiEdit(true)} title={aiVal||'—'}
        style={{fontWeight:600,fontSize:13,cursor:'text',display:'block',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {aiVal||<span style={{color:'var(--text3)',opacity:.4,fontWeight:400,fontStyle:'italic'}}>—</span>}
      </span>
      {rulePopup && (
        <RuleApplyPopup
          tx={tx}
          match={rulePopup.match}
          newDesc={rulePopup.newDesc}
          txId={tx.txId}
          txDate={tx._effDate||tx.date}
          onApply={handleApplyRule}
          onClose={()=>setRulePopup(null)}
        />
      )}
    </>
  )
}

// ── AI Enrichment overlay ─────────────────────────────────
const ENRICH_BATCH      = 15   // transactions per AI call
const ENRICH_WAVE_SIZE  = 400  // auto-split into waves above this threshold
const ENRICH_WAVE_PAUSE = 90   // seconds to pause between waves
let   _enrichRunning    = false // module-level guard — survives StrictMode remount

// ── Cat rules helpers (from Firestore via appPrefs) ────────
function getCatRulesLS() { return (useStore.getState()?.appPrefs?.catRules) || [] }
function applyCatRules(tx) {
  const rules = getCatRulesLS().filter(r => r.enabled !== false)
  for (const r of rules) {
    const val = (r.matchValue||'').toLowerCase()
    if (!val) continue
    const src = ((tx[r.matchField]||tx.description||tx.descAI||'')).toLowerCase()
    if (src.includes(val)) {
      return { cat1: r.cat1 || tx.cat1, cat2: r.cat2 !== undefined ? r.cat2 : tx.cat2 }
    }
  }
  return null
}

function AiEnrichmentOverlay({ transactions, onDone, forceAll=false }) {
  const { updateTransaction, applyAiRules } = useStore()
  const [pct,     setPct]     = useState(0)
  const [current, setCurrent] = useState(0)
  const [total,   setTotal]   = useState(0)
  const [phase,   setPhase]   = useState('Preparazione...')
  const [error,   setError]   = useState(null)
  const [placesPhase, setPlacesPhase] = useState(null)  // null = not started
  const abortRef   = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    // Module-level guard — only reset when run() truly finishes, NOT in cleanup.
    // This prevents StrictMode's unmount→remount cycle from clearing the flag
    // between the two mount calls and triggering a duplicate run.
    if (_enrichRunning) {
      // Another overlay is already running — show a message then close gracefully
      // instead of getting stuck at 0% forever.
      setPhase('⚠️ Arricchimento già in corso. Attendi il completamento.')
      setError('Un processo di arricchimento AI è già attivo. Attendi che finisca prima di avviarne un altro.')
      setTimeout(onDone, 2500)
      return
    }
    _enrichRunning = true
    mountedRef.current = true
    abortRef.current   = false
    run().finally(() => {
      _enrichRunning = false
      mountedRef.current = false  // only mark unmounted when run() truly ends
    })
    return () => {
      // intentionally NOT touching mountedRef or _enrichRunning here:
      // StrictMode cleanup fires before remount — setting mountedRef=false here
      // would cause run() to skip all state updates after the AI responds.
    }
  }, [])

  async function run() {
    // ── Pre-flight: check both API keys are configured ──
    const { appPrefs } = useStore.getState()
    const geminiKey = appPrefs?.geminiKey || localStorage.getItem('fm-gemini-key') || ''
    const placesKey = appPrefs?.placesKey || localStorage.getItem('fm-places-key') || ''
    const missing = []
    if (!geminiKey) missing.push('Gemini AI (AI Prompt)')
    if (!placesKey) missing.push('Google Places (AI Prompt)')
    if (missing.length) {
      setError(`⚠️ API key mancanti: ${missing.join(' e ')}.\nVai in Impostazioni → AI Prompt e inseriscile prima di procedere.`)
      _enrichRunning = false
      return
    }

    const stats = {cities:0,counterparts:0,descs:0,cats:0}
    const toEnrich = forceAll
      ? transactions.filter(t => !t.excluded)
      : transactions.filter(t => !t.excluded && !t.aiEnriched)
    if (!toEnrich.length) {
      if (!forceAll) {
        setPhase('Tutte le transazioni sono già state elaborate. Usa 🔄 Re-enrich per forzare.')
        await new Promise(r => setTimeout(r, 3000))
      }
      onDone(0); return
    }

    setTotal(toEnrich.length)
    setPhase(`Trovate ${toEnrich.length} transazioni da elaborare…`)
    setPct(0)
    await new Promise(r => setTimeout(r, 50))

    // Split into waves when total is large
    const useWaves  = toEnrich.length > ENRICH_WAVE_SIZE
    const totalWaves = useWaves ? Math.ceil(toEnrich.length / ENRICH_WAVE_SIZE) : 1
    let done = 0

    for (let waveIdx = 0; waveIdx < totalWaves; waveIdx++) {
      if (abortRef.current) break

      // Pause between waves (not before the first)
      if (waveIdx > 0) {
        for (let s = ENRICH_WAVE_PAUSE; s > 0; s--) {
          if (abortRef.current) break
          setPhase(`⏸ Pausa tra ondate — riprendo tra ${s}s (ondata ${waveIdx+1}/${totalWaves})…`)
          await new Promise(r => setTimeout(r, 1000))
        }
        if (abortRef.current) break
      }

      const waveStart = waveIdx * ENRICH_WAVE_SIZE
      const waveEnd   = Math.min(waveStart + ENRICH_WAVE_SIZE, toEnrich.length)
      const wave      = toEnrich.slice(waveStart, waveEnd)
      if (useWaves) setPhase(`🌊 Ondata ${waveIdx+1}/${totalWaves} — ${wave.length} transazioni…`)

      for (let i = 0; i < wave.length; i += ENRICH_BATCH) {
      if (abortRef.current) break
      // Rate-limit: small pause between batches to stay under TPM limits
      if (i > 0) await new Promise(r => setTimeout(r, 1000))
      if (abortRef.current) break
      const batch = wave.slice(i, i + ENRICH_BATCH)
      const globalDone = waveStart + i
      setPhase(`${useWaves?`Ondata ${waveIdx+1}/${totalWaves} — `:''}Elaborazione ${globalDone+1}–${Math.min(globalDone+ENRICH_BATCH, toEnrich.length)} di ${toEnrich.length}…`)

      // Retry loop — on 429 wait and retry up to 3 times
      let enriched = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          enriched = await enrichBatch(batch, { force: forceAll })
          break  // success
        } catch(e) {
          const is429 = e.message?.includes('429') || e.message?.includes('PROXY_ERROR')
          if (is429 && attempt < 2) {
            const wait = 30 + attempt * 20  // 30s, then 50s
            for (let s = wait; s > 0; s--) {
              if (abortRef.current) break
              setPhase(`⏳ Rate limit OpenAI — riprovo tra ${s}s (tentativo ${attempt+2}/3)…`)
              await new Promise(r => setTimeout(r, 1000))
            }
            continue
          }
          // non-429 errors or exhausted retries — propagate
          throw e
        }
      }
      if (!enriched) { done += batch.length; continue }

      try {
        const ruleDesc = await import('../data/aiService').then(m => m.computeDescAI)
        enriched.forEach(t => {
          if (!t) return
          // Only apply rule-based descAI if AI didn't produce one (fallback only)
          if (!t.descAI && !t.userEditedDesc) {
            const rd = ruleDesc(t)
            if (rd) t.descAI = rd
          }

          // ── Step 2: apply user-defined rules (highest priority) ──
          // 1. fm-cat-rules (simple field-contains rules from Regole AI → Categorizzazione)
          const catOverride = applyCatRules(t)
          if (catOverride) { t.cat1 = catOverride.cat1; t.cat2 = catOverride.cat2 }
          // 2. Zustand aiRules (multi-condition rules from Transactions panel)
          if (typeof applyAiRules === 'function') {
            const zr = applyAiRules(t.description, t.amount, t.date)
            if (zr?.cats?.[0]) { t.cat1 = zr.cats[0].cat1; t.cat2 = zr.cats[0].cat2 || '' } // aiRules always win over catRules
            if (zr?.descAI) t.descAI = zr.descAI
            if (zr?.exclude) { t.excluded = true }
          }
          // 3. System rule: positive amount → always Entrate L1
          if (t.amount > 0 && t.cat1 && t.cat1 !== 'Entrate') {
            t.cat1 = 'Entrate'
            t.cat2 = ''
          }

          // Fetch current tx to check manual overrides
          const curTx = useStore.getState().transactions.find(s => s.txId === t.txId)
          // Never overwrite categories the user set manually, or king-protected txs
          const _isKingProtected = useStore.getState().isKingProtected
          const catProtected = !!curTx?.userEditedCat ||
            (typeof _isKingProtected === 'function' && _isKingProtected(t.description, t.amount))
          updateTransaction(t.txId, {
            descAI:        t.descAI,
            city:          curTx?.cityUserEdited ? curTx.city : t.city,  // respect manual edits
            time:          t.time,
            card:          t.card,
            merchant:      t.merchant      ?? null,
            counterpart:   t.counterpart   ?? null,
            cat1:          catProtected ? (curTx?.cat1 ?? null) : (t.cat1 || null),
            cat2:          catProtected ? (curTx?.cat2 ?? '')   : (t.cat2 || ''),
            conf:          catProtected ? (curTx?.conf ?? null) : (t.conf || null),
            aiEnriched:    true,
            aiEnrichedAt:  t.aiEnrichedAt,
            aiCategorized: true,
            ...(t.excluded ? { excluded: true } : {}),
          })
          if (t.city)                    stats.cities++
          if (t.merchant||t.counterpart) stats.counterparts++
          if (t.descAI)                  stats.descs++
          if (t.cat1 && t.cat1 !== 'Non Categorizzato') stats.cats++
        })
      } catch(e) {
        if (e.message === 'GEMINI_KEY_MISSING') {
          setError('API key mancante. Vai su Impostazioni → Profilo & Conti.')
          abortRef.current = true; setPhase('Interrotto — key mancante'); return
        }
        if (e.message === 'PROXY_NOT_RUNNING') {
          setError('Proxy server non avviato. Apri un nuovo Terminale e lancia: node proxy-server.cjs')
          abortRef.current = true; setPhase('Interrotto — proxy non attivo'); return
        }
        if (e.message === 'PROXY_TIMEOUT') {
          setError('Timeout: il proxy non ha risposto in 30s. Controlla che sia avviato e che la API key sia valida.')
          abortRef.current = true; setPhase('Interrotto — timeout'); return
        }
        // Other errors (including exhausted 429 retries) — skip batch, will be retried next run
        console.warn('[overlay] batch failed after retries, skipping:', e.message)
      }

      done += batch.length
      if (mountedRef.current) {
        setCurrent(done)
        setPct(Math.round(done / toEnrich.length * 100))
      }
      } // end inner batch loop
    } // end wave loop
    // ── Step 3: Google Places city enrichment ─────────────
    if (!abortRef.current && (useStore.getState().appPrefs?.placesKey || localStorage.getItem('fm-places-key'))) {
      if (mountedRef.current) setPlacesPhase('Ricerca città con Google Places…')
      try {
        // Get current store state for the enriched transactions
        const allTxs = useStore.getState().transactions
        const placesToEnrich = toEnrich.map(t => allTxs.find(s => s.txId === t.txId) || t)

        let placesDone = 0
        const withCities = await enrichCitiesBatch(placesToEnrich, {
          skipCache: toEnrich.length <= 100,
          onProgress: (d, tot) => {
            placesDone = d
            if (mountedRef.current) setPlacesPhase(`Google Places: ${d}/${tot} merchants…`)
          }
        })

        // Update only transactions where city changed
        withCities.forEach(t => {
          const orig = placesToEnrich.find(o => o.txId === t.txId)
          if (t.city && t.city !== orig?.city) {
            updateTransaction(t.txId, { city: t.city })
            stats.cities++
          }
        })
      } catch(e) {
        console.warn('[places] enrichCitiesBatch failed:', e.message)
      }
      if (mountedRef.current) setPlacesPhase(null)
    }

    if (mountedRef.current) onDone(done)
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.65)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'var(--surface)',borderRadius:16,padding:'32px 36px',maxWidth:440,width:'90%',textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
        <div style={{fontSize:40,marginBottom:16}}>✨</div>
        <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>AI Enrichment in corso</div>
        <div style={{fontSize:13,color:'var(--text3)',marginBottom:20,lineHeight:1.5}}>
          OpenAI sta analizzando le transazioni.<br/><strong>Non chiudere l'app.</strong>
        </div>
        {(pct??0) < 100 && (
          <div style={{display:'flex',justifyContent:'center',marginBottom:8}}>
            <div style={{width:20,height:20,border:'3px solid var(--border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
          </div>
        )}
        <div style={{fontSize:52,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--accent)',lineHeight:1,marginBottom:8}}>
          {pct}<span style={{fontSize:28}}>%</span>
        </div>
        <div style={{height:8,borderRadius:4,background:'var(--border)',overflow:'hidden',marginBottom:12}}>
          <div style={{height:'100%',borderRadius:4,background:'var(--accent)',width:pct+'%',transition:'width .4s'}}/>
        </div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:4}}>{phase}</div>
        {placesPhase && (
          <div style={{fontSize:12,color:'var(--accent)',marginBottom:4}}>🗺️ {placesPhase}</div>
        )}
        <div style={{height:4}} />
        <div style={{fontSize:12,color:'var(--text2)',fontFamily:'var(--font-mono)'}}>{current} / {total} transazioni</div>
        <div style={{marginTop:16}}>
          <button
            onClick={()=>{ abortRef.current = true }}
            style={{padding:'8px 20px',borderRadius:8,border:'1px solid var(--red)',background:'transparent',
              color:'var(--red)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
            ⏹ Interrompi
          </button>
        </div>
        {error && (
          <div style={{marginTop:12,padding:'10px 14px',background:'var(--red-l)',border:'1px solid var(--red)',borderRadius:8,fontSize:12,color:'var(--red)',textAlign:'left'}}>
            ⚠️ {error}
            {error.includes('proxy') && (
              <div style={{marginTop:8,fontSize:12,fontFamily:'var(--font-mono)',background:'var(--surface2)',padding:'6px 8px',borderRadius:4}}>
                node proxy-server.js
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AI Feedback modal ─────────────────────────────────────
function AiFeedbackModal({ tx, onClose }) {
  const { updateTransaction } = useStore()
  const [text,    setText]    = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)

  async function submit() {
    if (!text.trim()) return
    setLoading(true)
    try {
      const fix = await processFeedback(tx, text)
      if (fix) {
        updateTransaction(tx.txId, {
          descAI: fix.descAI||tx.descAI, city: fix.city||tx.city,
          cat1: fix.cat1||tx.cat1, cat2: fix.cat2||tx.cat2,
          aiFeedback: text, aiFeedbackAt: new Date().toISOString(), userEditedDesc:true,
        })
        setResult(fix.note || 'Aggiornato.')
      }
    } catch(e) { setResult('Errore: '+e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:460,padding:'20px 24px'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:700}}>🤖 Feedback AI</div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:10,padding:'8px 10px',background:'var(--surface2)',borderRadius:'var(--radius-sm)'}}>
          <div><strong>{tx.descAI||'—'}</strong></div>
          <div style={{fontSize:11,marginTop:2}}>{(tx.description||'').slice(0,60)}</div>
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={3} autoFocus
          placeholder="Spiega perché la classificazione non è corretta…"
          style={{width:'100%',padding:'9px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',
            fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)',resize:'vertical'}}/>
        {result && <div style={{marginTop:8,padding:'8px 10px',background:'var(--green-l)',borderRadius:'var(--radius-sm)',fontSize:12,color:'var(--green)'}}>✓ {result}</div>}
        <div style={{display:'flex',gap:8,marginTop:12}}>
          <button className="btn btn-primary" style={{fontSize:12}} onClick={submit} disabled={!text.trim()||loading}>
            {loading?'⏳ Analisi…':'✨ Invia feedback'}
          </button>
          <button className="btn btn-secondary" style={{fontSize:12}} onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Manual Transaction Modal ──────────────────────────
function AddManualTxModal({ onClose }) {
  const { addTransactions } = useStore()
  const customCats = useStore(s => s.customCats)
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), description:'', amount:'', cat1:'Non Categorizzato', cat2:'' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  function save() {
    const amt = parseFloat(form.amount)
    if(!form.description||isNaN(amt)) return
    const now = new Date()
    const yr  = now.getFullYear().toString().slice(2)
    addTransactions([{
      txId: `${yr}-MAN-${Date.now()}`,
      date: form.date, date_reg: form.date,
      description: form.description, descAI: form.description.slice(0,40),
      amount: amt, cat1: form.cat1, cat2: form.cat2,
      aiEnriched: false, excluded: false, isBonifico: false,
    }])
    onClose()
  }
  return (
    <Modal title="+ Aggiungi Transazione" onClose={onClose} width={480}>
      <FormRow label="Data"><input type="date" value={form.date} onChange={e=>set('date',e.target.value)} className="form-input"/></FormRow>
      <FormRow label="Descrizione"><input value={form.description} onChange={e=>set('description',e.target.value)} className="form-input" placeholder="Es. Spesa supermercato" autoFocus/></FormRow>
      <FormRow label="Importo €"><input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} className="form-input" placeholder="−45.00 o +1200.00" step="0.01"/></FormRow>
      <FormRow label="Categoria">
        <Select value={form.cat1} onChange={e=>set('cat1',e.target.value)}>
          {Object.keys(getMergedCats(customCats)).map(n=><option key={n}>{n}</option>)}
        </Select>
      </FormRow>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save} disabled={!form.description||!form.amount}>Aggiungi</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Quick filters ─────────────────────────────────────────
function QuickFilters({ transactions, hideComm, setHideComm, hideSmall, setHideSmall, filterNoCat2, setFilterNoCat2, selected }) {
  const store   = useStore()
  const filters = store.filters
  const today   = new Date()
  const thisYM  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

  const allTxs = transactions
  const counts = {
    all:    allTxs.filter(t=>!t.excluded).length,
    income: allTxs.filter(t=>!t.excluded&&t.amount>0).length,
    expense:allTxs.filter(t=>!t.excluded&&t.amount<0).length,
    uncat:  allTxs.filter(t=>!t.excluded&&t.cat1&&t.cat1!=='Non Categorizzato'&&!t.cat2).length,
    review:  allTxs.filter(t=>(t.conf||0)<70).length,
    flagged: allTxs.filter(t=>t._flagged).length,
    thisM:   allTxs.filter(t=>!t.excluded&&(t._effDate||(t._effDate||t.date||'')).startsWith(thisYM)).length,
  }

  const pills = [
    {id:'all',     label:'Tutte',        count:counts.all,    active:!filters.type&&!filters.cat1&&!filters.dateFrom&&!filters.conf&&!filters.flagged, action:()=>store.clearFilters()},
    {id:'income',  label:'Entrate',      count:counts.income, active:filters.type==='Income', action:()=>store.setFilter('type',filters.type==='Income'?'':'Income')},
    {id:'expense', label:'Uscite',       count:counts.expense,active:filters.type==='Expense',action:()=>store.setFilter('type',filters.type==='Expense'?'':'Expense')},
    {id:'uncat',   label:'Non cat L2',   count:counts.uncat,  active:filterNoCat2, warn:counts.uncat>0, action:()=>setFilterNoCat2(v=>!v)},
    {id:'review',  label:'Da rivedere',  count:counts.review, active:filters.conf==='low',    warn:counts.review>0,action:()=>store.setFilter('conf',filters.conf==='low'?'':'low')},
    {id:'flagged', label:'🚩 To review',  count:counts.flagged,active:!!filters.flagged,        warn:counts.flagged>0,action:()=>store.setFilter('flagged',filters.flagged?'':'1')},
    {id:'thisM',   label:'Questo mese',  count:counts.thisM,  active:filters.dateFrom===thisYM+'-01', action:()=>{
      if(filters.dateFrom===thisYM+'-01') store.clearFilters()
      else { store.setFilter('dateFrom',thisYM+'-01'); store.setFilter('dateTo',thisYM+'-31') }
    }},
  ]

  const selTxs = selected?.size > 0
    ? transactions.filter(t => selected.has(t.txId))
    : []
  const selSum = selTxs.reduce((s, t) => s + (t.amount || 0), 0)
  const fmtSel = v => {
    const abs = Math.abs(v)
    const str = abs.toLocaleString('it-IT', {minimumFractionDigits:2,maximumFractionDigits:2})
    return v >= 0 ? `+€ ${str}` : `−€ ${str}`
  }

  const hideToggle = (label, active, action) => (
    <button onClick={action} style={{
      padding:'3px 9px',borderRadius:10,cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:12,
      border:`1px solid ${active?'var(--accent)':'var(--border)'}`,
      background:active?'var(--accent)':'transparent',
      color:active?'#fff':'var(--text3)',
      fontWeight:active?700:400,transition:'all .12s',
    }}>{label}</button>
  )

  return (
    <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
      {pills.map(p => (
        <button key={p.id} onClick={p.action} style={{
          display:'inline-flex',alignItems:'center',gap:5,padding:'5px 12px',
          borderRadius:20,cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:13,
          border:`1px solid ${p.active?'var(--accent)':p.warn?'var(--gold)':'var(--border)'}`,
          background:p.active?'var(--accent-l)':p.warn?'var(--gold-l)':'var(--surface)',
          color:p.active?'var(--accent)':p.warn?'var(--gold)':'var(--text2)',
          fontWeight:p.active?700:400,
        }}>
          {p.label}
          <span style={{fontSize:11,padding:'1px 6px',borderRadius:10,
            background:p.active?'var(--accent)':p.warn?'var(--gold)':'var(--border)',
            color:p.active||p.warn?'#fff':'var(--text3)',fontWeight:600}}>
            {p.count}
          </span>
        </button>
      ))}

      {/* ── Nascondi group ── */}
      <div style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:5,
        padding:'3px 8px 3px 10px',borderRadius:12,
        border:'1px solid var(--border)',background:'var(--surface)'}}>
        <span style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'.04em',
          textTransform:'uppercase',marginRight:2}}>Nascondi</span>
        {hideToggle('commissioni', hideComm,  ()=>setHideComm(v=>!v))}
        {hideToggle('<1€',         hideSmall, ()=>setHideSmall(v=>!v))}
      </div>

      {selTxs.length > 0 && (
        <div style={{display:'inline-flex',alignItems:'center',gap:8,
          padding:'5px 14px',borderRadius:20,
          border:'1px solid var(--accent)',background:'var(--accent-l)',
          fontSize:13,color:'var(--accent)',fontWeight:700}}>
          <span>{selTxs.length} selezionate</span>
          <span style={{width:1,height:14,background:'var(--accent)',opacity:.3}}/>
          <span style={{color:selSum>=0?'var(--green)':'var(--red)',fontFamily:'var(--font-mono)',fontSize:12}}>
            {fmtSel(selSum)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────
function FilterBar() {
  const store      = useStore()
  const filters    = store.filters
  const customCats = store.customCats
  const allCatNames = getMergedCatNames(customCats)

  return (
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
      <div style={{position:'relative',flex:1,minWidth:200}}>
        <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text3)',pointerEvents:'none'}}/>
        <input value={filters.search||''} onChange={e=>store.setFilter('search',e.target.value)}
          placeholder="Cerca…"
          style={{width:'100%',paddingLeft:32,paddingRight:filters.search?28:10,paddingTop:8,paddingBottom:8,
            border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:13,
            background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}/>
        {filters.search && <button onClick={()=>store.setFilter('search','')}
          style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text3)',display:'flex',alignItems:'center'}}>
          <X size={12}/>
        </button>}
      </div>
      <select value={filters.type||''} onChange={e=>store.setFilter('type',e.target.value)}
        style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}>
        <option value="">Tutti i tipi</option>
        <option value="Income">Entrate</option>
        <option value="Expense">Uscite</option>
      </select>
      <select value={filters.cat1||''} onChange={e=>store.setFilter('cat1',e.target.value)}
        style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)',minWidth:160}}>
        <option value="">Tutte le categorie</option>
        {allCatNames.map(n=><option key={n}>{n}</option>)}
      </select>
      <input type="date" value={filters.dateFrom||''} onChange={e=>store.setFilter('dateFrom',e.target.value)}
        style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}/>
      <input type="date" value={filters.dateTo||''} onChange={e=>store.setFilter('dateTo',e.target.value)}
        style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}/>
    </div>
  )
}

// ── Transaction row ───────────────────────────────────────
function TxRow({ tx, selected, setSelected, setFeedbackTx, openCatTxId, setOpenCatTxId, showRegDate, setEnrichSingleTx, visibleCols, colOrder }) {
  const updateTransaction = useStore(s=>s.updateTransaction)
  const userAccounts      = useStore(s=>s.userAccounts)
  const satiPots          = useStore(s=>s.satiPots)
  const allTxs            = useStore(s=>s.transactions)
  const customCats        = useStore(s=>s.customCats)
  const compensatingTx    = tx._compensatedBy ? allTxs.find(t=>t.txId===tx._compensatedBy) : null
  const compensatedLabel  = compensatingTx?.cat2?.toLowerCase()==='satispay' ? 'Compensato Satispay' : 'Compensato'
  const catOpen = openCatTxId === tx.txId
  const setCatOpen = (v) => setOpenCatTxId?.(v ? tx.txId : null)
  const [descOpen,    setDescOpen]    = useState(false)
  const [mixCatOpen,  setMixCatOpen]  = useState(false)
  const [amtPopup,    setAmtPopup]    = useState(false)
  const pillRef = useRef(null)

  const isIncome = tx.amount > 0
  const isCash   = !isIncome && (tx.cat1==='Contanti'||(tx.descAI||tx.description||'').toLowerCase().includes('prelievo'))
  const amtClass = isIncome?' income':isCash?' cash':' expense'

  const counterpartDisplay = (tx.counterpart && tx.counterpart !== 'null') ? tx.counterpart : null
  const _isBonifico        = tx.isBonifico || /bonifico/i.test(tx.description||'')
  const merchantDisplay    = (!_isBonifico && tx.merchant && tx.merchant !== 'null') ? tx.merchant : null

  const effectiveCols = colOrder || DEFAULT_ORDER
  const cols = effectiveCols.filter(id => visibleCols?.has(id) || ALL_COLUMNS.find(c=>c.id===id)?.alwaysOn)

  return (
    <tr className={'tx-row'+(tx.excluded?' excluded':'')}
      style={{background: (() => {
        if (tx._flagged) return 'rgba(220,50,50,0.04)'
        const isB = tx.isBonifico || /bonifico/i.test(tx.description||'')
        const isP = /\bprelievo\b/i.test(tx.description||'') && !isB
        if (tx._compensatedAmt > 0) return 'rgba(42,92,138,0.07)'
        return isB ? 'rgba(42,92,138,0.045)' : isP ? 'rgba(200,98,42,0.06)' : undefined
      })()}}>

      <td style={{padding:'6px 8px',textAlign:'center',verticalAlign:'middle'}}>
        <input type="checkbox" style={{cursor:'pointer'}}
          checked={selected?.has(tx.txId)||false}
          onChange={e=>{const next=new Set(selected||[]);e.target.checked?next.add(tx.txId):next.delete(tx.txId);setSelected?.(next)}}/>
      </td>
      <td style={{padding:'4px 6px',whiteSpace:'nowrap'}}>
        <button
          onClick={e=>{e.stopPropagation();updateTransaction(tx.txId,{_nonRecurring:!tx._nonRecurring})}}
          title={tx._nonRecurring?'Non ricorrente — clicca per rimuovere':'Segna come non ricorrente'}
          style={{border:'none',background:'none',cursor:'pointer',padding:'0 3px 0 0',fontSize:11,lineHeight:1,
            opacity:tx._nonRecurring?1:0.2,color:tx._nonRecurring?'#6366f1':'var(--text3)',
            verticalAlign:'middle'}}>⚡</button>
        <button
          onClick={e=>{e.stopPropagation();updateTransaction(tx.txId,{_flagged:!tx._flagged})}}
          title={tx._flagged?'To review — clicca per rimuovere flag':'Segna come to review'}
          style={{fontSize:10,fontFamily:'var(--font-mono)',padding:'2px 5px',borderRadius:4,cursor:'pointer',
            background: tx._flagged ? 'rgba(220,50,50,0.12)' : 'var(--surface2)',
            border: tx._flagged ? '1.5px solid rgba(220,50,50,0.5)' : '1px solid var(--border)',
            color: tx._flagged ? 'var(--red)' : 'var(--text3)',
            fontWeight: tx._flagged ? 700 : 400,
            ...(tx.excluded?{textDecoration:'line-through',opacity:.5}:{})}}>{tx.txId}</button>
      </td>

      {cols.map(id => {
        if(id==='date') return <DateCell key={id} tx={tx} showRegDate={showRegDate} updateTransaction={updateTransaction}/>
        if(id==='emoji') {
          const em = getMergedCats(customCats)[tx.cat1]?.subEmojis?.[tx.cat2] || ''
          return <td key={id} style={{width:28,textAlign:'center',fontSize:15,padding:'0 2px',verticalAlign:'middle'}}>{em}</td>
        }
        if(id==='descAI') return (
          <td key={id} style={{padding:'4px 8px',maxWidth:150}}>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <AiDescCell tx={tx} updateTransaction={updateTransaction}/>
              <button onClick={()=>setDescOpen(true)} title="Descrizione originale"
                style={{flexShrink:0,border:'none',background:'transparent',cursor:'pointer',
                  padding:0,lineHeight:1,color:'#111',fontSize:8,opacity:.45,
                  display:'inline-flex',alignItems:'center'}}>⬤</button>
            </div>
            {descOpen && <DescModal text={tx.description||''} onClose={()=>setDescOpen(false)}/>}
          </td>
        )
        if(id==='description') return (
          <td key={id} className="tx-desc-cell">
            <div onClick={()=>setDescOpen(true)} title="Clicca per leggere tutto"
              style={{fontSize:11,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}}>
              {(tx.description||'').slice(0,55)}
            </div>
            {descOpen && <DescModal text={tx.description||''} onClose={()=>setDescOpen(false)}/>}
          </td>
        )
        if(id==='counterpart') return (
          <td key={id} className="tx-counterpart-cell">
            {counterpartDisplay
              ? <span style={{fontSize:12,fontWeight:600,color:'var(--text2)'}}>{counterpartDisplay}</span>
              : <span style={{color:'var(--text3)',opacity:.4,fontSize:12}}>—</span>}
          </td>
        )
        if(id==='merchant') return (
          <td key={id} className="tx-counterpart-cell">
            {merchantDisplay
              ? <span style={{fontSize:12,fontWeight:600,color:'var(--text2)'}}>{merchantDisplay}</span>
              : <span style={{color:'var(--text3)',opacity:.4,fontSize:12}}>—</span>}
          </td>
        )
        if(id==='note') return (
          <td key={id} className="tx-note-cell">
            <NoteCell tx={tx} updateTransaction={updateTransaction}/>
          </td>
        )
        if(id==='city') return (
          <td key={id} className="tx-city-cell">
            <CityCell tx={tx} updateTransaction={updateTransaction}/>
          </td>
        )
        if(id==='time') return (
          <td key={id} className="tx-time-cell">
            {(tx.time && tx.time!=='null')
              ? <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text3)'}}>{tx.time}</span>
              : <span style={{color:'var(--text3)',opacity:.3}}>—</span>}
          </td>
        )
        if(id==='card') return (
          <td key={id} className="tx-card-cell">
            {(tx.card && tx.card!=='null')
              ? <span style={{fontSize:11,fontFamily:'var(--font-mono)',padding:'2px 6px',borderRadius:8,background:'var(--surface2)',border:'1px solid var(--border)',color:'var(--text3)',fontWeight:700}}>*{tx.card}</span>
              : <span style={{color:'var(--text3)',opacity:.3}}>—</span>}
          </td>
        )
        if(id==='user') return (
          <td key={id} className="tx-user-cell">
            {(()=>{
              const u = tx.user || resolveUserByCard(tx.card,userAccounts,tx.merchant,tx.description,tx.cat2)
              return u
                ?<span style={{fontSize:12,fontWeight:700,color:'var(--accent)'}}>{u}</span>
                :<span style={{color:'var(--text3)',opacity:.4,fontSize:11}}>—</span>
            })()}
          </td>
        )
        if(id==='cat') {
          const isSatiLinked = !!tx._satiLinked
          // Full cross-pot breakdown: find ALL pots that have this txId linked
          const fullBreakdown = isSatiLinked ? (() => {
            const groups = [] // [{potName, icon, ym, rows:[{cat1,cat2,amount}]}]
            ;(satiPots||[]).forEach(p => {
              Object.entries(p.data || {}).forEach(([ym, entry]) => {
                if (!entry?.linked) return
                const ids = Array.isArray(entry.linked) ? entry.linked : [entry.linked]
                if (!ids.includes(tx.txId)) return
                const voci = p.voci || []
                const cells = entry.cells || {}
                const rows = voci
                  .filter(v => v.cat1)
                  .map(v => ({ cat1: v.cat1, cat2: v.cat2, amount: parseFloat(cells[v.id])||0 }))
                  .filter(r => r.amount > 0)
                if (rows.length > 0) groups.push({ potName: p.name, icon: p.icon||'💰', ym, rows })
              })
            })
            return groups
          })() : []
          if (isSatiLinked) return (
            <td key={id} className="tx-cat">
              <div style={{position:'relative',display:'inline-block'}}>
                <button onClick={()=>setMixCatOpen(o=>!o)}
                  style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:12,
                    background:'rgba(26,188,156,.12)',border:'1px solid rgba(26,188,156,.3)',
                    fontSize:11,fontWeight:700,color:'#1abc9c',cursor:'pointer',whiteSpace:'nowrap',
                    fontFamily:'var(--font-sans)'}}>
                  🔗 {tx._satiLinked?.potName || 'Satispay'} 🔒
                </button>
                {mixCatOpen && (
                  <div onClick={e=>e.stopPropagation()}
                    style={{position:'absolute',top:'100%',left:0,zIndex:200,marginTop:4,
                      background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,
                      boxShadow:'0 4px 20px rgba(0,0,0,.15)',padding:'10px 12px',minWidth:240}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',marginBottom:4}}>
                      Accantonamento · {tx._satiLinked?.ym}
                    </div>
                    <div style={{fontSize:11,color:'var(--text3)',marginBottom:8,fontStyle:'italic'}}>
                      🔒 Categorizzazione gestita da Satispay
                    </div>
                    {fullBreakdown.map((group, gi) => (
                      <div key={gi} style={{marginBottom: gi < fullBreakdown.length-1 ? 10 : 0}}>
                        {fullBreakdown.length > 1 && (
                          <div style={{fontSize:10,fontWeight:800,color:'var(--text3)',
                            textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4,
                            paddingBottom:2,borderBottom:'1px solid var(--border2)'}}>
                            {group.icon} {group.potName}
                          </div>
                        )}
                        {group.rows.map((s,i)=>{
                          const col = CATS[s.cat1]?.color || '#888'
                          return (
                            <div key={i} style={{display:'flex',justifyContent:'space-between',
                              alignItems:'center',padding:'3px 0',
                              borderBottom:i<group.rows.length-1?'1px solid var(--border2)':'none'}}>
                              <span style={{fontSize:11,fontWeight:600,color:col}}>{s.cat1} › {s.cat2||'—'}</span>
                              <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text2)',marginLeft:12}}>€ {fmtIT(s.amount,2)}</span>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                    <button onClick={()=>setMixCatOpen(false)}
                      style={{marginTop:8,width:'100%',padding:'4px',fontSize:11,
                        background:'none',border:'1px solid var(--border)',borderRadius:6,
                        cursor:'pointer',color:'var(--text3)'}}>Chiudi</button>
                  </div>
                )}
              </div>
            </td>
          )
          return (
            <td key={id} className="tx-cat">
              <div className='cat-dropdown-portal' style={{position:'relative',display:'inline-block'}}>
                <CatPill pillRef={pillRef} cat1={tx.cat1} cat2={tx.cat2} mixCats={tx.mixCats} onClick={()=>setCatOpen(!catOpen)}/>
                {catOpen && <CatDropdown txId={tx.txId} cat1={tx.cat1} cat2={tx.cat2} tx={tx}
                  onClose={()=>setCatOpen(false)} anchorRef={pillRef}
                  onOpenMix={()=>setMixCatOpen(true)}/>}
              </div>
              {mixCatOpen && <MixCatModal tx={tx} onClose={()=>setMixCatOpen(false)}/>}
            </td>
          )
        }
        if(id==='conf') return (
          <td key={id} style={{padding:'4px 8px',textAlign:'right',fontSize:11,color:'var(--text3)'}}>
            {tx.conf ? `${tx.conf}%` : '—'}
          </td>
        )
        if(id==='isBonifico') return (
          <td key={id} style={{padding:'4px 8px',textAlign:'center',fontSize:11}}>
            {tx.isBonifico ? '🔵' : ''}
          </td>
        )
        if(id==='amount') return (
          <td key={id} className={'tx-amount'+amtClass} style={{position:'relative'}}>
            {tx._compensatedAmt>0 ? (
              <>
                <span
                  style={{color:'var(--gold)',cursor:'pointer'}}
                  title="Importo rettificato — clicca per dettaglio"
                  onClick={e=>{e.stopPropagation();setAmtPopup(v=>!v)}}>
                  {fmtIT(Math.abs(tx.amount) - tx._compensatedAmt, 2)}<span style={{fontSize:9,marginLeft:2}}>*</span>
                </span>
                {amtPopup && (
                  <div onClick={e=>e.stopPropagation()} style={{
                    position:'absolute',right:0,top:'100%',zIndex:999,
                    background:'var(--surface)',border:'1px solid var(--border)',
                    borderRadius:10,padding:'12px 16px',minWidth:220,
                    boxShadow:'0 8px 24px rgba(0,0,0,.18)',fontSize:13,whiteSpace:'nowrap'}}>
                    <div style={{fontWeight:700,marginBottom:8,fontSize:12,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Importo rettificato</div>
                    <div style={{display:'flex',justifyContent:'space-between',gap:16,marginBottom:4}}>
                      <span style={{color:'var(--text2)'}}>Originale</span>
                      <span style={{fontWeight:600,color:'var(--text1)'}}>{fmtIT(Math.abs(tx.amount),2)} €</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',gap:16,marginBottom:4}}>
                      <span style={{color:'var(--text2)'}}>{compensatedLabel}</span>
                      <span style={{fontWeight:600,color:'var(--gold)'}}>− {fmtIT(tx._compensatedAmt,2)} €</span>
                    </div>
                    <div style={{borderTop:'1px solid var(--border)',marginTop:8,paddingTop:8,display:'flex',justifyContent:'space-between',gap:16}}>
                      <span style={{color:'var(--text2)'}}>Netto</span>
                      <span style={{fontWeight:700,color:'var(--text1)'}}>{fmtIT(Math.abs(tx.amount)-tx._compensatedAmt,2)} €</span>
                    </div>
                    <button onClick={()=>setAmtPopup(false)} style={{marginTop:10,width:'100%',padding:'5px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface2)',cursor:'pointer',fontSize:12,color:'var(--text2)'}}>Chiudi</button>
                  </div>
                )}
              </>
            ) : fmtIT(Math.abs(tx.amount), 2)}
          </td>
        )
        return null
      })}
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────
// ── Merge transactions modal ──────────────────────────────
function MergeTransactionsModal({ txs, onClose }) {
  const addTransactions   = useStore(s => s.addTransactions)
  const deleteTransaction = useStore(s => s.deleteTransaction)
  const customCats        = useStore(s => s.customCats)
  const catDefs           = getMergedCats(customCats)

  // ── Smart defaults ──────────────────────────────────────
  function mostCommon(arr) {
    const freq = {}
    arr.forEach(v => { if (v) freq[v] = (freq[v] || 0) + 1 })
    return Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0] || null
  }

  const totalAmount = txs.reduce((s, t) => s + t.amount, 0)
  // Use most common cat1; tiebreak by highest absolute amount
  const byAmt       = [...txs].sort((a,b) => Math.abs(b.amount) - Math.abs(a.amount))
  const defaultCat1 = mostCommon(txs.map(t=>t.cat1)) || byAmt[0]?.cat1 || ''
  const defaultCat2 = mostCommon(txs.filter(t=>t.cat1===defaultCat1).map(t=>t.cat2)) || ''
  const defaultCity = txs.map(t=>t.city).find(c=>c) || ''
  const defaultAcct = mostCommon(txs.map(t=>t.account)) || byAmt[0]?.account || ''
  const defaultDate = txs.map(t=>t.date).filter(Boolean).sort().reverse()[0] || new Date().toISOString().slice(0,10)

  const [descAI, setDescAI] = useState('')
  const [cat1,   setCat1]   = useState(defaultCat1)
  const [cat2,   setCat2]   = useState(defaultCat2)
  const [city,   setCity]   = useState(defaultCity)
  const [account,setAccount]= useState(defaultAcct)
  const [date,   setDate]   = useState(defaultDate)
  const [done,   setDone]   = useState(false)

  const subCats = catDefs[cat1]?.sub || []

  function doMerge() {
    if (!descAI.trim()) return
    const newTxId = 'merged-' + Date.now().toString(36).toUpperCase()
    addTransactions([{
      txId:        newTxId,
      date,
      amount:      Math.round(totalAmount * 100) / 100,
      description: txs.map(t => t.description).join(' | '),
      descAI:      descAI.trim(),
      cat1, cat2,
      city,
      account,
      merchant:    mostCommon(txs.map(t=>t.merchant).filter(Boolean)) || '',
      conf:        99,
      aiEnriched:  true,
      userEditedCat:  true,
      userEditedDesc: true,
      _mergedFrom: txs.map(t => t.txId),
    }])
    txs.forEach(t => deleteTransaction(t.txId))
    setDone(true)
    setTimeout(onClose, 1000)
  }

  const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:6,
    fontSize:13, background:'var(--surface)', color:'var(--text)', outline:'none', fontFamily:'var(--font-sans)' }
  const lbl = { fontSize:11, fontWeight:700, color:'var(--text3)', marginBottom:4, display:'block', textTransform:'uppercase', letterSpacing:'.05em' }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',borderRadius:16,padding:28,width:'100%',maxWidth:560,
        boxShadow:'0 20px 60px rgba(0,0,0,.25)',display:'flex',flexDirection:'column',gap:18,maxHeight:'90vh',overflowY:'auto'}}>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:18,fontWeight:700}}>🔗 Unisci transazioni</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{txs.length} transazioni → 1 nuova</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text3)',padding:4}}>✕</button>
        </div>

        {/* Source transactions */}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {txs.map(t => (
            <div key={t.txId} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'8px 12px',background:'var(--surface2)',borderRadius:8,border:'1px solid var(--border)'}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.descAI||t.description}</div>
                <div style={{fontSize:10,color:'var(--text3)'}}>{t._effDate||t.date} · {t.cat1}{t.cat2?` › ${t.cat2}`:''} · {t.account}</div>
              </div>
              <div style={{fontSize:14,fontWeight:800,fontFamily:'var(--font-mono)',
                color:t.amount>=0?'var(--green)':'var(--red)',marginLeft:12,flexShrink:0}}>
                {t.amount>=0?'+':'−'}€ {fmtIT(Math.abs(t.amount),2)}
              </div>
            </div>
          ))}
        </div>

        {/* Result preview */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',
          background: totalAmount>=0?'rgba(50,180,100,.1)':'rgba(220,50,50,.08)',
          border:`1px solid ${totalAmount>=0?'rgba(50,180,100,.25)':'rgba(220,50,50,.2)'}`,borderRadius:8}}>
          <span style={{fontSize:13,fontWeight:600,color:'var(--text3)'}}>Totale unificato</span>
          <span style={{fontSize:18,fontWeight:900,fontFamily:'var(--font-mono)',
            color:totalAmount>=0?'var(--green)':'var(--red)'}}>
            {totalAmount>=0?'+':'−'}€ {fmtIT(Math.abs(totalAmount),2)}
          </span>
        </div>

        {/* Form */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div>
            <label style={lbl}>Descrizione AI *</label>
            <input value={descAI} onChange={e=>setDescAI(e.target.value)} autoFocus
              placeholder="Scrivi la descrizione della transazione unificata…" style={inp}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <label style={lbl}>Categoria</label>
              <select value={cat1} onChange={e=>{setCat1(e.target.value);setCat2('')}} style={inp}>
                {Object.keys(catDefs).map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sotto-categoria</label>
              <select value={cat2} onChange={e=>setCat2(e.target.value)} style={inp} disabled={!subCats.length}>
                <option value="">— nessuna —</option>
                {subCats.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Data</label>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Conto</label>
              <input value={account} onChange={e=>setAccount(e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Città</label>
              <input value={city} onChange={e=>setCity(e.target.value)} style={inp}/>
            </div>
          </div>
        </div>

        <div style={{fontSize:11,color:'var(--text3)',padding:'8px 10px',background:'var(--surface2)',borderRadius:6}}>
          ⚠️ Le {txs.length} transazioni originali verranno eliminate e sostituite dalla nuova transazione.
        </div>

        {done ? (
          <div style={{textAlign:'center',padding:'12px',color:'var(--green)',fontWeight:700,fontSize:14}}>✅ Transazioni unite!</div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <button onClick={onClose}
              style={{padding:'10px',borderRadius:8,border:'1px solid var(--border)',background:'none',cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:13}}>
              Annulla
            </button>
            <button onClick={doMerge} disabled={!descAI.trim()}
              style={{padding:'10px',borderRadius:8,border:'none',
                background:descAI.trim()?'var(--accent)':'var(--border)',
                color:descAI.trim()?'#fff':'var(--text3)',cursor:descAI.trim()?'pointer':'not-allowed',
                fontFamily:'var(--font-sans)',fontSize:13,fontWeight:700}}>
              🔗 Unisci
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  const store = useStore()
  const { updateTransaction, deleteTransaction } = store
  const txUndoStack  = useStore(s => s.txUndoStack)
  const undoLastTx   = useStore(s => s.undoLastTx)
  const { user, householdId } = useAuth()
  // Admin = chi ha creato l'household (householdId = 'hh_<uid>')
  const isAdmin = householdId === `hh_${user?.uid}`

  const [importOpen,     setImportOpen]     = useState(false)
  const [addManualOpen,  setAddManualOpen]  = useState(false)
  const [enriching,      setEnriching]      = useState(false)
  const [reenriching,    setReenriching]    = useState(false)
  const [enrichingSelected, setEnrichingSelected] = useState(false)
  const [aiCodePrompt,   setAiCodePrompt]   = useState(null) // null | 'enrich' | 'reenrich' | 'selected'
  const [aiCodeInput,    setAiCodeInput]    = useState('')
  const [aiCodeError,    setAiCodeError]    = useState(false)
  const appPrefs_tx = useStore(s => s.appPrefs)
  function checkAiCode(then) {
    const code = appPrefs_tx?.aiEnrichCode || ''
    if (!code || aiCodeInput.trim() === code) { then(); setAiCodePrompt(null); setAiCodeInput('') }
    else { setAiCodeError(true); setTimeout(() => setAiCodeError(false), 800) }
  }
  const [enrichSingleTx, setEnrichSingleTx] = useState(null)
  const [feedbackTx,     setFeedbackTx]     = useState(null)
  const [selected,       setSelected]       = useState(new Set())
  const [mergeTxOpen,    setMergeTxOpen]    = useState(false)
  const [bulkEditOpen,   setBulkEditOpen]   = useState(false)
  const [openCatTxId,    setOpenCatTxId]    = useState(null)
  const [showRegDate,    setShowRegDate]    = useState(false)
  const [colsOpen,       setColsOpen]       = useState(false)
  const [visibleCols,    setVisibleCols]    = useState(() => DEFAULT_VISIBLE)
  const [colOrder,       setColOrder]       = useState(() => DEFAULT_ORDER)
  const [sortKey,        setSortKey]        = useState('date')
  const [sortDir,        setSortDir]        = useState('desc')
  const [colFilters,     setColFilters]     = useState({})
  const [filterPopup,    setFilterPopup]    = useState(null)
  const [hideComm,       setHideComm]       = useState(true)
  const [hideSmall,      setHideSmall]      = useState(true)
  const [filterNoCat2,   setFilterNoCat2]   = useState(false)

  // Close cat dropdown on click outside
  useEffect(() => {
    function handleClick(e) {
      if (!e.target.closest('.cat-pill') && !e.target.closest('.cat-dropdown-portal')) {
        setOpenCatTxId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filters = store.filters || {}
  const customCats = store.customCats || {}
  const userAccounts = useStore(s => s.userAccounts)
  const allCatNames = getMergedCatNames(customCats)

  // Filter transactions
  const filtered = useMemo(() => {
    let txs = store.transactions.filter(t => !t.excluded)
    if (filters.search) {
      const s = filters.search.toLowerCase()
      txs = txs.filter(t =>
        (t.description||'').toLowerCase().includes(s) ||
        (t.descAI||'').toLowerCase().includes(s) ||
        (t.merchant||'').toLowerCase().includes(s) ||
        (t.counterpart||'').toLowerCase().includes(s) ||
        (t.city||'').toLowerCase().includes(s) ||
        (t.txId||'').toLowerCase().includes(s)
      )
    }
    if (filters.type === 'Income')  txs = txs.filter(t => t.amount > 0)
    if (filters.type === 'Expense') txs = txs.filter(t => t.amount < 0)
    if (filters.cat1) txs = txs.filter(t => t.cat1 === filters.cat1)
    if (filters.dateFrom) txs = txs.filter(t => (t._effDate||(t._effDate||t.date||'')) >= filters.dateFrom)
    if (filters.dateTo)   txs = txs.filter(t => (t._effDate||(t._effDate||t.date||'')) <= filters.dateTo)
    if (filters.conf === 'low') txs = txs.filter(t => (t.conf||0) < 70)
    if (filters.flagged)        txs = txs.filter(t => !!t._flagged)
    if ((filters.accounts||[]).length > 0) txs = txs.filter(t => filters.accounts.includes(t.account))
    if (hideComm)  txs = txs.filter(t => {
      const c2 = (t.cat2 || '').toLowerCase()
      if (t.descAI === 'Commissioni') return false
      if (c2.includes('commissioni') || c2 === 'commissione banca') return false
      return true
    })
    if (hideSmall) txs = txs.filter(t => {
      if (Math.abs(t.amount) < 1) return false
      return true
    })
    if (filterNoCat2) txs = txs.filter(t => t.cat1 && t.cat1 !== 'Non Categorizzato' && !t.cat2)
    // Column filters (Excel-style)
    Object.entries(colFilters).forEach(([colId, vals]) => {
      if (!vals || vals.length === 0) return
      if (colId === 'cat') {
        // Support both L1-only ("Casa") and L1›L2 ("Casa › Utenze") selection
        txs = txs.filter(t => vals.some(val => {
          if (val.includes(' › ')) return `${t.cat1||''} › ${t.cat2||''}` === val
          return (t.cat1||'') === val
        }))
      } else {
        const valSet = new Set(vals)
        txs = txs.filter(t => valSet.has(getColValueStr(t, colId, userAccounts)))
      }
    })
    // Sort
    txs = [...txs].sort((a,b) => {
      const av = a[sortKey]||'', bv = b[sortKey]||''
      if (sortKey==='amount') return sortDir==='asc' ? a.amount-b.amount : b.amount-a.amount
      return sortDir==='asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return txs
  }, [store.transactions, filters, sortKey, sortDir, colFilters, userAccounts, hideComm, hideSmall, filterNoCat2])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d==='asc'?'desc':'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  function sortIcon(key) {
    if (sortKey !== key) return null
    return <span style={{fontSize:9,marginLeft:2}}>{sortDir==='asc'?'▲':'▼'}</span>
  }

  function openColFilter(colId, e) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const allVals = store.transactions
      .filter(t => !t.excluded)
      .map(t => getColValueStr(t, colId, userAccounts))
      .filter(v => v !== '—')
    let uniqueVals = [...new Set(allVals)].sort()
    if (colId === 'cat') {
      // Add L1-only values so user can filter "all of Casa" or drill to "Casa › Utenze"
      const l1s = [...new Set(store.transactions.filter(t=>!t.excluded&&t.cat1).map(t=>t.cat1))].sort()
      // L1s first, then full L1›L2 combos
      uniqueVals = [...l1s, ...uniqueVals.filter(v => v.includes(' › '))]
    }
    setFilterPopup({ colId, rect, values: uniqueVals, selected: new Set(colFilters[colId] || []) })
  }

  function applyColFilter(colId, selected) {
    setColFilters(f => {
      const next = { ...f }
      if (selected.size === 0) delete next[colId]
      else next[colId] = [...selected]
      return next
    })
    setFilterPopup(null)
  }

  const unenriched = store.transactions.filter(t=>!t.excluded&&!t.aiEnriched).length
  const enriched   = store.transactions.filter(t=>!t.excluded&&t.aiEnriched).length
  const hasFilters = filters.search||filters.cat1||filters.type||filters.dateFrom||filters.dateTo||filters.conf||(filters.accounts||[]).length>0

  return (
    <>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,margin:0,display:'flex',alignItems:'center',gap:8}}>🏦 Transazioni</h1>
          <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{filtered.length} di {store.transactions.filter(t=>!t.excluded).length} transazioni</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* Enriched counter */}
          {enriched > 0 && (
            <button style={{padding:'5px 10px',borderRadius:6,border:'1px solid var(--green)',background:'var(--green-l)',color:'var(--green)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)'}}
              onClick={()=>{const ids=new Set(store.transactions.filter(t=>t.aiEnriched).map(t=>t.txId));setSelected(ids)}}>
              ✓ {enriched} arricchite
            </button>
          )}
          {/* AI Enrichment */}
          {(appPrefs_tx?.aiEnrichEnabled !== false) && (
            <button className="btn btn-secondary"
              style={{background:'var(--gold-l)',borderColor:'var(--gold)',color:'var(--gold)',fontWeight:700,
                opacity: unenriched > 0 ? 1 : 0.45}}
              onClick={()=>{setAiCodeInput('');setAiCodeError(false);setAiCodePrompt('enrich')}}
              title={unenriched === 0 ? 'Tutte le transazioni sono già elaborate' : `${unenriched} transazioni da elaborare`}>
              ✨ AI {unenriched > 0 ? `(${unenriched})` : ''}
            </button>
          )}
          {/* Re-enrich */}
          {(appPrefs_tx?.aiEnrichEnabled !== false) && (
            <button className="btn btn-ghost" style={{fontSize:12,color:'var(--text3)'}}
              title="Forza ri-processamento AI su tutte le transazioni"
              onClick={()=>{setAiCodeInput('');setAiCodeError(false);setAiCodePrompt('reenrich')}}>
              🔄 Re-enrich
            </button>
          )}
          {/* Edit colonne */}
          <button className="btn btn-ghost" style={{fontSize:12,border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px'}}
            onClick={()=>setColsOpen(true)}>
            ⚙️ Colonne
          </button>
          {/* Data toggle */}
          <div style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer'}} onClick={()=>setShowRegDate(v=>!v)}>
            <span style={{fontSize:12,color:'var(--text3)'}}>📅 {showRegDate ? 'Data Reg.' : 'Data Valuta'}</span>
            <div style={{width:36,height:20,borderRadius:10,background:showRegDate?'var(--accent)':'var(--border)',position:'relative',transition:'background .2s',flexShrink:0}}>
              <div style={{position:'absolute',top:2,left:showRegDate?16:2,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
            </div>
          </div>
          {/* Undo button */}
          {txUndoStack.length > 0 && (
            <button
              onClick={undoLastTx}
              title={`Annulla: ${txUndoStack[txUndoStack.length-1]?.label || 'ultima operazione'}`}
              style={{display:'inline-flex',alignItems:'center',gap:5,
                padding:'5px 11px',borderRadius:6,border:'1px solid var(--border)',
                background:'var(--surface)',color:'var(--text2)',cursor:'pointer',
                fontSize:12,fontWeight:600,fontFamily:'var(--font-sans)',
                transition:'background .15s'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
              onMouseLeave={e=>e.currentTarget.style.background='var(--surface)'}>
              ↩ Annulla
              <span style={{fontSize:10,opacity:.6,maxWidth:120,overflow:'hidden',
                textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {txUndoStack[txUndoStack.length-1]?.label || ''}
              </span>
            </button>
          )}
          <button className="btn btn-secondary" onClick={()=>setAddManualOpen(true)}><Plus size={14}/> Aggiungi</button>
          <button className="btn btn-primary" onClick={()=>setImportOpen(true)}><Upload size={14}/> Importa CSV</button>
        </div>
      </div>


      {/* Uncategorized alert banner */}
      {(() => {
        const uncatCount = store.transactions.filter(t => !t.excluded && t.cat1 === 'Non Categorizzato').length
        if (!uncatCount) return null
        return (
          <div style={{
            margin:'0 0 16px',padding:'12px 16px',
            background:'#fff8f0',border:'1px solid #f59e0b',borderRadius:10,
            display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'
          }}>
            <div style={{flex:1,fontSize:13,fontWeight:600,color:'#92400e'}}>
              ⚠️ {uncatCount} transazion{uncatCount===1?'e':'i'} senza categoria
            </div>
            <button onClick={()=>{ store.setFilter('cat1','Non Categorizzato'); store._recomputeFiltered() }}
              style={{padding:'5px 14px',borderRadius:7,border:'none',cursor:'pointer',
                background:'#f59e0b',color:'#fff',fontSize:12,fontWeight:700,
                fontFamily:'var(--font-sans)'}}>
              Mostra
            </button>
          </div>
        )
      })()}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{display:'flex',gap:8,alignItems:'center',padding:'10px 14px',background:'var(--accent-l)',borderRadius:'var(--radius-sm)',marginBottom:12,flexWrap:'wrap'}}>
          <span style={{fontSize:13,fontWeight:600,color:'var(--accent)'}}>{selected.size} selezionate</span>
          {(appPrefs_tx?.aiEnrichEnabled !== false) && (
            <button className="btn btn-ghost" style={{fontSize:12,color:'var(--gold)',fontWeight:700,border:'1px solid var(--gold)',borderRadius:6,padding:'4px 10px'}}
              onClick={()=>{setAiCodeInput('');setAiCodeError(false);setAiCodePrompt('selected')}}>
              ✨ AI Enrichment ({selected.size})
            </button>
          )}
          <button className="btn btn-ghost" style={{fontSize:12,color:'var(--accent)',border:'1px solid var(--accent)',borderRadius:6,padding:'4px 10px',fontWeight:700}}
            onClick={()=>setBulkEditOpen(true)}>
            ✏️ Modifica Multipla
          </button>
          <button className="btn btn-ghost" style={{fontSize:12,color:'var(--text3)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px'}}
            onClick={()=>{const txList=store.transactions.filter(t=>selected.has(t.txId));if(txList.length===1)setFeedbackTx(txList[0])}}>
            💬 Feedback
          </button>
          <button className="btn btn-ghost" style={{fontSize:12,color:'var(--red)',border:'1px solid var(--red)',borderRadius:6,padding:'4px 10px'}}
            onClick={()=>{selected.forEach(id=>store.updateTransaction(id,{excluded:true}));setSelected(new Set())}}>
            🚫 Escludi
          </button>
          <button className="btn btn-ghost" style={{fontSize:12,color:'var(--green)',border:'1px solid var(--green)',borderRadius:6,padding:'4px 10px'}}
            onClick={()=>{selected.forEach(id=>{const t=store.transactions.find(x=>x.txId===id);if(t?.excluded)store.updateTransaction(id,{excluded:false})});setSelected(new Set())}}>
            ↩ Ripristina
          </button>
          {selected.size >= 2 && selected.size <= 3 && (
            <button className="btn btn-ghost" style={{fontSize:12,color:'var(--accent)',border:'1px solid var(--accent)',borderRadius:6,padding:'4px 10px',fontWeight:700}}
              onClick={()=>setMergeTxOpen(true)}>
              🔗 Unisci ({selected.size})
            </button>
          )}
          <button className="btn btn-ghost" style={{fontSize:12,color:'#d97706',border:'1px solid #d97706',borderRadius:6,padding:'4px 10px'}}
            onClick={()=>{
              const anyFlagged = store.transactions.filter(t=>selected.has(t.txId)).some(t=>t._flagged)
              selected.forEach(id=>store.updateTransaction(id,{_flagged: !anyFlagged}))
              setSelected(new Set())
            }}>
            🚩 To review
          </button>
          <button className="btn btn-ghost" style={{fontSize:12,color:'var(--red)'}}
            onClick={()=>{if(confirm(`Eliminare ${selected.size} transazioni?`)){selected.forEach(id=>store.deleteTransaction(id));setSelected(new Set())}}}>
            🗑 Elimina
          </button>
          <button className="btn btn-ghost" style={{fontSize:12,marginLeft:'auto'}} onClick={()=>setSelected(new Set())}>✕ Deseleziona</button>
        </div>
      )}

      {bulkEditOpen && (
        <BulkEditModal
          txIds={selected}
          onClose={() => { setBulkEditOpen(false); setSelected(new Set()) }}
        />
      )}

      {mergeTxOpen && selected.size >= 2 && selected.size <= 3 && (
        <MergeTransactionsModal
          txs={store.transactions.filter(t => selected.has(t.txId))}
          onClose={()=>{ setMergeTxOpen(false); setSelected(new Set()) }}
        />
      )}

      <div style={{position:'sticky',top:0,zIndex:10,background:'var(--bg)',paddingBottom:8,marginBottom:0}}>
        <KPIBar txs={filtered}/>
        <QuickFilters transactions={store.transactions} hideComm={hideComm} setHideComm={setHideComm} hideSmall={hideSmall} setHideSmall={setHideSmall} filterNoCat2={filterNoCat2} setFilterNoCat2={setFilterNoCat2} selected={selected}/>
        <FilterBar/>
      </div>

      {Object.keys(colFilters).length > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 12px',
          background:'var(--accent-l)',borderRadius:'var(--radius-sm)',marginBottom:8,
          border:'1px solid var(--accent)',fontSize:12}}>
          <span style={{color:'var(--accent)',fontWeight:600}}>
            🔍 {Object.keys(colFilters).length} {Object.keys(colFilters).length===1?'colonna filtrata':'colonne filtrate'}
          </span>
          <button onClick={()=>setColFilters({})}
            style={{border:'none',background:'transparent',color:'var(--accent)',cursor:'pointer',
              fontSize:12,textDecoration:'underline',padding:0,fontFamily:'var(--font-sans)'}}>
            Rimuovi
          </button>
        </div>
      )}

      <div className="card tx-table-wrap" style={{padding:0}}>
        {filtered.length===0 ? (
          <div className="tx-no-results">
            Nessuna transazione corrisponde ai filtri.
            <button className="btn btn-ghost" onClick={()=>store.resetFilters()}>
              Rimuovi filtri
            </button>
          </div>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th className="tx-th" style={{width:32,textAlign:'center'}}>
                  <input type="checkbox" style={{cursor:'pointer'}}
                    checked={filtered.length>0 && filtered.every(t=>selected.has(t.txId))}
                    onChange={e=>setSelected(e.target.checked?new Set(filtered.map(t=>t.txId)):new Set())}/>
                </th>
                <th className="tx-th" style={{width:50,cursor:'pointer'}} onClick={()=>toggleSort('txId')}>Cod. {sortIcon('txId')}</th>
                {(colOrder||DEFAULT_ORDER).filter(id=>visibleCols.has(id)||ALL_COLUMNS.find(c=>c.id===id)?.alwaysOn).map(id=>{
                  const filterBtn = (colId) => (
                    <button onClick={e=>openColFilter(colId,e)} style={{
                      border:'none',background:'transparent',cursor:'pointer',padding:'0 2px',
                      color:colFilters[colId]?.length>0?'var(--accent)':'var(--text3)',
                      fontSize:9,lineHeight:1,verticalAlign:'middle',
                    }}>{colFilters[colId]?.length>0?'▼':'▽'}</button>
                  )
                  if(id==='date')        return <th key={id} className="tx-th" style={{width:80,cursor:'pointer'}} onClick={()=>toggleSort('date')}>Data {sortIcon('date')}{filterBtn('date')}</th>
                  if(id==='emoji')       return <th key={id} className="tx-th" style={{width:28,textAlign:'center',padding:'0 2px'}} title="Emoji categoria L2">😀</th>
                  if(id==='descAI')      return <th key={id} className="tx-th" style={{minWidth:140,cursor:'pointer'}} onClick={()=>toggleSort('descAI')}>AI Descrizione {sortIcon('descAI')}{filterBtn('descAI')}</th>
                  if(id==='description') return <th key={id} className="tx-th" style={{minWidth:140}}>Desc. Originale</th>
                  if(id==='counterpart') return <th key={id} className="tx-th" style={{minWidth:100}}>Controparte{filterBtn('counterpart')}</th>
                  if(id==='merchant')    return <th key={id} className="tx-th" style={{minWidth:100}}>Merchant{filterBtn('merchant')}</th>
                  if(id==='note')        return <th key={id} className="tx-th" style={{width:36,textAlign:'center',padding:'0 4px'}}>📝</th>
                  if(id==='city')        return <th key={id} className="tx-th" style={{width:90}}>Città{filterBtn('city')}</th>
                  if(id==='time')        return <th key={id} className="tx-th" style={{width:60}}>Ora</th>
                  if(id==='card')        return <th key={id} className="tx-th" style={{width:70}}>Carta{filterBtn('card')}</th>
                  if(id==='user')        return <th key={id} className="tx-th" style={{width:65}}>Utente{filterBtn('user')}</th>
                  if(id==='cat')         return <th key={id} className="tx-th" style={{cursor:'pointer'}} onClick={()=>toggleSort('cat1')}>Categoria {sortIcon('cat1')}{filterBtn('cat')}</th>
                  if(id==='conf')        return <th key={id} className="tx-th" style={{width:55,textAlign:'right'}}>Conf%</th>
                  if(id==='isBonifico')  return <th key={id} className="tx-th" style={{width:40,textAlign:'center'}}>Bon.{filterBtn('isBonifico')}</th>
                  if(id==='amount')      return <th key={id} className="tx-th" style={{textAlign:'right',width:120,cursor:'pointer'}} onClick={()=>toggleSort('amount')}>Importo (€) {sortIcon('amount')}</th>
                  return null
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx=>(
                <TxRow key={tx.txId} tx={tx}
                  selected={selected} setSelected={setSelected}
                  setFeedbackTx={setFeedbackTx}
                  openCatTxId={openCatTxId} setOpenCatTxId={setOpenCatTxId}
                  showRegDate={showRegDate}
                  setEnrichSingleTx={setEnrichSingleTx}
                  visibleCols={visibleCols}
                  colOrder={colOrder}
                />
              ))}
            </tbody>
          </table>
        )}
        {filtered.some(t => t._compensatedAmt > 0) && (
          <div style={{fontSize:11,color:'var(--gold)',padding:'8px 14px',background:'rgba(200,160,0,.05)',borderTop:'1px solid var(--border)',textAlign:'right'}}>
            * Importo rettificato — transazione compensata (clicca sull'importo per dettaglio)
          </div>
        )}
      </div>

      {importOpen      && <ImportModal onClose={()=>setImportOpen(false)}/>}
      {addManualOpen   && <AddManualTxModal onClose={()=>setAddManualOpen(false)}/>}
      {feedbackTx      && <AiFeedbackModal tx={feedbackTx} onClose={()=>setFeedbackTx(null)}/>}
      {colsOpen        && <EditColonneModal visibleCols={visibleCols} colOrder={colOrder} onApply={(cols,order)=>{setVisibleCols(cols);setColOrder(order)}} onClose={()=>setColsOpen(false)}/>}
      {enriching       && <AiEnrichmentOverlay transactions={store.transactions} onDone={()=>setEnriching(false)}/>}
      {reenriching     && <AiEnrichmentOverlay forceAll={true} transactions={store.transactions} onDone={()=>setReenriching(false)}/>}
      {enrichingSelected && <AiEnrichmentOverlay forceAll={true} transactions={store.transactions.filter(t=>selected.has(t.txId))} onDone={()=>{setEnrichingSelected(false);setSelected(new Set())}}/>}

      {/* ── AI Code Prompt ── */}
      {aiCodePrompt && (
        <div onClick={e=>e.target===e.currentTarget&&setAiCodePrompt(null)}
          style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.4)',
            display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--surface)',borderRadius:16,padding:'28px 32px',width:340,
            boxShadow:'0 20px 60px rgba(0,0,0,.3)',textAlign:'center'}}>
            <div style={{fontSize:28,marginBottom:8}}>✨</div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Codice di conferma</div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:16}}>
              Inserisci il codice per avviare AI Enrichment
            </div>
            <input
              autoFocus
              type="password"
              value={aiCodeInput}
              onChange={e=>{setAiCodeInput(e.target.value);setAiCodeError(false)}}
              onKeyDown={e=>{if(e.key==='Enter')checkAiCode(()=>{
                if(aiCodePrompt==='enrich') setEnriching(true)
                else if(aiCodePrompt==='reenrich') setReenriching(true)
                else if(aiCodePrompt==='selected') setEnrichingSelected(true)
              })}}
              placeholder="Codice..."
              style={{width:'100%',boxSizing:'border-box',padding:'10px 14px',
                borderRadius:8,border:`1.5px solid ${aiCodeError?'var(--red)':'var(--border)'}`,
                background:'var(--surface2)',color:'var(--text)',fontSize:15,
                fontFamily:'var(--font-mono)',outline:'none',textAlign:'center',
                transition:'border-color .2s',marginBottom:12,
                animation: aiCodeError ? 'shake .3s' : 'none'}}
            />
            {aiCodeError && <div style={{fontSize:11,color:'var(--red)',marginBottom:8}}>Codice errato</div>}
            <div style={{display:'flex',gap:8,justifyContent:'center'}}>
              <button className="btn btn-secondary" onClick={()=>setAiCodePrompt(null)}>Annulla</button>
              <button className="btn btn-primary"
                style={{background:'var(--gold)',borderColor:'var(--gold)'}}
                onClick={()=>checkAiCode(()=>{
                  if(aiCodePrompt==='enrich') setEnriching(true)
                  else if(aiCodePrompt==='reenrich') setReenriching(true)
                  else if(aiCodePrompt==='selected') setEnrichingSelected(true)
                })}>
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
      {enrichSingleTx  && <AiEnrichmentOverlay forceAll={true} transactions={[enrichSingleTx]} onDone={()=>setEnrichSingleTx(null)}/>}
      {filterPopup && (
        <>
          <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setFilterPopup(null)}/>
          <ColFilterPopup popup={filterPopup} onApply={applyColFilter} onClose={()=>setFilterPopup(null)}/>
        </>
      )}
    </>
  )
}
