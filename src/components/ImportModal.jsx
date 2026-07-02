import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { parseCSV } from '../data/csvParser'
import { categorizeBatch } from '../data/aiService'
import { X, Upload, Sparkles, Clock } from 'lucide-react'
import './ImportModal.css'
// spin animation added via CSS

// ── Card reconciliation modal ─────────────────────────────
function CardReconcileModal({ data, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const { selectedAccount, reconciled } = data
  const [rows, setRows] = useState(() => reconciled.map(r => ({ ...r, selected: r.status !== 'missing' })))
  const [done, setDone] = useState(false)

  function toggleRow(i) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r))
  }

  function handleConfirm() {
    rows.filter(r => r.selected).forEach(r => {
      updateTransaction(r.estratto.txId, { excluded: true, reconciled: true })
    })
    setDone(true)
    setTimeout(onClose, 1800)
  }

  const selectedCount = rows.filter(r => r.selected).length

  if (done) return (
    <div className="modal-backdrop">
      <div className="modal import-modal" style={{ textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Riconciliazione completata</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {selectedCount} estratt{selectedCount === 1 ? 'o escluso' : 'i esclusi'} dal conto corrente
        </div>
      </div>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="modal-header">
          <h3>🔍 Riconciliazione estratti · *{selectedAccount.card4}</h3>
          <button className="btn btn-ghost" onClick={onClose}><X size={16}/></button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '0 4px 14px', lineHeight: 1.5 }}>
          Il sistema ha trovato <strong>{rows.length}</strong> estratt{rows.length === 1 ? 'o' : 'i'} non riconciliat{rows.length === 1 ? 'o' : 'i'} per la carta <strong>*{selectedAccount.card4}</strong>.
          Seleziona quelli da escludere dal conto corrente (le singole spese della carta rimangono visibili).
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text3)', fontWeight: 700, width: 32 }}></th>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text3)', fontWeight: 700 }}>Data estratto</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text3)', fontWeight: 700 }}>Importo</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text3)', fontWeight: 700 }}>Spese carta</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text3)', fontWeight: 700 }}>Tx</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text3)', fontWeight: 700 }}>Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const { estratto, cardSum, diff, status, selected, periodTxs } = row
                const estrattoAmt = Math.abs(estratto.amount)
                const statusIcon = status === 'ok' ? '✅' : status === 'partial' ? '⚠️' : '❌'
                const statusColor = status === 'ok' ? 'var(--green)' : status === 'partial' ? 'var(--gold)' : 'var(--red)'
                const statusLabel = status === 'ok'
                  ? 'Corrispondenza esatta'
                  : status === 'partial'
                  ? `Differenza €${diff.toFixed(2)}`
                  : cardSum === 0 ? 'Nessuna tx trovata' : `Differenza €${diff.toFixed(2)}`

                return (
                  <tr key={estratto.txId}
                    style={{ borderBottom: '1px solid var(--border)', background: selected ? 'var(--surface2)' : 'transparent', cursor: 'pointer' }}
                    onClick={() => toggleRow(i)}>
                    <td style={{ padding: '8px 8px' }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleRow(i)}
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                        onClick={e => e.stopPropagation()}/>
                    </td>
                    <td style={{ padding: '8px 8px', color: 'var(--text2)' }}>
                      <div style={{ fontWeight: 600 }}>{estratto.date}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                        {row.periodLabel}
                      </div>
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>
                      €{estrattoAmt.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600,
                      color: cardSum > 0 ? 'var(--text)' : 'var(--text3)' }}>
                      {cardSum > 0 ? `€${cardSum.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text3)' }}>
                      {periodTxs?.length ?? 0}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                      <span title={statusLabel} style={{ fontSize: 16 }}>{statusIcon}</span>
                      <div style={{ fontSize: 10, color: statusColor, marginTop: 2 }}>{statusLabel}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose}>Salta</button>
          <button className="btn btn-primary" disabled={selectedCount === 0} onClick={handleConfirm}>
            ✅ Escludi {selectedCount} estratt{selectedCount === 1 ? 'o' : 'i'}
          </button>
        </div>
      </div>
    </div>
  )
}

const BATCH_SIZE = 20

export default function ImportModal({ onClose }) {
  const { userAccounts, addTransactions, transactions, aiRules } = useStore()
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
  const [reconcileData,      setReconcileData]      = useState(null)
  const [showReconcileModal, setShowReconcileModal] = useState(false)

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

    // ── Phase 2: AI ─────────────────────────────────
    let finalTxs = allParsed
    if (useAI) {
      startTimeRef.current = Date.now()
      const batches = []
      for (let i = 0; i < allParsed.length; i += BATCH_SIZE)
        batches.push(allParsed.slice(i, i + BATCH_SIZE))

      finalTxs = []
      for (let b = 0; b < batches.length; b++) {
        if (abortRef.current) { handleCancel(); return }

        const categorized = await categorizeBatch(batches[b])

        if (abortRef.current) { handleCancel(); return }

        finalTxs.push(...categorized)
        const current = Math.min((b+1)*BATCH_SIZE, allParsed.length)
        const pct     = Math.round(current / allParsed.length * 100)

        setStatus({
          phase:'ai', pct, current, total:allParsed.length,
          eta: calcETA(current, allParsed.length),
          message:`Gemini AI: categorizzate ${current} di ${allParsed.length}`,
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

    const added   = addTransactions(finalTxs)

    setStatus({ phase:'save', pct:85, current:Math.floor(finalTxs.length*0.85),
      total:finalTxs.length, eta:null, message:'Sincronizzazione database…' })
    await new Promise(r => setTimeout(r, 200))

    setStatus({ phase:'save', pct:100, current:finalTxs.length,
      total:finalTxs.length, eta:null, message:'✓ Ci siamo quasi…' })
    await new Promise(r => setTimeout(r, 300))
    const aiCount = 0 // AI enrichment is now a separate step
    const dupes   = Math.max(0, finalTxs.length - (typeof added==='number' ? added : finalTxs.length))

    setStatus(null)

    // ── Card reconciliation ──────────────────────────────────
    const selectedAccountObj = userAccounts.find(a => a.name === account)
    if (selectedAccountObj?.type === 'carta' && selectedAccountObj?.card4) {
      const card4   = selectedAccountObj.card4
      const allTxs  = useStore.getState().transactions
      const panRegex = new RegExp(`[0-9X]{4,}${card4}\\b`, 'i')

      // Find unreconciled ESTRATTO transactions for this card in other accounts
      const estrattos = allTxs
        .filter(t =>
          !t.excluded &&
          t.account !== selectedAccountObj.name &&
          t.amount < 0 &&
          /estratto|utilizzo carte|carta di credito/i.test(t.description || '') &&
          (t.card === card4 || panRegex.test(t.description || ''))
        )
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

      if (estrattos.length > 0) {
        // All card transactions for this card account
        const cardTxs = allTxs
          .filter(t => t.account === selectedAccountObj.name && !t.excluded)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

        // Match each ESTRATTO with card transactions in its period
        let prevDate = null
        const reconciled = estrattos.map(estratto => {
          const periodTxs = cardTxs.filter(t =>
            t.date <= estratto.date && (!prevDate || t.date > prevDate)
          )
          const cardSum    = periodTxs.reduce((s, t) => s + Math.abs(t.amount), 0)
          const estrattoAmt = Math.abs(estratto.amount)
          const diff       = Math.abs(cardSum - estrattoAmt)
          const pct        = estrattoAmt > 0 ? diff / estrattoAmt : 1
          const status     = cardSum === 0 ? 'missing' : pct < 0.02 ? 'ok' : pct < 0.08 ? 'partial' : 'mismatch'
          const periodLabel = prevDate
            ? `${prevDate} → ${estratto.date}`
            : `fino al ${estratto.date}`
          prevDate = estratto.date
          return { estratto, periodTxs, cardSum, diff, status, periodLabel }
        })

        setReconcileData({ selectedAccount: selectedAccountObj, reconciled })
        setShowReconcileModal(true)
        setDone({ total: finalTxs.length, aiCount: 0, dupes })
        return  // don't auto-close — reconcile modal will handle it
      }
    }

    setDone({ total:finalTxs.length, aiCount, dupes })
    setTimeout(onClose, 2500)
  }

  const isRunning = status !== null

  return (
    <>
    <div className="modal-backdrop" onClick={!isRunning ? onClose : undefined}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h3><Upload size={16}/> Importa CSV</h3>
          {!isRunning && <button className="btn btn-ghost" onClick={onClose}><X size={16}/></button>}
        </div>

        {/* Setup form — hidden while running */}
        {!isRunning && !done && (
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
            </div>
            {reconcileData && (
              <button className="btn btn-primary" style={{marginTop:16,width:'100%'}}
                onClick={()=>setShowReconcileModal(true)}>
                🔍 Riconcilia {reconcileData.reconciled.length} estratt{reconcileData.reconciled.length===1?'o':'i'} →
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        {!isRunning && !done && (
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

    {/* Card reconciliation modal — rendered on top */}
    {showReconcileModal && reconcileData && (
      <CardReconcileModal
        data={reconcileData}
        onClose={()=>{ setShowReconcileModal(false); onClose() }}
      />
    )}
    </>
  )
}
