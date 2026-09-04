// ── Pipeline di COMMIT di un import (salvataggio → AI Gemini → regole di sistema) ──
//
// Estratto da ImportModal.jsx (2026-09) per essere richiamabile anche dal wizard di
// import (ImportWizard.jsx) DOPO lo step Doppioni — richiesta utente: il flusso corretto
// è parse → anteprima/selezione → doppioni (su dati NON ancora salvati, confronto vs DB)
// → SOLO ORA salva + AI. Prima l'intera pipeline girava dentro ImportModal subito dopo il
// parse, e lo step Doppioni cancellava a posteriori le righe già salvate/arricchite.
//
// Manteniamo QUI un unico punto di verità così sia lo standalone ImportModal (App.jsx)
// sia il wizard usano esattamente la stessa logica di salvataggio/arricchimento/regole.
//
// Tutte le funzioni sono "pure di orchestrazione": leggono/scrivono lo store via
// useStore.getState() e riportano lo stato di avanzamento tramite il callback onStatus,
// così chi le chiama (ImportModal o il wizard) può disegnare la UI di progresso a modo suo.

import { useStore } from '../store/useStore'
import { enrichBatch, hasGeminiKey, cleanRawDescFallback } from './aiService'
import { applyCatRulesTo } from './ruleMatching'
import { findVacationForDate, isVacationEligible } from './vacationRules'

const IMPORT_ENRICH_BATCH = 15  // stesso batch size di AI Enrichment in Transazioni

// ── Storico import (appPrefs.importLog) ──
// Registra un record per ogni import completato, così la prima schermata dell'import
// può mostrare lo storico (data, tipo, somma, n. transazioni, vecchio/nuovo saldo, tappo).
// Cap a 200 record, più recente in testa.
export function logImport(entry) {
  const { appPrefs, setAppPref } = useStore.getState()
  const rec = { id: 'imp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    at: new Date().toISOString(), ...entry }
  const prev = Array.isArray(appPrefs?.importLog) ? appPrefs.importLog : []
  setAppPref('importLog', [rec, ...prev].slice(0, 200))
  return rec
}

function calcETA(startTime, doneCount, totalCount) {
  if (!startTime || doneCount === 0) return null
  const elapsed = (Date.now() - startTime) / 1000
  const rate    = doneCount / elapsed
  const etaSec  = (totalCount - doneCount) / rate
  if (etaSec <  5) return 'meno di 5 secondi'
  if (etaSec < 60) return `circa ${Math.round(etaSec)} secondi`
  return `circa ${Math.round(etaSec / 60)} minuti`
}

// ── Fase di SOLO salvataggio (nessuna AI qui) ──
// dedupAgainst: se passato, i doppioni vengono controllati SOLO contro questo
// sottoinsieme di transazioni (carte: solo import precedenti della stessa carta).
// extraTxs: righe di "rettifica" già complete/categorizzate (nessuna AI necessaria).
// abortRef: ref opzionale { current:boolean } per interrompere a metà.
// Ritorna { savedTxs, total, dupes, correctionsCount }.
export async function saveTxs(txsToImport, { onStatus = () => {}, abortRef, dedupAgainst, extraTxs } = {}) {
  const { addTransactions } = useStore.getState()

  onStatus({ phase: 'save', pct: 10, current: 0, total: txsToImport.length, eta: null, message: 'Preparazione salvataggio…' })
  await new Promise(r => setTimeout(r, 100))

  onStatus({ phase: 'save', pct: 40, current: Math.floor(txsToImport.length * 0.4), total: txsToImport.length, eta: null,
    message: `Salvataggio ${txsToImport.length} transazioni su Firestore…` })
  await new Promise(r => setTimeout(r, 80))

  const savedTxs = addTransactions(txsToImport, dedupAgainst ? { dedupAgainst } : undefined)

  let correctionsCount = 0
  if (extraTxs?.length) correctionsCount = addTransactions(extraTxs).length

  onStatus({ phase: 'save', pct: 85, current: Math.floor(txsToImport.length * 0.85), total: txsToImport.length, eta: null, message: 'Sincronizzazione database…' })
  await new Promise(r => setTimeout(r, 200))

  onStatus({ phase: 'save', pct: 100, current: txsToImport.length, total: txsToImport.length, eta: null, message: '✓ Salvataggio completato' })
  await new Promise(r => setTimeout(r, 250))

  const dupes = Math.max(0, txsToImport.length - savedTxs.length)
  return { savedTxs, total: txsToImport.length, dupes, correctionsCount }
}

// ── Fase FINALE: categorizzazione AI (Gemini) su transazioni già salvate ──
// force:true → l'AI viene invocata SEMPRE su ogni riga appena importata (vedi nota
// storica in ImportModal). Se manca la chiave AI, salta senza bloccare.
export async function runEnrichmentStep(savedTxs, { onStatus = () => {}, abortRef, startTime } = {}) {
  const { updateTransaction } = useStore.getState()
  if (!savedTxs.length) return { enrichedCount: 0, total: 0 }
  if (!hasGeminiKey()) {
    onStatus({ phase: 'ai', pct: 100, current: 0, total: savedTxs.length, eta: null,
      message: '⚠️ Chiave AI (Gemini) mancante in Impostazioni — categorizzazione saltata. Le transazioni restano salvate ma non arricchite (usa ✨ AI Enrichment in Transazioni quando vuoi).' })
    await new Promise(r => setTimeout(r, 1200))
    return { enrichedCount: 0, total: savedTxs.length, skippedNoKey: true }
  }

  const t0 = startTime || Date.now()
  let enrichedCount = 0
  for (let i = 0; i < savedTxs.length; i += IMPORT_ENRICH_BATCH) {
    if (abortRef?.current) break
    const batch   = savedTxs.slice(i, i + IMPORT_ENRICH_BATCH)
    const current = Math.min(i + IMPORT_ENRICH_BATCH, savedTxs.length)
    onStatus({ phase: 'ai', pct: Math.round(current / savedTxs.length * 100), current, total: savedTxs.length,
      eta: calcETA(t0, current, savedTxs.length), message: `Gemini AI: categorizzate ${current} di ${savedTxs.length}` })

    let enriched
    try {
      enriched = await enrichBatch(batch, { force: true })
    } catch (e) {
      console.warn('[import] runEnrichmentStep: enrichBatch interrotto:', e.message)
      break
    }
    enriched.forEach(t => {
      if (!t) return
      const cleanDescAI = (t.descAI && t.descAI.trim() && t.descAI.trim() !== '-')
        ? t.descAI.trim()
        : (cleanRawDescFallback(t.description) || null)
      updateTransaction(t.txId, {
        merchant: t.merchant, counterpart: t.counterpart,
        descAI: cleanDescAI, city: t.city,
        cat1: t.cat1, cat2: t.cat2, conf: t.conf,
        aiEnriched: true,
        aiEnrichedAt: t.aiEnrichedAt || new Date().toISOString(),
        aiCategorized: true,
      })
      enrichedCount++
    })
  }
  return { enrichedCount, total: savedTxs.length }
}

function applyCatRulesLocal(tx, rules) {
  return applyCatRulesTo(tx, rules)
}

// ── Fase "rules": applica le regole di sistema salvate alle transazioni importate ──
// (catRules semplici, regole AI multi-condizione, "importo positivo → Entrate",
// riassegnazione a "Weekend e Vacanze" per le spese in periodo di vacanza dichiarato).
export async function runRulesStep(savedTxIds, { onStatus = () => {} } = {}) {
  const { updateTransaction, applyAiRules, appPrefs } = useStore.getState()
  if (!savedTxIds.length) return { rulesAppliedCount: 0, ruleAppliedIds: [] }
  const ruleAppliedIds = []
  onStatus({ phase: 'rules', pct: 30, current: 0, total: savedTxIds.length, eta: null, message: 'Applicazione delle regole di sistema salvate…' })
  await new Promise(r => setTimeout(r, 150))

  const catRules          = appPrefs?.catRules || []
  const declaredVacations = appPrefs?.calendarVacations || []
  const notVacationDates  = appPrefs?.calendarNotVacationDates || []
  let rulesAppliedCount = 0

  savedTxIds.forEach(txId => {
    const curTx = useStore.getState().transactions.find(s => s.txId === txId)
    if (!curTx) return

    let cat1 = curTx.cat1, cat2 = curTx.cat2, descAI = curTx.descAI, excluded = curTx.excluded
    let changed = false

    const catOverride = applyCatRulesLocal(curTx, catRules)
    if (catOverride) { cat1 = catOverride.cat1; cat2 = catOverride.cat2; changed = true }

    if (typeof applyAiRules === 'function') {
      const zr = applyAiRules(curTx)
      if (zr?.cats?.[0]) { cat1 = zr.cats[0].cat1; cat2 = zr.cats[0].cat2 || ''; changed = true }
      if (zr?.descAI) { descAI = zr.descAI; changed = true }
      if (zr?.exclude) { excluded = true; changed = true }
    }

    if (curTx.amount > 0 && cat1 !== 'Entrate') { cat1 = 'Entrate'; cat2 = ''; changed = true }
    else if (curTx.amount < 0 && cat1 === 'Entrate') { cat1 = 'Non Categorizzato'; cat2 = ''; changed = true }

    const effDateForVac = curTx._effDate || curTx.competenza || curTx.date
    const vacHit = curTx.amount < 0 && cat1 !== 'Weekend e Vacanze' && !notVacationDates.includes(effDateForVac)
      ? findVacationForDate(effDateForVac, declaredVacations)
      : null
    if (vacHit && isVacationEligible(curTx)) { cat1 = 'Weekend e Vacanze'; cat2 = 'Vacanze'; changed = true }

    if (curTx.userEditedCat) { cat1 = curTx.cat1; cat2 = curTx.cat2 }

    const flagCompetenza = cat1 === 'Weekend e Vacanze' && notVacationDates.includes(effDateForVac)
    if (flagCompetenza !== !!curTx.flagCompetenza) changed = true

    if (changed) {
      updateTransaction(txId, { cat1, cat2, descAI, excluded, flagCompetenza })
      rulesAppliedCount++
      ruleAppliedIds.push(txId)
    }
  })

  onStatus({ phase: 'rules', pct: 100, current: savedTxIds.length, total: savedTxIds.length, eta: null, message: '✓ Regole di sistema applicate' })
  await new Promise(r => setTimeout(r, 150))
  return { rulesAppliedCount, ruleAppliedIds }
}

// ── Orchestrazione completa: salva + AI + regole, in UN unico batch Undo ──
// Usata dal wizard DOPO lo step Doppioni (le righe passate sono già ripulite dai
// doppioni/deselezionate). Ritorna il riepilogo completo per il wizard.
export async function commitParsedTxs(txsToImport, { onStatus = () => {}, abortRef, dedupAgainst, extraTxs, batchLabel } = {}) {
  const startTime = Date.now()
  useStore.getState().beginTxUndoBatch()
  try {
    const saveResult = await saveTxs(txsToImport, { onStatus, abortRef, dedupAgainst, extraTxs })
    if (!saveResult) return null
    const enrichResult = await runEnrichmentStep(saveResult.savedTxs, { onStatus, abortRef, startTime })
    const rulesResult  = await runRulesStep(saveResult.savedTxs.map(t => t.txId), { onStatus })
    return {
      savedTxs: saveResult.savedTxs,
      savedTxIds: saveResult.savedTxs.map(t => t.txId),
      total: saveResult.total,
      dupes: saveResult.dupes,
      correctionsCount: saveResult.correctionsCount,
      aiCount: enrichResult.enrichedCount,
      aiSkippedNoKey: enrichResult.skippedNoKey,
      rulesAppliedCount: rulesResult.rulesAppliedCount,
      ruleAppliedIds: rulesResult.ruleAppliedIds || [],
    }
  } finally {
    useStore.getState().commitTxUndoBatch(batchLabel || 'Import')
  }
}
