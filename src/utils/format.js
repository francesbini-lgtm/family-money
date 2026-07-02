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

// \u2500\u2500 Signed variants \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// The formatters above use Math.abs (many call sites rely on that).
// Use these where the sign of the value must be shown.
export function fmtITSigned(n, decimals = 0) {
  return ((Number(n) || 0) < 0 ? '-' : '') + fmtIT(n, decimals)
}

export function fmtEurSigned(n, decimals = 2) {
  return ((Number(n) || 0) < 0 ? '-' : '') + fmtEur(n, decimals)
}
