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

// ── Definizione colonne export ────────────────────────────
// Ogni colonna: key, label, get(t)->valore stringa per la cella. `quote:false` per i
// campi che non vanno racchiusi tra virgolette nel CSV (date, importi, sì/no).
// Usata sia dall'export CSV sia dall'anteprima nel wizard di export.
export const EXPORT_COLUMNS = [
  { key: 'data',       label: 'Data',                  get: t => t.date || '',                                 quote: false },
  { key: 'descAI',     label: 'Descrizione AI',        get: t => t.descAI || '' },
  { key: 'descOrig',   label: 'Descrizione originale', get: t => t.description || '' },
  { key: 'conto',      label: 'Conto',                 get: t => t.account || '' },
  { key: 'cat1',       label: 'Categoria',             get: t => t.cat1 || '' },
  { key: 'cat2',       label: 'Sottocategoria',        get: t => t.cat2 || '' },
  { key: 'importo',    label: 'Importo',               get: t => (t.amount ?? 0).toFixed(2).replace('.', ','), quote: false },
  { key: 'tipo',       label: 'Tipo',                  get: t => (t.type === 'Income' ? 'Entrata' : 'Uscita'), quote: false },
  { key: 'origine',    label: 'Origine',               get: t => deriveOrigine(t) },
  { key: 'dataImport', label: 'Data import',           get: t => fmtImportDate(t.importedAt),                  quote: false },
  { key: 'rifOrigine', label: 'Rif. origine',          get: t => rifOrigine(t) },
  { key: 'paypal',     label: 'Abbinata PayPal',       get: t => (t._paypalOverride ? 'Sì' : ''),              quote: false },
  { key: 'compensata', label: 'Compensata',            get: t => compensataLabel(t) },
  { key: 'txId',       label: 'txId',                  get: t => t.txId || '' },
]

const csvCell = (col, t) => {
  const v = col.get(t)
  return col.quote === false ? String(v ?? '') : `"${String(v ?? '').replace(/"/g, '""')}"`
}

// ── Export CSV di righe e colonne SELEZIONATE (usato dal wizard di export) ──
export function exportRowsCSV(rows, columnKeys, filename = 'family-money-transazioni.csv') {
  const cols = EXPORT_COLUMNS.filter(c => columnKeys.includes(c.key))
  const header = cols.map(c => c.label).join(';')
  const body = rows.map(t => cols.map(c => csvCell(c, t)).join(';'))
  const csv = [header, ...body].join('\n')
  downloadFile('﻿' + csv, filename, 'text/csv;charset=utf-8') // BOM per Excel
}

// ── CSV Export (tutte le colonne, righe non escluse) — retrocompatibile ──
export function exportTransactionsCSV(transactions, filename = 'family-money-transazioni.csv') {
  exportRowsCSV(transactions.filter(t => !t.excluded), EXPORT_COLUMNS.map(c => c.key), filename)
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
  downloadFile('﻿' + csv, 'family-money-riepilogo.csv', 'text/csv;charset=utf-8')
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
