import { useStore } from '../store/useStore'
import { fmtIT } from '../utils/format'

// Saldo totale (somma di tutti gli amount non esclusi) — stessa identica funzione
// di NannyColfPage.jsx (postaSpesaNannyColf), duplicata volutamente qui invece di
// importata: sono rete di sicurezza indipendenti, non serve un modulo condiviso
// per una funzione di 2 righe (stesso pattern di duplicazione già tollerato altrove
// nel codice, es. applyCatRulesLocal in ImportModal.jsx).
function computeSaldoTotale(transactions) {
  return Math.round(transactions.filter(t => !t.excluded || t._forcedBalance).reduce((s,t)=>s+t.amount,0) * 100) / 100
}

/**
 * Registra come spesa REALE (in transactions) un utilizzo di contanti già tracciato
 * altrove (oggi: cashEntry manuale di ContantiPage), consumando/spaccando il
 * prelievo ATM che lo copre — stesso pattern (e stessa rete di sicurezza sul saldo,
 * con rollback automatico) di postaSpesaNannyColf in NannyColfPage.jsx, ma
 * generalizzato per UN SOLO prelievo/allocazione invece di un array multi-prelievo
 * (i cashEntries manuali oggi si abbinano sempre a UN solo prelievo via atmTxId —
 * task #137, richiesta utente 2026-07-26: "fai per gli altri contanti quello che
 * già fai per Nanny/Colf").
 *
 * expenseDraft: { date, amount (positivo), cat1, cat2, description, descAI, note }
 * atmTx: la transazione di prelievo ATM reale da consumare (NON esclusa, trovata in
 *        transactions — se già consumata/esclusa da un'altra registrazione non va
 *        passata qui, il chiamante deve verificarlo PRIMA di offrire il bottone)
 * onPosted(expenseTxId): callback per marcare la fonte (es. cashEntry) come "postata"
 *        — chiamata SOLO se il saldo torna invariato
 */
export function postCashExpense(expenseDraft, atmTx, onPosted) {
  const store = useStore.getState()
  const saldoPrima = computeSaldoTotale(store.transactions)
  const expenseTxId = '0000-' + Date.now().toString(36).toUpperCase()
  const rollbackOps = [] // funzioni da chiamare in ordine INVERSO per annullare

  const amt        = Math.round(Math.abs(expenseDraft.amount) * 100) / 100
  const grossAbs    = Math.round(Math.abs(atmTx.amount) * 100) / 100
  const usedAbs      = Math.min(amt, grossAbs)
  const leftoverAbs = Math.round((grossAbs - usedAbs) * 100) / 100

  try {
    // 1) crea la transazione di spesa reale
    store.addTransactions([{
      txId: expenseTxId,
      date: expenseDraft.date,
      amount: -amt,
      description: expenseDraft.description,
      descAI: expenseDraft.descAI || expenseDraft.description,
      cat1: expenseDraft.cat1, cat2: expenseDraft.cat2 || '',
      account: 'Contanti', aiEnriched: true,
      note: expenseDraft.note || `Spesa contanti registrata. Coperta dal prelievo ${atmTx.txId}.`,
      _cashExpense: true,
    }])
    rollbackOps.push(() => useStore.getState().deleteTransaction(expenseTxId))

    // 2) consuma il prelievo: escluso per intero, con eventuale residuo spaccato
    //    in una nuova transazione "Contanti" separata (stesso importo lordo
    //    invariato in totale, saldo intatto) — identico a postaSpesaNannyColf
    const prevPatch = { excluded: atmTx.excluded, excludedAt: atmTx.excludedAt, excludedBy: atmTx.excludedBy, excludedType: atmTx.excludedType, excludedReason: atmTx.excludedReason }
    useStore.getState().updateTransaction(atmTx.txId, {
      excluded: true,
      excludedReason: `Coperto da spesa contanti registrata (${expenseTxId})`,
      excludedType: 'manual',
      _cashExpenseConsumedBy: expenseTxId,
    })
    rollbackOps.push(() => useStore.getState().updateTransaction(atmTx.txId, prevPatch))

    if (leftoverAbs > 0.005) {
      const leftoverTxId = '0000-' + (Date.now() + Math.floor(Math.random() * 1000)).toString(36).toUpperCase()
      useStore.getState().addTransactions([{
        ...atmTx,
        txId: leftoverTxId,
        amount: atmTx.amount < 0 ? -leftoverAbs : leftoverAbs,
        excluded: false,
        excludedAt: null, excludedBy: null, excludedType: null, excludedReason: null,
        note: `Residuo del prelievo ${atmTx.txId} (€ ${fmtIT(grossAbs, 2)}), dopo che € ${fmtIT(usedAbs, 2)} sono stati usati per la spesa contanti (transazione ${expenseTxId}).`,
        _cashSplitFrom: atmTx.txId,
      }])
      rollbackOps.push(() => useStore.getState().deleteTransaction(leftoverTxId))
    }

    // 3) verifica saldo invariato — se no, rollback completo (non deve mai succedere
    //    per costruzione, è solo una rete di sicurezza contro bug)
    const saldoDopo = computeSaldoTotale(useStore.getState().transactions)
    if (Math.abs(saldoDopo - saldoPrima) > 0.01) {
      for (let i = rollbackOps.length - 1; i >= 0; i--) rollbackOps[i]()
      return { ok: false, reason: 'saldo-diverso' }
    }

    onPosted?.(expenseTxId)
    return { ok: true, expenseTxId }
  } catch (e) {
    for (let i = rollbackOps.length - 1; i >= 0; i--) { try { rollbackOps[i]() } catch (_) {} }
    return { ok: false, reason: 'errore', error: e }
  }
}
