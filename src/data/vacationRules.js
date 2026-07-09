// ── Regole di riassegnazione automatica "Weekend e Vacanze" ────────────────
// Usato sia da bulkApplyRules/applySingleRule (useStore.js) sia dall'AI
// Enrichment overlay (TransactionsPage.jsx, import CSV) per verificare, per
// ogni transazione, se la sua data di competenza cade in un periodo che
// l'utente ha dichiarato come vacanza/weekend nella sezione Calendario
// (appPrefs.calendarVacations — vedi CalendarioPage.jsx).

// Categorie di spesa "vacanza-eligible": se la data è dentro un periodo
// dichiarato vacanza, queste vengono riassegnate a cat1 "Weekend e Vacanze"
export const VACATION_ELIGIBLE_CATS = [
  { cat1: 'Spesa e Alimentari' },                   // alimentari / supermercato — tutte le sub
  { cat1: 'Tempo Libero', cat2: 'Cene / Pranzi' },   // ristoranti
  { cat1: 'Tempo Libero', cat2: 'Aperitivi' },
  { cat1: 'Veicoli', cat2: 'Carburante' },
]

// Parole chiave per rilevare spese di alloggio (hotel/B&B/affini) indipendentemente
// dalla categoria attuale — non esiste ancora una sotto-categoria "Alberghi" dedicata
const HOTEL_KEYWORDS = [
  'hotel', 'booking.com', 'booking', 'airbnb', 'b&b', 'bnb', 'residence',
  'agriturismo', 'ostello', 'hostel', 'resort', 'guest house', 'guesthouse',
]

// Vero se la transazione appartiene a una categoria/merchant "vacanza-eligible"
export function isVacationEligible(tx) {
  const hay = `${tx.merchant || ''} ${tx.description || ''} ${tx.descAI || ''}`.toLowerCase()
  if (HOTEL_KEYWORDS.some(k => hay.includes(k))) return true
  return VACATION_ELIGIBLE_CATS.some(c => tx.cat1 === c.cat1 && (!c.cat2 || tx.cat2 === c.cat2))
}

// Trova il periodo vacanza dichiarato (appPrefs.calendarVacations) che contiene dateStr, o null
export function findVacationForDate(dateStr, vacations) {
  if (!dateStr) return null
  return (vacations || []).find(v => dateStr >= v.from && dateStr <= v.to) || null
}

// Calcola le eventuali modifiche (patch) da applicare a una transazione in base
// alle vacanze dichiarate. Va chiamata come step della pipeline di categorizzazione
// (dopo le regole utente, prima dell'ultima regola di sistema "importo positivo → Entrate").
//
// - effDate: data di competenza da usare per il confronto (tx._effDate || tx.competenza || tx.date)
// - Ritorna { cat1?, cat2?, flagCompetenza? } — solo i campi che vanno effettivamente cambiati
export function computeVacationPatch(tx, vacations, effDate) {
  const patch = {}
  const vac = findVacationForDate(effDate, vacations)

  // 1. Riassegnazione: spesa vacanza-eligible in un periodo dichiarato → Weekend e Vacanze
  if (vac && tx.amount < 0 && tx.cat1 !== 'Weekend e Vacanze' && isVacationEligible(tx)) {
    patch.cat1 = 'Weekend e Vacanze'
    patch.cat2 = 'Vacanze'
  }

  // 2. Flag "da rivedere competenza": la categoria è (già/ora) Weekend e Vacanze ma la
  //    data di competenza non cade in nessun periodo dichiarato vacanza dall'utente —
  //    probabile spesa allocata al giorno sbagliato, va rivista la competenza.
  const finalCat1 = patch.cat1 || tx.cat1
  const shouldFlag = finalCat1 === 'Weekend e Vacanze' && !vac
  if (!!tx.flagCompetenza !== shouldFlag) patch.flagCompetenza = shouldFlag

  return patch
}
