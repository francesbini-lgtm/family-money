import { create } from 'zustand'
import {
  loadCollection, saveDocument, deleteDocument, loadDocument,
  saveBatch, subscribeToCollection, deleteAllFromCollection,
  loadUserAccounts, saveUserAccounts, batchSaveDocuments, mergeDocument,
} from '../services/firestore'
import { generateDescAI, parseRow } from '../data/csvParser'
import { computeVacationPatch } from '../data/vacationRules'
import { txMatchesConditions } from '../data/ruleMatching'


// ── Resolve user from card → member mapping (pure, no store) ─
export function computeUser(t, userAccounts, appPrefs) {
  const accounts  = userAccounts || []
  const family    = appPrefs?.family || []
  const ownerNick = appPrefs?.ownerNickname || null

  // 1. Card match
  if (t.card) {
    const acc = accounts.find(a => a.card4 === t.card)
    if (acc?.memberId) {
      if (acc.memberId === 'owner') return ownerNick || 'Admin'
      const member = family.find(m => String(m.id) === String(acc.memberId))
      if (member) return member.nickname || member.name?.split(' ')[0] || null
    }
  }
  // 2. cat2 match vs family nicknames
  if (t.cat2) {
    for (const m of family) {
      const nick = m.nickname || m.name?.split(' ')[0] || ''
      if (nick && nick.toLowerCase() === t.cat2.toLowerCase()) return nick
    }
  }
  // 3. Text match in merchant / description
  const hay = `${t.merchant||''} ${t.description||''}`.toLowerCase()
  if (hay.trim()) {
    if (ownerNick && hay.includes(ownerNick.toLowerCase())) return ownerNick
    for (const m of family) {
      const nick = m.nickname || m.name?.split(' ')[0] || ''
      if (nick && hay.includes(nick.toLowerCase())) return nick
    }
  }
  return null
}

// ── Enrich legacy transactions missing merchant/city/time ─
function enrichTx(t) {
  // _effDate: competenza (user-overridden date) wins over bank date in all analytics
  const _effDate = t.competenza || t.date

  // If already AI-enriched, only fill fields that are MISSING — never overwrite
  if (t.aiEnriched) {
    const desc = t.description || ''
    const r    = parseRow(desc)
    return {
      ...t,
      _effDate,
      card:        t.card        || r.card        || null,
      time:        t.time        || r.time        || null,
      city:        t.city        || r.city        || null,
      counterpart: t.counterpart || r.counterpart || null,
      merchant:    t.merchant    || null,  // preserve AI-set merchant
      descAI:      t.descAI      || null,
    }
  }

  // Not yet AI-enriched: run regex enrichment only
  if (t.userEditedDesc) return { ...t, _effDate }

  const desc = t.description || ''
  const r    = parseRow(desc)
  return {
    ...t,
    _effDate,
    card:        r.card        || t.card        || null,
    merchant:    r.merchant    || t.merchant    || null,
    city:        r.city        || t.city        || null,
    time:        r.time        || t.time        || null,
    counterpart: r.counterpart || t.counterpart || null,
    descAI:      r.descAI      || t.descAI      || null,
  }
}

let _nextId = Date.now()
const uid = () => String(_nextId++)

export const useStore = create((set, get) => ({
  // Utente Google attualmente loggato (sincronizzato da AuthContext.jsx a ogni
  // cambio di stato auth) — usato SOLO per audit trail (es. chi ha escluso una
  // transazione), non per la logica di business "proprietario spesa" (quello è
  // il campo tx.user calcolato da computeUser())
  currentUser: null,
  setCurrentUser: (u) => set({ currentUser: u }),

  // ── Data ────────────────────────────────────────────────
  transactions:  [],
  txUndoStack:   [],   // undo history (max 20 entries, in-memory only)
  _txUndoBatch:  null, // null = no batch open; array = batch collecting entries
  userAccounts:  [{ id: 1, name: 'Conto Corrente', type: 'conto', bank: '' }],
  loans:         [],
  scadenze:      [],
  vehicles:      [],
  vehExpenses:   [],
  vacations:     [],
  nannyTS:       [],   // nanny timesheet
  colfTS:        [],   // colf timesheet
  portfolios:    [],   // investment portfolios
  satiPots:      [],   // satispay accantonamenti
  isDemoMode:    false,
  onboardingDone: false, // set true after first import or skip
  ceciliaGoals:  [],   // Cecilia savings goals
  cashEntries:   [],   // manual cash spending log
  notePrelievi:        [],   // mobile ATM withdrawal notes (for future matching)
  pendingWithdrawals:  [],   // temporary withdrawals pending bank reconciliation
  discoverySkipRules:  [],   // descAI strings permanently skipped in Discovery
  energyBills:   [],   // utility bills (luce/gas/acqua)
  salaries:      [],   // RAL e netto annui per persona
  aiChatHistory: [],   // persisted chat (overrides previous definition)
  customCats:    {},   // loaded from Firestore user_settings/custom_cats
  aiRules:       [],   // AI learning rules (Firestore ai_rules collection)
  cityOverrides: {},   // permanent merchant→city overrides (Firestore user_settings/city_overrides)
  locationExclusions: [], // merchants/keywords excluded from location views (Firestore)
  // true solo DOPO che loadAllData() ha risolto il caricamento di app_prefs da Firestore.
  // Finché è false, setAppPref() blocca le scritture: appPrefs locale (es. calendarVacations)
  // è ancora [] di default, quindi qualunque add/update/remove partirebbe da uno stato vuoto
  // e, con mergeDocument che sostituisce i campi-array per intero, sovrascriverebbe in
  // silenzio i dati reali già su Firestore. Vedi guardia in setAppPref più sotto.
  appPrefsLoaded: false,
  // ── App-wide preferences (Firestore user_settings/app_prefs) ─
  appPrefs: {
    family:             [],
    ownerNickname:      '',
    disabledNav:        ['salute','shopping','tempo-libero'],
    cashCats:           ['Figli','Casa'],
    notifPrefs:         {},
    catRules:           [],
    aiNamingRules:      [],
    utilMerchants:      {},
    compLinks:          {},
    aeNotes:            {},
    aeCats:             {},
    nannyName:          '',
    colfName:           '',
    nannyRecon:         {},
    colfRecon:          {},
    satiNotes:          {},
    satiComp:           {},
    atmMeta:            {},
    bonusMap:           {},
    cecBonds:           [],
    calendarVacations:  [],
    attachments:        {},
    salaryData:         {},
    aiPrompts:          {},
    homeLocations:      ['Como', 'Mendrisio'], // legacy
    homeCity:           'Como',
    homeRadius:         300,
  },
  rimborsiCosts: [],   // shared costs with reimbursements

  // ── Filters ─────────────────────────────────────────────
  filters: { search:'', cat1:'', accounts:[], dateFrom:'', dateTo:'', type:'', conf:'' },

  // ── Load all from Firestore ───────────────────────────
  loadAllData: async (userId) => {
    const [txs, lns, scd, veh, vehExp, vac, nan, col, port, sati, cec, cash, energy, chat, rules, rimb, sal, accts, notePrelievi, skipRules, pendingW] = await Promise.all([
      loadCollection('transactions'),
      loadCollection('loans'),
      loadCollection('scadenze'),
      loadCollection('vehicles'),
      loadCollection('veh_expenses'),
      loadCollection('vacations'),
      loadCollection('nanny_ts'),
      loadCollection('colf_ts'),
      loadCollection('portfolios'),
      loadCollection('sati_pots'),
      loadCollection('cecilia_goals'),
      loadCollection('cash_entries'),
      loadCollection('energy_bills'),
      loadCollection('ai_chat'),
      loadCollection('ai_rules'),
      loadCollection('rimborsi_costs'),
      loadCollection('salaries'),
      loadUserAccounts(userId),
      loadCollection('note_prelievi'),
      loadCollection('discovery_skip_rules'),
      loadCollection('pending_withdrawals'),
    ])
    set({
      transactions: txs.map(enrichTx).sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||'')),
      loans: lns, scadenze: scd, vehicles: veh,
      vehExpenses: vehExp, vacations: vac,
      nannyTS: nan, colfTS: col, portfolios: port, satiPots: sati,
      ceciliaGoals: cec, cashEntries: cash, energyBills: energy,
      notePrelievi, discoverySkipRules: skipRules, pendingWithdrawals: pendingW,
      aiChatHistory: chat.sort((a,b)=>a.ts-b.ts),
      aiRules: rules,
      rimborsiCosts: rimb,
      salaries: sal.sort((a,b)=>a.year-b.year||(a.person||'').localeCompare(b.person||'')),
      userAccounts: accts.length ? accts : get().userAccounts,
    })
    // Load customCats from Firestore
    const customCatsDoc = await loadDocument('user_settings', 'custom_cats')
    if (customCatsDoc?.cats && Object.keys(customCatsDoc.cats).length > 0) {
      set({ customCats: customCatsDoc.cats })
    }
    // Load app-wide preferences from Firestore
    const appPrefsDoc = await loadDocument('user_settings', 'app_prefs')
    if (appPrefsDoc) {
      set(s => ({ appPrefs: { ...s.appPrefs, ...appPrefsDoc } }))
    }
    // Solo da qui in avanti appPrefs locale è affidabile (documento caricato, o
    // confermato assente): sblocca le scritture in setAppPref. Va impostato anche se
    // appPrefsDoc è falsy (nuovo utente senza documento ancora) — altrimenti le scritture
    // resterebbero bloccate per sempre.
    set({ appPrefsLoaded: true })
    // Load permanent city overrides
    const cityOverridesDoc = await loadDocument('user_settings', 'city_overrides')
    if (cityOverridesDoc) {
      set({ cityOverrides: cityOverridesDoc })
    }
    // Load location exclusions
    const locExcDoc = await loadDocument('user_settings', 'location_exclusions')
    if (locExcDoc?.list) {
      set({ locationExclusions: locExcDoc.list })
    }
    // Historical cash-sync: push any already-linked cash transactions to DB
    setTimeout(() => get().syncCashTransactions(), 500)
    setTimeout(() => get().reconcilePendingWithdrawals(), 700)
    // Compute/backfill user field for all transactions (after prefs + accounts are loaded)
    setTimeout(() => get().recomputeUsers(), 800)
    // Migrate old compensation: old code set excluded:true on fully-compensated expenses.
    // New behavior: keep visible, show as 0* via _compensatedAmt instead.
    setTimeout(() => {
      const allTxs = get().transactions
      const updateTx = get().updateTransaction
      const incomeFixMap = {}  // incomeTxId → total compensated amount
      allTxs.forEach(tx => {
        if (tx.excluded && tx._compensatedBy && !tx._compensatedAmt) {
          const compensateAmt = Math.abs(tx.amount)
          updateTx(tx.txId, { excluded: false, _compensatedAmt: compensateAmt })
          incomeFixMap[tx._compensatedBy] = (incomeFixMap[tx._compensatedBy] || 0) + compensateAmt
        }
      })
      // Also set _compensatedAmt on income if not already set
      Object.entries(incomeFixMap).forEach(([incomeTxId, total]) => {
        const incomeTx = allTxs.find(t => t.txId === incomeTxId)
        if (incomeTx && !incomeTx._compensatedAmt) {
          updateTx(incomeTxId, { _compensatedAmt: total })
        }
      })
    }, 1500)
  },

  // ── Realtime sync ─────────────────────────────────────
  _unsubs: [],
  startRealtimeSync: () => {
    get()._unsubs.forEach(f=>f())
    set({ _unsubs: [
      subscribeToCollection('transactions', txs => {
        const sorted = txs.map(enrichTx).sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
        const { filters } = get()
        const filtered = sorted.filter(t => {
          if(t.excluded) return false
          if(filters.search){const q=filters.search.toLowerCase();if(!(t.description||'').toLowerCase().includes(q)&&!(t.descAI||'').toLowerCase().includes(q))return false}
          if(filters.cat1 && (filters.cat1==='Non Categorizzato' ? !(!t.cat1 || t.cat1==='Non Categorizzato') : t.cat1!==filters.cat1)) return false
          if(filters.accounts.length>0 && !filters.accounts.includes(t.account)) return false
          if(filters.dateFrom && (t._effDate||t.date||'')<filters.dateFrom) return false
          if(filters.dateTo   && (t._effDate||t.date||'')>filters.dateTo)   return false
          if(filters.type && t.type!==filters.type) return false
          if(filters.conf==='low' && (t.conf||0)>=70) return false
          return true
        })
        set({ transactions: sorted, filteredTx: filtered })
      }),
      subscribeToCollection('scadenze',     scd => set({ scadenze: scd })),
      subscribeToCollection('vehicles',     veh => set({ vehicles: veh })),
      subscribeToCollection('veh_expenses', exp => set({ vehExpenses: exp })),
    ]})
  },
  stopRealtimeSync: () => { get()._unsubs.forEach(f=>f()); set({_unsubs:[]}) },

  // ── Transactions ──────────────────────────────────────
  // ── Undo stack helpers ────────────────────────────────────
  _pushUndoEntry: (entry) => {
    const batch = get()._txUndoBatch
    if (batch !== null) {
      set({ _txUndoBatch: [...batch, entry] })
    } else {
      const stack = get().txUndoStack
      set({ txUndoStack: [...stack.slice(-19), { entries: [entry] }] })
    }
  },
  beginTxUndoBatch: () => { set({ _txUndoBatch: [] }) },
  commitTxUndoBatch: (label = '') => {
    const batch = get()._txUndoBatch
    set({ _txUndoBatch: null })
    if (!batch || batch.length === 0) return
    const stack = get().txUndoStack
    set({ txUndoStack: [...stack.slice(-19), { entries: batch, label }] })
  },
  // BUG REALE TROVATO (2026-07-11, segnalato dall'utente: dopo un Undo su una
  // riconciliazione carta, gli estratti risultavano esclusi per sempre, mai
  // ripristinati — saldo gonfiato dell'importo mancante): questa funzione è
  // dichiarata async ma non aspettava MAI il completamento dei saveDocument()/
  // deleteDocument() verso Firestore — erano tutte fire-and-forget. Per una
  // riconciliazione carta, un Undo genera decine di scritture individuali
  // (13 saveDocument per gli estratti + una deleteDocument per ognuna delle
  // centinaia di righe di dettaglio importate). Se l'utente navigava altrove o
  // chiudeva/ricaricava la scheda subito dopo aver cliccato "Annulla" (comportamento
  // naturale, il click sembrava istantaneo), alcune di quelle scritture potevano non
  // arrivare mai al server — lasciando l'estratto escluso in Firestore per sempre,
  // pur avendo il dettaglio importato già rimosso: un "buco" di spesa non contata
  // da nessuna parte, che gonfia il saldo esattamente dell'importo mancante.
  // Fix: raccoglie tutte le Promise e le aspetta (Promise.allSettled) prima di
  // ritornare, così chi chiama undoLastTx() può a sua volta attendere il completamento.
  undoLastTx: async () => {
    const stack = get().txUndoStack
    if (!stack.length) return
    const last = stack[stack.length - 1]
    set({ txUndoStack: stack.slice(0, -1) })
    const writes = []
    // Revert all entries in reverse order
    for (const entry of [...last.entries].reverse()) {
      if (entry.type === 'update') {
        set(s => ({ transactions: s.transactions.map(t => t.txId === entry.txId ? { ...t, ...entry.prev } : t) }))
        const t = get().transactions.find(t => t.txId === entry.txId)
        if (t) writes.push(saveDocument('transactions', entry.txId, t))
      } else if (entry.type === 'delete') {
        const tx = entry.tx
        set(s => ({ transactions: [...s.transactions, tx].sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||'')) }))
        writes.push(saveDocument('transactions', tx.txId, tx))
      } else if (entry.type === 'add') {
        set(s => ({ transactions: s.transactions.filter(t => !entry.txIds.includes(t.txId)) }))
        for (const txId of entry.txIds) writes.push(deleteDocument('transactions', txId))
      }
    }
    get()._recomputeFiltered()
    await Promise.allSettled(writes)
  },

  // ── Migrazione codici TX ─────────────────────────────────
  // Riassegna txId a tutte le transazioni in ordine cronologico
  // con prefisso YY corretto dall'anno della transazione.
  migrateTxIds: async (onProgress) => {
    const allTxs = [...get().transactions]
    // Sort chronologically (oldest first)
    allTxs.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    // Compute new IDs grouped by year
    const yearCounters = {}
    const plan = allTxs.map(tx => {
      const yr = (tx.date || '2000-01-01').slice(2, 4)  // "2022-11-20" → "22"
      if (!yearCounters[yr]) yearCounters[yr] = 1
      const newId = `${yr}-${String(yearCounters[yr]++).padStart(4, '0')}`
      return { tx, newId, changed: newId !== tx.txId }
    })

    const toChange = plan.filter(p => p.changed)
    if (!toChange.length) return 0

    let done = 0
    // Two-phase migration: first save ALL new docs, then delete old IDs.
    // Deleting inline would wipe a freshly saved doc when a later tx's old ID
    // equals an earlier tx's NEW id.
    const newIds = new Set(toChange.map(p => p.newId))
    for (const { tx, newId } of toChange) {
      let newTx = { ...tx, txId: newId }
      // For non-AI-enriched transactions, re-run regex enrichment to reset any
      // wrong merchant/descAI data that crept in via txId collisions between imports
      if (!newTx.aiEnriched && !newTx.userEditedDesc) {
        const r = parseRow(newTx.description || '')
        newTx = {
          ...newTx,
          merchant:    r.merchant    || null,
          descAI:      r.descAI      || newTx.descAI      || null,
          city:        r.city        || newTx.city         || null,
          card:        r.card        || newTx.card         || null,
          counterpart: r.counterpart || newTx.counterpart  || null,
        }
      }
      await saveDocument('transactions', newId, newTx)
      done++
      onProgress?.(done, toChange.length)
    }
    // Phase 2: delete only old IDs that were NOT reused as new IDs
    for (const { tx } of toChange) {
      if (!newIds.has(tx.txId)) await deleteDocument('transactions', tx.txId)
    }

    // Update in-memory state with all new IDs
    const migrated = plan.map(p => p.changed ? enrichTx({ ...p.tx, txId: p.newId }) : p.tx)
    set({ transactions: migrated.sort((a, b) => (b.date || '').localeCompare(a.date || '')) })
    get()._recomputeFiltered()
    return done
  },

  // opts.dedupAgainst: se passato, i doppioni vengono cercati SOLO in questo
  // sottoinsieme invece che nell'intero elenco transazioni (usato dall'import
  // carta di credito: doppioni controllati solo contro import precedenti della
  // STESSA carta, non l'intero DB — vedi ImportModal.jsx)
  addTransactions: (txs, opts = {}) => {
    const existing = opts.dedupAgainst || get().transactions
    const rawNew = txs.filter(t =>
      !existing.some(e => e.date===t.date && Math.abs(e.amount-t.amount)<0.01 && (e.description||'').trim().slice(0,60)===(t.description||'').trim().slice(0,60))
    )
    // Run regex enrichment immediately — fast, deterministic, no AI needed.
    // This fills descAI, city, time, card, counterpart from the raw description.
    // AI Enrichment (✨ button) will later refine category and ambiguous merchants.
    const { userAccounts: ua, appPrefs: ap } = get()
    const newTxs = rawNew.map(t => {
      const enriched = enrichTx({...t, aiEnriched: false})
      return { ...enriched, user: computeUser(enriched, ua, ap) || null, importedAt: t.importedAt || new Date().toISOString() }
    })
    set(s=>({
      transactions: [...newTxs,...s.transactions].sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
    }))
    saveBatch('transactions', newTxs, 'txId')
    get()._recomputeFiltered()
    // Push undo entry for import — respect an open undo batch (same as _pushUndoEntry)
    if (newTxs.length > 0) {
      const entry = { type: 'add', txIds: newTxs.map(t => t.txId) }
      const batch = get()._txUndoBatch
      if (batch !== null) {
        set({ _txUndoBatch: [...batch, entry] })
      } else {
        const stack = get().txUndoStack
        set({ txUndoStack: [...stack.slice(-19), {
          entries: [entry],
          label: `Import ${newTxs.length} tx`,
        }]})
      }
    }
    // Ritorna l'array delle transazioni EFFETTIVAMENTE salvate (non solo il conteggio) —
    // serve al flusso di import (ImportModal.jsx) per sapere ESATTAMENTE quali txId sono
    // finiti a database (i doppioni scartati da questa funzione non ci sono), così l'AI
    // Enrichment finale (ultimo step della pipeline, dopo la verifica saldo) può girare
    // solo su quelle, mai su righe scartate o mai salvate.
    return newTxs
  },
  updateTransaction: (txId, patch) => {
    const prevTx = get().transactions.find(t => t.txId === txId)
    // Audit trail esclusioni (richiesto dall'utente 2026-07-11, sezione Escluse in
    // Impostazioni): quando patch marca excluded:true, registriamo automaticamente
    // quando (excludedAt), chi (excludedBy: utente Google loggato via currentUser,
    // o 'Sistema' se non determinabile — es. operazioni innescate da un batch senza
    // sessione utente attiva) e se manuale o automatica (excludedType). Solo sulla
    // transizione VERA non-escluso→escluso (mai se era già escluso e il patch lo
    // riafferma soltanto, es. l'AI Enrichment che ripropone excluded:true su righe
    // già escluse per un motivo precedente — altrimenti sovrascriveremmo un audit
    // trail più vecchio e valido con dati odierni fuorvianti). I chiamanti che
    // conoscono già il contesto (bottone "Escludi" esplicito, riconciliazione carta,
    // abbinamento Satispay, ecc.) possono passare questi campi già valorizzati nel
    // patch — qui si riempiono solo quelli mancanti, mai si sovrascrivono.
    if (patch.excluded === true && !prevTx?.excluded) {
      const cu = get().currentUser
      patch = {
        ...patch,
        excludedAt:     patch.excludedAt     || new Date().toISOString(),
        excludedBy:     patch.excludedBy     || cu?.displayName || cu?.email || 'Sistema',
        excludedType:   patch.excludedType   || 'automatic',
        excludedReason: patch.excludedReason ?? null,
      }
    }
    // Record previous values for undo
    if (prevTx) {
      const prev = {}
      Object.keys(patch).forEach(k => { prev[k] = prevTx[k] })
      get()._pushUndoEntry({ type: 'update', txId, prev })
    }
    set(s=>({ transactions: s.transactions.map(t=>t.txId===txId?{...t,...patch}:t) }))
    const t = get().transactions.find(t=>t.txId===txId)
    // Save the merged object as-is — do NOT re-run enrichTx here, or regex
    // results would overwrite fields the caller just patched (merchant, descAI, cat1, cat2, …)
    if(t) {
      const { userAccounts, appPrefs } = get()
      const user = t.user || computeUser(t, userAccounts, appPrefs) || null
      saveDocument('transactions', txId, {...t, ...patch, user})
    }
    get()._recomputeFiltered()
  },

  deleteTransaction: (txId) => {
    const prevTx = get().transactions.find(t => t.txId === txId)
    if (prevTx) {
      // Batch-aware (fix 2026-07-12): dentro beginTxUndoBatch/commitTxUndoBatch
      // l'eliminazione confluisce nel batch (una sola voce Undo per l'operazione
      // di massa); standalone si comporta come prima (voce singola etichettata).
      const batch = get()._txUndoBatch
      if (batch !== null) {
        set({ _txUndoBatch: [...batch, { type: 'delete', tx: prevTx }] })
      } else {
        const stack = get().txUndoStack
        set({ txUndoStack: [...stack.slice(-19), {
          entries: [{ type: 'delete', tx: prevTx }],
          label: `Elimina ${prevTx.descAI || prevTx.description || txId}`,
        }]})
      }
      // Storico persistente per ripristino da Impostazioni (richiesta utente
      // 2026-07-15): l'undo locale sopra copre solo la sessione corrente (max 20
      // voci, perso al refresh) — qui si tiene una copia completa della
      // transazione in appPrefs.deletedTxLog, capped alle ultime 300, con
      // data/utente di cancellazione, così è recuperabile anche giorni dopo.
      if (get().appPrefsLoaded) {
        const cu = get().currentUser
        const log = get().appPrefs?.deletedTxLog || []
        const entry = { ...prevTx, deletedAt: new Date().toISOString(), deletedBy: cu?.displayName || cu?.email || 'Sistema' }
        get().setAppPref('deletedTxLog', [...log.slice(-299), entry])
      }
      // Pulizia registri collegati (bug segnalato 2026-07-15: voci "fantasma" in
      // Altre Entrate/compensazioni che referenziano un txId non più esistente) —
      // rimuove i riferimenti pendenti a questo txId da compLinks/aeNotes/aeCats,
      // così non restano agganci morti dopo l'eliminazione.
      if (get().appPrefsLoaded) {
        const ap = get().appPrefs || {}
        if (ap.compLinks && ap.compLinks[txId]) {
          const next = { ...ap.compLinks }; delete next[txId]
          get().setAppPref('compLinks', next)
        }
        if (ap.aeNotes && ap.aeNotes[txId] !== undefined) {
          const next = { ...ap.aeNotes }; delete next[txId]
          get().setAppPref('aeNotes', next)
        }
        if (ap.aeCats && ap.aeCats[txId] !== undefined) {
          const next = { ...ap.aeCats }; delete next[txId]
          get().setAppPref('aeCats', next)
        }
      }
    }
    set(s=>({ transactions: s.transactions.filter(t=>t.txId!==txId) }))
    deleteDocument('transactions', txId)
    get()._recomputeFiltered()
  },
  // Ripristina una transazione dallo storico eliminazioni (Impostazioni → Transazioni eliminate)
  restoreDeletedTransaction: (txId) => {
    const log = get().appPrefs?.deletedTxLog || []
    const entry = log.find(t => t.txId === txId)
    if (!entry) return
    const { deletedAt, deletedBy, ...tx } = entry
    get().addTransactions([tx])
    get().setAppPref('deletedTxLog', log.filter(t => t.txId !== txId))
  },
  deleteAllTransactions: async () => {
    const count = get().transactions.length

    // 1. Kill ALL realtime listeners so onSnapshot cannot repopulate
    //    the store while Firestore deletes are in flight.
    get()._unsubs.forEach(f => f())
    set({ _unsubs: [], transactions: [], txUndoStack: [] })
    get()._recomputeFiltered()

    // 2. Bulk-delete via writeBatch (up to 400 docs per batch → atomic).
    await deleteAllFromCollection('transactions')

    // 3. Restart all listeners — transactions onSnapshot fires immediately
    //    with the now-empty collection and sets transactions: [].
    get().startRealtimeSync()

    return count
  },

  // ── Scadenze ──────────────────────────────────────────
  addScadenza: (s) => {
    const item = {...s, id: uid()}
    set(st=>({ scadenze: [...st.scadenze, item] }))
    saveDocument('scadenze', item.id, item)
    return item
  },
  updateScadenza: (id, patch) => {
    set(s=>({ scadenze: s.scadenze.map(x=>x.id===id?{...x,...patch}:x) }))
    const x = get().scadenze.find(x=>x.id===id)
    if(x) saveDocument('scadenze', id, x)
  },
  deleteScadenza: (id) => {
    set(s=>({ scadenze: s.scadenze.filter(x=>x.id!==id) }))
    deleteDocument('scadenze', id)
  },

  // ── Vehicles ──────────────────────────────────────────
  addVehicle: (v) => {
    const item = {...v, id: uid()}
    set(s=>({ vehicles: [...s.vehicles, item] }))
    saveDocument('vehicles', item.id, item)
    return item
  },
  updateVehicle: (id, patch) => {
    set(s=>({ vehicles: s.vehicles.map(v=>v.id===id?{...v,...patch}:v) }))
    const v = get().vehicles.find(v=>v.id===id)
    if(v) saveDocument('vehicles', id, v)
  },
  deleteVehicle: (id) => {
    set(s=>({ vehicles: s.vehicles.filter(v=>v.id!==id) }))
    deleteDocument('vehicles', id)
  },
  addVehExpense: (e) => {
    const item = {...e, id: uid()}
    set(s=>({ vehExpenses: [...s.vehExpenses, item] }))
    saveDocument('veh_expenses', item.id, item)
    return item
  },
  updateVehExpense: (id, patch) => {
    set(s=>({vehExpenses:s.vehExpenses.map(e=>e.id===id?{...e,...patch}:e)}))
    const e = get().vehExpenses.find(e=>e.id===id)
    if(e) saveDocument('veh_expenses', id, {...e,...patch})
    // Trigger cash-sync when ATM link or Satispay link changes
    if (patch.reconRef !== undefined || patch.reconType !== undefined || patch.satiTxId !== undefined) {
      setTimeout(() => get().syncCashTransactions(), 0)
    }
  },
  deleteVehExpense: (id) => {
    set(s=>({ vehExpenses: s.vehExpenses.filter(e=>e.id!==id) }))
    deleteDocument('veh_expenses', id)
  },

  // ── Loans ─────────────────────────────────────────────
  addLoan: (l) => {
    const item = {...l, id: uid()}
    set(s=>({ loans: [...s.loans, item] }))
    saveDocument('loans', item.id, item)
    return item
  },
  updateLoan: (id, patch) => {
    set(s=>({ loans: s.loans.map(l=>l.id===id?{...l,...patch}:l) }))
    const l = get().loans.find(l=>l.id===id)
    if(l) saveDocument('loans', id, l)
  },
  deleteLoan: (id) => {
    set(s=>({ loans: s.loans.filter(l=>l.id!==id) }))
    deleteDocument('loans', id)
  },

  // ── Vacations ─────────────────────────────────────────
  addVacation: (v) => {
    const item = {...v, id: uid()}
    set(s=>({ vacations: [...s.vacations, item] }))
    saveDocument('vacations', item.id, item)
    return item
  },
  deleteVacation: (id) => {
    set(s=>({ vacations: s.vacations.filter(v=>v.id!==id) }))
    deleteDocument('vacations', id)
  },

  updateVacation: (id, patch) => {
    set(s => ({ vacations: s.vacations.map(v => v.id===id ? {...v,...patch} : v) }))
    const item = get().vacations.find(v => v.id===id)
    if (item) saveDocument('vacations', id, item)
  },

  // ── Nanny / Colf ──────────────────────────────────────
  addNannyMonth: (m) => {
    const item = {...m, id: uid()}
    set(s=>({ nannyTS: [item,...s.nannyTS] }))
    saveDocument('nanny_ts', item.id, item)
  },
  deleteNannyMonth: (id) => {
    set(s=>({ nannyTS: s.nannyTS.filter(x=>x.id!==id) }))
    deleteDocument('nanny_ts', id)
  },
  // richiesta utente 2026-07-21: nota editabile via pallino in tabella
  updateNannyMonth: (id, patch) => {
    set(s=>({ nannyTS: s.nannyTS.map(x => x.id===id ? {...x,...patch} : x) }))
    const item = get().nannyTS.find(x=>x.id===id)
    if (item) saveDocument('nanny_ts', id, item)
  },
  addColfMonth: (m) => {
    const item = {...m, id: uid()}
    set(s=>({ colfTS: [item,...s.colfTS] }))
    saveDocument('colf_ts', item.id, item)
  },
  deleteColfMonth: (id) => {
    set(s=>({ colfTS: s.colfTS.filter(x=>x.id!==id) }))
    deleteDocument('colf_ts', id)
  },
  updateColfMonth: (id, patch) => {
    set(s=>({ colfTS: s.colfTS.map(x => x.id===id ? {...x,...patch} : x) }))
    const item = get().colfTS.find(x=>x.id===id)
    if (item) saveDocument('colf_ts', id, item)
  },

  // ── Portfolios ────────────────────────────────────────
  addPortfolio: (p) => {
    const item = {...p, id:uid()}
    set(s=>({ portfolios: [...s.portfolios, item] }))
    saveDocument('portfolios', item.id, item)
    return item
  },
  updatePortfolio: (id, patch) => {
    set(s=>({ portfolios: s.portfolios.map(x=>x.id===id?{...x,...patch}:x) }))
    const x = get().portfolios.find(x=>x.id===id)
    if(x) saveDocument('portfolios', id, x)
  },
  addPortfolioPosition: (portfolioId, position) => {
    set(s=>({ portfolios: s.portfolios.map(p=>p.id===portfolioId
      ? {...p, positions:[...(p.positions||[]), position]}
      : p) }))
    const p = get().portfolios.find(p=>p.id===portfolioId)
    if(p) saveDocument('portfolios', portfolioId, p)
  },
  updatePortfolioPosition: (portfolioId, posId, patch) => {
    set(s=>({ portfolios: s.portfolios.map(p=>p.id===portfolioId
      ? {...p, positions:(p.positions||[]).map(x=>x.id===posId?{...x,...patch}:x)}
      : p) }))
    const p = get().portfolios.find(p=>p.id===portfolioId)
    if(p) saveDocument('portfolios', portfolioId, p)
  },
  deletePortfolioPosition: (portfolioId, posId) => {
    set(s=>({ portfolios: s.portfolios.map(p=>p.id===portfolioId
      ? {...p, positions:(p.positions||[]).filter(x=>x.id!==posId)}
      : p) }))
    const p = get().portfolios.find(p=>p.id===portfolioId)
    if(p) saveDocument('portfolios', portfolioId, p)
  },
  deletePortfolio: (id) => {
    set(s=>({ portfolios: s.portfolios.filter(x=>x.id!==id) }))
    deleteDocument('portfolios', id)
  },

  // ── Sati pots ─────────────────────────────────────────
  addSatiPot: (p) => {
    const item = {...p, id:uid(), data:{}}
    set(s=>({ satiPots: [...s.satiPots, item] }))
    saveDocument('sati_pots', item.id, item)
    return item
  },
  updateSatiPot: (id, patch) => {
    set(s=>({ satiPots: s.satiPots.map(x=>x.id===id?{...x,...patch}:x) }))
    const x = get().satiPots.find(x=>x.id===id)
    if(x) saveDocument('sati_pots', id, x)
  },
  deleteSatiPot: (id) => {
    set(s=>({ satiPots: s.satiPots.filter(x=>x.id!==id) }))
    deleteDocument('sati_pots', id)
  },

  // ── Demo mode ─────────────────────────────────────────
  loadDemoData: () => {
    const MERCHANTS = ['Esselunga','Netflix','Shell','Amazon','Trenitalia','Farmacia','Zara','Bar Centro','Ristorante Da Mario','Spotify','IKEA','Decathlon']
    const CATS_DEMO = [
      {l1:'Spesa e Alimentari',l2:'Spesa'},{l1:'Spesa e Alimentari',l2:'Spesa'},
      {l1:'Casa',l2:'Utenze'},{l1:'Veicoli',l2:'Carburante'},
      {l1:'Tempo Libero',l2:'Cene'},{l1:'Shopping',l2:'Shopping Online'},
      {l1:'Shopping',l2:'Abbigliamento'},{l1:'Salute e Cura',l2:'Visite'},
      {l1:'Weekend e Vacanze',l2:'Weekend'},{l1:'Tempo Libero',l2:'Sport'},
    ]
    const txs = []
    let seq=1
    for(let m=0;m<6;m++){
      const d=new Date()
      d.setMonth(d.getMonth()-m)
      const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
      // Income
      txs.push({txId:`D-${seq++}`,date:ym+'-01',account:'Conto Corrente',description:'STIPENDIO',descAI:'Stipendio',amount:3200,type:'Income',cat1:'Entrate',cat2:'Fra',conf:95,excluded:false})
      txs.push({txId:`D-${seq++}`,date:ym+'-01',account:'Conto Corrente',description:'STIPENDIO SOFIA',descAI:'Stipendio Sofia',amount:2100,type:'Income',cat1:'Entrate',cat2:'Sofi',conf:95,excluded:false})
      // Expenses
      for(let i=0;i<18;i++){
        const cat=CATS_DEMO[Math.floor(Math.random()*CATS_DEMO.length)]
        const merchant=MERCHANTS[Math.floor(Math.random()*MERCHANTS.length)]
        const day=String(1+Math.floor(Math.random()*28)).padStart(2,'0')
        const amount=-(30+Math.floor(Math.random()*400))
        txs.push({txId:`D-${seq++}`,date:ym+'-'+day,account:'Conto Corrente',description:`PAGAMENTO ${merchant.toUpperCase()}`,descAI:merchant,amount,type:'Expense',cat1:cat.l1,cat2:cat.l2,conf:80,excluded:false})
      }
    }
    txs.sort((a,b)=>b.date.localeCompare(a.date))

    const scadenze=[
      {id:'ds1',nome:'Bollo Auto',cat:'Auto',importo:185,data:new Date(Date.now()+15*86400000).toISOString().slice(0,10),cadenza:'Annuale',pagata:false},
      {id:'ds2',nome:'Assicurazione RC',cat:'Assicurazione',importo:780,data:new Date(Date.now()+45*86400000).toISOString().slice(0,10),cadenza:'Annuale',pagata:false},
      {id:'ds3',nome:'Netflix',cat:'Abbonamento',importo:15.99,data:new Date(Date.now()+5*86400000).toISOString().slice(0,10),cadenza:'Mensile',pagata:false},
      {id:'ds4',nome:'Mutuo',cat:'Mutuo/Prestito',importo:920,data:new Date(Date.now()+3*86400000).toISOString().slice(0,10),cadenza:'Mensile',pagata:false},
    ]

    const vehicles=[
      {id:'dv1',name:'BMW 320d',targa:'EF123GH',marca:'BMW',modello:'320d',anno:'2021',icon:'🚗'},
      {id:'dv2',name:'Mini Cooper',targa:'AB456CD',marca:'Mini',modello:'Cooper S',anno:'2019',icon:'🚙'},
    ]

    const portfolios = [
      { id:'dp1', name:'Portafoglio ETF', positions:[
        { id:'pos1', name:'iShares S&P 500', ticker:'CSPX', type:'ETF', quantity:15, avgPrice:450, currentPrice:487, invested:6750, currentValue:7305, pnl:555, pnlPct:'8.2' },
        { id:'pos2', name:'Xtrackers MSCI World', ticker:'XDWD', type:'ETF', quantity:20, avgPrice:85, currentPrice:91, invested:1700, currentValue:1820, pnl:120, pnlPct:'7.1' },
      ]},
    ]

    const satiPots = [
      { id:'dsp1', name:'Fondo Emergenze', icon:'🛡️', monthly:300, startYM:'2026-01', data:{
        '2026-01':{reconciled:true},'2026-02':{reconciled:true},'2026-03':{reconciled:true},
        '2026-04':{reconciled:true},'2026-05':{reconciled:false},
      }},
      { id:'dsp2', name:'Vacanze Estate', icon:'✈️', monthly:200, startYM:'2026-01', data:{
        '2026-01':{reconciled:true},'2026-02':{reconciled:true},'2026-03':{reconciled:true},
      }},
    ]

    const nannyTS = [
      { id:'dnn1', mese:'2026-05', ore:88, rate:12, base:1056, bonus:0, totale:1056, pagato:true },
      { id:'dnn2', mese:'2026-04', ore:84, rate:12, base:1008, bonus:50, totale:1058, pagato:true },
    ]

    const vacations = [
      { id:'dv1', name:'Sardegna Estate', dest:'Sardegna', type:'Vacanza', dateFrom:'2026-08-01', dateTo:'2026-08-14', budget:3500, note:'Costa Smeralda' },
      { id:'dv2', name:'Weekend Milano', dest:'Milano', type:'Weekend', dateFrom:'2026-06-20', dateTo:'2026-06-22', budget:400, note:'' },
    ]

    const vehExpenses = [
      { id:'de1', vehicleId:'dv1', date:'2026-05-15', cat:'Carburante', desc:'Pieno Shell A9', amount:78 },
      { id:'de2', vehicleId:'dv1', date:'2026-04-10', cat:'Tagliando', desc:'Tagliando + filtri BMW', amount:320 },
      { id:'de3', vehicleId:'dv2', date:'2026-05-02', cat:'Assicurazione', desc:'Rinnovo RC Auto', amount:680 },
    ]

    set({ transactions:txs, scadenze, vehicles, vehExpenses, nannyTS, colfTS:[], portfolios, satiPots, vacations, isDemoMode:true, appPrefsLoaded:true })
  },

  setOnboardingDone: () => {
    set({ onboardingDone: true })
  },
  checkOnboarding: () => {
    // no-op: onboarding state is managed in Firestore via loadAllData
  },

  // ── Cecilia goals ─────────────────────────────────────
  addCeciliaGoal: (g) => {
    const item={...g,id:uid()}
    set(s=>({ceciliaGoals:[...s.ceciliaGoals,item]}))
    saveDocument('cecilia_goals',item.id,item)
  },
  updateCeciliaGoal: (id,patch) => {
    set(s=>({ceciliaGoals:s.ceciliaGoals.map(x=>x.id===id?{...x,...patch}:x)}))
    const x=get().ceciliaGoals.find(x=>x.id===id)
    if(x) saveDocument('cecilia_goals',id,x)
  },
  deleteCeciliaGoal: (id) => {
    set(s=>({ceciliaGoals:s.ceciliaGoals.filter(x=>x.id!==id)}))
    deleteDocument('cecilia_goals',id)
  },

  // ── Cash entries ──────────────────────────────────────
  addCashEntry: (e) => {
    const item={...e,id:uid()}
    set(s=>({cashEntries:[item,...s.cashEntries]}))
    saveDocument('cash_entries',item.id,item)
  },
  deleteCashEntry: (id) => {
    set(s=>({cashEntries:s.cashEntries.filter(x=>x.id!==id)}))
    deleteDocument('cash_entries',id)
  },
  updateCashEntry: (id, patch) => {
    set(s=>({cashEntries:s.cashEntries.map(x=>x.id===id?{...x,...patch}:x)}))
    const e=get().cashEntries.find(x=>x.id===id)
    if(e) saveDocument('cash_entries',id,{...e,...patch})
  },

  // ── Note Prelievi (mobile ATM withdrawal notes) ───────
  addNotaPrelievo: (n) => {
    const item={...n,id:uid()}
    set(s=>({notePrelievi:[item,...s.notePrelievi]}))
    saveDocument('note_prelievi',item.id,item)
  },
  deleteNotaPrelievo: (id) => {
    set(s=>({notePrelievi:s.notePrelievi.filter(x=>x.id!==id)}))
    deleteDocument('note_prelievi',id)
  },

  // ── Pending Withdrawals ──────────────────────────────
  addPendingWithdrawal: (pw) => {
    const item = { ...pw, id: uid() }
    set(s => ({ pendingWithdrawals: [item, ...s.pendingWithdrawals] }))
    saveDocument('pending_withdrawals', item.id, item)
    return item.id
  },
  updatePendingWithdrawal: (id, patch) => {
    set(s => ({ pendingWithdrawals: s.pendingWithdrawals.map(x => x.id===id ? {...x,...patch} : x) }))
    const pw = get().pendingWithdrawals.find(x => x.id===id)
    if (pw) saveDocument('pending_withdrawals', id, {...pw,...patch})
  },
  deletePendingWithdrawal: (id) => {
    set(s => ({ pendingWithdrawals: s.pendingWithdrawals.filter(x => x.id!==id) }))
    deleteDocument('pending_withdrawals', id)
  },

  // ── Cash logic helpers ───────────────────────────────────
  // Quanto di una riconciliazione Nanny/Colf (recon entry) è allocato su un
  // dato txId — supporta sia il formato nuovo multi-prelievo (r.allocations,
  // richiesta utente 2026-07-20: poter selezionare più prelievi per coprire
  // un pagamento) sia il vecchio formato singolo (r.txId/r.nannyAmt).
  _reconAmountForTx: (r, txId, fallbackAmt) => {
    if (!r) return 0
    if (Array.isArray(r.allocations)) {
      return r.allocations.reduce((s,a) => s + (a.txId === txId ? (a.amt||0) : 0), 0)
    }
    return r.txId === txId ? (r.nannyAmt || fallbackAmt || 0) : 0
  },
  // Total amount used/assigned from a specific ATM withdrawal txId
  computeAtmUsed: (txId) => {
    const { appPrefs, nannyTS, colfTS, cashEntries } = get()
    const nannyRecon = appPrefs?.nannyRecon || {}
    const colfRecon  = appPrefs?.colfRecon  || {}
    const atmMeta    = appPrefs?.atmMeta    || {}
    const reconAmt   = get()._reconAmountForTx
    let total = 0
    ;(atmMeta[txId]?.links || []).forEach(l => { total += (l.amount || 0) })
    ;(nannyTS || []).forEach(e => { total += reconAmt(nannyRecon[e.id], txId, e.totale) })
    ;(colfTS  || []).forEach(e => { total += reconAmt(colfRecon[e.id],  txId, e.totale) })
    ;(cashEntries || []).forEach(e => {
      if (e.atmTxId === txId) total += (e.amount || 0)
    })
    return Math.round(total * 100) / 100
  },
  // Come computeAtmUsed, ma esclude l'allocazione di UNA specifica riga Nanny/Colf
  // (usato dal modale di riconciliazione per mostrare quanto è "davvero" ancora
  // disponibile su un prelievo, ignorando l'allocazione che si sta per riscrivere)
  computeAtmUsedExcluding: (txId, excludeEntryId, excludeReconKey) => {
    const { appPrefs, nannyTS, colfTS, cashEntries } = get()
    const nannyRecon = appPrefs?.nannyRecon || {}
    const colfRecon  = appPrefs?.colfRecon  || {}
    const atmMeta    = appPrefs?.atmMeta    || {}
    const reconAmt   = get()._reconAmountForTx
    let total = 0
    ;(atmMeta[txId]?.links || []).forEach(l => { total += (l.amount || 0) })
    ;(nannyTS || []).forEach(e => {
      if (excludeReconKey === 'nannyRecon' && e.id === excludeEntryId) return
      total += reconAmt(nannyRecon[e.id], txId, e.totale)
    })
    ;(colfTS || []).forEach(e => {
      if (excludeReconKey === 'colfRecon' && e.id === excludeEntryId) return
      total += reconAmt(colfRecon[e.id], txId, e.totale)
    })
    ;(cashEntries || []).forEach(e => {
      if (e.atmTxId === txId) total += (e.amount || 0)
    })
    return Math.round(total * 100) / 100
  },

  // Auto-assign a cash expense to the best available ATM withdrawal
  autoAssignAtm: (amount) => {
    const { transactions } = get()
    const computeUsed = get().computeAtmUsed
    const atmTxs = transactions
      .filter(t => !t.excluded && t.cat1 === 'Contanti' && t.amount < 0)
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
    for (const tx of atmTxs) {
      const used = computeUsed(tx.txId)
      const remaining = Math.abs(tx.amount) - used
      if (remaining >= amount - 0.01) return tx.txId
    }
    return atmTxs[0]?.txId || null
  },

  // Rebalance all auto-assigned cash entries after a manual change
  rebalanceAutoAssignments: () => {
    const { cashEntries, transactions, appPrefs, nannyTS, colfTS } = get()
    const atmTxs = transactions
      .filter(t => !t.excluded && t.cat1 === 'Contanti' && t.amount < 0)
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
    if (atmTxs.length === 0) return
    const autoEntries = cashEntries.filter(e => e.atmSource === 'auto')
    if (autoEntries.length === 0) return
    const nannyRecon = appPrefs?.nannyRecon || {}
    const colfRecon  = appPrefs?.colfRecon  || {}
    const atmMeta    = appPrefs?.atmMeta    || {}
    const reconAmt   = get()._reconAmountForTx
    // Base usage per ATM (from non-auto sources)
    const baseUsed = new Map()
    atmTxs.forEach(tx => {
      let total = 0
      ;(atmMeta[tx.txId]?.links || []).forEach(l => { total += (l.amount || 0) })
      ;(nannyTS || []).forEach(e => { total += reconAmt(nannyRecon[e.id], tx.txId, e.totale) })
      ;(colfTS  || []).forEach(e => { total += reconAmt(colfRecon[e.id],  tx.txId, e.totale) })
      cashEntries.filter(e => e.atmSource !== 'auto' && e.atmTxId === tx.txId)
        .forEach(e => { total += (e.amount || 0) })
      baseUsed.set(tx.txId, Math.round(total * 100) / 100)
    })
    // Re-assign each auto entry greedily
    const dynamicUsed = new Map(atmTxs.map(tx => [tx.txId, baseUsed.get(tx.txId) || 0]))
    const updated = []
    for (const entry of autoEntries) {
      let bestTxId = null
      for (const tx of atmTxs) {
        const used = dynamicUsed.get(tx.txId) || 0
        const remaining = Math.abs(tx.amount) - used
        if (remaining >= (entry.amount || 0) - 0.01) { bestTxId = tx.txId; break }
      }
      if (!bestTxId) bestTxId = atmTxs[0].txId
      dynamicUsed.set(bestTxId, (dynamicUsed.get(bestTxId) || 0) + (entry.amount || 0))
      if (bestTxId !== entry.atmTxId) {
        const patched = { ...entry, atmTxId: bestTxId }
        updated.push(patched)
        saveDocument('cash_entries', patched.id, patched)
      }
    }
    if (updated.length > 0) {
      set(s => ({
        cashEntries: s.cashEntries.map(e =>
          e.atmSource === 'auto' ? (updated.find(u => u.id === e.id) || e) : e
        )
      }))
    }
  },

  // Reconcile pending withdrawals with real ATM transactions
  reconcilePendingWithdrawals: () => {
    const { pendingWithdrawals, transactions, cashEntries } = get()
    const pending = (pendingWithdrawals || []).filter(pw => pw.status === 'pending')
    if (pending.length === 0) return
    const atmTxs = transactions.filter(t => !t.excluded && t.cat1 === 'Contanti' && t.amount < 0)
    const pwUpdates = {}
    const ceUpdates = {}
    for (const pw of pending) {
      let candidates = atmTxs
      if (pw.amount) candidates = candidates.filter(t => Math.abs(Math.abs(t.amount) - pw.amount) < 0.01)
      if (pw.date) {
        const pwTime = new Date(pw.date).getTime()
        candidates = candidates.filter(t => {
          const tTime = new Date(t._effDate || t.date || '').getTime()
          return !isNaN(tTime) && Math.abs(tTime - pwTime) <= 5 * 86400000
        })
      }
      if (candidates.length === 1) {
        const realTxId = candidates[0].txId
        const matched = { ...pw, status: 'matched', matchedTxId: realTxId }
        pwUpdates[pw.id] = matched
        saveDocument('pending_withdrawals', pw.id, matched)
        ;(cashEntries || []).filter(e => e.atmTxId === pw.id).forEach(e => {
          const patched = { ...e, atmTxId: realTxId, atmSource: 'manual', atmPendingId: pw.id }
          ceUpdates[e.id] = patched
          saveDocument('cash_entries', patched.id, patched)
        })
      }
    }
    if (Object.keys(pwUpdates).length > 0) {
      set(s => ({
        pendingWithdrawals: s.pendingWithdrawals.map(pw => pwUpdates[pw.id] || pw),
        cashEntries: s.cashEntries.map(e => ceUpdates[e.id] || e),
      }))
    }
  },

  // ── Discovery skip rules ──────────────────────────────
  addDiscoverySkipRule: (arg) => {
    const descAI = typeof arg === 'string' ? arg : (arg?.descAI || '')
    const note   = typeof arg === 'string' ? '' : (arg?.note || '')
    const item = { id: uid(), descAI, note, addedAt: new Date().toISOString() }
    set(s=>({discoverySkipRules:[...s.discoverySkipRules, item]}))
    saveDocument('discovery_skip_rules', item.id, item)
    return item
  },
  removeDiscoverySkipRule: (id) => {
    set(s=>({discoverySkipRules:s.discoverySkipRules.filter(r=>r.id!==id)}))
    deleteDocument('discovery_skip_rules', id)
  },

  // ── Energy bills ──────────────────────────────────────
  addEnergyBill: (b) => {
    const item={...b,id:uid()}
    set(s=>({energyBills:[item,...s.energyBills]}))
    saveDocument('energy_bills',item.id,item)
  },
  deleteEnergyBill: (id) => {
    set(s=>({energyBills:s.energyBills.filter(x=>x.id!==id)}))
    deleteDocument('energy_bills',id)
  },

  // ── AI chat (persisted) ───────────────────────────────
  addChatMessage: (msg) => {
    const item={...msg,id:uid(),ts:Date.now()}
    set(s=>({aiChatHistory:[...s.aiChatHistory,item]}))
    saveDocument('ai_chat',item.id,item)
  },
  clearChat: () => {
    // capture list BEFORE clearing state, then delete all chat docs
    const toDelete = get().aiChatHistory
    set({aiChatHistory:[]})
    toDelete.forEach(m=>deleteDocument('ai_chat',m.id))
  },

  // ── Custom categories ────────────────────────────────
  setCustomCats: (cats) => {
    set({ customCats: cats })
    mergeDocument('user_settings','custom_cats',{ cats })
  },

  // ── Location exclusions ───────────────────────────────────
  addLocationExclusion: (term) => {
    const list = [...new Set([...get().locationExclusions, term.trim()])]
    set({ locationExclusions: list })
    mergeDocument('user_settings', 'location_exclusions', { list })
  },
  removeLocationExclusion: (term) => {
    const list = get().locationExclusions.filter(e => e !== term)
    set({ locationExclusions: list })
    mergeDocument('user_settings', 'location_exclusions', { list })
  },

  // ── City overrides — permanent, immutable cache ──────────
  setCityOverride: (merchant, city) => {
    const updated = { ...get().cityOverrides, [merchant]: city }
    set({ cityOverrides: updated })
    mergeDocument('user_settings', 'city_overrides', updated)
  },

  // ── App preferences (Firestore user_settings/app_prefs) ──
  // ── Cash → DB sync ───────────────────────────────────────
  // Pushes linked cash transactions (nanny/colf/veicoli) to the main
  // transactions collection so they appear in analytics & TransactionsPage.
  // Rules:
  //   Nanny/Colf: push when linked to an ATM withdrawal
  //   Veicoli:    push when linked to ATM AND NOT linked to Satispay
  syncCashTransactions: async () => {
    const state = get()
    const { appPrefs, nannyTS, colfTS, vehExpenses, vehicles, transactions } = state
    const nannyRecon  = appPrefs?.nannyRecon  || {}
    const colfRecon   = appPrefs?.colfRecon   || {}
    const satiMatches = appPrefs?.satiMatches || {}
    const nannyName   = appPrefs?.nannyName   || 'Nanny'
    const colfName    = appPrefs?.colfName    || 'Colf'

    const shouldExist = new Map() // txId → data

    // Nanny — push when ATM-linked
    ;(nannyTS || []).forEach(entry => {
      const recon = nannyRecon[entry.id]
      if (!recon?.txId) return
      const id = `cash-nanny-${entry.id}`
      shouldExist.set(id, {
        id, txId: id,
        amount: -(recon.nannyAmt || entry.totale || 0),
        date: (entry.mese || '') + '-01',
        _effDate: (entry.mese || '') + '-01',
        cat1: 'Famiglia', cat2: nannyName,
        description: `Pagamento contanti ${nannyName} — ${entry.mese}`,
        descAI: `${nannyName} ${entry.mese}`,
        account: 'Contanti', excluded: false,
        _source: 'cash-sync', _cashSyncRole: 'nanny',
        userEditedCat: true, aiEnriched: true,
      })
    })

    // Colf — push when ATM-linked
    ;(colfTS || []).forEach(entry => {
      const recon = colfRecon[entry.id]
      if (!recon?.txId) return
      const id = `cash-colf-${entry.id}`
      shouldExist.set(id, {
        id, txId: id,
        amount: -(recon.nannyAmt || entry.totale || 0),
        date: (entry.mese || '') + '-01',
        _effDate: (entry.mese || '') + '-01',
        cat1: 'Famiglia', cat2: colfName,
        description: `Pagamento contanti ${colfName} — ${entry.mese}`,
        descAI: `${colfName} ${entry.mese}`,
        account: 'Contanti', excluded: false,
        _source: 'cash-sync', _cashSyncRole: 'colf',
        userEditedCat: true, aiEnriched: true,
      })
    })

    // Veicoli — push when ATM-linked AND NOT Satispay-matched
    ;(vehExpenses || []).filter(e => e.payMethod === 'cash' && e.reconType === 'cash' && e.reconRef).forEach(e => {
      const satiId = `veh-${e.id}`
      const hasSati = satiMatches[satiId]?.status === 'matched'
      if (hasSati) return
      const veh     = (vehicles || []).find(v => v.id === e.vehicleId)
      const vehName = veh ? (veh.nickname || veh.model || 'Veicolo') : 'Veicolo'
      const id = `cash-veh-${e.id}`
      shouldExist.set(id, {
        id, txId: id,
        amount: -(e.amount || 0),
        date: e.date || '',
        _effDate: e.date || '',
        cat1: 'Veicoli', cat2: e.desc || '',
        description: `${e.desc || 'Spesa veicolo'} — ${vehName} (contanti)`,
        descAI: e.desc || `Spesa ${vehName}`,
        account: 'Contanti', excluded: false,
        _source: 'cash-sync', _cashSyncRole: 'veicoli',
        userEditedCat: true, aiEnriched: true,
      })
    })

    // Compare with existing synthetic txs in store
    const existing     = (transactions || []).filter(t => t._source === 'cash-sync')
    const existingById = new Map(existing.map(t => [t.txId, t]))

    const toAdd       = []
    const toRemoveIds = []

    for (const [id, data] of shouldExist) {
      if (!existingById.has(id)) {
        toAdd.push(data)
        saveDocument('transactions', id, data)
      }
    }

    for (const t of existing) {
      if (!shouldExist.has(t.txId)) {
        toRemoveIds.push(t.txId)
        deleteDocument('transactions', t.txId)
      }
    }

    if (toAdd.length > 0 || toRemoveIds.length > 0) {
      set(s => ({
        transactions: [
          ...s.transactions.filter(t => !toRemoveIds.includes(t.txId)),
          ...toAdd.map(enrichTx),
        ].sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||'')),
      }))
    }

    return { added: toAdd.length, removed: toRemoveIds.length }
  },

  setAppPref: (key, value) => {
    // Guardia anti data-loss (2026-07-13): se loadAllData() non ha ancora finito di
    // caricare app_prefs da Firestore, lo stato locale di appPrefs è ancora quello di
    // default (es. calendarVacations: []). Scrivere in questa finestra — anche solo per
    // un click arrivato prima del previsto — sovrascriverebbe il campo reale su Firestore
    // con un array vuoto/parziale (mergeDocument sostituisce i campi-array per intero, non
    // fa merge elemento per elemento). Blocchiamo e segnaliamo invece di scrivere: molto
    // meglio perdere un click che perdere dati già salvati.
    if (!get().appPrefsLoaded) {
      console.warn(`[setAppPref] Scrittura di "${key}" bloccata: dati non ancora caricati da Firestore. Riprova tra un istante.`)
      return
    }
    set(s => ({ appPrefs: { ...s.appPrefs, [key]: value } }))
    // mergeDocument (merge:true) invece di saveDocument (overwrite totale): app_prefs
    // è un documento condiviso con DECINE di preferenze diverse (soprannomi, chiave AI,
    // vacanze dichiarate, fornitori Utenze, compLinks...) e loadAllData() lo carica una
    // tantum, senza realtime listener. Con l'overwrite totale, una sessione/tab rimasta
    // aperta da prima che un'altra sessione modificasse qualcos'altro finiva per
    // cancellare in silenzio quelle modifiche al primo setAppPref successivo — causa
    // reale di sparizioni "casuali" di dati non correlati tra loro (vedi memoria).
    mergeDocument('user_settings', 'app_prefs', { [key]: value })
    // Trigger cash-sync when reconciliation data changes
    if (key === 'nannyRecon' || key === 'colfRecon' || key === 'satiMatches') {
      setTimeout(() => get().syncCashTransactions(), 0)
    }
  },

  // ── AI Rules ─────────────────────────────────────────
  addAiRule: (rule) => {
    const item = {...rule, id: uid(), createdAt: new Date().toISOString()}
    set(s=>({ aiRules: [...s.aiRules, item] }))
    saveDocument('ai_rules', item.id, item)
    return item
  },
  updateAiRule: (id, patch) => {
    set(s=>({ aiRules: s.aiRules.map(r=>r.id===id?{...r,...patch}:r) }))
    const r = get().aiRules.find(r=>r.id===id)
    if(r) saveDocument('ai_rules', id, r)
  },
  deleteAiRule: (id) => {
    set(s=>({ aiRules: s.aiRules.filter(r=>r.id!==id) }))
    deleteDocument('ai_rules', id)
  },
  // txOrDescription: preferibilmente l'OGGETTO transazione completo (così le
  // condizioni su descAI/merchant/counterpart/city matchano sui campi veri);
  // retro-compatibile con la vecchia firma (description, amount, date) — in quel
  // caso i campi arricchiti non sono disponibili e si valuta solo la descrizione.
  // Matching delegato al motore unico condiviso (src/data/ruleMatching.js) —
  // consolidamento 2026-07-12, prima qui c'era una copia divergente che non
  // gestiva descAI e valutava merchant sulla descrizione.
  applyAiRules: (txOrDescription, amount, date) => {
    const tx = (txOrDescription && typeof txOrDescription === 'object')
      ? txOrDescription
      : { description: txOrDescription, amount, date }
    // Returns [{cat1, cat2, pct, action}] if a rule matches, null otherwise
    // King rules always evaluated first — they win over all other rules
    const rules = get().aiRules
      .filter(r => r.enabled !== false)
      .sort((a, b) => (b.isKing ? 1 : 0) - (a.isKing ? 1 : 0))

    for (const rule of rules) {
      if (!rule.conditions?.length) continue
      const matches = txMatchesConditions(tx, rule.conditions, rule.logic)

      if (matches) {
        // Return action
        if (rule.action === 'exclude') return { exclude: true, ruleId: rule.id }
        if (rule.action === 'categorize') {
          return {
            cats: rule.cats || [{cat1: rule.cat1||'Non Categorizzato', cat2: rule.cat2||'', pct: 100}],
            conf: 95, ruleId: rule.id,
            isMix: (rule.cats||[]).length > 1,
            descAI: rule.descAI || null,
          }
        }
      }
    }
    return null
  },

  // Returns true if a KING rule matches this transaction — used to block non-king overwrites
  // excludeRuleId: skip this rule from the check (used when running a king rule on itself)
  // txOrDescription: preferibilmente l'OGGETTO transazione (le king su
  // descAI/merchant/counterpart proteggono davvero solo così); retro-compatibile
  // con la vecchia firma (description, amount). Matching delegato al motore
  // unico condiviso (ruleMatching.js) — consolidamento 2026-07-12.
  isKingProtected: (txOrDescription, amount, excludeRuleId = null) => {
    const kingRules = get().aiRules.filter(r => r.isKing && r.enabled !== false && r.id !== excludeRuleId)
    if (!kingRules.length) return false
    const tx = (txOrDescription && typeof txOrDescription === 'object')
      ? txOrDescription
      : { description: txOrDescription, amount }
    return kingRules.some(rule =>
      rule.conditions?.length ? txMatchesConditions(tx, rule.conditions, rule.logic) : false
    )
  },

  // ── Bulk apply all rules to entire DB ────────────────
  bulkApplyRules: async (onProgress) => {
    const s = get()
    const transactions  = s.transactions
    const namingRules   = (s.appPrefs?.aiNamingRules || []).filter(r => r.enabled !== false)
    const multiRules    = (s.aiRules || []).filter(r => r.enabled !== false)
    const catRules      = (s.appPrefs?.catRules || []).filter(r => r.enabled !== false)
    const vacations     = s.appPrefs?.calendarVacations || []
    const notVacationDates = s.appPrefs?.calendarNotVacationDates || []

    const patches = []   // { txId, patch }

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i]
      if (onProgress) onProgress(i + 1, transactions.length)
      const patch = {}

      // 1. Naming rules → descAI (skip user-edited desc)
      if (!tx.userEditedDesc) {
        for (const rule of namingRules) {
          const fld = rule.matchField || 'merchant'
          const src = (
            fld === 'merchant'     ? (tx.merchant || tx.description) :
            fld === 'description'  ? tx.description :
            fld === 'counterpart'  ? tx.counterpart :
            fld === 'city'         ? tx.city : ''
          ) || ''
          const needle = (rule.matchValue || rule.merchant || '').toLowerCase()
          if (needle && src.toLowerCase().includes(needle)) {
            if (rule.description && tx.descAI !== rule.description) patch.descAI = rule.description
            break
          }
        }
      }

      // 2. Cat rules (simple field-match) → cat1/cat2 (skip user-edited cat)
      if (!tx.userEditedCat) {
        for (const rule of catRules) {
          if (!rule.matchValue || !rule.cat1) continue
          const fld = rule.matchField || 'description'
          const src = (
            fld === 'merchant'    ? (tx.merchant || tx.description) :
            fld === 'description' ? tx.description :
            fld === 'counterpart' ? tx.counterpart :
            fld === 'city'        ? tx.city : ''
          ) || ''
          if (src.toLowerCase().includes(rule.matchValue.toLowerCase())) {
            if (tx.cat1 !== rule.cat1)        patch.cat1 = rule.cat1
            if (rule.cat2 && tx.cat2 !== rule.cat2) patch.cat2 = rule.cat2
            break
          }
        }
      }

      // 3. Multi-condition rules → cat1/cat2/descAI or excluded (highest priority — always wins over catRules)
      //    Skip transactions manually categorized by the user (same guard as step 2)
      if (multiRules.length > 0 && !tx.userEditedCat) {
        const result = s.applyAiRules(tx)  // oggetto completo (motore unico ruleMatching.js)
        if (result) {
          if (result.exclude && !tx.excluded) {
            patch.excluded = true
            // Questo percorso (recompute di massa su tutte le regole) NON passa da
            // updateTransaction (usa batchSaveDocuments+enrichTx più sotto), quindi il
            // metadata di audit va iniettato qui esplicitamente — vedi stessa logica in
            // updateTransaction (useStore.js) per il campo excludedBy
            patch.excludedAt     = patch.excludedAt     || new Date().toISOString()
            patch.excludedBy     = patch.excludedBy     || get().currentUser?.displayName || get().currentUser?.email || 'Sistema'
            patch.excludedType   = 'automatic'
            patch.excludedReason = 'Regola AI (esclusione automatica)'
          } else if (result.cats?.length >= 1) {
            const { cat1, cat2 } = result.cats[0]
            if (cat1) patch.cat1 = cat1  // always overwrite — aiRules beat catRules
            patch.cat2 = cat2 || ''
          }
          if (result.descAI && !tx.userEditedDesc) patch.descAI = result.descAI
        }
      }

      // 4. Vacanze dichiarate (Calendario) → riassegnazione a "Weekend e Vacanze" +
      //    flag "da rivedere competenza" se la categoria è Weekend e Vacanze ma il giorno
      //    è stato esplicitamente marcato "non vacanza" (click su cella blu in Calendario,
      //    o "elimina" nella tabella Weekend e Vacanze v2).
      //    La riassegnazione di categoria rispetta userEditedCat; il flag di revisione no
      //    (è un segnale di qualità dati, non una modifica di categoria).
      {
        const effDate = tx._effDate || tx.competenza || tx.date
        const vacPatch = computeVacationPatch({ ...tx, ...patch }, vacations, effDate, notVacationDates)
        if (!tx.userEditedCat && vacPatch.cat1) {
          patch.cat1 = vacPatch.cat1
          patch.cat2 = vacPatch.cat2
        }
        if ('flagCompetenza' in vacPatch) patch.flagCompetenza = vacPatch.flagCompetenza
      }

      // 5. System rule: positive amount → always Entrate L1
      const finalCat1 = patch.cat1 || tx.cat1
      if (tx.amount > 0 && finalCat1 && finalCat1 !== 'Entrate') {
        patch.cat1 = 'Entrate'
        patch.cat2 = ''
      }

      if (Object.keys(patch).length > 0) patches.push({ txId: tx.txId, patch })
    }

    if (!patches.length) return { updated: 0, total: transactions.length }

    // Apply all patches to Zustand in one shot (no per-tx re-renders)
    set(s => ({
      transactions: s.transactions.map(tx => {
        const p = patches.find(p => p.txId === tx.txId)
        return p ? { ...tx, ...p.patch } : tx
      })
    }))
    s._recomputeFiltered?.()

    // Batch-save to Firestore
    const updated = get().transactions.filter(tx => patches.some(p => p.txId === tx.txId))
    await batchSaveDocuments('transactions', updated.map(tx => ({ id: tx.txId, data: enrichTx(tx) })))

    return { updated: patches.length, total: transactions.length }
  },

  // ── Apply a single aiRule to entire DB ───────────────
  applySingleRule: async (ruleId, onProgress) => {
    const s = get()
    const transactions = s.transactions
    const rule = (s.aiRules || []).find(r => r.id === ruleId)
    if (!rule || rule.enabled === false) return { updated: 0, total: transactions.length }

    const patches = []

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i]
      if (onProgress) onProgress(i + 1, transactions.length)
      // King rules always win — never let a non-king single rule overwrite them
      // Pass ruleId so a king rule running on itself is not blocked by its own protection
      if (s.isKingProtected(tx, null, ruleId)) continue
      const patch = {}

      // Matching delegato al motore unico condiviso (ruleMatching.js) —
      // consolidamento 2026-07-12: stessa semantica di applyAiRules/anteprima
      const matches = txMatchesConditions(tx, rule.conditions || [], rule.logic)

      if (matches) {
        if (rule.action === 'exclude') {
          if (!tx.excluded) {
            patch.excluded = true
            // Non passa da updateTransaction (batchSaveDocuments+enrichTx più sotto) —
            // stesso motivo/nota del blocco analogo in applyAiRules/recompute di massa
            patch.excludedAt     = patch.excludedAt     || new Date().toISOString()
            patch.excludedBy     = patch.excludedBy     || get().currentUser?.displayName || get().currentUser?.email || 'Sistema'
            patch.excludedType   = 'automatic'
            patch.excludedReason = `Regola AI: ${rule.label || rule.id}`
          }
        } else if ((!rule.action || rule.action === 'categorize') && rule.cats?.length >= 1) {
          const { cat1, cat2 } = rule.cats[0]
          if (cat1) patch.cat1 = cat1
          patch.cat2 = cat2 || ''
        }
        if (rule.descAI && !tx.userEditedDesc) patch.descAI = rule.descAI
      }

      // System rule: positive amount → always Entrate
      const finalCat1 = patch.cat1 || tx.cat1
      if (tx.amount > 0 && finalCat1 && finalCat1 !== 'Entrate') {
        patch.cat1 = 'Entrate'
        patch.cat2 = ''
      }

      if (Object.keys(patch).length > 0) patches.push({ txId: tx.txId, patch })
    }

    if (!patches.length) return { updated: 0, total: transactions.length }

    set(s => ({
      transactions: s.transactions.map(tx => {
        const p = patches.find(p => p.txId === tx.txId)
        return p ? { ...tx, ...p.patch } : tx
      })
    }))

    const updated = get().transactions.filter(tx => patches.some(p => p.txId === tx.txId))
    await batchSaveDocuments('transactions', updated.map(tx => ({ id: tx.txId, data: enrichTx(tx) })))

    return { updated: patches.length, total: transactions.length }
  },

  // ── Scan/fix a hardcoded system rule ─────────────────
  scanSystemRule: (ruleId) => {
    const transactions = get().transactions
    if (ruleId === 'sys-entrate') {
      return transactions.filter(tx =>
        !tx.excluded && tx.amount > 0 && tx.cat1 && tx.cat1 !== 'Entrate'
      )
    }
    return []
  },

  fixSystemRule: async (ruleId, onProgress) => {
    const s = get()
    const transactions = s.transactions
    const patches = []

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i]
      if (onProgress) onProgress(i + 1, transactions.length)
      if (ruleId === 'sys-entrate') {
        if (!tx.excluded && tx.amount > 0 && tx.cat1 && tx.cat1 !== 'Entrate') {
          patches.push({ txId: tx.txId, patch: { cat1: 'Entrate', cat2: '' } })
        }
      }
      // Add new system rule IDs here when hardcoded
    }

    if (!patches.length) return { updated: 0, total: transactions.length }

    set(s => ({
      transactions: s.transactions.map(tx => {
        const p = patches.find(p => p.txId === tx.txId)
        return p ? { ...tx, ...p.patch } : tx
      })
    }))

    const updated = get().transactions.filter(tx => patches.some(p => p.txId === tx.txId))
    await batchSaveDocuments('transactions', updated.map(tx => ({ id: tx.txId, data: enrichTx(tx) })))

    return { updated: patches.length, total: transactions.length }
  },

  // ── Rimborsi (shared costs) ────────────────────────
  addRimborsiCost: (cost) => {
    const item = {...cost, id: uid(), reimbursements: []}
    set(s=>({ rimborsiCosts: [...s.rimborsiCosts, item] }))
    saveDocument('rimborsi_costs', item.id, item)
    return item
  },
  addReimbursement: (costId, reimbursement) => {
    set(s=>({
      rimborsiCosts: s.rimborsiCosts.map(c=>
        c.id===costId ? {...c, reimbursements:[...(c.reimbursements||[]), reimbursement]} : c
      )
    }))
    const c = get().rimborsiCosts.find(c=>c.id===costId)
    if(c) saveDocument('rimborsi_costs', costId, c)
  },
  deleteRimborsiCost: (id) => {
    set(s=>({ rimborsiCosts: s.rimborsiCosts.filter(c=>c.id!==id) }))
    deleteDocument('rimborsi_costs', id)
  },

  // ── Salaries ─────────────────────────────────────────────
  addSalary: (salary) => {
    const id = uid()
    const entry = { ...salary, id }
    set(s => ({ salaries: [...s.salaries, entry].sort((a,b)=>a.year-b.year||(a.person||'').localeCompare(b.person||'')) }))
    saveDocument('salaries', id, entry)
  },
  updateSalary: (id, patch) => {
    set(s => ({ salaries: s.salaries.map(x => x.id===id ? {...x,...patch} : x) }))
    const entry = get().salaries.find(x => x.id===id)
    if (entry) saveDocument('salaries', id, entry)
  },
  deleteSalary: (id) => {
    set(s => ({ salaries: s.salaries.filter(x => x.id!==id) }))
    deleteDocument('salaries', id)
  },

    // ── User accounts ─────────────────────────────────────
  setUserAccounts: async (userId, accounts) => {
    set({ userAccounts: accounts })
    await saveUserAccounts(userId, accounts)
    // Recompute user field for all transactions when card mappings change
    get().recomputeUsers()
  },

  recomputeUsers: () => {
    const { transactions, userAccounts, appPrefs } = get()
    const toSave = []
    const updated = transactions.map(t => {
      const newUser = computeUser(t, userAccounts, appPrefs) || null
      if (newUser === (t.user ?? null)) return t          // unchanged
      toSave.push({ id: t.txId, data: { ...t, user: newUser } })
      return { ...t, user: newUser }
    })
    if (!toSave.length) return
    set({ transactions: updated })
    // Batch-persist only the changed documents
    batchSaveDocuments('transactions', toSave)
  },

  // ── Filters ───────────────────────────────────────────
  setFilter:    (k,v) => { set(s=>({ filters:{...s.filters,[k]:v} })); get()._recomputeFiltered() },
  resetFilters: () => {
    set({ filters:{search:'',cat1:'',accounts:[],dateFrom:'',dateTo:'',type:'',conf:''} })
    get()._recomputeFiltered()
  },
  clearFilters: () => {
    set({ filters:{search:'',cat1:'',accounts:[],dateFrom:'',dateTo:'',type:'',conf:''} })
    get()._recomputeFiltered()
  },

  // ── Computed ──────────────────────────────────────────
  filteredTx: [],   // kept in sync by setFilter/resetFilters

  // Call this after any filter or transaction change
  _recomputeFiltered: () => {
    const s = get()
    const { transactions, filters } = s
    const result = transactions.filter(t => {
      if(t.excluded) return false
      if(filters.search){
        const q=filters.search.toLowerCase()
        if(!(t.description||'').toLowerCase().includes(q)&&!(t.descAI||'').toLowerCase().includes(q)) return false
      }
      // "Non Categorizzato" deve includere anche le transazioni con cat1 vuoto/assente
      // (mai passate da un enrichment/regola), non solo quelle taggate col valore
      // letterale — richiesta utente 2026-07-19, stesso criterio già usato altrove
      // (es. MobileDiscovery.jsx filtro 'nocat': !t.cat1 || t.cat1==='Non Categorizzato')
      if(filters.cat1 && (filters.cat1==='Non Categorizzato' ? !(!t.cat1 || t.cat1==='Non Categorizzato') : t.cat1!==filters.cat1)) return false
      if((filters.accounts||[]).length>0 && !filters.accounts.includes(t.account)) return false
      if(filters.dateFrom && (t._effDate||t.date||'')<filters.dateFrom) return false
      if(filters.dateTo   && (t._effDate||t.date||'')>filters.dateTo)   return false
      if(filters.type && t.type!==filters.type) return false
      if(filters.conf==='low' && (t.conf||0)>=70) return false
      if(filters.flagged && !t._flagged) return false
      if(filters.reviewCompetenza && !t.flagCompetenza) return false
      return true
    })
    set({ filteredTx: result })
    return result
  },
}))

// Hook di debug per la console del browser (nessun effetto sul comportamento dell'app):
// espone lo store così da poter ispezionare rapidamente lo stato reale — es. quali
// transazioni sono escluse e perché — invece di dover ipotizzare la causa di
// un'anomalia sul saldo senza vedere i dati veri (vedi bug "saldo crollato" 2026-07-11).
// Uso da console: window.__fmtDebugSaldo()
if (typeof window !== 'undefined') {
  window.__fmtStore = useStore
  window.__fmtDebugSaldo = () => {
    const txs = useStore.getState().transactions
    const forced = txs.filter(t => t._forcedBalance)
    const excluded = txs.filter(t => t.excluded && !t._forcedBalance)
    const counted = txs.filter(t => !t.excluded || t._forcedBalance)
    const saldo = counted.reduce((s, t) => s + t.amount, 0)
    const report = {
      totaleTransazioni: txs.length,
      contateNelSaldo: counted.length,
      escluseNormali: excluded.length,
      escluseSommaImporti: Math.round(excluded.reduce((s, t) => s + t.amount, 0) * 100) / 100,
      saldoCalcolato: Math.round(saldo * 100) / 100,
      forcedBalanceTx: forced.map(t => ({ txId: t.txId, amount: t.amount, date: t.date, description: t.description })),
      top10EscluseAssolute: excluded
        .slice()
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 10)
        .map(t => ({ txId: t.txId, amount: t.amount, date: t.date, account: t.account, description: t.description, cardImportCard4: t.cardImportCard4, reconciled: t.reconciled })),
    }
    console.log('[FMT DEBUG SALDO]', report)
    return report
  }

  // Riparazione mirata (2026-07-11): trova estratti carta esclusi durante una
  // riconciliazione (excluded:true + reconciled:true, marcati SOLO da
  // handleCardReconcileConfirm in ImportModal.jsx) il cui dettaglio sostitutivo
  // NON esiste più tra le transazioni attuali — segno che un Undo incompleto (vedi
  // fix su undoLastTx, bug: scritture Firestore fire-and-forget non attese) ha
  // rimosso il dettaglio ma NON è riuscito a ripristinare l'esclusione dell'estratto,
  // lasciando un "buco" di spesa che gonfia il saldo. Con dryRun:true (default)
  // stampa solo cosa farebbe; richiamare con dryRun:false per applicare davvero.
  // Uso da console: window.__fmtFixOrphanedCardExclusions()            // anteprima
  //                 window.__fmtFixOrphanedCardExclusions({dryRun:false}) // applica
  window.__fmtFixOrphanedCardExclusions = ({ dryRun = true } = {}) => {
    const txs = useStore.getState().transactions
    const replacedIds = new Set(txs.filter(t => t.cardImportEstrattoTxId).map(t => t.cardImportEstrattoTxId))
    const orphaned = txs.filter(t => t.excluded && t.reconciled && !replacedIds.has(t.txId))
    const report = orphaned.map(t => ({ txId: t.txId, amount: t.amount, date: t.date, account: t.account, description: t.description }))
    console.log(`[FMT FIX] ${orphaned.length} estratti orfani trovati (esclusi ma senza dettaglio sostitutivo)`, report)
    if (!dryRun) {
      orphaned.forEach(t => useStore.getState().updateTransaction(t.txId, { excluded: false, reconciled: false }))
      console.log(`[FMT FIX] Ripristinati ${orphaned.length} estratti — ricarica la pagina per vedere il saldo aggiornato`)
    } else if (orphaned.length) {
      console.log('[FMT FIX] Anteprima soltanto — richiama window.__fmtFixOrphanedCardExclusions({dryRun:false}) per applicare davvero')
    }
    return report
  }
}
