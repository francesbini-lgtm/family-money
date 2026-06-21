import { useState } from 'react'
import { CAT_NAMES, CATS } from '../data/categories'
import { useStore } from '../store/useStore'

// ── Bulk re-apply button ──────────────────────────────────────
function BulkApplyButton() {
  const bulkApplyRules = useStore(s => s.bulkApplyRules)
  const transactions   = useStore(s => s.transactions)
  const [state,    setState]    = useState('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result,   setResult]   = useState(null)

  async function run() {
    if (state === 'running') return
    if (!confirm(`Rieseguire tutte le regole su ${transactions.length} transazioni?`)) return
    setState('running'); setResult(null)
    try {
      const res = await bulkApplyRules((done, total) => setProgress({ done, total }))
      setResult(res); setState('done')
    } catch (e) { console.error(e); setState('error') }
    setTimeout(() => setState('idle'), 8000)
  }

  const pct = progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0

  return (
    <div style={{padding:'16px 18px',background:'var(--surface)',border:'1.5px solid var(--accent)',borderRadius:'var(--radius)',marginBottom:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>🔄 Riesegui regole su tutto il DB</div>
          <div style={{fontSize:12,color:'var(--text3)',lineHeight:1.5}}>
            Applica tutte le regole attive (multi-condizione, categorizzazione, regole di sistema) a ogni transazione.
          </div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={state==='running'} style={{flexShrink:0,minWidth:130}}>
          {state==='running' ? `⏳ ${pct}%` : '🔄 Esegui ora'}
        </button>
      </div>
      {state==='running' && (
        <div style={{marginTop:10}}>
          <div style={{height:4,background:'var(--surface2)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',background:'var(--accent)',borderRadius:2,transition:'width .1s',width:`${pct}%`}}/>
          </div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{progress.done} / {progress.total} analizzate…</div>
        </div>
      )}
      {state==='done' && result && (
        <div style={{marginTop:10,padding:'8px 12px',background:'rgba(50,180,100,.1)',border:'1px solid rgba(50,180,100,.2)',borderRadius:6,fontSize:13}}>
          ✅ <strong>{result.updated}</strong> transazioni aggiornate su {result.total}
        </div>
      )}
      {state==='error' && (
        <div style={{marginTop:10,padding:'8px 12px',background:'var(--red-l)',borderRadius:6,fontSize:13,color:'var(--red)'}}>
          ❌ Errore. Controlla la console.
        </div>
      )}
    </div>
  )
}

// ── Hardcoded system rules ────────────────────────────────────
// Add new entries here when a rule is hardcoded; add matching case in useStore scanSystemRule/fixSystemRule
const SYSTEM_RULES = [
  {
    id: 'sys-entrate',
    icon: '💰',
    label: 'Importo positivo → L1 = Entrate',
    description: 'Se amount > 0 e cat1 è impostata ma non "Entrate", forza cat1 = "Entrate" e svuota cat2.',
    file: 'TransactionsPage.jsx (step 3) + useStore.js bulkApplyRules (step 4)',
    violationLabel: tx => `${tx._effDate||tx.date} — ${(tx.description||'').slice(0,50)} → cat1="${tx.cat1}"`,
  },
]

// ── Scan/fix panel for a single system rule ──────────────────
function ScanSystemRuleCard({ rule }) {
  const scanSystemRule = useStore(s => s.scanSystemRule)
  const fixSystemRule  = useStore(s => s.fixSystemRule)

  const [phase,     setPhase]     = useState('idle')  // idle | scanning | found | fixing | done
  const [victims,   setVictims]   = useState([])
  const [progress,  setProgress]  = useState({done:0,total:0})
  const [fixResult, setFixResult] = useState(null)

  function scan() {
    setPhase('scanning')
    setTimeout(() => {
      const found = scanSystemRule(rule.id)
      setVictims(found)
      setPhase('found')
    }, 30)
  }

  async function fix() {
    setPhase('fixing')
    try {
      const res = await fixSystemRule(rule.id, (done, total) => setProgress({done, total}))
      setFixResult(res)
      setPhase('done')
    } catch(e) { console.error(e); setPhase('found') }
  }

  const pct = progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0

  return (
    <div style={{padding:'10px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
      {/* Rule header */}
      <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
        <span style={{fontSize:20,flexShrink:0}}>{rule.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600}}>{rule.label}</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:2,lineHeight:1.5}}>{rule.description}</div>
          <div style={{fontSize:10,color:'var(--text3)',marginTop:3,fontFamily:'var(--font-mono)',opacity:.7}}>📁 {rule.file}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
          <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,fontWeight:700,
            background:'rgba(50,180,100,.1)',color:'var(--green)',border:'1px solid rgba(50,180,100,.25)'}}>
            ✓ Attiva
          </span>
          {phase === 'idle' && (
            <button onClick={scan} title="Scansiona DB per violazioni"
              style={{background:'none',border:'1px solid var(--border)',borderRadius:5,cursor:'pointer',
                fontSize:11,padding:'3px 8px',color:'var(--text3)',display:'flex',alignItems:'center',gap:4}}>
              ▶ Scan
            </button>
          )}
          {phase === 'scanning' && <span style={{fontSize:11,color:'var(--text3)'}}>⏳ Scansione…</span>}
        </div>
      </div>

      {/* Scan results panel */}
      {phase === 'found' && (
        <div style={{marginTop:10,padding:'10px 12px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8}}>
          {victims.length === 0 ? (
            <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--green)'}}>
              ✅ Nessuna violazione trovata.
              <button onClick={()=>setPhase('idle')} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--text3)',textDecoration:'underline'}}>chiudi</button>
            </div>
          ) : (
            <>
              <div style={{fontSize:12,fontWeight:700,color:'#b87000',marginBottom:6}}>
                ⚠️ {victims.length} transazioni violano questa regola
              </div>
              <div style={{maxHeight:120,overflowY:'auto',marginBottom:10}}>
                {victims.slice(0,8).map(tx => (
                  <div key={tx.txId} style={{fontSize:11,color:'var(--text3)',padding:'1px 0',fontFamily:'var(--font-mono)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {rule.violationLabel(tx)}
                  </div>
                ))}
                {victims.length > 8 && <div style={{fontSize:11,color:'var(--text3)',fontStyle:'italic'}}>…e altre {victims.length - 8}</div>}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary" style={{fontSize:12}} onClick={fix}>
                  🔧 Applica correzione ({victims.length})
                </button>
                <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>setPhase('idle')}>Annulla</button>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'fixing' && (
        <div style={{marginTop:10,padding:'10px 12px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8}}>
          <div style={{fontSize:12,color:'var(--accent)',marginBottom:6}}>⏳ Correzione in corso… {pct}%</div>
          <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',background:'var(--accent)',width:pct+'%',transition:'width .1s'}}/>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div style={{marginTop:10,padding:'8px 12px',background:'rgba(50,180,100,.08)',border:'1px solid rgba(50,180,100,.2)',borderRadius:8,
          display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
          <span style={{fontSize:12,color:'var(--green)'}}>✅ Corrette {fixResult?.updated || 0} transazioni</span>
          <button onClick={()=>setPhase('idle')} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--text3)',textDecoration:'underline'}}>chiudi</button>
        </div>
      )}
    </div>
  )
}

function HardcodedRulesSection() {
  const [prompt,  setPrompt]  = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  async function generate() {
    if (!prompt.trim()) return
    setLoading(true); setResult(null); setError(null)
    try {
      const key = localStorage.getItem('fm-gemini-key') || 'proxy'
      const existingRules = SYSTEM_RULES.map(r => '- ' + r.label + ': ' + r.description).join('\n')
      const userRequest   = prompt.trim().replace(/"/g, "'")

      const geminiPrompt = [
        'Sei un assistente per un app React di finanza personale chiamata Family Money.',
        'Linterfaccia ha regole di sistema hardcoded nel codice JavaScript che si applicano dopo tutte le regole utente.',
        '',
        'Regole di sistema esistenti:',
        existingRules,
        '',
        'Ogni transazione ha questi campi: txId, description, amount (number, positivo=entrata), date YYYY-MM-DD, cat1, cat2, descAI, merchant, excluded.',
        '',
        'La regola viene applicata in DUE punti del codice:',
        '1. TransactionsPage.jsx dopo le regole utente (oggetto t)',
        '2. useStore.js in bulkApplyRules step 4 (oggetto tx, patch)',
        '',
        'Nuova regola richiesta: ' + userRequest,
        '',
        'Rispondi SOLO con JSON valido senza markdown, con questi campi:',
        'label (stringa breve), description (max 30 parole italiano), conditionExplanation (italiano), codeEnrichment (JS snippet per TransactionsPage), codeBulkApply (JS snippet per useStore), systemRulesEntry (oggetto JS per array SYSTEM_RULES)',
      ].join('\n')

      const res = await fetch('http://localhost:3001/gemini', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt: geminiPrompt, key })
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      let text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
        .replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim()
      setResult(JSON.parse(text))
    } catch(e) {
      setError('Errore: ' + e.message + '. Assicurati che il proxy Gemini sia avviato.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{marginBottom:28}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>🔒 Regole di sistema</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
        Hardcoded nel codice — sempre attive, non modificabili dall'UI.
      </div>

      {/* Existing rules list */}
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
        {SYSTEM_RULES.map(r => <ScanSystemRuleCard key={r.id} rule={r}/>)}
      </div>

      {/* AI generator */}
      <div style={{padding:'14px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>✨ Genera nuova regola di sistema con AI</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
          Descrivi la regola in italiano — l'AI genererà il codice da aggiungere manualmente nei file giusti.
        </div>
        <div style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:8}}>
          <textarea
            value={prompt}
            onChange={e=>{setPrompt(e.target.value);setResult(null)}}
            placeholder="Es: se importo negativo e cat1=Entrate correggi a Non Categorizzato"
            rows={3}
            style={{flex:1,padding:'9px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',
              fontSize:12,lineHeight:1.5,background:'var(--surface)',color:'var(--text)',
              outline:'none',fontFamily:'var(--font-sans)',resize:'vertical'}}
          />
          <button className="btn btn-primary" onClick={generate} disabled={loading||!prompt.trim()} style={{flexShrink:0,minWidth:100,fontSize:12}}>
            {loading ? '⏳ AI…' : '✨ Genera'}
          </button>
        </div>
        {error && <div style={{padding:'8px 12px',background:'var(--red-l)',borderRadius:6,fontSize:12,color:'var(--red)'}}>{error}</div>}

        {result && (
          <div style={{marginTop:8,padding:'12px 14px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>🔧 {result.label}</div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>{result.conditionExplanation}</div>

            {[
              ['1. Aggiungi a SYSTEM_RULES in AiRulesTab.jsx', result.systemRulesEntry],
              ['2. TransactionsPage.jsx — dopo step 3 system rule', result.codeEnrichment],
              ['3. useStore.js — bulkApplyRules dopo step 4', result.codeBulkApply],
            ].map(([label, code]) => code && (
              <div key={label} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>{label}</div>
                <pre style={{margin:0,padding:'8px 10px',background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:6,fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text)',
                  overflowX:'auto',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                  {code}
                </pre>
              </div>
            ))}
            <div style={{fontSize:11,color:'var(--text3)',marginTop:4,fontStyle:'italic'}}>
              ⚠️ Aggiungi manualmente nei file indicati e riavvia il dev server.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────
const TEXT_OPS   = [{v:'contains',l:'contiene'},{v:'not_contains',l:'non contiene'},{v:'starts_with',l:'inizia con'},{v:'ends_with',l:'finisce con'},{v:'equals',l:'uguale a'}]
const AMOUNT_OPS = [{v:'gt',l:'>'},{v:'gte',l:'≥'},{v:'lt',l:'<'},{v:'lte',l:'≤'},{v:'equals',l:'='}]
const fieldOps   = f => f === 'importo' ? AMOUNT_OPS : TEXT_OPS

const ruleCode   = i => `R${String(i+1).padStart(3,'0')}`

const condLabel  = c => {
  const ops = {contains:'contiene',not_contains:'non contiene',starts_with:'inizia con',ends_with:'finisce con',equals:'uguale a',gt:'>',gte:'≥',lt:'<',lte:'≤',between:'tra'}
  return `${c.field} ${ops[c.op]||c.op} "${c.value}"`
}

const SEL = {padding:'5px 8px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',
  fontSize:12,background:'var(--surface)',color:'var(--text)',outline:'none',cursor:'pointer'}
const INP = {padding:'5px 8px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',
  fontSize:12,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}

// ── Conditions editor (shared by Add + Edit) ──────────────────
function ConditionsEditor({ conds, onChange }) {
  function addCond() {
    if (conds.length >= 4) return
    onChange([...conds, {field:'description',op:'contains',value:''}])
  }
  function removeCond(i) { onChange(conds.filter((_,j)=>j!==i)) }
  function updateCond(i, patch) {
    onChange(conds.map((c,j) => {
      if (j!==i) return c
      const u = {...c,...patch}
      if (patch.field && patch.field!==c.field) { u.op=fieldOps(patch.field)[0].v; u.value='' }
      return u
    }))
  }
  return (
    <div>
      {conds.map((c,i) => (
        <div key={i} style={{display:'flex',gap:6,alignItems:'center',marginBottom:6}}>
          <span style={{fontSize:9,fontWeight:800,color:'var(--text3)',width:18,textAlign:'center',flexShrink:0}}>
            {i>0?'E':''}
          </span>
          <select value={c.field} onChange={e=>updateCond(i,{field:e.target.value})} style={SEL}>
            <option value="description">Descrizione</option>
            <option value="merchant">Merchant</option>
            <option value="counterpart">Controparte</option>
            <option value="importo">Importo</option>
          </select>
          <select value={c.op} onChange={e=>updateCond(i,{op:e.target.value})} style={SEL}>
            {fieldOps(c.field).map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <input value={c.value} onChange={e=>updateCond(i,{value:e.target.value})}
            placeholder={c.field==='importo'?'es. 4000':'es. ESSELUNGA'} style={{...INP,flex:1}}/>
          {conds.length>1 && (
            <button onClick={()=>removeCond(i)}
              style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:14,padding:'0 2px'}}>✕</button>
          )}
        </div>
      ))}
      {conds.length<4 && (
        <button className="btn btn-ghost" style={{fontSize:11,marginTop:2}} onClick={addCond}>+ condizione</button>
      )}
    </div>
  )
}

// ── Category + descAI editor row ──────────────────────────────
function CatDescEditor({ cat1, cat2, descAI, onChangeCat1, onChangeCat2, onChangeDescAI }) {
  const subCats = CATS[cat1]?.sub || []
  return (
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      <span style={{fontSize:12,color:'var(--text3)',flexShrink:0}}>→ Categoria:</span>
      <select value={cat1} onChange={e=>{onChangeCat1(e.target.value);onChangeCat2('')}} style={SEL}>
        {CAT_NAMES.map(n=><option key={n}>{n}</option>)}
      </select>
      {subCats.length>0 && (
        <select value={cat2} onChange={e=>onChangeCat2(e.target.value)} style={SEL}>
          <option value="">— nessuna —</option>
          {subCats.map(s=><option key={s}>{s}</option>)}
        </select>
      )}
      <span style={{fontSize:12,color:'var(--text3)',flexShrink:0}}>AI Desc:</span>
      <input value={descAI} onChange={e=>onChangeDescAI(e.target.value)}
        placeholder="es. Stipendio" style={{...INP,width:140}}/>
    </div>
  )
}

// ── Add rule form ─────────────────────────────────────────────
function AddRuleForm({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [conds,  setConds]  = useState([{field:'description',op:'contains',value:''}])
  const [cat1,   setCat1]   = useState(CAT_NAMES[0]||'')
  const [cat2,   setCat2]   = useState('')
  const [descAI, setDescAI] = useState('')

  function save() {
    const valid = conds.filter(c=>c.value.trim())
    if (!valid.length||!cat1) return
    onAdd({ conditions:valid, action:'categorize', cats:[{cat1,cat2:cat2||'',pct:100}],
      descAI:descAI.trim()||null, name:`${cat1}${cat2?'/'+cat2:''} — ${valid.map(c=>condLabel(c)).join(' + ')}` })
    setConds([{field:'description',op:'contains',value:''}])
    setCat1(CAT_NAMES[0]||''); setCat2(''); setDescAI(''); setOpen(false)
  }

  if (!open) return (
    <button className="btn btn-primary" style={{fontSize:12,marginBottom:12}} onClick={()=>setOpen(true)}>
      + Nuova regola
    </button>
  )

  return (
    <div style={{marginBottom:16,padding:'14px 16px',background:'var(--surface)',border:'1.5px solid var(--accent)',borderRadius:'var(--radius)'}}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>+ Nuova regola multi-condizione</div>
      <ConditionsEditor conds={conds} onChange={setConds}/>
      <div style={{marginTop:10,marginBottom:12}}>
        <CatDescEditor cat1={cat1} cat2={cat2} descAI={descAI}
          onChangeCat1={setCat1} onChangeCat2={setCat2} onChangeDescAI={setDescAI}/>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-primary" style={{fontSize:12}} onClick={save}>✓ Salva</button>
        <button className="btn btn-ghost"   style={{fontSize:12}} onClick={()=>setOpen(false)}>Annulla</button>
      </div>
    </div>
  )
}

// ── Multi-condition rules table ───────────────────────────────
function ZustandRulesSection() {
  const { aiRules, addAiRule, updateAiRule, deleteAiRule, applySingleRule } = useStore()

  // Expanded edit row state
  const [editingId, setEditingId] = useState(null)
  const [editConds, setEditConds] = useState([])
  const [editCat1,  setEditCat1]  = useState('')
  const [editCat2,  setEditCat2]  = useState('')
  const [editDesc,  setEditDesc]  = useState('')

  // Single-rule run
  const [runningId,    setRunningId]    = useState(null)  // ruleId currently running
  const [runProgress,  setRunProgress]  = useState({done:0,total:0})
  const [runResult,    setRunResult]    = useState({})    // { [ruleId]: {updated,total} }

  async function runSingleRule(ruleId) {
    if (runningId) return
    setRunningId(ruleId)
    setRunProgress({done:0,total:0})
    try {
      const res = await applySingleRule(ruleId, (done,total) => setRunProgress({done,total}))
      setRunResult(v=>({...v,[ruleId]:res}))
      setTimeout(()=>setRunResult(v=>{const n={...v};delete n[ruleId];return n}), 5000)
    } catch(e) { console.error(e) }
    finally { setRunningId(null) }
  }

  // Overlap
  const [overlapFocus,  setOverlapFocus]  = useState(null)
  const [analyzing,     setAnalyzing]     = useState(false)
  const [overlapError,  setOverlapError]  = useState(null)
  // overlapAI: { [ruleId]: { codes: string[], reason: string } }
  const [overlapAI, setOverlapAI] = useState({})

  function startEdit(r) {
    setEditingId(r.id)
    setEditConds(r.conditions?.length ? [...r.conditions.map(c=>({...c}))] : [{field:'description',op:'contains',value:''}])
    setEditCat1(r.cats?.[0]?.cat1 || CAT_NAMES[0] || '')
    setEditCat2(r.cats?.[0]?.cat2 || '')
    setEditDesc(r.descAI || '')
  }

  function saveEdit(id) {
    const valid = editConds.filter(c=>c.value.trim())
    if (!valid.length) return
    updateAiRule(id, {
      conditions: valid,
      cats: [{cat1: editCat1, cat2: editCat2||'', pct:100}],
      descAI: editDesc.trim()||null,
    })
    setEditingId(null)
  }

  function saveOverlap(id, value) {
    updateAiRule(id, { overlap: value.trim()||null })
    setOverlapFocus(null)
  }

  async function analyzeOverlaps() {
    if (analyzing || !aiRules?.length) return
    setAnalyzing(true); setOverlapError(null); setOverlapAI({})
    try {
      const key = localStorage.getItem('fm-gemini-key') || 'proxy'

      // Build code↔id maps for response normalization
      const codeToId = {}
      const idToCode = {}
      aiRules.forEach((r, i) => {
        const code = ruleCode(i)
        codeToId[code] = r.id
        idToCode[r.id] = code
      })

      const lines = aiRules.map((r, i) => {
        const code = ruleCode(i)
        const conds = (r.conditions||[]).map(c => condLabel(c)).join(' E ')
        const cat = (r.cats||[]).map(c => c.cat1 + (c.cat2 ? '/' + c.cat2 : '')).join('+') || '?'
        const desc = r.descAI ? ' (descAI: ' + r.descAI + ')' : ''
        return code + ' [id:' + r.id + ']: ' + conds + ' -> ' + cat + desc
      }).join('\n')

      const prompt = [
        'Analizza queste regole di categorizzazione per transazioni bancarie.',
        'Individua regole ridondanti, sovrapposte o poco efficienti: stesse categorie, parametri simili o uguali, nomi diversi, una regola sottoinsieme di unaltra.',
        '',
        'REGOLE:',
        lines,
        '',
        'Per ogni regola problematica indica con quale altra si sovrappone e perche.',
        'Rispondi SOLO con JSON valido senza markdown:',
        '{"overlaps":[{"ruleId":"FIRESTORE_ID_O_CODICE","overlapsWith":["R001","R002"],"reason":"motivo breve italiano max 12 parole"}]}',
        'Se nessun overlap: {"overlaps":[]}',
      ].join('\n')

      const res = await fetch('http://localhost:3001/gemini', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt, key })
      })
      if (!res.ok) {
        const errText = await res.text().catch(()=>'')
        throw new Error('HTTP ' + res.status + (errText ? ': ' + errText.slice(0,200) : ''))
      }
      const data = await res.json()
      let text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
        .replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim()
      const parsed = JSON.parse(text)
      const map = {}
      for (const o of (parsed.overlaps || [])) {
        if (!o.ruleId) continue
        // AI might return code (R001) or Firestore ID — normalize to Firestore ID
        const firestoreId = codeToId[o.ruleId] || o.ruleId
        // overlapsWith: normalize to codes for display
        const displayCodes = (o.overlapsWith || []).map(x => idToCode[x] || x)
        map[firestoreId] = { codes: displayCodes, reason: o.reason || '' }
      }
      setOverlapAI(map)
    } catch(e) {
      setOverlapError('Errore analisi: ' + e.message)
    } finally { setAnalyzing(false) }
  }

  // Grid columns: # | AI Desc | Conditions | Category | Actions | Overlap
  const COL = '48px 120px 1fr 190px 72px 130px'

  const hasAiOverlaps = Object.keys(overlapAI).length > 0

  return (
    <div style={{marginBottom:28}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,marginBottom:4}}>
        <div style={{fontSize:14,fontWeight:700}}>
          ⚙️ Regole multi-condizione
          <span style={{fontSize:12,fontWeight:400,color:'var(--text3)',marginLeft:6}}>({aiRules?.length||0})</span>
        </div>
        {aiRules?.length > 1 && (
          <button className="btn btn-ghost" style={{fontSize:12,gap:5,display:'flex',alignItems:'center'}}
            onClick={analyzeOverlaps} disabled={analyzing}>
            {analyzing ? '⏳ Analisi…' : '🔍 Analizza overlap con AI'}
          </button>
        )}
      </div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
        Priorità più alta delle regole semplici. Salvate su Firestore.
      </div>

      {overlapError && (
        <div style={{padding:'8px 12px',background:'var(--red-l)',borderRadius:6,fontSize:12,color:'var(--red)',marginBottom:10}}>
          {overlapError}
        </div>
      )}
      {hasAiOverlaps && (
        <div style={{padding:'8px 12px',background:'rgba(255,160,50,.1)',border:'1px solid rgba(255,160,50,.3)',
          borderRadius:6,fontSize:12,color:'#b87000',marginBottom:10}}>
          ⚠️ Trovati possibili overlap — le righe evidenziate in arancione potrebbero matchare le stesse transazioni.
          <button onClick={()=>setOverlapAI({})} style={{marginLeft:10,background:'none',border:'none',cursor:'pointer',
            fontSize:11,color:'var(--text3)',textDecoration:'underline'}}>Nascondi</button>
        </div>
      )}

      <AddRuleForm onAdd={r=>addAiRule(r)}/>

      {(!aiRules?.length) ? (
        <div style={{padding:'16px',color:'var(--text3)',fontSize:13,background:'var(--surface)',
          border:'1px solid var(--border)',borderRadius:'var(--radius)',textAlign:'center'}}>
          Nessuna regola. Aggiungine una sopra.
        </div>
      ) : (
        <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
          {/* Header */}
          <div style={{display:'grid',gridTemplateColumns:COL,padding:'8px 12px',
            background:'var(--surface2)',borderBottom:'1px solid var(--border)',
            fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em'}}>
            <div>#</div>
            <div>AI Desc</div>
            <div>Condizioni</div>
            <div>Categoria</div>
            <div style={{textAlign:'center'}}>Azioni</div>
            <div>Overlap</div>
          </div>

          {aiRules.map((r,i) => {
            const ai = overlapAI[r.id]
            const hasOverlap = !!ai
            const rowBg = r.enabled===false ? 'var(--surface2)'
              : hasOverlap ? 'rgba(255,160,50,.07)'
              : 'var(--surface)'
            const rowBorder = hasOverlap ? '1px solid rgba(255,160,50,.25)' : undefined

            return (
              <div key={r.id}>
                {/* Main row */}
                <div style={{
                  display:'grid',gridTemplateColumns:COL,padding:'10px 12px',alignItems:'center',
                  borderBottom: editingId===r.id ? 'none' : (i<aiRules.length-1?'1px solid var(--border)':'none'),
                  background: rowBg,
                  outline: rowBorder,
                  outlineOffset: -1,
                  opacity: r.enabled===false?0.55:1,
                  transition:'background .3s',
                }}>
                  {/* Code */}
                  <div style={{fontSize:11,fontWeight:700,color: hasOverlap?'#b87000':'var(--text3)',fontFamily:'var(--font-mono)'}}>
                    {ruleCode(i)}
                  </div>

                  {/* AI Desc */}
                  <div style={{paddingRight:8,fontSize:11,
                    color:r.descAI?'var(--text)':'var(--text3)',fontStyle:r.descAI?'normal':'italic',
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {r.descAI||'—'}
                  </div>

                  {/* Conditions */}
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',paddingRight:8}}>
                    {(r.conditions||[]).map((c,j)=>(
                      <span key={j} style={{fontSize:10,padding:'1px 7px',borderRadius:8,
                        background:'var(--surface2)',border:'1px solid var(--border)',
                        color:'var(--text2)',whiteSpace:'nowrap'}}>
                        {condLabel(c)}
                      </span>
                    ))}
                  </div>

                  {/* Category */}
                  <div style={{fontSize:12,fontWeight:600,color:'var(--accent)',paddingLeft:8,paddingRight:8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {r.cats?.map(c=>`${c.cat1}${c.cat2?'/'+c.cat2:''}`).join(' + ')||'—'}
                  </div>

                  {/* Actions */}
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                    <div style={{display:'flex',gap:2}}>
                      <button onClick={()=>updateAiRule(r.id,{enabled:r.enabled===false?true:false})}
                        title={r.enabled===false?'Attiva':'Disattiva'}
                        style={{background:'none',border:'none',cursor:'pointer',fontSize:14,padding:'2px 3px'}}>
                        {r.enabled===false?'🔴':'🟢'}
                      </button>
                      <button onClick={()=>editingId===r.id?setEditingId(null):startEdit(r)}
                        title="Modifica" style={{background:'none',border:'none',cursor:'pointer',fontSize:13,padding:'2px 3px',
                          color:editingId===r.id?'var(--accent)':'var(--text3)'}}>
                        ✏️
                      </button>
                      <button onClick={()=>{if(confirm('Eliminare?'))deleteAiRule(r.id)}}
                        style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:13,padding:'2px 3px'}}>
                        🗑
                      </button>
                    </div>
                    {/* Run single rule */}
                    {runningId===r.id ? (
                      <div style={{fontSize:9,color:'var(--accent)',fontWeight:700,textAlign:'center',lineHeight:1.3}}>
                        ⏳ {runProgress.done}/{runProgress.total}
                      </div>
                    ) : runResult[r.id] ? (
                      <div style={{fontSize:9,color:'var(--green)',fontWeight:700,textAlign:'center',lineHeight:1.3}}>
                        ✅ {runResult[r.id].updated} tx
                      </div>
                    ) : (
                      <button onClick={()=>runSingleRule(r.id)} disabled={!!runningId}
                        title="Esegui questa regola su tutte le transazioni"
                        style={{background:'none',border:'1px solid var(--border)',borderRadius:4,cursor:runningId?'not-allowed':'pointer',
                          fontSize:10,padding:'1px 5px',color:'var(--text3)',opacity:runningId&&runningId!==r.id?0.4:1,
                          display:'flex',alignItems:'center',gap:3}}>
                        ▶ Run
                      </button>
                    )}
                  </div>

                  {/* Overlap — AI-detected + manually editable */}
                  <div style={{paddingLeft:8}}>
                    {/* AI-detected overlap badges */}
                    {hasOverlap && (
                      <div style={{marginBottom:ai.codes.length?3:0}}>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:2}}>
                          {ai.codes.map(c=>(
                            <span key={c} style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:6,
                              background:'rgba(255,140,30,.15)',border:'1px solid rgba(255,140,30,.4)',color:'#b87000'}}>
                              {c}
                            </span>
                          ))}
                        </div>
                        <div style={{fontSize:9,color:'#b87000',opacity:.8,lineHeight:1.3,fontStyle:'italic'}}>
                          {ai.reason}
                        </div>
                      </div>
                    )}
                    {/* Manual note */}
                    {overlapFocus===r.id ? (
                      <input
                        autoFocus
                        defaultValue={r.overlap||''}
                        onBlur={e=>saveOverlap(r.id,e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter')e.target.blur();if(e.key==='Escape')setOverlapFocus(null)}}
                        placeholder="nota manuale…"
                        style={{...INP,width:'100%',padding:'2px 6px',fontSize:10,marginTop:hasOverlap?4:0}}
                      />
                    ) : (
                      <div onClick={()=>setOverlapFocus(r.id)}
                        style={{cursor:'pointer',fontSize:10,color:r.overlap?'var(--gold)':'var(--text3)',
                          fontStyle:r.overlap?'normal':'italic',marginTop:hasOverlap?4:0,opacity:r.overlap?1:0.6}}>
                        {r.overlap || (hasOverlap ? '+ nota' : '—')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded edit panel */}
                {editingId===r.id && (
                  <div style={{padding:'12px 16px',background:'rgba(var(--accent-rgb,99,102,241),.04)',
                    borderTop:'1px dashed var(--accent)',borderBottom:i<aiRules.length-1?'1px solid var(--border)':'none'}}>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--accent)',marginBottom:10}}>
                      ✏️ Modifica {ruleCode(i)}
                    </div>
                    <ConditionsEditor conds={editConds} onChange={setEditConds}/>
                    <div style={{marginTop:10,marginBottom:12}}>
                      <CatDescEditor cat1={editCat1} cat2={editCat2} descAI={editDesc}
                        onChangeCat1={setEditCat1} onChangeCat2={setEditCat2} onChangeDescAI={setEditDesc}/>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>saveEdit(r.id)}>✓ Salva</button>
                      <button className="btn btn-ghost"   style={{fontSize:12}} onClick={()=>setEditingId(null)}>Annulla</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Cat rules — list only ─────────────────────────────────────
function CatRulesSection() {
  const appPrefs   = useStore(s=>s.appPrefs)
  const setAppPref = useStore(s=>s.setAppPref)
  const rules      = appPrefs.catRules || []
  if (!rules.length) return null

  function toggle(id) { setAppPref('catRules',rules.map(r=>r.id===id?{...r,enabled:!r.enabled}:r)) }
  function remove(id) { if(!confirm('Eliminare?'))return; setAppPref('catRules',rules.filter(r=>r.id!==id)) }

  const COL = '1fr 180px 64px'
  return (
    <div style={{marginTop:8,marginBottom:28}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>
        🏷️ Regole categorizzazione semplici
        <span style={{fontSize:12,fontWeight:400,color:'var(--text3)',marginLeft:6}}>({rules.length})</span>
      </div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
        Match su un singolo campo testo → categoria. Priorità inferiore alle multi-condizione.
      </div>
      <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:COL,padding:'8px 12px',
          background:'var(--surface2)',borderBottom:'1px solid var(--border)',
          fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em'}}>
          <div>Condizione</div><div>Categoria</div><div style={{textAlign:'right'}}>Azioni</div>
        </div>
        {rules.map((r,i)=>(
          <div key={r.id} style={{display:'grid',gridTemplateColumns:COL,padding:'8px 12px',alignItems:'center',
            borderBottom:i<rules.length-1?'1px solid var(--border)':'none',
            background:r.enabled!==false?'var(--surface)':'var(--surface2)',opacity:r.enabled!==false?1:0.5}}>
            <div style={{fontSize:12,fontFamily:'var(--font-mono)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {r.matchField} = <strong>"{r.matchValue}"</strong>
            </div>
            <div style={{fontSize:12,fontWeight:600,color:'var(--accent)',paddingLeft:8}}>
              {r.cat1}{r.cat2?`/${r.cat2}`:''}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:4}}>
              <div style={{display:'flex',alignItems:'center',cursor:'pointer'}} onClick={()=>toggle(r.id)}>
                <div style={{width:24,height:14,borderRadius:7,background:r.enabled!==false?'var(--green)':'var(--border)',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:2,left:r.enabled!==false?12:2,width:10,height:10,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
                </div>
              </div>
              <button onClick={()=>remove(r.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:12,padding:'0 2px'}}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function AiRulesTab() {
  return (
    <div style={{maxWidth:960}}>
      <BulkApplyButton/>
      <HardcodedRulesSection/>
      <ZustandRulesSection/>
      <CatRulesSection/>
    </div>
  )
}
