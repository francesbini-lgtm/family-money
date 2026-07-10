import { useState, useRef, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { parseCSV } from '../data/csvParser'
import { categorizeBatch } from '../data/aiService'
import { X, Upload, Sparkles, Clock, Search } from 'lucide-react'
import './ImportModal.css'
// spin animation added via CSS

// Legge un file CSV/TXT come testo normale, oppure — se è un Excel (.xls/.xlsx) —
// lo converte in testo CSV prima di passarlo a parseCSV, così tutta la logica di
// rilevamento banca/colonne/formato resta invariata e condivisa fra i due formati.
// xlsx importato dinamicamente: libreria pesante, caricata solo se l'utente sceglie
// davvero un file Excel (stesso pattern già usato in questo file per aiService).
async function fileToCSVText(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) return file.text()
  const XLSX  = await import('xlsx')
  const buf   = await file.arrayBuffer()
  const wb    = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  // raw:false + dateNF forza date/numeri alla loro rappresentazione testuale
  // (es. "15/03/2026"), che parseDate()/parseAmount() in csvParser.js già gestiscono
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'dd/mm/yyyy', defval: '' })
  const escCell = v => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return rows.map(r => r.map(escCell).join(',')).join('\n')
}

// Alcuni export di carte includono, in mezzo alle transazioni vere, righe di
// riepilogo/totale mensile (es. "Maggio 2026" con solo un importo aggregato, senza
// data né commerciante). Questi totali NON vanno mai fidati/importati come se fossero
// una spesa reale: i totali per mese li calcoliamo sempre noi dalle transazioni singole
// (vedi buildMonthGroups). Pattern stretto per non scartare mai una vera transazione.
const ITALIAN_MONTHS_RE = '(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)'
function isMonthSummaryRow(desc) {
  const d = (desc || '').trim().toLowerCase()
  if (!d) return false
  const re = new RegExp(`^(totale|subtotale|riepilogo)?\\s*${ITALIAN_MONTHS_RE}\\s+\\d{4}$`, 'i')
  return re.test(d)
}

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
    if (!map[ym]) map[ym] = { month: ym, label: monthLabel(ym), txs: [], net: 0 }
    map[ym].txs.push(t)
    map[ym].net += t.amount   // somma CON segno — è quella che conta per confrontare con l'estratto reale
  })
  return Object.values(map)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(g => {
      const net = Math.round(g.net * 100) / 100
      // "total" = |net|, NON la somma dei valori assoluti delle singole righe: se nel mese
      // c'è un rimborso/accredito insieme alle spese (es. un reso Amazon), sommare gli
      // importi assoluti gonfia il totale rispetto a quello che l'estratto conto reale
      // mostra davvero (che è sempre un movimento netto) — bug reale trovato con un file utente
      return { ...g, net, total: Math.abs(net) }
    })
}

// Prima/ultima data plausibile per l'estratto di un mese CSV "ym" (es. "2026-04"): un
// estratto non può mai precedere il mese a cui si riferisce, e nella pratica arriva di
// solito entro 1-2 mesi dopo — usato per NON abbinare in automatico un estratto lontano
// nel tempo solo perché l'importo coincide per caso (bug reale trovato: Apr 2026 abbinato
// in automatico a un estratto di Ago 2025 solo perché l'importo era vicino)
function monthKeyAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function isPlausibleEstrattoDate(estrattoDate, ym) {
  if (!estrattoDate) return false
  return estrattoDate >= `${ym}-01` && estrattoDate < `${monthKeyAdd(ym, 3)}-01`
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
      // Solo candidati con una data plausibile per QUESTO mese (non prima, non troppo dopo)
      const plausible = candidates.filter(c => !used.has(c.txId) && isPlausibleEstrattoDate(c.date, g.month))
      const ok      = plausible.find(c => g.total > 0 && Math.abs(Math.abs(c.amount) - g.total) / g.total < 0.02)
      const partial = !ok && plausible.find(c => g.total > 0 && Math.abs(Math.abs(c.amount) - g.total) / g.total < 0.08)
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
          <strong style={{ color: 'var(--text2)' }}> Il saldo del conto corrente non cambia mai</strong>: l'estratto viene tolto dal
          totale (per non contarlo due volte) solo nella stessa misura in cui il dettaglio importato lo rimpiazza — un'eventuale
          differenza viene aggiunta come rettifica automatica, così i soldi realmente usciti dal conto restano sempre gli stessi.
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
    const icon = (a.type === 'carta_credito' || a.type === 'carta_debito') ? '💳' : '🏦'
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
  // extraTxs: eventuali righe di "rettifica" (vedi handleCardReconcileConfirm) —
  // salvate direttamente, SENZA passare da AI (sono già complete/categorizzate)
  async function runAIAndSave(txsToImport, { dedupAgainst, skippedMonths, extraTxs } = {}) {
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

    // Righe di rettifica (garanzia saldo invariato) — salvate a parte, non hanno bisogno di dedup speciale
    let correctionsCount = 0
    if (extraTxs?.length) {
      correctionsCount = addTransactions(extraTxs)
    }

    setStatus({ phase:'save', pct:85, current:Math.floor(finalTxs.length*0.85),
      total:finalTxs.length, eta:null, message:'Sincronizzazione database…' })
    await new Promise(r => setTimeout(r, 200))

    setStatus({ phase:'save', pct:100, current:finalTxs.length,
      total:finalTxs.length, eta:null, message:'✓ Ci siamo quasi…' })
    await new Promise(r => setTimeout(r, 300))
    const aiCount = 0 // AI enrichment is now a separate step
    const dupes   = Math.max(0, finalTxs.length - (typeof added==='number' ? added : finalTxs.length))

    setStatus(null)
    setDone({ total:finalTxs.length, aiCount, dupes, skippedMonths: skippedMonths || [], correctionsCount })
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
    try {
      for (const file of files) {
        const text = await fileToCSVText(file)
        const txs  = parseCSV(text, account, aiRules || [], useStore.getState().transactions)
        allParsed.push(...txs)
      }
    } catch (e) {
      setError(`Errore leggendo il file: ${e.message || e}`)
      setStatus(null); return
    }

    // Scarta eventuali righe di riepilogo/totale mensile presenti nel file (es. "Maggio
    // 2026" con solo un importo aggregato) — teniamo SOLO le transazioni singole, i
    // totali per mese li calcoliamo sempre noi da quelle (vedi buildMonthGroups più sotto)
    const parsedCount = allParsed.length
    allParsed = allParsed.filter(t => !isMonthSummaryRow(t.description) && !isMonthSummaryRow(t.descAI))
    const summaryRowsDropped = parsedCount - allParsed.length

    allParsed.sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))

    if (!allParsed.length) {
      setError('Nessuna transazione trovata. Verifica il formato del file.')
      setStatus(null); return
    }

    if (abortRef.current) { handleCancel(); return }

    setStatus({ phase:'parse', pct:100, current:allParsed.length,
      total:allParsed.length, eta:null,
      message:`✓ Lette ${allParsed.length} transazioni dal CSV`
        + (summaryRowsDropped > 0 ? ` (scartate ${summaryRowsDropped} righe di riepilogo mensile)` : '') })

    // ── Carta di credito: riconciliazione mensile PRIMA di AI/salvataggio ──
    // NOTA: solo "carta_credito" — è l'unico tipo con un estratto conto mensile
    // aggregato da riconciliare; una carta di debito addebita in tempo reale,
    // riga per riga, quindi non ha un "estratto" con cui fare il match.
    const selectedAccountObj = userAccounts.find(a => a.name === account)
    if (selectedAccountObj?.type === 'carta_credito' && selectedAccountObj?.card4) {
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
  // GARANZIA saldo invariato: l'estratto escluso tolto dal saldo del conto corrente deve
  // essere rimpiazzato da un importo di dettaglio ESATTAMENTE identico. Se la somma (con
  // segno) delle transazioni del CSV per un mese non coincide al centesimo con l'estratto
  // (differenza di arrotondamento, piccola commissione non nel dettaglio, o abbinamento
  // "differenza lieve"/"mismatch" confermato comunque), viene aggiunta automaticamente una
  // riga di rettifica per l'esatta differenza — così il saldo del conto NON cambia mai,
  // indipendentemente dalla qualità dell'abbinamento.
  async function handleCardReconcileConfirm({ matchedMonths, estrattoTxIdsToExclude }) {
    const { account: acc, monthGroups, allParsed } = cardReconcile
    const card4 = acc.card4
    const allTxsNow = useStore.getState().transactions

    // 1. Escludi gli estratti abbinati dal conto corrente — SOLO ora, ad avvenuta conferma
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

    // 2b. Rettifica automatica per garantire saldo invariato (vedi nota sopra)
    const yr2 = String(new Date().getFullYear()).slice(2)
    const correctionTxs = []
    matchedMonths.forEach(({ month, estrattoTxId }) => {
      const g         = monthGroups.find(mm => mm.month === month)
      const estrattoTx = allTxsNow.find(t => t.txId === estrattoTxId)
      if (!g || !estrattoTx) return
      const residual = Math.round((estrattoTx.amount - g.net) * 100) / 100
      if (Math.abs(residual) < 0.01) return   // combacia già al centesimo, nessuna rettifica necessaria
      correctionTxs.push({
        txId:          `${yr2}-RETT-${Date.now()}-${month}`,
        date:          estrattoTx.date,
        date_reg:      estrattoTx.date,
        isBonifico:    false,
        time:          null, card: card4, counterpart: null, merchant: null, city: null, streetHint: null,
        account:       acc.name,
        description:   `Rettifica riconciliazione carta *${card4} — differenza estratto/dettaglio ${monthLabel(month)}`,
        descAI:        `Rettifica *${card4}`,
        amount:        residual,
        type:          residual >= 0 ? 'Income' : 'Expense',
        cat1:          estrattoTx.cat1 || 'Non Categorizzato',
        cat2:          estrattoTx.cat2 || '',
        conf:          1,
        excluded:      false,
        aiCategorized: true,
        cardImportCard4: card4,
        cardImportEstrattoTxId: estrattoTxId,
        cardImportCorrection: true,
      })
    })

    // 3. Doppioni controllati solo contro precedenti import della STESSA carta
    const dedupAgainst = allTxsNow.filter(t => t.cardImportCard4 === card4)

    // 4. Mesi non abbinati (es. estratto non ancora arrivato) restano fuori — si reimporta più avanti
    const skippedMonths = monthGroups.filter(g => !matchedMonthSet.has(g.month)).map(g => g.label)

    setCardReconcile(null)
    startTimeRef.current = Date.now()
    setStatus({ phase:'ai', pct:0, current:0, total:txsToImport.length, eta:null, message:'Preparazione…' })
    await runAIAndSave(txsToImport, { dedupAgainst, skippedMonths, extraTxs: correctionTxs })
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
              formati CSV italiani — il parser rileva automaticamente il formato. Accetta anche file Excel
              (.xls/.xlsx), convertiti automaticamente. Puoi selezionare più file.
            </div>

            <label className="form-label">Conto / Carta</label>
            <select className="form-select" value={account} onChange={e=>setAccount(e.target.value)}>
              {userAccounts.map(a=>(
                <option key={a.id} value={a.name}>{accountLabel(a)}</option>
              ))}
            </select>

            <label className="form-label" style={{marginTop:14}}>File CSV o Excel</label>
            <input type="file" accept=".csv,.txt,.xls,.xlsx" multiple className="form-file"
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
              {done.correctionsCount>0 && (
                <div style={{color:'var(--text3)'}}>⚖️ {done.correctionsCount} rettifica{done.correctionsCount===1?'':'che'} automatica{done.correctionsCount===1?'':'he'} per mantenere il saldo del conto invariato</div>
              )}
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
