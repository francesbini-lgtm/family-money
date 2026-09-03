// ── Provenienza riga (derivata dai marcatori esistenti sulla transazione) ──
// Non esiste un singolo campo "origine": lo deduciamo dai vari flag/prefissi txId
// impostati alla creazione della riga (import, split, unione, manuale, rettifiche,
// cash-sync). Retroattivo: funziona su tutte le righe già a DB.
export function deriveOrigine(t) {
  if (t._doppioniTappo)          return 'Rettifica doppioni'
  if (t.cardImportCorrection)    return 'Rettifica carta'
  if (t._source === 'cash-sync') return 'Cash/Veicoli'
  if (t._mergedFrom)             return 'Unione'
  if (t._splitFrom)              return 'Split'
  if (String(t.txId || '').includes('-MAN-')) return 'Manuale'
  if (t.cardImportCard4)         return `Import carta *${t.cardImportCard4}`
  if (t.importedAt)              return 'Import conto'
  return '—'
}
function rifOrigine(t) {
  if (t._splitFrom) return t._splitFrom
  if (Array.isArray(t._mergedFrom)) return t._mergedFrom.join(' | ')
  return ''
}
function fmtImportDate(iso) {
  return iso ? String(iso).slice(0, 16).replace('T', ' ') : ''
}
function compensataLabel(t) {
  if (!(t._compensatedAmt > 0) && !t._compensatedBy) return ''
  const by = Array.isArray(t._compensatedBy) ? t._compensatedBy.join(' | ') : (t._compensatedBy || '')
  return by ? `Sì (con ${by})` : 'Sì'
}

// ── CSV Export ────────────────────────────────────────────
export function exportTransactionsCSV(transactions, filename = 'family-money-transazioni.csv') {
  const headers = ['Data', 'Descrizione AI', 'Descrizione originale', 'Conto', 'Categoria', 'Sottocategoria', 'Importo', 'Tipo',
    'Origine', 'Data import', 'Rif. origine', 'Abbinata PayPal', 'Compensata', 'txId']

  const q = s => `"${(s ?? '').toString().replace(/"/g, '""')}"`

  const rows = transactions
    .filter(t => !t.excluded)
    .map(t => [
      t.date,
      q(t.descAI),
      q(t.description),
      q(t.account),
      q(t.cat1),
      q(t.cat2),
      t.amount.toFixed(2).replace('.', ','),
      t.type === 'Income' ? 'Entrata' : 'Uscita',
      q(deriveOrigine(t)),
      fmtImportDate(t.importedAt),
      q(rifOrigine(t)),
      t._paypalOverride ? 'Sì' : '',
      q(compensataLabel(t)),
      q(t.txId),
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
