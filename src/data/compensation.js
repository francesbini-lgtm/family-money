import { useStore } from '../store/useStore'

/**
 * Sistema di compensazione condiviso tra Altre Entrate, PayPal e Carte di Credito
 * (compatibile con i campi usati anche da Satispay, che però ha un proprio
 * registro satiMatches/satiComp indipendente e non viene toccato qui).
 *
 * Convenzione comune su ogni transazione coinvolta in una compensazione:
 * - _compensatedAmt: importo CUMULATIVO già "consumato" (per una spesa: quanto
 *   è stato coperto; per un'entrata: quanto è stato usato per coprire spese).
 *   Non è mai negativo né superiore a Math.abs(amount).
 * - _compensatedBy: riferimento all'altro lato — stringa (singolo txId) se il
 *   gruppo ha esattamente 2 membri, array di txId se ne ha più di 2.
 * - excluded: MAI impostato a true da una compensazione — la transazione resta
 *   sempre visibile, con l'importo netto rettificato (vedi netAmt sotto).
 *
 * Registro condiviso appPrefs.compLinks: chiave = txId (o id manuale) del lato
 * "entrata", valore = array di { expTxId, compensatedAmt }. Permette di
 * risalire da un'entrata a tutte le spese che copre e viceversa, da qualunque
 * pagina (prima Carte usava solo i campi diretti senza scrivere qui — per
 * questo una spesa compensata in Carte non veniva riconosciuta come "già
 * abbinata" da Altre Entrate/PayPal e poteva essere ricompensata due volte).
 */

export function getCompLinks() {
  return useStore.getState()?.appPrefs?.compLinks || {}
}
export function saveCompLinks(data) {
  useStore.getState()?.setAppPref?.('compLinks', data)
}
export function getLinksArray(entry) {
  if (!entry) return []
  return Array.isArray(entry) ? entry : [entry]
}

// Importo netto dopo compensazione — usare SEMPRE questo (mai l'amount grezzo)
// per qualunque totale/KPI/statistica che debba riflettere la realtà economica
// (Dashboard, Analytics, Transazioni, KPI di pagina, ecc.).
export function netAmt(t) {
  if (!t) return 0
  if (!t._compensatedAmt || t._compensatedAmt <= 0) return t.amount || 0
  return t.amount < 0 ? t.amount + t._compensatedAmt : t.amount - t._compensatedAmt
}

export function isCompensated(t) {
  return !!(t && t._compensatedAmt && t._compensatedAmt > 0.005)
}

// Quanto è ancora disponibile su questo lato PRIMA di una nuova compensazione —
// tiene conto di qualunque compensazione già fatta da QUALSIASI pagina, perché
// tutte condividono lo stesso campo _compensatedAmt sulla transazione. Questo è
// il fix anti-doppia-compensazione: non si usa mai più l'importo lordo per
// calcolare quanto compensare, solo il residuo davvero disponibile.
export function availableAmount(t) {
  if (!t) return 0
  const gross = Math.abs(t.amount || 0)
  const used  = t._compensatedAmt || 0
  return Math.max(0, gross - used)
}

/**
 * Compensazione N:N tra un set di transazioni selezionate (usato da Carte e
 * PayPal per il multi-select "Abbina e compensa"). Distribuisce greedy: ogni
 * spesa attinge dalle entrate in ordine finché non è coperta o le entrate
 * finiscono. Usa sempre availableAmount() — mai l'importo lordo — così una
 * transazione già parzialmente compensata da un'ALTRA pagina non viene
 * ricompensata da zero, e scrive nel registro condiviso compLinks in modo che
 * Altre Entrate/PayPal/Carte vedano sempre lo stesso stato.
 */
export function compensateGroup(selTxs, updateTransaction) {
  const pos = selTxs.filter(t => t.amount > 0)
  const neg = selTxs.filter(t => t.amount < 0)
  if (!pos.length || !neg.length) return { ok: false, reason: 'need-both-signs' }

  const incRem   = new Map(pos.map(t => [t.txId, availableAmount(t)]))
  const expRem   = new Map(neg.map(t => [t.txId, availableAmount(t)]))
  const incDelta = new Map(pos.map(t => [t.txId, 0]))
  const expDelta = new Map(neg.map(t => [t.txId, 0]))
  const expBy    = new Map()
  const links    = { ...getCompLinks() }

  for (const exp of neg) {
    for (const inc of pos) {
      const avail = incRem.get(inc.txId)
      const need  = expRem.get(exp.txId)
      if (avail <= 0.005 || need <= 0.005) continue
      const comp = Math.round(Math.min(avail, need) * 100) / 100
      if (comp <= 0) continue
      links[inc.txId] = [...getLinksArray(links[inc.txId]), { expTxId: exp.txId, compensatedAmt: comp }]
      incRem.set(inc.txId, avail - comp)
      expRem.set(exp.txId, need - comp)
      incDelta.set(inc.txId, (incDelta.get(inc.txId) || 0) + comp)
      expDelta.set(exp.txId, (expDelta.get(exp.txId) || 0) + comp)
      if (!expBy.has(exp.txId)) expBy.set(exp.txId, [])
      expBy.get(exp.txId).push(inc.txId)
    }
  }

  const totalComp = [...expDelta.values()].reduce((s, v) => s + v, 0)
  if (totalComp <= 0) return { ok: false, reason: 'nothing-available' }

  saveCompLinks(links)

  neg.forEach(t => {
    const delta = expDelta.get(t.txId) || 0
    if (delta <= 0) return
    const byArr = expBy.get(t.txId) || []
    const existingBy = Array.isArray(t._compensatedBy) ? t._compensatedBy : (t._compensatedBy ? [t._compensatedBy] : [])
    const mergedBy = [...new Set([...existingBy, ...byArr])]
    updateTransaction(t.txId, {
      _compensatedAmt: Math.round(((t._compensatedAmt || 0) + delta) * 100) / 100,
      _compensatedBy: mergedBy.length > 1 ? mergedBy : (mergedBy[0] || null),
      excluded: false,
    })
  })
  pos.forEach(t => {
    const delta = incDelta.get(t.txId) || 0
    if (delta <= 0) return
    updateTransaction(t.txId, { _compensatedAmt: Math.round(((t._compensatedAmt || 0) + delta) * 100) / 100 })
  })

  return { ok: true, totalComp }
}

/**
 * Rimuove un'intera compensazione a partire da UNA transazione qualsiasi del
 * gruppo (entrata o spesa) — ripulisce compLinks E i campi _compensatedAmt/
 * _compensatedBy su TUTTI i lati coinvolti, indipendentemente da quale pagina
 * l'ha creata (Carte/PayPal/AltreEntrate condividono lo stesso registro).
 */
export function removeCompensationGroup(tx, updateTransaction) {
  const links = { ...getCompLinks() }
  const touched = new Set([tx.txId])

  // 1) tx è un'entrata con una entry diretta in compLinks?
  const directKey = [tx.txId, tx.id].find(k => k != null && links[k])
  if (directKey != null) {
    getLinksArray(links[directKey]).forEach(l => l.expTxId && touched.add(l.expTxId))
    delete links[directKey]
  }
  // 2) tx è una spesa referenziata come expTxId in un link di un'altra entrata?
  Object.entries(links).forEach(([key, entry]) => {
    const arr = getLinksArray(entry)
    const filtered = arr.filter(l => l.expTxId !== tx.txId)
    if (filtered.length !== arr.length) {
      touched.add(key)
      if (filtered.length) links[key] = filtered
      else delete links[key]
    }
  })
  // 3) compensazione impostata direttamente sui campi (senza compLinks): segui _compensatedBy
  const byGroup = Array.isArray(tx._compensatedBy) ? tx._compensatedBy : (tx._compensatedBy ? [tx._compensatedBy] : [])
  byGroup.forEach(id => touched.add(id))

  saveCompLinks(links)
  // Guard (fix 2026-07-12): per le entrate MANUALI di Altre Entrate la chiave è
  // tx.id e tx.txId è undefined — updateTransaction(undefined) era un no-op
  // innocuo ma sporco. Le entrate manuali non vivono nella collection
  // transactions: il loro stato di compensazione è interamente in compLinks
  // (già ripulito sopra), quindi si saltano gli id non validi.
  touched.forEach(id => { if (id) updateTransaction(id, { _compensatedAmt: null, _compensatedBy: null }) })
  return [...touched]
}
