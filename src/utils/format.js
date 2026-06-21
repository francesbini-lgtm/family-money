// ── Global number/currency formatter ─────────────────────
// Italian format: thousands separator = ".", decimal = ","
// Works in all browsers and Node.js (no locale dependency).

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
