// ── Global number/currency formatter ─────────────────────
// Italian format: thousands separator = ".", decimal = ","
// Works in all browsers and Node.js (no locale dependency).

// Parsing di un numero digitato in formato italiano: virgola = decimale, punto =
// migliaia (es. "274.907,22" o "274907,22" → 274907.22). Se non c'è la virgola si
// assume il punto come decimale ("274907.22" → 274907.22, "274907" → 274907). Ritorna
// NaN per stringhe vuote/non numeriche. Usato dagli input saldo dell'import.
export function parseDecimalIT(s) {
  if (s == null) return NaN
  let str = String(s).trim()
  if (str === '') return NaN
  const neg = str.startsWith('-')
  str = str.replace(/[^\d.,]/g, '')
  if (str === '') return NaN
  if (str.includes(',')) {
    // virgola = decimale, punti = migliaia
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    // nessuna virgola ma punti a gruppi di 3 (es. "5.500", "1.234.567") = migliaia
    str = str.replace(/\./g, '')
  }
  // altrimenti un singolo punto con 1-2 (o 4+) cifre resta decimale (es. "274907.22")
  const n = parseFloat(str)
  return Number.isNaN(n) ? NaN : (neg ? -n : n)
}

// Formattazione LIVE mentre l'utente digita un numero in stile italiano: migliaia col
// punto, decimali con la virgola. Tollera stati intermedi ("1.234," o "1.234,5"). La
// virgola è il separatore decimale; i punti sono solo raggruppamento (rimossi e
// ricalcolati). Da usare come: onChange={e => set(formatThousandsTyping(e.target.value))}.
// L'accoppiata con parseDecimalIT è esatta: parseDecimalIT("273.320,33") === 273320.33.
export function formatThousandsTyping(raw) {
  let s = String(raw ?? '').replace(/[^\d.,-]/g, '')
  const neg = s.startsWith('-')
  s = s.replace(/-/g, '').replace(/\./g, '')          // via segno e punti migliaia esistenti
  const firstComma = s.indexOf(',')
  let intPart, decPart
  if (firstComma === -1) { intPart = s; decPart = null }
  else {
    intPart = s.slice(0, firstComma)
    decPart = s.slice(firstComma + 1).replace(/,/g, '').slice(0, 2)  // una sola virgola, max 2 decimali
  }
  intPart = intPart.replace(/^0+(?=\d)/, '')          // niente zeri iniziali superflui
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const out = decPart != null ? `${grouped || '0'},${decPart}` : grouped
  return (neg ? '-' : '') + out
}

export function fmtIT(n, decimals = 0) {
  const fixed = Math.abs(Number(n) || 0).toFixed(decimals)
  const [int, dec] = fixed.split('.')
  const intF = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decimals > 0 ? intF + ',' + dec : intF
}

// € 1.234,56
export function fmtEur(n, decimals = 2) {
  return '\u20ac\u00a0' + fmtIT(n, decimals)
}

// € 1.234 (rounded, no decimals — for KPI displays)
export function fmtEurInt(n) {
  return '\u20ac\u00a0' + fmtIT(Math.round(n), 0)
}

// \u2500\u2500 Signed variants \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// The formatters above use Math.abs (many call sites rely on that).
// Use these where the sign of the value must be shown.
export function fmtITSigned(n, decimals = 0) {
  return ((Number(n) || 0) < 0 ? '-' : '') + fmtIT(n, decimals)
}

export function fmtEurSigned(n, decimals = 2) {
  return ((Number(n) || 0) < 0 ? '-' : '') + fmtEur(n, decimals)
}

// ── Date formatter ────────────────────────────────────────
// DD MMM YY  e.g. "18 Jan 26"
const _MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function fmtDate(dateStr) {
  if (!dateStr) return ''
  const s = String(dateStr).slice(0, 10)
  const [yr, mo, dy] = s.split('-')
  if (!yr || !mo || !dy) return s
  return `${parseInt(dy, 10)} ${_MONTHS_SHORT[parseInt(mo, 10) - 1] || ''} ${yr.slice(2)}`
}
