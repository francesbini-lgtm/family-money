// ── Regole di riassegnazione automatica "Weekend e Vacanze" ────────────────
// Usato da bulkApplyRules/applySingleRule (useStore.js), dall'AI Enrichment
// overlay (TransactionsPage.jsx, import CSV), da CalendarioPage.jsx e dalla
// tabella "Weekend e Vacanze v2" (WeekendVacanzeV2Page.jsx) per verificare,
// per ogni transazione, se la sua data di competenza cade in un periodo che
// l'utente ha dichiarato come vacanza/weekend nella sezione Calendario
// (appPrefs.calendarVacations) oppure ha esplicitamente escluso
// (appPrefs.calendarNotVacationDates).

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
// alle vacanze dichiarate e ai giorni esplicitamente marcati "non vacanza".
// Va chiamata come step della pipeline di categorizzazione (dopo le regole
// utente, prima dell'ultima regola di sistema "importo positivo → Entrate").
//
// - effDate: data di competenza da usare per il confronto (tx._effDate || tx.competenza || tx.date)
// - notVacationDates: array di dateStr esplicitamente marcati come NON vacanza
//   (click su una cella blu in Calendario, o "elimina" nella tabella Weekend e Vacanze v2)
// - Ritorna { cat1?, cat2?, flagCompetenza? } — solo i campi che vanno effettivamente cambiati
export function computeVacationPatch(tx, vacations, effDate, notVacationDates = []) {
  const patch = {}
  const isNotVac = notVacationDates.includes(effDate)
  const vac = isNotVac ? null : findVacationForDate(effDate, vacations)

  // 1. Riassegnazione: spesa vacanza-eligible in un periodo dichiarato → Weekend e Vacanze
  //    (mai se il giorno è stato esplicitamente marcato "non vacanza")
  if (vac && tx.amount < 0 && tx.cat1 !== 'Weekend e Vacanze' && isVacationEligible(tx)) {
    patch.cat1 = 'Weekend e Vacanze'
    patch.cat2 = 'Vacanze'
  }

  // 2. Flag "da rivedere competenza": la categoria è (già/ora) Weekend e Vacanze ma
  //    l'utente ha esplicitamente dichiarato che quel giorno NON era vacanza —
  //    probabile spesa allocata al giorno sbagliato, va rivista la competenza.
  const finalCat1 = patch.cat1 || tx.cat1
  const shouldFlag = finalCat1 === 'Weekend e Vacanze' && isNotVac
  if (!!tx.flagCompetenza !== shouldFlag) patch.flagCompetenza = shouldFlag

  return patch
}

// ── Raggruppa date (YYYY-MM-DD) in periodi consecutivi ────
// es. ['2026-07-01','2026-07-02','2026-07-05'] → [['2026-07-01','2026-07-02'],['2026-07-05','2026-07-05']]
export function groupConsecutiveDates(dates) {
  const sorted = [...dates].sort()
  const runs = []
  if (!sorted.length) return runs
  let start = sorted[0]
  let prev  = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]
    const prevDate = new Date(prev + 'T00:00:00')
    prevDate.setDate(prevDate.getDate() + 1)
    const expected = prevDate.toISOString().slice(0, 10)
    if (d === expected) {
      prev = d
    } else {
      runs.push([start, prev])
      start = d
      prev = d
    }
  }
  runs.push([start, prev])
  return runs
}

// Tutte le date (YYYY-MM-DD) comprese tra from e to, inclusi gli estremi
export function allDatesBetween(from, to) {
  const dates = []
  if (!from || !to) return dates
  let d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

// Città più frequente tra le transazioni "Weekend e Vacanze" nell'intervallo [from, to]
export function dominantCityInRange(transactions, from, to) {
  const freq = {}
  ;(transactions || []).forEach(t => {
    if (t.excluded || t.cat1 !== 'Weekend e Vacanze') return
    const d = t._effDate || t.date
    if (!d || d < from || d > to) return
    const c = t.city && t.city !== 'null' ? t.city : null
    if (c) freq[c] = (freq[c] || 0) + 1
  })
  const entries = Object.entries(freq)
  if (!entries.length) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

// Somma delle spese "Weekend e Vacanze" (nette, dopo compensazione) nell'intervallo [from, to]
export function vacationSpendInRange(transactions, from, to) {
  if (!from || !to) return 0
  return (transactions || [])
    .filter(t => !t.excluded && t.cat1 === 'Weekend e Vacanze' && t.amount < 0)
    .filter(t => { const d = t._effDate || t.date; return d && d >= from && d <= to })
    .reduce((sum, t) => {
      const net = (!t._compensatedAmt || t._compensatedAmt <= 0) ? t.amount : t.amount + t._compensatedAmt
      const abs = Math.abs(net)
      return sum + (abs < 0.005 ? 0 : abs)
    }, 0)
}

// ── Elenco unificato dei periodi vacanza per la tabella "Weekend e Vacanze v2" ──
// Combina i periodi dichiarati esplicitamente (appPrefs.calendarVacations, "declared: true")
// con i periodi rilevati automaticamente dalle transazioni cat1 "Weekend e Vacanze" che NON
// sono già coperti da un periodo dichiarato e non sono stati esclusi ("declared: false").
export function computeVacationPeriods(transactions, declaredVacations = [], notVacationDates = []) {
  const notSet = new Set(notVacationDates)

  const vacDaySet = new Set()
  ;(transactions || []).forEach(t => {
    if (t.excluded || t.cat1 !== 'Weekend e Vacanze') return
    const d = t._effDate || t.date
    if (d && !notSet.has(d)) vacDaySet.add(d)
  })
  const autoRuns = groupConsecutiveDates([...vacDaySet])

  const declared = declaredVacations.map(v => ({ ...v, declared: true }))

  const overlaps = (aFrom, aTo, bFrom, bTo) => aFrom <= bTo && bFrom <= aTo

  const virtual = autoRuns
    .filter(([from, to]) => !declared.some(v => overlaps(from, to, v.from, v.to)))
    .map(([from, to]) => ({
      id: `auto-${from}`,
      name: 'Weekend e Vacanze',
      from, to,
      city: dominantCityInRange(transactions, from, to),
      declared: false,
    }))

  return [...declared, ...virtual].sort((a, b) => (b.from || '').localeCompare(a.from || ''))
}
