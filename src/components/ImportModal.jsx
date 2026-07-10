import { useState, useRef, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { parseCSV } from '../data/csvParser'
import { categorizeBatch } from '../data/aiService'
import { X, Upload, Sparkles, Clock, Search } from 'lucide-react'
import './ImportModal.css'
// spin animation added via CSS

const MONTH_NAMES = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function monthLabel(ym) {
  const [y, m] = (ym || '').split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTH_NAMES[idx] || m} ${y}`
}

// Raggruppa le transazioni appena lette dal CSV per mese (YYYY-MM) — usato per la
// riconciliazione: ogni mese va abbinato a UN estratto conto reale prima di poter
// essere importato (vedi CardImportReconcileModal)
function buildMonthGroups(txs) {
  const map = {}
  txs.forEach(t => {
    const ym = (t.date || '').slice(0, 7)
    if (!ym) return
    if (!map[ym]) map[ym] = { month: ym, label: monthLabel(ym), txs: [], total: 0 }
    map[ym].txs.push(t)
    map[ym].total += Math.abs(t.amount)
  })
  return Object.values(map)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(g => ({ ...g, total: Math.round(g.total * 100) / 100 }))
}

// Transazioni del conto corrente che sembrano un "estratto conto" per questa carta
// (stessa logica di riconoscimento già in uso: parole chiave + numero carta nella
// descrizione), non ancora escluse/riconciliate — candidati per l'abbinamento automatico
function findEstrattoCandidates(transactions, account) {
  const card4 = account.card4
  const panRegex = new RegExp(`[0-9X]{4,}${card4}\\b`, 'i')
  return transactions
    .filter(t =>
      !t.excluded &&
      t.account !== account.name &&
      t.amount < 0 &&
      /estratto|utilizzo carte|carta di credito/i.test(t.description || '') &&
      (t.card === card4 || panRegex.test(t.description || ''))
    )
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

// ── Riconciliazione carta di credito — PRIMA di AI/salvataggio ────────────
// Per ogni mese letto dal CSV, l'utente deve abbinare l'estratto conto reale già
// presente sul conto corrente (trovato automaticamente per importo, o cercato a mano).
// Solo i mesi abbinati vengono poi importati; gli altri (es. mese non ancora
// addebitato sul conto) restano fuori — si reimporta lo stesso CSV più avanti.
function CardImportReconcileModal({ account, monthGroups, candidates, transactions, onConfirm, onCancel }) {
  const [choice, setChoice] = useState(() => {
    const used = new Set()
    const init = {}
    monthGroups.forEach(g => {
      const ok = candidates.find(c => !used.has(c.txId) && g.total > 0 && Math.abs(Math.abs(c.amount) - g.total) / g.total < 0.02)
      const partial = !ok && candidates.find(c => !used.has(c.txId) && g.total > 0 && Math.abs(Math.abs(c.amount) - g.total) / g.total < 0.08)
      const match = ok || partial
      if (match) { init[g.month] = match.txId; used.add(match.txId) }
      else init[g.month] = null
    })
    return init
  })
  const [searchMonth, setSearchMonth] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  function statusFor(g) {
    const txId = choice[g.month]
    if (!txId) return 'missing'
    const c = transactions.find(t => t.txId === txId)
    if (!c || !g.total) return 'missing'
    const diff = Math.abs(Math.abs(c.amount) - g.total) / g.total
    return diff < 0.02 ? 'ok' : diff < 0.08 ? 'partial' : 'mismatch'
  }

  const manualResults = useMemo(() => {
    if (!searchMonth) return []
    const chosenElsewhere = new Set(Object.entries(choice).filter(([m]) => m !== searchMonth).map(([, id]) => id).filter(Boolean))
    let list = transactions.filter(t => !t.excluded && t.amount < 0 && !chosenElsewhere.has(t.txId))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t => (t.description || '').toLowerCase().includes(q) || (t.descAI || '').toLowerCase().includes(q))
    }
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 30)
  }, [searchMonth, searchQuery, transactions, choice])

  const matchedMonths = monthGroups.filter(g => choice[g.month])
  const matchedCount = matchedMonths.length
  const totalToImport = matchedMonths.reduce((s, g) => s + g.txs.length, 0)

  function confirm() {
    const months = matchedMonths.map(g => ({ month: g.month, estrattoTxId: choice[g.month] }))
    onConfirm({ matchedMonths: months, estrattoTxIdsToExclude: months.map(m => m.estrattoTxId) })
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header">
          <h3>🔍 Riconcilia estratti · {account.name} *{account.card4}</h3>
          <button className="btn btn-ghost" onClick={onCancel}><X size={16}/></button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '0 4px 14px', lineHeight: 1.5 }}>
          Il CSV contiene {monthGroups.reduce((s, g) => s + g.txs.length, 0)} transazioni su {monthGroups.length} mes{monthGroups.length === 1 ? 'e' : 'i'}.
          Ogni mese va abbinato all'estratto conto già presente sul conto corrente prima di poter importare le sue spese —
          solo i mesi abbinati verranno importati. Se un mese non ha ancora un estratto (es. carta non ancora addebitata),
          lascialo così: potrai reimportare lo stesso CSV più avanti quando l'estratto sarà arrivato.
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text3)', fontWeight: 700 }}>Mese</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text3)', fontWeight: 700 }}>Totale CSV</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text3)', fontWeight: 700 }}>Tx</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text3)', fontWeight: 700 }}>Estratto abbinato</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text3)', fontWeight: 700 }}>Stato</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text3)', fontWeight: 700 }}></th>
              </tr>
            </thead>
            <tbody>
              {monthGroups.map(g => {
                const txId = choice[g.month]
                const chosenTx = txId ? transactions.find(t => t.txId === txId) : null
                const status = statusFor(g)
                const statusIcon = status === 'ok' ? '✅' : status === 'partial' ? '⚠️' : status === 'mismatch' ? '❌' : '🔍'
                const statusColor = status === 'ok' ? 'var(--green)' : status === 'partial' ? 'var(--gold)' : status === 'mismatch' ? 'var(--red)' : 'var(--text3)'
                return (
                  <>
                    <tr key={g.month} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 8px', fontWeight: 600 }}>{g.label}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>€{g.total.toFixed(2)}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text3)' }}>{g.txs.length}</td>
                      <td style={{ padding: '8px 8px', color: 'var(--text2)' }}>
                        {chosenTx
                          ? <><div style={{ fontWeight: 600 }}>{chosenTx.date} · €{Math.abs(chosenTx.amount).toFixed(2)}</div>
                              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{chosenTx.descAI || chosenTx.description?.slice(0, 50)}</div></>
                          : <span style={{ color: 'var(--text3)' }}>— non trovato —</span>}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        <span style={{ fontSize: 15 }}>{statusIcon}</span>
                        <div style={{ fontSize: 9, color: statusColor }}>{status === 'ok' ? 'esatto' : status === 'partial' ? 'differenza lieve' : status === 'mismatch' ? 'importo diverso' : 'da cercare'}</div>
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
                          onClick={() => { setSearchMonth(searchMonth === g.month ? null : g.month); setSearchQuery('') }}>
                          <Search size={11}/> Cerca
                        </button>
                        {chosenTx && (
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => setChoice(c => ({ ...c, [g.month]: null }))}>✕</button>
                        )}
                      </td>
                    </tr>
                    {searchMonth === g.month && (
                      <tr>
                        <td colSpan={6} style={{ padding: '8px 8px 14px', background: 'var(--surface2)' }}>
                          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus
                            placeholder="Cerca per descrizione (es. 'estratto', 'carta', nome banca)…"
                            className="form-select" style={{ width: '100%', marginBottom: 8 }}/>
                          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {manualResults.length === 0 && (
                              <div style={{ fontSize: 12, color: 'var(--text3)', padding: 8 }}>Nessun risultato — prova un'altra ricerca</div>
                            )}
                            {manualResults.map(t => (
                              <div key={t.txId} onClick={() => { setChoice(c => ({ ...c, [g.month]: t.txId })); setSearchMonth(null) }}
                                style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 10px',
                                  borderRadius: 6, cursor: 'pointer', background: 'var(--surface)', fontSize: 12 }}>
                                <span>{t.date} · {t.descAI || t.description?.slice(0, 60)}</span>
                                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>€{Math.abs(t.amount).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            <strong style={{ color: 'var(--text)' }}>{matchedCount}/{monthGroups.length}</strong> mesi abbinati · <strong style={{ color: 'var(--text)' }}>{totalToImport}</strong> transazioni verranno importate
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onCancel}>Annulla</button>
            <button className="btn btn-primary" disabled={matchedCount === 0} onClick={confirm}>
              ✅ Conferma e importa {totalToImport} tx
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const BATCH_SIZE = 20

export default function ImportModal({ onClose }) {
  const { userAccounts, addTransactions, updateTransaction, transactions, aiRules } = useStore()
  const appPrefs = useStore(s => s.appPrefs)
  const [account, setAccount] = useState(userAccounts[0]?.name || 'Conto Corrente')

  // Build display label for each account: name · *card4 · owner nickname
  function accountLabel(a) {
    const icon = a.type === 'carta' ? '💳' : '🏦'
    const card = a.card4 ? ` · *${a.card4}` : ''
    let owner = ''
    if (a.memberId) {
      if (a.memberId === 'owner') {
        owner = appPrefs.ownerNickname || ''
      } else {
        const m = (appPrefs.family || []).find(m => String(m.id) === String(a.memberId))
        owner = m?.nickname || m?.name || ''
      }
    }
    return `${icon} ${a.name}${card}${owner ? '  ·  ' + owner : ''}`
  }
  const [files,              setFiles]              = useState([])
  const [useAI,              setUseAI]              = useState(true)
  const [status,             setStatus]             = useState(null)
  const [done,               setDone]               = useState(null)
  const [error,              setError]              = useState(null)
  // In attesa di riconciliazione mensile per un conto "carta" — { account, monthGroups, candidates, allParsed }
  const [cardReconcile,      setCardReconcile]      = useState(null)

  const startTimeRef   = useRef(null)
  const abortRef       = useRef(false)        // true = user cancelled
  const snapshotTxsRef = useRef(null)         // tx list before import started

  // ── ETA ──────────────────────────────────────────────────
  function calcETA(doneCount, totalCount) {
    if (!startTimeRef.current || doneCount === 0) return null
    const elapsed   = (Date.now() - startTimeRef.current) / 1000
    const rate      = doneCount / elapsed
    const etaSec    = (totalCount - doneCount) / rate
    if (etaSec <  5) return 'meno di 5 secondi'
    if (etaSec < 60) return `circa ${Math.round(etaSec)} secondi`
    return `circa ${Math.round(etaSec / 60)} minuti`
  }

  // ── Cancel ────────────────────────────────────────────────
  function handleCancel() {
    abortRef.current = true
    // Rollback: restore transactions to pre-import snapshot
    if (snapshotTxsRef.current !== null) {
      useStore.setState({ transactions: snapshotTxsRef.current })
    }
    setStatus(null)
    setError(null)
    setDone(null)
    snapshotTxsRef.current = null
    abortRef.current = false
  }

  // ── Fase AI + salvataggio, condivisa fra il flusso normale e quello carta ──
  // dedupAgainst: se passato, i doppioni vengono controllati SOLO contro questo
  // sottoinsieme di transazioni (richiesto per le carte: solo import precedenti
  // della stessa carta, non l'intero DB) — vedi addTransactions in useStore.js
  async function runAIAndSave(txsToImport, { dedupAgainst, skippedMonths } = {}) {
    let finalTxs = txsToImport
    if (useAI) {
      startTimeRef.current = Date.now()
      const batches = []
      for (let i = 0; i < txsToImport.length; i += BATCH_SIZE)
        batches.push(txsToImport.slice(i, i + BATCH_SIZE))

      finalTxs = []
      for (let b = 0; b < batches.length; b++) {
        if (abortRef.current) { handleCancel(); return }

        const categorized = await categorizeBatch(batches[b])

        if (abortRef.current) { handleCancel(); return }

        finalTxs.push(...categorized)
        const current = Math.min((b+1)*BATCH_SIZE, txsToImport.length)
        const pct     = Math.round(current / txsToImport.length * 100)

        setStatus({
          phase:'ai', pct, current, total:txsToImport.length,
          eta: calcETA(current, txsToImport.length),
          message:`Gemini AI: categorizzate ${current} di ${txsToImport.length}`,
        })
      }
    }

    if (abortRef.current) { handleCancel(); return }

    // ── Phase 3: Save ────────────────────────────────
    // Point of no return: data is about to be persisted on Firestore.
    // Null the snapshot NOW so a late cancel can't roll back saved data.
    snapshotTxsRef.current = null
    setStatus({ phase:'save', pct:10, current:0,
      total:finalTxs.length, eta:null, message:'Preparazione salvataggio…' })
    await new Promise(r => setTimeout(r, 100)) // let UI render

    setStatus({ phase:'save', pct:40, current:Math.floor(finalTxs.length*0.4),
      total:finalTxs.length, eta:null, message:`Salvataggio ${finalTxs.length} transazioni su Firestore…` })
    await new Promise(r => setTimeout(r, 80))

    const added = addTransactions(finalTxs, dedupAgainst ? { dedupAgainst } : undefined)

    setStatus({ phase:'save', pct:85, current:Math.floor(finalTxs.length*0.85),
      total:finalTxs.length, eta:null, message:'Sincronizzazione database…' })
    await new Promise(r => setTimeout(r, 200))

    setStatus({ phase:'save', pct:100, current:finalTxs.length,
      total:finalTxs.length, eta:null, message:'✓ Ci siamo quasi…' })
    await new Promise(r => setTimeout(r, 300))
    const aiCount = 0 // AI enrichment is now a separate step
    const dupes   = Math.max(0, finalTxs.length - (typeof added==='number' ? added : finalTxs.length))

    setStatus(null)
    setDone({ total:finalTxs.length, aiCount, dupes, skippedMonths: skippedMonths || [] })
    setTimeout(onClose, 2500)
  }

  // ── Import ────────────────────────────────────────────────
  async function handleImport() {
    if (!files.length) return
    setError(null); setDone(null)
    abortRef.current = false
    startTimeRef.current = Date.now()

    // Save snapshot for rollback
    snapshotTxsRef.current = [...useStore.getState().transactions]

    // ── Phase 1: Parse ──────────────────────────────
    setStatus({ phase:'parse', pct:0, current:0, total:0, eta:null,
      message:'Lettura file CSV…' })

    let allParsed = []
    for (const file of files) {
      const text = await file.text()
      const txs  = parseCSV(text, account, aiRules || [], useStore.getState().transactions)
      allParsed.push(...txs)
    }
    allParsed.sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))

    if (!allParsed.length) {
      setError('Nessuna transazione trovata. Verifica il formato del file.')
      setStatus(null); return
    }

    if (abortRef.current) { handleCancel(); return }

    setStatus({ phase:'parse', pct:100, current:allParsed.length,
      total:allParsed.length, eta:null,
      message:`✓ Lette ${allParsed.length} transazioni dal CSV` })

    // ── Carta di credito: riconciliazione mensile PRIMA di AI/salvataggio ──
    const selectedAccountObj = userAccounts.find(a => a.name === account)
    if (selectedAccountObj?.type === 'carta' && selectedAccountObj?.card4) {
      const monthGroups = buildMonthGroups(allParsed)
      const candidates  = findEstrattoCandidates(useStore.getState().transactions, selectedAccountObj)
      snapshotTxsRef.current = null   // niente ancora salvato, nessun rollback necessario
      setStatus(null)
      setCardReconcile({ account: selectedAccountObj, monthGroups, candidates, allParsed })
      return  // in attesa della conferma dell'utente in CardImportReconcileModal
    }

    // ── Phase 2 + 3: AI + salvataggio (flusso non-carta, invariato) ──
    await runAIAndSave(allParsed)
  }

  // ── Conferma riconciliazione carta ──────────────────────────
  async function handleCardReconcileConfirm({ matchedMonths, estrattoTxIdsToExclude }) {
    const { account: acc, monthGroups, allParsed } = cardReconcile
    const card4 = acc.card4

    // 1. Escludi gli estratti abbinati dal conto corrente
    estrattoTxIdsToExclude.forEach(txId => updateTransaction(txId, { excluded: true, reconciled: true }))

    // 2. Solo le transazioni dei mesi abbinati vengono importate, taggate con la carta di origine
    const matchedMonthSet = new Map(matchedMonths.map(m => [m.month, m.estrattoTxId]))
    const txsToImport = allParsed
      .filter(t => matchedMonthSet.has((t.date || '').slice(0, 7)))
      .map(t => ({
        ...t,
        cardImportCard4: card4,
        cardImportEstrattoTxId: matchedMonthSet.get((t.date || '').slice(0, 7)),
      }))

    // 3. Doppioni controllati solo contro precedenti import della STESSA carta
    const dedupAgainst = useStore.getState().transactions.filter(t => t.cardImportCard4 === card4)

    // 4. Mesi non abbinati (es. estratto non ancora arrivato) restano fuori — si reimporta più avanti
    const skippedMonths = monthGroups.filter(g => !matchedMonthSet.has(g.month)).map(g => g.label)

    setCardReconcile(null)
    startTimeRef.current = Date.now()
    setStatus({ phase:'ai', pct:0, current:0, total:txsToImport.length, eta:null, message:'Preparazione…' })
    await runAIAndSave(txsToImport, { dedupAgainst, skippedMonths })
  }

  function handleCardReconcileCancel() {
    setCardReconcile(null)
    setStatus(null)
    setError(null)
  }

  const isRunning = status !== null

  return (
    <>
    <div className="modal-backdrop" onClick={(!isRunning && !cardReconcile) ? onClose : undefined}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h3><Upload size={16}/> Importa CSV</h3>
          {!isRunning && !cardReconcile && <button className="btn btn-ghost" onClick={onClose}><X size={16}/></button>}
        </div>

        {/* Setup form — hidden while running or waiting on card reconciliation */}
        {!isRunning && !done && !cardReconcile && (
          <>
            <div className="info-box">
              Supportato: <strong>UniCredit, Fineco, BNL, Banco BPM, BPER, Credem, Widiba</strong> e altri
              formati CSV italiani — il parser rileva automaticamente il formato. Puoi selezionare più file.
            </div>

            <label className="form-label">Conto / Carta</label>
            <select className="form-select" value={account} onChange={e=>setAccount(e.target.value)}>
              {userAccounts.map(a=>(
                <option key={a.id} value={a.name}>{accountLabel(a)}</option>
              ))}
            </select>

            <label className="form-label" style={{marginTop:14}}>File CSV</label>
            <input type="file" accept=".csv,.txt" multiple className="form-file"
              onChange={e=>setFiles(Array.from(e.target.files))}/>
            {files.length > 0 && (
              <div className="file-list">
                {files.map(f=><span key={f.name} className="file-chip">{f.name}</span>)}
              </div>
            )}

            <div style={{padding:'10px 14px',background:'var(--blue-l)',borderRadius:'var(--radius-sm)',fontSize:12,color:'var(--blue)'}}>
              ℹ️ Le transazioni vengono salvate senza AI. Usa il bottone <strong>✨ AI Enrichment</strong> nella sezione Transazioni per arricchirle.
            </div>
          </>
        )}

        {/* ── Progress UI ── */}
        {isRunning && status && (
          <div className="import-progress-full">
            {/* Phase steps */}
            <div className="import-phases">
              {[
                {id:'parse', label:'Lettura CSV', icon:'📄'},
                {id:'ai',    label:'AI Gemini',   icon:'✨'},
                {id:'save',  label:'Salvataggio', icon:'💾'},
              ].map(ph => {
                const order   = ['parse','ai','save']
                const curIdx  = order.indexOf(status.phase)
                const thisIdx = order.indexOf(ph.id)
                const isDone  = thisIdx < curIdx
                const isActive= thisIdx === curIdx
                return (
                  <div key={ph.id} className={'import-phase'+(isActive?' active':isDone?' done':'')}>
                    <div className="import-phase-dot">{isDone?'✓':ph.icon}</div>
                    <span>{ph.label}</span>
                  </div>
                )
              })}
            </div>

            {/* Spinning indicator when not at 100% */}
            {(status.pct??0) < 100 && (
              <div style={{display:'flex',justifyContent:'center',marginBottom:8}}>
                <div style={{width:20,height:20,border:'3px solid var(--border)',borderTopColor:'var(--accent)',
                  borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
              </div>
            )}
            {/* Big % */}
            <div className="import-pct-big">
              {status.pct??0}<span style={{fontSize:28}}>%</span>
            </div>

            {/* Bar */}
            <div className="import-bar-outer">
              <div className="import-bar-inner" style={{width:(status.pct??0)+'%'}}/>
            </div>

            {/* Stats */}
            <div className="import-stats-row">
              <div className="import-stat">
                <span className="import-stat-label">Transazioni</span>
                <span className="import-stat-val">
                  {status.current??0}
                  {status.total ? <span style={{color:'var(--text3)',fontWeight:400}}> / {status.total}</span> : ''}
                </span>
              </div>
              {status.eta && (
                <div className="import-stat">
                  <Clock size={12} color="var(--text3)" style={{marginRight:3}}/>
                  <span className="import-stat-label">ETA</span>
                  <span className="import-stat-val">{status.eta}</span>
                </div>
              )}
              {status.phase==='ai' && status.total>0 && (
                <div className="import-stat">
                  <span className="import-stat-label">Batch</span>
                  <span className="import-stat-val">
                    {Math.ceil((status.current||0)/BATCH_SIZE)} / {Math.ceil(status.total/BATCH_SIZE)}
                  </span>
                </div>
              )}
            </div>

            {/* Message */}
            <div className="import-message">{status.message}</div>

            {/* AI dots */}
            {status.phase==='ai' && (
              <div className="import-ai-indicator">
                <Sparkles size={13} color="var(--gold)"/>
                <span>Gemini sta analizzando le transazioni</span>
                <span className="import-dots"><span/><span/><span/></span>
              </div>
            )}

            {/* ── Cancel button — hidden during save: data is being persisted ── */}
            {status.phase !== 'save' && (
              <>
                <button className="import-cancel-btn" onClick={handleCancel}>
                  <X size={13}/> Annulla importazione
                </button>
                <div className="import-cancel-hint">
                  Annullare riporterà le transazioni allo stato precedente — nessun dato verrà salvato.
                </div>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {error && <div className="error-box">{error}</div>}

        {/* Success */}
        {done && (
          <div className="import-success">
            <div className="import-success-icon">✓</div>
            <div className="import-success-title">{done.total} transazioni importate!</div>
            <div className="import-success-details">
              {done.aiCount>0 && <div><Sparkles size={12} color="var(--gold)"/> {done.aiCount} categorizzate con Gemini AI</div>}
              {done.dupes>0  && <div style={{color:'var(--text3)'}}>🔄 {done.dupes} duplicate scartate</div>}
              <div style={{color:'var(--text3)'}}>💾 Salvate su Firestore</div>
              {done.skippedMonths?.length > 0 && (
                <div style={{color:'var(--gold)',marginTop:6}}>
                  ⏳ Mes{done.skippedMonths.length===1?'e':'i'} non abbinat{done.skippedMonths.length===1?'o':'i'} (estratto non ancora presente sul conto): {done.skippedMonths.join(', ')} — reimporta il CSV più avanti.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {!isRunning && !done && !cardReconcile && (
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={handleImport} disabled={!files.length}>
              <Upload size={14}/> Importa
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
          </div>
        )}
        {error && !isRunning && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setError(null)}>Riprova</button>
          </div>
        )}
      </div>
    </div>

    {/* Riconciliazione mensile carta di credito — PRIMA di AI/salvataggio */}
    {cardReconcile && (
      <CardImportReconcileModal
        account={cardReconcile.account}
        monthGroups={cardReconcile.monthGroups}
        candidates={cardReconcile.candidates}
        transactions={transactions}
        onConfirm={handleCardReconcileConfirm}
        onCancel={handleCardReconcileCancel}
      />
    )}
    </>
  )
}
