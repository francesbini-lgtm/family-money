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

// Costo totale di una vacanza dichiarata: spesa transazioni "Weekend e Vacanze" nel
// periodo + eventuali importi manuali di carburante/autostrada imputati dall'utente
// (v.manualCarburante / v.manualAutostrada, compilati a mano nel drill-down della riga
// perché quelle spese sono categorizzate "Veicoli" e non risulterebbero altrimenti nel
// costo della vacanza — vedi anche la riconciliazione in UscitePage "Adj vacanze")
export function vacationManualExtra(v) {
  return (Number(v?.manualCarburante) || 0) + (Number(v?.manualAutostrada) || 0)
}
export function vacationTotalCost(transactions, v) {
  return vacationSpendInRange(transactions, v.from, v.to) + vacationManualExtra(v)
}

// Tipo dominante (Weekend / Vacanze) nell'intervallo, in base al cat2 più frequente
// tra le transazioni "Weekend e Vacanze" (non più su base "numero di notti")
export function dominantVacationType(transactions, from, to) {
  const freq = {}
  ;(transactions || []).forEach(t => {
    if (t.excluded || t.cat1 !== 'Weekend e Vacanze') return
    const d = t._effDate || t.date
    if (!d || d < from || d > to) return
    const c2 = t.cat2 === 'Vacanze' ? 'Vacanze' : 'Weekend'
    freq[c2] = (freq[c2] || 0) + 1
  })
  const entries = Object.entries(freq)
  if (!entries.length) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

export function vacationNights(v) {
  if (!v?.from || !v?.to) return 0
  return Math.max(0, Math.round((new Date(v.to) - new Date(v.from)) / 86400000))
}

// Tipo (Vacanze/Weekend) di un periodo dichiarato — punto UNICO di calcolo,
// usato ovunque nell'app serva sapere se un periodo è "Vacanze" o "Weekend"
// (WeekendVacanzeV2Page, TransactionsPage). Priorità: (1) v.typeOverride —
// scelta manuale esplicita dell'utente, click sul badge "Tipo" nella tabella
// annuale di Weekend e Vacanze (richiesta 2026-07-13: "utente può cambiare da
// weekend a vacanza cliccandoci sopra"); (2) cat2 dominante tra le transazioni
// già assegnate al periodo; (3) fallback sulla durata, 3+ notti = Vacanze.
export function vacationType(v, transactions) {
  if (v?.typeOverride === 'Vacanze' || v?.typeOverride === 'Weekend') return v.typeOverride
  return dominantVacationType(transactions, v.from, v.to) || (vacationNights(v) >= 3 ? 'Vacanze' : 'Weekend')
}

// ── Classificazione destinazione (Mare / Montagna / Città) da nome località ──
const DEST_BEACH_KEYWORDS = ['mare','sard','rimini','cost','bagn','lido','lignan','riccione','cattolica','riviera','tropea','sicil','calabr','puglia','salent','amalfi','elba','capri','ischia','taormin','eolie','positano','gallipoli','otranto','vieste','ibiza','mykonos','maiorca','tenerife','palermo','catania','miami','maldive','seychelles','sharm','hurghada','cancun']
const DEST_MOUNTAIN_KEYWORDS = ['mont','alp','dolomit','aosta','neve','ski','snowboard','courmayeur','livigno','madonna','sestriere','bormio','cervinia','cortina','trentino','val di fass','val garden','alta badia','davos','zermatt','innsbruck','salzburg','chamonix']
const DEST_CITY_KEYWORDS = ['roma','milano','madrid','parigi','paris','londra','london','berlino','berlin','amsterdam','dublino','dublin','barcellona','barcelona','lisbona','lisbon','vienna','praga','prague','budapest','new york','tokyo','venezia','venice','firenze','florence','torino','napoli','bologna','stoccolma','stockholm','copenaghen','copenhagen','oslo','helsinki','bruxelles','brussels','monaco','munich','zurigo','zurich','ginevra','geneva','atene','athens','istanbul','dubai']

export const DEST_TYPES = ['Mare', 'Montagna', 'Città', 'Altro']

export function labelToEmoji(label) {
  return label === 'Mare' ? '🏖️' : label === 'Montagna' ? '🏔️' : label === 'Città' ? '🏙️' : '✈️'
}

export function destCategoryLabel(city = '') {
  const n = (city || '').toLowerCase()
  if (DEST_BEACH_KEYWORDS.some(k => n.includes(k))) return 'Mare'
  if (DEST_MOUNTAIN_KEYWORDS.some(k => n.includes(k))) return 'Montagna'
  if (DEST_CITY_KEYWORDS.some(k => n.includes(k))) return 'Città'
  return 'Altro'
}

export function destCategoryEmoji(city = '') {
  return labelToEmoji(destCategoryLabel(city))
}

// ── Candidati vacanza/weekend NON ancora confermati dall'utente ──────────────
// Raggruppa i giorni con spesa "Weekend e Vacanze" (esclusi quelli già coperti da
// un periodo dichiarato o marcati "non vacanza") in cluster: giorni ravvicinati
// (gap <= CANDIDATE_GAP_DAYS) E con la stessa località dominante vengono uniti in
// un'unica riga candidata, invece di restare tante righe di 1 giorno ciascuna.
const CANDIDATE_GAP_DAYS = 3

export function computeCandidateVacations(transactions, declaredVacations = [], notVacationDates = []) {
  const notSet = new Set(notVacationDates)
  const declared = declaredVacations || []
  const isCovered = d => declared.some(v => d >= v.from && d <= v.to)

  // giorno → città dominante quel giorno (può essere null)
  const dayCity = {}
  ;(transactions || []).forEach(t => {
    if (t.excluded || t.cat1 !== 'Weekend e Vacanze') return
    const d = t._effDate || t.date
    if (!d || notSet.has(d) || isCovered(d)) return
    const c = t.city && t.city !== 'null' ? t.city : null
    if (!(d in dayCity)) dayCity[d] = {}
    if (c) dayCity[d][c] = (dayCity[d][c] || 0) + 1
  })

  const sortedDates = Object.keys(dayCity).sort()
  if (!sortedDates.length) return []

  const cityOf = d => {
    const freq = dayCity[d]
    const entries = Object.entries(freq || {})
    return entries.length ? entries.sort((a, b) => b[1] - a[1])[0][0] : null
  }

  const clusters = []
  let cur = null
  for (const d of sortedDates) {
    const c = cityOf(d)
    if (cur) {
      const prevDate = new Date(cur.dates[cur.dates.length - 1] + 'T00:00:00')
      const gapDays = Math.round((new Date(d + 'T00:00:00') - prevDate) / 86400000)
      const sameCity = !c || !cur.city || c === cur.city
      if (gapDays <= CANDIDATE_GAP_DAYS && sameCity) {
        cur.dates.push(d)
        if (c) cur.city = c
        continue
      }
      clusters.push(cur)
    }
    cur = { dates: [d], city: c }
  }
  if (cur) clusters.push(cur)

  return clusters.map((cl, i) => {
    const from = cl.dates[0], to = cl.dates[cl.dates.length - 1]
    return {
      id: `candidate-${from}-${i}`,
      dates: cl.dates,
      from, to,
      city: cl.city || dominantCityInRange(transactions, from, to),
      type: dominantVacationType(transactions, from, to) || 'Weekend',
      spend: vacationSpendInRange(transactions, from, to),
    }
  }).sort((a, b) => b.from.localeCompare(a.from))
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
