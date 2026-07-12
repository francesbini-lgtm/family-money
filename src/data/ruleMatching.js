// ═══════════════════════════════════════════════════════════════════════════
// MOTORE UNICO di matching per le regole multi-condizione (aiRules) e per le
// catRules semplici "campo contiene" — consolidamento 2026-07-12 (vedi audit).
//
// PRIMA esistevano 5+ copie divergenti (useStore.applyAiRules, isKingProtected,
// applySingleRule, AiRulesTab.countMatchingTx, BulkEditModal.conditionMatches,
// più 3 copie delle catRules): la stessa regola dava risultati diversi tra
// anteprima, applicazione singola ed enrichment di massa; il campo "descAI"
// non matchava MAI in applyAiRules, e "merchant" veniva valutato sulla
// descrizione bancaria invece che sul merchant.
//
// SEMANTICA UNIFICATA (superset retro-compatibile: nessuna regola esistente
// smette di matchare, alcune matchano di più — comportamento corretto atteso):
// - description / anywhere → description O descAI
// - descAI                 → tx.descAI
// - merchant               → tx.merchant O description (legacy: alcune regole
//                            "merchant" furono salvate quando il matching
//                            avveniva sulla descrizione — non vanno rotte)
// - counterpart            → tx.counterpart O description (stesso motivo)
// - city                   → tx.city
// - amount / importo       → |amount|, operatori numerici (anche simboli)
// - condizioni con value vuoto → IGNORATE (prima, in OR, matchavano tutto)
// Ops positivi (contains/starts/ends/equals): basta che UN campo candidato
// soddisfi. Op negativo (not_contains): NESSUN campo candidato deve contenere.
// ═══════════════════════════════════════════════════════════════════════════

const TEXT_OPS = {
  contains: 'contains', contiene: 'contains',
  not_contains: 'not_contains', 'non contiene': 'not_contains',
  starts_with: 'starts_with', 'inizia con': 'starts_with',
  ends_with: 'ends_with', 'finisce con': 'ends_with',
  equals: 'equals', 'è': 'equals', 'uguale a': 'equals', '=': 'equals',
}
const NUM_OPS = {
  gt: 'gt', '>': 'gt', gte: 'gte', '>=': 'gte',
  lt: 'lt', '<': 'lt', lte: 'lte', '<=': 'lte',
  equals: 'equals', '=': 'equals', 'è': 'equals', 'uguale a': 'equals',
  between: 'between', tra: 'between',
}

// Campi candidati (in minuscolo) su cui valutare la condizione testuale
function candidatesFor(tx, field) {
  const c = (...vals) => vals.filter(v => v && v !== 'null').map(v => String(v).toLowerCase())
  switch (field) {
    case 'anywhere':
    case 'description':
    case 'descrizione': return c(tx.description, tx.descAI)
    case 'descAI':      return c(tx.descAI)
    case 'merchant':    return c(tx.merchant, tx.description)
    case 'counterpart':
    case 'controparte': return c(tx.counterpart, tx.description)
    case 'city':
    case 'città':       return c(tx.city)
    default:            return c(tx[field])
  }
}

function textOpMatches(hay, op, val) {
  switch (op) {
    case 'contains':    return hay.includes(val)
    case 'starts_with': return hay.startsWith(val)
    case 'ends_with':   return hay.endsWith(val)
    case 'equals':      return hay.trim() === val
    default:            return false
  }
}

export function condMatches(tx, cond) {
  const field = cond.field || 'description'
  if (field === 'amount' || field === 'importo') {
    const amt = Math.abs(tx.amount || 0)
    const n = parseFloat(cond.value)
    if (isNaN(n)) return false
    switch (NUM_OPS[cond.op] || cond.op) {
      case 'gt':      return amt > n
      case 'gte':     return amt >= n
      case 'lt':      return amt < n
      case 'lte':     return amt <= n
      case 'equals':  return Math.abs(amt - n) < 0.01
      case 'between': return amt >= n && amt <= parseFloat(cond.value2 || 0)
      default:        return false
    }
  }
  const val = String(cond.value ?? '').trim().toLowerCase()
  if (!val) return false // le condizioni vuote vanno filtrate a monte (activeConditions)
  const op = TEXT_OPS[cond.op] || cond.op
  const hays = candidatesFor(tx, field)
  if (op === 'not_contains') return hays.every(h => !h.includes(val)) // anche se hays è vuoto: "non contiene" è vero
  return hays.some(h => textOpMatches(h, op, val))
}

// Condizioni "attive": value valorizzato (le vuote sono neutre e vanno ignorate,
// mai considerate un match — in OR una condizione vuota matchava TUTTO)
export function activeConditions(conditions) {
  return (conditions || []).filter(c => String(c?.value ?? '').trim() !== '')
}

// logic: 'and' (default, tutte) | 'or' (almeno una)
export function txMatchesConditions(tx, conditions, logic = 'and') {
  const active = activeConditions(conditions)
  if (!active.length) return false
  return logic === 'or'
    ? active.some(c => condMatches(tx, c))
    : active.every(c => condMatches(tx, c))
}

// ── catRules semplici ("campo contiene valore" → categoria) ────────────────
// Unifica le 3 copie identiche che vivevano in TransactionsPage.applyCatRules,
// ImportModal.applyCatRulesLocal e MobileDiscovery (inline in handleAiLookup).
export function applyCatRulesTo(tx, rules) {
  for (const r of (rules || []).filter(r => r.enabled !== false)) {
    const val = (r.matchValue || '').toLowerCase()
    if (!val) continue
    const src = ((tx[r.matchField] || tx.description || tx.descAI || '')).toLowerCase()
    if (src.includes(val)) {
      return { cat1: r.cat1 || tx.cat1, cat2: r.cat2 !== undefined ? r.cat2 : tx.cat2 }
    }
  }
  return null
}
