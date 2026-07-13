// ── CSV Export ────────────────────────────────────────────
export function exportTransactionsCSV(transactions, filename = 'family-money-transazioni.csv') {
  const headers = ['Data', 'Descrizione AI', 'Descrizione originale', 'Conto', 'Categoria', 'Sottocategoria', 'Importo', 'Tipo']

  const rows = transactions
    .filter(t => !t.excluded)
    .map(t => [
      t.date,
      `"${(t.descAI || '').replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${(t.account || '').replace(/"/g, '""')}"`,
      `"${(t.cat1 || '').replace(/"/g, '""')}"`,
      `"${(t.cat2 || '').replace(/"/g, '""')}"`,
      t.amount.toFixed(2).replace('.', ','),
      t.type === 'Income' ? 'Entrata' : 'Uscita',
    ].join(';'))

  const csv = [headers.join(';'), ...rows].join('\n')
  const bom = '\uFEFF' // UTF-8 BOM for Excel
  downloadFile(bom + csv, filename, 'text/csv;charset=utf-8')
}

// ── Export filtered by category ───────────────────────────
export function exportCategoryCSV(transactions, cat1, filename) {
  const filtered = transactions.filter(t => !t.excluded && t.cat1 === cat1)
  exportTransactionsCSV(filtered, filename || `family-money-${cat1.toLowerCase().replace(/\s+/g, '-')}.csv`)
}

// ── Summary export ────────────────────────────────────────
export function exportSummaryCSV(transactions) {
  // Group by month and category
  const data = {}
  transactions.filter(t => !t.excluded).forEach(t => {
    const ym = (t._effDate||t.date).slice(0, 7)
    if (!data[ym]) data[ym] = {}
    data[ym][t.cat1] = (data[ym][t.cat1] || 0) + t.amount
  })

  const months  = Object.keys(data).sort()
  const allCats = [...new Set(transactions.map(t => t.cat1))].sort()

  const headers = ['Mese', ...allCats]
  const rows = months.map(ym => [
    ym,
    ...allCats.map(c => (data[ym][c] || 0).toFixed(2).replace('.', ',')),
  ].join(';'))

  const csv = [headers.join(';'), ...rows].join('\n')
  downloadFile('\uFEFF' + csv, 'family-money-riepilogo.csv', 'text/csv;charset=utf-8')
}

// ── Backup vacanze (appPrefs.calendarVacations / calendarNotVacationDates) ──
// Backup manuale su richiesta esplicita dell'utente (2026-07-13, dopo una giornata
// intera passata a sistemare le vacanze): non è un sostituto della vera causa del
// bug (vedi guardia appPrefsLoaded in useStore.js), ma una rete di sicurezza
// indipendente — un JSON scaricato sul PC dell'utente, fuori da qualunque bug futuro
// dell'app o di Firestore.
export function exportVacanzeBackupJSON(appPrefs) {
  const payload = {
    exportedAt: new Date().toISOString(),
    calendarVacations: appPrefs?.calendarVacations || [],
    calendarNotVacationDates: appPrefs?.calendarNotVacationDates || [],
  }
  const stamp = new Date().toISOString().slice(0, 10)
  downloadFile(JSON.stringify(payload, null, 2), `family-money-backup-vacanze-${stamp}.json`, 'application/json;charset=utf-8')
}

// ── Helper ────────────────────────────────────────────────
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
