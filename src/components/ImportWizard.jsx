import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { getMergedCats } from '../data/categories'
import { fmtIT } from '../utils/format'
import { showToast } from '../services/notifications'
import { isCompensated, compensateGroup } from '../data/compensation'
import ImportModal from './ImportModal'
import CompDaConfermare, { findCompPairs } from './CompDaConfermare'
import { PaypalImportModal, applyPaypalImport, isPayPal } from '../pages/PaypalPage'
import { RuleApplyPopup, autoDetectMatch, txMatchesRule, parseRuleText, learnException } from '../pages/TransactionsPage'
import { navigateRef } from '../utils/navigate'

// ═══════════════════════════════════════════════════════════════════════════
// Wizard di importazione unificata (richiesta utente 2026-07-11, punto 12).
// Obiettivo: un unico flusso mensile ("il 20 del mese apro e faccio tutto") che
// concatena import multipli (conto corrente, carte di credito, PayPal), le
// schermate di rifinitura post-import e le compensazioni, chiudendo con un
// riepilogo — invece di girare per l'app tra mille sheet.
//
// NESSUNA logica nuova di abbinamento: si riusano i motori esistenti —
// ImportModal (pipeline CSV→salva→[riconcilia carta]→AI Gemini→Regole, con la
// sua schermata di progresso), PaypalImportModal+applyPaypalImport (import
// screenshot/PDF/incolla + auto-match), compensateGroup/findCompPairs
// (compensazioni PayPal/Carte/Altre Entrate), RuleApplyPopup (creazione regole
// dalle tabelle di rifinitura, identica allo sheet Transazioni).
// ═══════════════════════════════════════════════════════════════════════════

const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function fmtDate(d) {
  const m = (d||'').match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${String(m[3]).padStart(2,'0')} ${MONTHS[parseInt(m[2])-1]} ${m[1].slice(2)}` : (d||'—')
}
const noDesc = t => { const d = (t.descAI||'').trim(); return !d || d === '-' || d === '—' }

const SEL_STYLE = {
  width:'100%', padding:'4px 6px', borderRadius:5, border:'1px solid var(--border)',
  fontSize:11, background:'var(--surface)', color:'var(--text)', outline:'none', cursor:'pointer',
  fontFamily:'var(--font-sans)',
}

// ── Riga editabile delle tabelle di rifinitura ─────────────────────────────
// Colonne = sheet Transazioni MENO Ora/Carta/Utente/Codice (richiesta esplicita).
// Comportamento allineato allo sheet Transazioni: modifica descAI → flag
// userEditedDesc + learnException + popup RuleApplyPopup per creare una regola;
// modifica categoria → flag userEditedCat.
function WizardRow({ t, allCats, updateTransaction, onOpenRulePopup }) {
  const [descVal, setDescVal] = useState(t.descAI || '')
  const [cityVal, setCityVal] = useState(t.city || '')
  useEffect(() => { setDescVal(t.descAI || '') }, [t.descAI])
  useEffect(() => { setCityVal(t.city || '') }, [t.city])

  function commitDesc() {
    const v = descVal.trim()
    if (v === (t.descAI || '')) return
    updateTransaction(t.txId, { descAI: v || null, userEditedDesc: true, aiEnriched: true })
    learnException(t, v)
    if (v) onOpenRulePopup({ tx: t, match: autoDetectMatch(t), newDesc: v })
  }
  function commitCity() {
    const v = cityVal.trim()
    if (v !== (t.city || '')) updateTransaction(t.txId, { city: v || null, cityUserEdited: true })
  }

  const cat2Options = allCats[t.cat1]?.sub || []
  const inputStyle = {
    width:'100%',padding:'4px 6px',borderRadius:5,border:'1px solid transparent',
    background:'transparent',fontSize:12,color:'var(--text)',outline:'none',
    fontFamily:'var(--font-sans)',boxSizing:'border-box',
  }

  return (
    <tr style={{borderBottom:'1px solid var(--border)'}}>
      <td style={{padding:'8px 10px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
        {fmtDate(t._effDate||t.date)}
      </td>
      <td style={{padding:'4px 8px',minWidth:150}}>
        <input value={descVal} onChange={e=>setDescVal(e.target.value)} onBlur={commitDesc}
          onKeyDown={e=>{ if (e.key==='Enter') e.target.blur() }} placeholder="✨ —"
          style={{...inputStyle,fontWeight:600}}
          onFocus={e=>{e.target.style.border='1px solid var(--accent)'; e.target.style.background='var(--surface)'}}
          onBlurCapture={e=>{e.target.style.border='1px solid transparent'; e.target.style.background='transparent'}}/>
      </td>
      <td style={{padding:'8px 10px',fontSize:11,color:'var(--text3)',maxWidth:220,overflow:'hidden',
        textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t.description||''}>
        {(t.description||'').slice(0,70)}
      </td>
      <td style={{padding:'4px 8px',minWidth:130}}>
        <select value={t.cat1||''} style={SEL_STYLE}
          onChange={e=>updateTransaction(t.txId,{cat1:e.target.value,cat2:'',userEditedCat:true})}>
          <option value="">—</option>
          {Object.keys(allCats).map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={{padding:'4px 8px',minWidth:120}}>
        <select value={t.cat2||''} disabled={!cat2Options.length} style={SEL_STYLE}
          onChange={e=>updateTransaction(t.txId,{cat2:e.target.value,userEditedCat:true})}>
          <option value="">—</option>
          {cat2Options.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{padding:'4px 8px',minWidth:90}}>
        <input value={cityVal} onChange={e=>setCityVal(e.target.value)} onBlur={commitCity}
          onKeyDown={e=>{ if (e.key==='Enter') e.target.blur() }} placeholder="—"
          style={inputStyle}
          onFocus={e=>{e.target.style.border='1px solid var(--accent)'; e.target.style.background='var(--surface)'}}
          onBlurCapture={e=>{e.target.style.border='1px solid transparent'; e.target.style.background='transparent'}}/>
      </td>
      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,
        fontWeight:700,color:t.amount>=0?'var(--green)':'var(--red)',whiteSpace:'nowrap'}}>
        {t.amount>=0?'+':'−'}€ {fmtIT(Math.abs(t.amount),2)}
      </td>
      <td style={{padding:'4px 8px'}}>
        <button title="Crea una regola da questa transazione"
          onClick={()=>onOpenRulePopup({ tx: t, match: autoDetectMatch(t), newDesc: t.descAI || '' })}
          style={{border:'1px solid var(--border)',background:'var(--surface)',borderRadius:6,
            fontSize:11,padding:'3px 8px',cursor:'pointer',color:'var(--text3)',fontFamily:'var(--font-sans)'}}>
          ✚ Regola
        </button>
      </td>
    </tr>
  )
}

function RefineTable({ txs, allCats, updateTransaction, onOpenRulePopup, emptyMsg }) {
  if (!txs.length) return (
    <div style={{padding:'36px 20px',textAlign:'center',color:'var(--green)',fontSize:14,fontWeight:600}}>
      ✅ {emptyMsg}
    </div>
  )
  return (
    <div style={{overflow:'auto',maxHeight:'52vh',border:'1px solid var(--border)',borderRadius:10}}>
      <table style={{width:'100%',borderCollapse:'collapse',minWidth:860}}>
        <thead>
          <tr>
            {['Data','✨ AI Descrizione','Descrizione','Categoria','Sottocategoria','Città','Importo',''].map((h,i)=>(
              <th key={i} style={{padding:'8px 10px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left',
                whiteSpace:'nowrap',position:'sticky',top:0,zIndex:1}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {txs.map(t => (
            <WizardRow key={t.txId} t={t} allCats={allCats}
              updateTransaction={updateTransaction} onOpenRulePopup={onOpenRulePopup}/>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Pannello Altre Entrate (compensazioni, punto d2) ───────────────────────
// Elenca le Altre Entrate non ancora abbinate e, quando esiste una spesa con
// importo IDENTICO, propone l'abbinamento (conferma → compensateGroup, lo stesso
// motore condiviso). Gli altri abbinamenti restano manuali nello sheet Altre Entrate.
function AltreEntratePanel() {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const appPrefs          = useStore(s => s.appPrefs)

  const nicknames = useMemo(() => {
    const nicks = []
    if (appPrefs?.ownerNickname) nicks.push(appPrefs.ownerNickname)
    ;(appPrefs?.family || []).forEach(m => { if (m.nickname) nicks.push(m.nickname) })
    return nicks.map(n => n.toLowerCase())
  }, [appPrefs])

  // Stessi criteri della card "Altre Entrate non abbinate" di Accuracy
  const aeIncomes = useMemo(() => {
    const compLinks = appPrefs?.compLinks || {}
    const EXCL_L2 = ['satispay', 'stipendio', ...nicknames]
    return transactions.filter(t =>
      t.amount > 0 && !t.excluded && !t._forcedBalance &&
      (t.cat1 === 'Entrate' || t.cat2 === 'Prestiti') &&
      !EXCL_L2.includes((t.cat2 || '').toLowerCase()) &&
      !compLinks[t.txId] && !isCompensated(t)
    )
  }, [transactions, appPrefs, nicknames])

  // Suggerimenti solo per importo IDENTICO (findCompPairs condiviso: al centesimo,
  // rimborso mai precedente alla spesa) contro tutte le spese non compensate
  const suggestions = useMemo(() => {
    const expenses = transactions.filter(t => t.amount < 0 && !t.excluded && !isCompensated(t))
    return findCompPairs([...aeIncomes, ...expenses], {})
  }, [transactions, aeIncomes])

  function confirmPair(p) {
    const result = compensateGroup([p.exp, p.inc], updateTransaction)
    if (result.ok) showToast('✅ Abbinata e compensata', 'success')
    else showToast('Impossibile compensare (residuo non disponibile?)', 'error')
  }

  const suggestedIncIds = new Set(suggestions.map(p => p.inc.txId))

  return (
    <div style={{border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>💸 Altre Entrate</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
        {aeIncomes.length === 0
          ? 'Nessuna entrata da abbinare. ✅'
          : `${aeIncomes.length} entrat${aeIncomes.length===1?'a':'e'} non abbinat${aeIncomes.length===1?'a':'e'} — ${suggestions.length} con una spesa di importo identico (suggerite qui sotto); le altre si abbinano dallo sheet Altre Entrate.`}
      </div>
      {suggestions.map(p => (
        <div key={`${p.exp.txId}|${p.inc.txId}`}
          style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,
            background:'var(--surface2)',marginBottom:6,flexWrap:'wrap'}}>
          <span style={{fontSize:12,flex:1,minWidth:220}}>
            <strong style={{color:'var(--green)'}}>+€ {fmtIT(p.inc.amount,2)}</strong> {p.inc.descAI||p.inc.description?.slice(0,30)} ({fmtDate(p.inc._effDate||p.inc.date)})
            {' '}↔ <strong style={{color:'var(--red)'}}>−€ {fmtIT(Math.abs(p.exp.amount),2)}</strong> {p.exp.descAI||p.exp.description?.slice(0,30)} ({fmtDate(p.exp._effDate||p.exp.date)})
          </span>
          <button onClick={()=>confirmPair(p)}
            style={{padding:'5px 12px',background:'#16a34a',color:'#fff',border:'none',borderRadius:7,
              fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
            ✅ Abbina
          </button>
        </div>
      ))}
      {aeIncomes.filter(t => !suggestedIncIds.has(t.txId)).slice(0,8).map(t => (
        <div key={t.txId} style={{display:'flex',gap:10,padding:'5px 10px',fontSize:12,color:'var(--text2)'}}>
          <span style={{fontFamily:'var(--font-mono)',color:'var(--text3)'}}>{fmtDate(t._effDate||t.date)}</span>
          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.descAI||t.description?.slice(0,50)}</span>
          <span style={{fontWeight:700,color:'var(--green)'}}>+€ {fmtIT(t.amount,2)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Pannello Satispay (compensazioni, punto d1) ─────────────────────────────
// Il motore Satispay (auto-abbinamento accantonamenti per fondo + modale "Da
// confermare" accrediti/spese) vive dentro lo sheet Satispay con la configurazione
// dei fondi: qui il wizard mostra lo stato (quanti abbinamenti in attesa) e porta
// direttamente là, senza duplicare quella logica.
function SatispayPanel({ onNavigate }) {
  const transactions = useStore(s => s.transactions)
  const appPrefs     = useStore(s => s.appPrefs)
  const satiMatches  = appPrefs?.satiMatches || {}
  const txIds        = useMemo(() => new Set(transactions.map(t => t.txId)), [transactions])
  const pendingCount = Object.entries(satiMatches)
    .filter(([txId, m]) => m.status === 'pending_approval' && txIds.has(txId)).length

  return (
    <div style={{border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>💚 Satispay</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
        Auto-abbinamento accantonamenti e conferma accrediti/spese si gestiscono nello sheet Satispay
        (serve la configurazione dei fondi).
        {pendingCount > 0
          ? ` Ci sono ${pendingCount} abbinament${pendingCount===1?'o':'i'} in attesa di conferma.`
          : ' Nessun abbinamento in attesa. ✅'}
      </div>
      <button onClick={onNavigate}
        style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--accent)',background:'transparent',
          color:'var(--accent)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
        {pendingCount > 0 ? `⏳ Apri Satispay (${pendingCount} da confermare)` : 'Apri Satispay'}
      </button>
    </div>
  )
}

// ═══════════════════════════════ WIZARD ═════════════════════════════════════
export default function ImportWizard({ onClose }) {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats        = useStore(s => s.customCats)
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const allCats           = useMemo(() => getMergedCats(customCats), [customCats])
  const apiKey            = appPrefs?.geminiKey || localStorage.getItem('fm-gemini-key') || ''

  const [sources, setSources] = useState({ conto: true, carta: false, paypal: false })
  const [queue,   setQueue]   = useState(null)   // null = schermata di selezione
  const [stepIdx, setStepIdx] = useState(0)
  const [results, setResults] = useState({})     // { conto: {...}, carta: {...}, paypal: {...} }
  const [rulePopup, setRulePopup] = useState(null) // { tx, match, newDesc }
  // setResults è asincrono: quando PaypalImportModal chiama onImport e SUBITO DOPO
  // onClose (doImport), lo state non è ancora aggiornato — il ref sì.
  const ppImportedRef = useRef(false)

  function buildQueue() {
    const q = []
    if (sources.conto) q.push({ id:'import', src:'conto' },
      { id:'refine', src:'conto', kind:'l2' }, { id:'refine', src:'conto', kind:'desc' }, { id:'refine', src:'conto', kind:'ai' })
    if (sources.carta) q.push({ id:'import', src:'carta' },
      { id:'refine', src:'carta', kind:'l2' }, { id:'refine', src:'carta', kind:'desc' }, { id:'refine', src:'carta', kind:'ai' })
    if (sources.paypal) q.push({ id:'import', src:'paypal' }, { id:'paypal-result' })
    q.push({ id:'compensazioni' }, { id:'summary' })
    return q
  }

  const step = queue ? queue[stepIdx] : null
  function next() { setStepIdx(i => Math.min(i + 1, (queue?.length || 1) - 1)) }

  // Salta le schermate di rifinitura di una sorgente il cui import è stato
  // annullato/chiuso senza salvare nulla
  function skipSource(src) {
    setStepIdx(i => {
      let j = i + 1
      while (queue[j] && ((queue[j].src === src) || (src === 'paypal' && queue[j].id === 'paypal-result'))) j++
      return j
    })
  }

  // Transazioni importate di una sorgente, fresche dallo store
  function importedTxs(src) {
    const ids = new Set(results[src]?.savedTxIds || [])
    return transactions.filter(t => ids.has(t.txId) && !t.excluded)
  }
  function refineRows(src, kind) {
    const txs = importedTxs(src)
    if (kind === 'l2')   return txs.filter(t => (!t.cat1 || t.cat1 === 'Non Categorizzato' || !t.cat2) && t.cat1 !== 'Entrate')
    if (kind === 'desc') return txs.filter(noDesc)
    // 'ai': categorizzate dall'AI senza che nessuna regola sia scattata, e non toccate a mano
    const ruleIds = new Set(results[src]?.ruleAppliedIds || [])
    return txs.filter(t => t.cat1 && t.cat1 !== 'Non Categorizzato' && t.aiCategorized && !ruleIds.has(t.txId) && !t.userEditedCat)
  }

  // Gestione regola dal popup (stessa semantica di handleApplyRule dello sheet Transazioni)
  function handleApplyRule(mode, ruleText, cat1, cat2, updateDescAI = true, parsedMatch = null) {
    if (mode === 'none' || !rulePopup) { setRulePopup(null); return }
    const { tx, match, newDesc } = rulePopup
    const effectiveMatch = parsedMatch || parseRuleText(ruleText, match)
    const existingRules = useStore.getState()?.appPrefs?.aiNamingRules || []
    setAppPref('aiNamingRules', [...existingRules, {
      id: `nr-${Date.now()}`,
      matchField: effectiveMatch.field,
      matchValue: effectiveMatch.value,
      matchLabel: ruleText || `${effectiveMatch.label} includes "${effectiveMatch.value}"`,
      description: newDesc,
      enabled: true,
      createdAt: new Date().toISOString(),
    }])
    const targets = transactions.filter(t => {
      if (t.txId === tx.txId || t.excluded) return false
      if (!txMatchesRule(t, effectiveMatch)) return false
      if (mode === 'future') return (t._effDate||t.date||'') >= (tx._effDate||tx.date||'')
      return true
    })
    useStore.getState()?.beginTxUndoBatch?.()
    targets.forEach(t => {
      const patch = {}
      if (updateDescAI && newDesc) { patch.descAI = newDesc; patch.userEditedDesc = true }
      if (cat1) { patch.cat1 = cat1; if (cat2) patch.cat2 = cat2 }
      if (Object.keys(patch).length) updateTransaction(t.txId, patch)
    })
    useStore.getState()?.commitTxUndoBatch?.(`Regola "${newDesc}" su ${targets.length + 1} tx`)
    setRulePopup(null)
  }

  // ── Riepilogo finale ──────────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!queue || queue[stepIdx]?.id !== 'summary') return null
    const allIds = [...(results.conto?.savedTxIds||[]), ...(results.carta?.savedTxIds||[])]
    const idSet  = new Set(allIds)
    const imported = transactions.filter(t => idSet.has(t.txId))
    const pp = results.paypal || null
    const paypalTxs = transactions.filter(isPayPal)
    const cardTxs   = transactions.filter(t => !t.excluded && t.cardImportCard4)
    const rejected  = appPrefs?.compRejectedPairs || {}
    return {
      imported: allIds.length,
      rulesApplied: (results.conto?.rulesAppliedCount||0) + (results.carta?.rulesAppliedCount||0),
      dupes: (results.conto?.dupes||0) + (results.carta?.dupes||0),
      noCat: imported.filter(t => !t.cat1 || t.cat1 === 'Non Categorizzato').length,
      noL2: imported.filter(t => !t.cat2 && t.cat1 !== 'Entrate').length,
      noDesc: imported.filter(noDesc).length,
      ppAdded: pp?.added || 0, ppMatched: pp?.matchedNew || 0,
      ppPending: pp?.pendingNew || 0, ppUnmatched: pp?.unmatchedNew || 0,
      compPaypal: findCompPairs(paypalTxs, rejected.paypal || {}).length,
      compCarte:  findCompPairs(cardTxs,   rejected.carte  || {}).length,
    }
  }, [queue, stepIdx, results, transactions, appPrefs])

  // ── UI ────────────────────────────────────────────────────────────────────
  const SRC_LABEL = { conto: '🏦 Conto corrente', carta: '💳 Carte di credito', paypal: '🅿️ PayPal' }
  const KIND_LABEL = {
    l2:   { title: 'Transazioni senza categoria L2', empty: 'Tutte le transazioni importate hanno la categoria completa.' },
    desc: { title: 'Transazioni senza AI Description', empty: 'Tutte le transazioni importate hanno una descrizione.' },
    ai:   { title: 'Categorizzate dall’AI (nessuna regola applicata) — verifica', empty: 'Nessuna transazione categorizzata solo dall’AI da verificare.' },
  }

  // Chip di avanzamento in testa al wizard
  function StepChips() {
    if (!queue) return null
    const labels = []
    const seen = new Set()
    queue.forEach(s => {
      const key = s.id === 'refine' ? `rifinisci-${s.src}` : s.id === 'import' ? `import-${s.src}` : s.id
      if (seen.has(key)) return
      seen.add(key)
      labels.push({ key, label:
        s.id === 'import' ? SRC_LABEL[s.src]
        : s.id === 'refine' ? `🔍 Rifinisci ${s.src}`
        : s.id === 'paypal-result' ? '💙 Esito PayPal'
        : s.id === 'compensazioni' ? '🔗 Compensazioni'
        : '🏁 Riepilogo' })
    })
    const curKey = step.id === 'refine' ? `rifinisci-${step.src}` : step.id === 'import' ? `import-${step.src}` : step.id
    return (
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
        {labels.map(l => (
          <span key={l.key} style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:12,
            border:`1px solid ${l.key===curKey?'var(--accent)':'var(--border)'}`,
            background:l.key===curKey?'var(--accent-l)':'var(--surface2)',
            color:l.key===curKey?'var(--accent)':'var(--text3)'}}>{l.label}</span>
        ))}
      </div>
    )
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.55)',backdropFilter:'blur(3px)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={e => e.target === e.currentTarget && !queue && onClose()}>
      <div style={{background:'var(--surface)',borderRadius:16,padding:'24px 28px',width:'100%',maxWidth:980,
        maxHeight:'92vh',overflowY:'auto',position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
        <button onClick={onClose} title="Chiudi il wizard"
          style={{position:'absolute',top:14,right:16,background:'none',border:'none',cursor:'pointer',
            fontSize:18,color:'var(--text3)'}}>✕</button>

        <div style={{fontSize:18,fontWeight:800,marginBottom:2}}>📥 Importa</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:16}}>
          Import unificato: conto, carte e PayPal in un unico flusso guidato, con rifinitura e compensazioni.
        </div>

        {/* ── Selezione sorgenti ── */}
        {!queue && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,marginBottom:18}}>
              {[
                ['conto',  '🏦 Conto corrente', 'File CSV/Excel del conto (UniCredit, Fineco, …)'],
                ['carta',  '💳 Carte di credito', 'CSV/Excel della carta, con riconciliazione mensile estratti'],
                ['paypal', '🅿️ PayPal', 'Screenshot, PDF o incolla (⌘V) — abbinamento automatico'],
              ].map(([key,label,sub]) => (
                <label key={key} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'14px 16px',
                  borderRadius:12,cursor:'pointer',
                  border:`2px solid ${sources[key]?'var(--accent)':'var(--border)'}`,
                  background:sources[key]?'var(--accent-l)':'var(--surface2)'}}>
                  <input type="checkbox" checked={sources[key]}
                    onChange={()=>setSources(s=>({...s,[key]:!s[key]}))} style={{marginTop:2,cursor:'pointer'}}/>
                  <span>
                    <span style={{fontSize:14,fontWeight:700,display:'block'}}>{label}</span>
                    <span style={{fontSize:11,color:'var(--text3)'}}>{sub}</span>
                  </span>
                </label>
              ))}
            </div>
            <button disabled={!sources.conto && !sources.carta && !sources.paypal}
              className="btn btn-primary" style={{fontSize:14,padding:'9px 26px',fontWeight:700}}
              onClick={()=>{ setQueue(buildQueue()); setStepIdx(0) }}>
              Avvia importazione →
            </button>
          </>
        )}

        {queue && step && <StepChips/>}

        {/* ── Import conto/carta: riusa ImportModal (pipeline completa) ── */}
        {step && step.id === 'import' && step.src !== 'paypal' && (
          <>
            <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>{SRC_LABEL[step.src]}</div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:8}}>
              Si apre il modulo di importazione — al termine (CSV → Salvataggio → AI Gemini → Regole) il wizard
              prosegue da solo con le schermate di rifinitura. Chiudendo il modulo la sorgente viene saltata.
            </div>
            <ImportModal
              accountFilter={step.src}
              onClose={()=>skipSource(step.src)}
              onFlowDone={res => { setResults(r => ({ ...r, [step.src]: res })); next() }}
            />
          </>
        )}

        {/* ── Import PayPal: riusa PaypalImportModal ── */}
        {step && step.id === 'import' && step.src === 'paypal' && (
          <PaypalImportModal
            onClose={()=>{
              // se non è stato importato niente, salta anche la schermata esito
              setStepIdx(i => ppImportedRef.current ? i + 1 : i + 2)
            }}
            onImport={(items)=>{
              const res = applyPaypalImport(items, { paypalImports: appPrefs?.paypalImports || [], transactions, updateTransaction, setAppPref })
              setResults(r => ({ ...r, paypal: res }))
              ppImportedRef.current = true
            }}
            transactions={transactions}
            apiKey={apiKey}
            paypalImports={appPrefs?.paypalImports || []}
          />
        )}

        {/* ── Rifinitura (a/b): 3 schermate per sorgente ── */}
        {step && step.id === 'refine' && (
          <>
            <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>
              {SRC_LABEL[step.src]} — {KIND_LABEL[step.kind].title}
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
              Modifica direttamente i campi (come nello sheet Transazioni): la descrizione AI apre il popup per
              creare una regola, le categorie si cambiano dalle tendine, ✚ Regola crea una regola dalla riga.
            </div>
            <RefineTable
              txs={refineRows(step.src, step.kind)}
              allCats={allCats}
              updateTransaction={updateTransaction}
              onOpenRulePopup={setRulePopup}
              emptyMsg={KIND_LABEL[step.kind].empty}
            />
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}>
              <button className="btn btn-primary" style={{fontSize:13,padding:'8px 22px',fontWeight:700}} onClick={next}>
                Avanti →
              </button>
            </div>
          </>
        )}

        {/* ── Esito PayPal (c) ── */}
        {step && step.id === 'paypal-result' && (() => {
          const pp = results.paypal
          const unmatched = (appPrefs?.paypalImports || []).filter(i => i.status === 'unmatched')
          return (
            <>
              <div style={{fontSize:15,fontWeight:700,marginBottom:10}}>💙 Esito import PayPal</div>
              {pp ? (
                <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:14}}>
                  {[['Importate', pp.added, 'var(--accent)'],
                    ['Abbinate automaticamente', pp.matchedNew, 'var(--green)'],
                    ['Da approvare', pp.pendingNew, 'var(--gold)'],
                    ['Non abbinate', pp.unmatchedNew, 'var(--red)']].map(([l,v,c]) => (
                    <div key={l} style={{padding:'10px 16px',border:'1px solid var(--border)',borderRadius:10,minWidth:120}}>
                      <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)'}}>{l}</div>
                      <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : <div style={{fontSize:13,color:'var(--text3)',marginBottom:12}}>Nessun import PayPal effettuato.</div>}
              {unmatched.length > 0 && (
                <>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>Operazioni PayPal non abbinate ({unmatched.length})</div>
                  <div style={{maxHeight:'34vh',overflow:'auto',border:'1px solid var(--border)',borderRadius:10,marginBottom:12}}>
                    {unmatched.map(i => (
                      <div key={i.id} style={{display:'flex',gap:10,padding:'7px 12px',fontSize:12,borderBottom:'1px solid var(--border)'}}>
                        <span style={{fontFamily:'var(--font-mono)',color:'var(--text3)',flexShrink:0}}>{fmtDate(i.date)}</span>
                        <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.merchant}</span>
                        <span style={{fontWeight:700,fontFamily:'var(--font-mono)'}}>€ {fmtIT(Math.abs(i.amount),2)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>
                    Si abbinano manualmente dallo sheet PayPal (bottone "Non abbinate").
                  </div>
                </>
              )}
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button className="btn btn-primary" style={{fontSize:13,padding:'8px 22px',fontWeight:700}} onClick={next}>
                  Avanti →
                </button>
              </div>
            </>
          )
        })()}

        {/* ── Compensazioni (d) ── */}
        {step && step.id === 'compensazioni' && (
          <>
            <div style={{fontSize:15,fontWeight:700,marginBottom:10}}>🔗 Compensazioni</div>
            <SatispayPanel onNavigate={()=>{ navigateRef.current?.('satispay'); onClose() }}/>
            <AltreEntratePanel/>
            <div style={{border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>💙 PayPal &nbsp;·&nbsp; 💳 Carte</div>
              <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
                Coppie spesa/rimborso con lo stesso importo, da confermare una alla volta
                (identico alla modalità "Da confermare" di Satispay). Se non compare nessun
                bottone, non c'è niente da abbinare. ✅
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                <CompDaConfermare txs={transactions.filter(isPayPal)} scope="paypal" incomeLabel="📥 Rimborso PayPal"/>
                <CompDaConfermare txs={transactions.filter(t => !t.excluded && t.cardImportCard4)} scope="carte" incomeLabel="📥 Rimborso carta"/>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button className="btn btn-primary" style={{fontSize:13,padding:'8px 22px',fontWeight:700}} onClick={next}>
                Avanti →
              </button>
            </div>
          </>
        )}

        {/* ── Riepilogo finale (e) ── */}
        {step && step.id === 'summary' && summary && (
          <>
            <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>🏁 Riepilogo importazione</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:16}}>
              {[
                ['📄 Transazioni importate', summary.imported, 'var(--accent)'],
                ['🧩 Regole applicate', summary.rulesApplied, 'var(--accent)'],
                ['🔁 Doppioni scartati', summary.dupes, 'var(--text2)'],
                ['🏷️ Ancora senza categoria', summary.noCat, summary.noCat>0?'var(--red)':'var(--green)'],
                ['🏷️ Senza sottocategoria L2', summary.noL2, summary.noL2>0?'var(--gold)':'var(--green)'],
                ['✍️ Senza AI Description', summary.noDesc, summary.noDesc>0?'var(--gold)':'var(--green)'],
                ...(results.paypal ? [
                  ['💙 PayPal importate', summary.ppAdded, 'var(--accent)'],
                  ['💙 Abbinate auto', summary.ppMatched, 'var(--green)'],
                  ['💙 Da approvare', summary.ppPending, summary.ppPending>0?'var(--gold)':'var(--green)'],
                  ['💙 Non abbinate', summary.ppUnmatched, summary.ppUnmatched>0?'var(--red)':'var(--green)'],
                ] : []),
                ['🔗 Compensazioni PayPal in sospeso', summary.compPaypal, summary.compPaypal>0?'var(--gold)':'var(--green)'],
                ['🔗 Compensazioni Carte in sospeso', summary.compCarte, summary.compCarte>0?'var(--gold)':'var(--green)'],
              ].map(([l,v,c]) => (
                <div key={l} style={{padding:'12px 14px',border:'1px solid var(--border)',borderRadius:10}}>
                  <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:4}}>{l}</div>
                  <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:16}}>
              Ciò che richiede ancora un intervento si ritrova in: Accuracy (KPI qualità), Transazioni
              (filtro Non Categorizzato), PayPal/Carte (⏳ Da confermare), Satispay e Altre Entrate.
            </div>
            <button className="btn btn-primary" style={{fontSize:14,padding:'9px 26px',fontWeight:700}} onClick={onClose}>
              ✅ Fine
            </button>
          </>
        )}

        {/* Popup regola (identico allo sheet Transazioni) */}
        {rulePopup && (
          <RuleApplyPopup
            tx={rulePopup.tx}
            match={rulePopup.match}
            newDesc={rulePopup.newDesc}
            txId={rulePopup.tx.txId}
            txDate={rulePopup.tx._effDate || rulePopup.tx.date}
            onApply={handleApplyRule}
            onClose={()=>setRulePopup(null)}
          />
        )}
      </div>
    </div>
  )
}
