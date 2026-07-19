// ── Definizione condivisa di "mese chiuso" ────────────────────────────────
// Regola concordata con l'utente (2026-07-19): un mese è CHIUSO quando non
// mancano più di 4 giorni di transazioni rispetto alla fine del mese, cioè
// l'ultima transazione registrata in quel mese cade negli ultimi 4 giorni
// del mese stesso. Se mancano più di 4 giorni, il mese è considerato NON
// chiuso (dati probabilmente non ancora importati per la coda del mese).
//
// Usare SEMPRE questa funzione per qualunque calcolo che debba escludere/
// includere un mese in base al fatto che sia chiuso o meno (Risparmio,
// Summary/Dashboard, Forecast, ecc.) invece di reimplementare la soglia in
// ogni pagina.
export function getMonthCloseInfo(transactions, ym) {
  const [y, m] = ym.split('-').map(Number)
  const lastDayOfMonth = new Date(y, m, 0).getDate()
  const txDaysInMonth = transactions
    .filter(t => !t.excluded && (t._effDate || t.date || '').startsWith(ym))
    .map(t => parseInt((t._effDate || t.date).slice(8, 10), 10))
    .filter(d => Number.isFinite(d))
  const lastTxDay = txDaysInMonth.length > 0 ? Math.max(...txDaysInMonth) : 0
  const missingDays = lastDayOfMonth - lastTxDay
  const closed = missingDays <= 4
  return { closed, lastTxDay, lastDayOfMonth, missingDays }
}

// Comodo per il mese corrente (usa new Date() del browser/sistema)
export function isCurrentMonthClosed(transactions) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return getMonthCloseInfo(transactions, ym)
}
