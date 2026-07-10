import { CATS } from './categories'

// ── Bank format detection ────────────────────────────────────
export function detectBank(headerLine) {
  const h = (headerLine || '').toLowerCase()
  if (h.includes('intesa') || h.includes('abi') || (h.includes('data valuta') && h.includes('causale'))) return 'intesa'
  if (h.includes('unicredit') || h.includes('descrizione operazione')) return 'unicredit'
  if (h.includes('fineco') || h.includes('entrate') && h.includes('uscite')) return 'fineco'
  if (h.includes('bnl') || h.includes('banco di napoli')) return 'bnl'
  if (h.includes('credem')) return 'credem'
  if (h.includes('bper')) return 'bper'
  if (h.includes('banco bpm') || h.includes('bpm')) return 'bancobpm'
  return 'generic'
}

// ── Italian bank merchant patterns ──────────────────────────
const MERCHANT_PATTERNS = [
  // Supermercati
  [/esselunga/i,           'Esselunga',          'Spesa e Alimentari', 'Spesa'],
  [/coop\b/i,              'Coop',               'Spesa e Alimentari', 'Spesa'],
  [/carrefour|crf\s*mrkt/i,'Carrefour',          'Spesa e Alimentari', 'Spesa'],
  [/lidl/i,                'Lidl',               'Spesa e Alimentari', 'Spesa'],
  [/conad/i,               'Conad',              'Spesa e Alimentari', 'Spesa'],
  [/tigros/i,              'Tigros',             'Spesa e Alimentari', 'Spesa'],
  [/eurospin/i,            'Eurospin',           'Spesa e Alimentari', 'Spesa'],
  [/aldi\b/i,              'Aldi',               'Spesa e Alimentari', 'Spesa'],
  [/pam\b/i,               'Pam',                'Spesa e Alimentari', 'Spesa'],
  [/simply/i,              'Simply',             'Spesa e Alimentari', 'Spesa'],
  [/bennet/i,              'Bennet',             'Spesa e Alimentari', 'Spesa'],
  // Ristorazione
  [/mcdonald|mc donald/i,  'McDonald\'s',        'Tempo Libero', 'Cene / Pranzi'],
  [/burger king/i,         'Burger King',        'Tempo Libero', 'Cene / Pranzi'],
  [/starbucks/i,           'Starbucks',          'Tempo Libero', 'Cene / Pranzi'],
  [/just eat/i,            'Just Eat',           'Tempo Libero', 'Cene / Pranzi'],
  [/deliveroo/i,           'Deliveroo',          'Tempo Libero', 'Cene / Pranzi'],
  [/glovo/i,               'Glovo',              'Tempo Libero', 'Cene / Pranzi'],
  [/satispay/i,            'Satispay',           'Non Categorizzato', ''],
  // Trasporti
  [/trenitalia/i,          'Trenitalia',         'Veicoli', 'Autostrade'],
  [/italo\b/i,             'Italo Treno',        'Veicoli', 'Autostrade'],
  [/uber\b/i,              'Uber',               'Veicoli', 'Autostrade'],
  [/atm\b.*milano/i,       'ATM Milano',         'Veicoli', 'Autostrade'],
  [/autostrade/i,          'Autostrade',         'Veicoli', 'Autostrade'],
  [/telepass/i,            'Telepass',           'Veicoli', 'Autostrade'],
  [/ryanair/i,             'Ryanair',            'Weekend e Vacanze', 'Vacanze'],
  [/easyjet/i,             'EasyJet',            'Weekend e Vacanze', 'Vacanze'],
  [/alitalia|ita airways/i,'ITA Airways',        'Weekend e Vacanze', 'Vacanze'],
  [/booking\.com/i,        'Booking.com',        'Weekend e Vacanze', 'Vacanze'],
  [/airbnb/i,              'Airbnb',             'Weekend e Vacanze', 'Vacanze'],
  // Carburante
  [/\beni\b.*distrib|eni\s*station/i, 'ENI',    'Veicoli', 'Carburante'],
  [/shell\b/i,             'Shell',              'Veicoli', 'Carburante'],
  [/\bq8\b/i,              'Q8',                 'Veicoli', 'Carburante'],
  [/agip\b/i,              'Agip',               'Veicoli', 'Carburante'],
  [/total\b.*energ/i,      'TotalEnergies',      'Veicoli', 'Carburante'],
  [/ip\b.*distrib/i,       'IP',                 'Veicoli', 'Carburante'],
  // Shopping
  [/amazon/i,              'Amazon',             'Shopping', 'Shopping Online'],
  [/ebay/i,                'eBay',               'Shopping', 'Shopping Online'],
  [/zalando/i,             'Zalando',            'Shopping', 'Abbigliamento'],
  [/\bzara\b/i,            'Zara',               'Shopping', 'Abbigliamento'],
  [/h&m|h and m/i,         'H&M',                'Shopping', 'Abbigliamento'],
  [/\bovs\b/i,             'OVS',                'Shopping', 'Abbigliamento'],
  [/ikea/i,                'IKEA',               'Shopping', 'Shopping Online'],
  [/decathlon/i,           'Decathlon',          'Shopping', 'Shopping Online'],
  [/unieuro/i,             'Unieuro',            'Shopping', 'Shopping Online'],
  [/mediaworld/i,          'MediaWorld',         'Shopping', 'Shopping Online'],
  [/apple store|itunes|apple\.com/i, 'Apple',   'Shopping', 'Shopping Online'],
  [/paypal/i,              'PayPal',             'Non Categorizzato', ''],
  // Salute
  [/farmacia/i,            'Farmacia',           'Salute e Cura', 'Visite'],
  [/\bdottore|medic|clinica|dentist|studio med/i, 'Medico', 'Salute e Cura', 'Visite'],
  // Abbonamenti
  [/netflix/i,             'Netflix',            'Tempo Libero', 'Altro'],
  [/spotify/i,             'Spotify',            'Tempo Libero', 'Altro'],
  [/disney\+|disney plus/i,'Disney+',            'Tempo Libero', 'Altro'],
  [/apple.*tv|itv\b/i,     'Apple TV+',          'Tempo Libero', 'Altro'],
  [/sky\b/i,               'Sky',                'Tempo Libero', 'Altro'],
  [/dazn/i,                'DAZN',               'Tempo Libero', 'Altro'],
  [/prime video|amazon prime/i, 'Amazon Prime',  'Tempo Libero', 'Altro'],
  // Utenze
  [/enel\b/i,              'Enel',               'Casa', 'Utenze'],
  [/a2a\b/i,               'A2A',                'Casa', 'Utenze'],
  [/eni gas|engas/i,       'ENI Gas',            'Casa', 'Utenze'],
  [/vodafone/i,            'Vodafone',           'Casa', 'Utenze'],
  [/\btim\b/i,             'TIM',                'Casa', 'Utenze'],
  [/wind.*tre|windtre/i,   'WindTre',            'Casa', 'Utenze'],
  [/iliad/i,               'Iliad',              'Casa', 'Utenze'],
  [/fastweb/i,             'Fastweb',            'Casa', 'Utenze'],
  // Banca / admin
  [/prelievo|atm\b/i,      'Prelievo Contanti',  'Contanti', ''],
  [/canone|tenuta conto/i, 'Canone Bancario',    'Casa', 'Altro'],
  [/commissione|oneri ban/i,'Commissione Banca', 'Casa', 'Altro'],
  [/stipendio|salary|retrib/i, 'Stipendio',      'Entrate', 'Fra'],
  [/affitto|fitto\b/i,     'Affitto',            'Casa', 'Affitto'],
  [/mutuo\b/i,             'Mutuo',              'Casa', 'Affitto'],
  [/condominio/i,          'Condominio',         'Casa', 'Spese Condominio'],
  [/\btari\b/i,            'TARI',               'Casa', 'Tari'],
]

function toTitle(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function splitLine(line, sep) {
  const cols = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }  // escaped "" → literal quote
      else inQ = !inQ
    }
    else if (ch === sep && !inQ) { cols.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cols.push(cur.trim())
  return cols
}

function parseDate(raw) {
  raw = (raw || '').trim().replace(/['"]/g, '')
  let m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return raw
  return null
}

function parseAmount(raw) {
  raw = (raw || '').trim().replace(/['"]/g, '').replace(/\s/g, '')
  if (!raw || raw === '-') return null
  // Italian thousands only: 1.234 / 1.234.567 → strip dots
  if (/^-?\d{1,3}(\.\d{3})+$/.test(raw))
    return parseFloat(raw.replace(/\./g, ''))
  // English format: 1,234.56 / 1,234 → strip commas
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw))
    return parseFloat(raw.replace(/,/g, ''))
  // Italian format: 1.234,56
  if (/^-?[\d.]+,\d{1,2}$/.test(raw))
    return parseFloat(raw.replace(/\./g, '').replace(',', '.'))
  // Plain number
  const n = parseFloat(raw.replace(',', '.'))
  return isNaN(n) ? null : n
}

// ── Master row parser ────────────────────────────────────
// Single function that extracts ALL fields from a description row.
// Uses regex only — no AI needed for extraction.
export function parseRow(desc) {
  const result = { descAI: null, city: null, time: null, card: null, counterpart: null, merchant: null, streetHint: null }
  if (!desc) return result

  // ── Ora ───────────────────────────────────────────────────
  const timeM = desc.match(/(?:ALLE|ORE)\s+(\d{2})[.:h](\d{2})/i)
  if (timeM) result.time = `${timeM[1]}:${timeM[2]}`

  // ── Carta ─────────────────────────────────────────────────
  const cardM = desc.match(/CARTA \*(\d{4})/)
  if (cardM) result.card = cardM[1]
  // Masked PAN format: e.g. "5XXXXXXXXXXX0256" → card = "0256"
  if (!result.card) {
    const maskedPanM = desc.match(/\b\d[0-9X]*X(\d{4})\b/)
    if (maskedPanM) result.card = maskedPanM[1]
  }

  // ── Pagamento carta (Apple Pay / NFC) ─────────────────────
  // Format: "... CARTA *XXXX   DI EUR   AMOUNT   MERCHANT   CITY"
  const cardPayM = desc.match(/CARTA \*\d{4}\s+DI (?:EUR|CHF|SEK|USD|GBP|JPY|NOK|DKK|PLN)\s+[\d.,]+\s+(.+?)\s{2,}([\w][\w\s\-']+?)\s*$/i)
    || desc.match(/CARTA \*\d{4}\s+DI (?:EUR|CHF|SEK|USD|GBP|JPY|NOK|DKK|PLN)\s+[\d.,]+\s+(.+?)\s+([\w]+)\s*$/i)
  if (cardPayM) {
    let merchant = cardPayM[1].trim().replace(/\s+/g, ' ')
    let city     = cardPayM[2].trim().replace(/\s+/g, ' ')

    // If merchant == city → no merchant name, just city
    if (merchant.toUpperCase() === city.toUpperCase()) {
      result.city = toTitle(city)
      result.descAI = null
      return result
    }

    // ISP prelievo ATM
    if (/^ISP\s/i.test(merchant)) {
      result.descAI   = 'Prelievo ISP'
      result.city     = toTitle(city.split(/[-\s]/)[0])
      result.merchant = 'Prelievo ISP'
      return result
    }

    // Bankomat / ATM stranger
    if (/^Bankomat|^ATM\b/i.test(merchant)) {
      result.descAI   = 'Prelievo Bancomat'
      result.city     = toTitle(city)
      result.merchant = 'Prelievo Bancomat'
      return result
    }

    // Merchant name: remove trailing city if it ends with the city name
    // e.g. "CALZEDONIA COMO" with city "COMO" → merchant is "CALZEDONIA"
    const cityUpper = city.toUpperCase().trim()
    if (merchant.toUpperCase().endsWith(' ' + cityUpper)) {
      merchant = merchant.slice(0, -(cityUpper.length + 1)).trim()
    }

    // Remove terminal codes (e.g. COM3212, POS01, IT001, store numbers)
    merchant = merchant.replace(/\b[A-Z]{1,4}[0-9]+\b/g, '').replace(/\b[0-9]+\b/g, '').replace(/\s+/g, ' ').trim()

    // "DI", "DEL", "DELLA", "IN" etc. alone are prepositions, not city names
    const PREP_RE = /^(?:di|del|della|dei|degli|delle|dello|da|in|su|con|per|a|e)$/i
    const cityIsPrep = PREP_RE.test(city.trim())
    const cityClean = cityIsPrep ? null : city

    // If merchant starts with a street address (VIA, PIAZZA…) strip the street prefix.
    // If city was a preposition (e.g. "In", "Di"), re-attach it before stripping so we
    // don't lose words that are part of the business name (e.g. "Pizza In").
    const merchantForStreet = cityIsPrep ? merchant + ' ' + city : merchant
    const streetM = merchantForStreet.match(/^(?:VIA|VIALE|PIAZZA|P\.ZZA|CORSO|LARGO|VICOLO|STRADA)\s+\S+\s+(.+)/i)
    if (streetM) {
      // Save street prefix as a hint for Google Places ("VIA VINCENZO" etc.)
      const streetPrefix = merchantForStreet.match(/^(?:VIA|VIALE|PIAZZA|P\.ZZA|CORSO|LARGO|VICOLO|STRADA)\s+\S+/i)?.[0]
      result.streetHint = streetPrefix ? toTitle(streetPrefix) : null

      let afterStreet = streetM[1].trim()
      // Strip trailing Italian noise particles (DI/DEL/DELLA…) but NOT "In", "Al", "Da"
      // which are more likely to be part of the business name (e.g. "Pizza In", "Da Mario")
      afterStreet = afterStreet.replace(/\s+(?:di|del|della|dei|degli|delle|dello)\s*$/i, '').trim()
      merchant = afterStreet
    }

    result.merchant = toTitle(merchant)
    result.descAI   = toTitle(merchant)
    result.city     = cityClean ? toTitle(cityClean) : null
    return result
  }

  // ── Prelievo MASTERCARD (inline UNICREDIT ATM format) ────
  if (/PRELIEVO MASTERCARD/i.test(desc)) {
    // Format: "... UNICREDIT ATM NNNN CAB NNNNN CITY (XX) - ADDRESS"
    const unicreditM = desc.match(/UNICREDIT ATM\s+\d+\s+CAB\s+\d+\s+([A-Z][A-Z\s]+?)\s*\(/i)
    if (unicreditM) {
      result.descAI = 'Prelievo ATM'
      result.city   = toTitle(unicreditM[1].trim())
      return result
    }
    // Padded format (older): handled by cardPayM above
    result.descAI = 'Prelievo ATM'
    return result
  }

  // ── BONIFICO (in/out) ─────────────────────────────────────
  if (/BONIFICO/i.test(desc)) {
    result.descAI = 'Bonifico'

    // Incoming: DA: sender
    const daM = desc.match(/\bDA:\s*([^\n]{3,40}?)(?:\s{3,}|PER:|TRN:|COMM:|$)/i)
    if (daM && daM[1].trim().length > 2) result.counterpart = toTitle(daM[1].trim())

    // SEPA incoming
    const sepaM = desc.match(/BONIFICO SEPA DA:\s*([^\n]{3,40}?)(?:\s{3,}|PER:|TRN:|$)/i)
    if (sepaM && sepaM[1].trim().length > 2) result.counterpart = toTitle(sepaM[1].trim())

    // Outgoing: A: recipient
    if (!result.counterpart) {
      const aM = desc.match(/\bA:\s*([A-Z][A-Z\s,.\']{3,40}?)(?:\s{3,}|PER:|TRN:|$)/i)
      if (aM && aM[1].trim().length > 2) result.counterpart = toTitle(aM[1].trim())
    }

    // Outgoing: PER: causale (use as descAI for outgoing)
    if (/DISPOSIZIONE DI BONIFICO/i.test(desc)) {
      const perM = desc.match(/\bPER:\s*([^\n]{3,50}?)(?:\s{3,}|COMM:|TRN:|$)/i)
      if (perM && perM[1].trim().length > 2) {
        result.descAI = toTitle(perM[1].trim().split(/\s+/).slice(0,3).join(' '))
      } else if (result.counterpart) {
        result.descAI = result.counterpart.split(',')[0].trim().split(' ').slice(0,2).join(' ')
      }
    } else if (result.counterpart) {
      // For incoming, use sender name as descAI
      result.descAI = result.counterpart.split(',')[0].trim().split(' ').slice(0,2).join(' ')
    }

    return result
  }

  // ── SEPA DD ───────────────────────────────────────────────
  if (/ADDEBITO SEPA DD/i.test(desc)) {
    const coM = desc.match(/SDD da [A-Z0-9]+\s+([A-Za-z][A-Za-z\s.&\',-]{3,40}?)(?:\s{3,}|mandato|Per )/i)
    if (coM) {
      result.counterpart = toTitle(coM[1].trim())
      result.descAI      = toTitle(coM[1].trim().split(/\s+/).slice(0,2).join(' '))
    } else {
      result.descAI = 'Addebito SEPA'
    }
    return result
  }

  // ── COMMISSIONI / SPESE ───────────────────────────────────
  if (/COMMISSIONI|PROVVIGIONI/i.test(desc)) {
    result.descAI = 'Commissioni'
    return result
  }

  // ── ESTRATTO CARTA ────────────────────────────────────────
  if (/ESTRATTO.*CARTA/i.test(desc)) {
    const mM = desc.match(/ESTRATTO (\d{2}\/\d{4})/)
    result.descAI = mM ? 'Estratto ' + mM[1] : 'Estratto Carta'
    return result
  }

  // ── Fallback ──────────────────────────────────────────────
  // Do NOT set descAI here — let AI handle unknown transactions
  return result
}

// ── Compat wrappers ───────────────────────────────────────
export function parseCardPayment(desc)     { return parseRow(desc) }
export function extractMerchantAndCity(desc) {
  const r = parseRow(desc)
  return (r.merchant || r.city) ? { merchant: r.merchant, city: r.city } : null
}
export function extractAtmLocation(desc)   { return parseRow(desc).city }
export function extractTime(desc)          { return parseRow(desc).time }
export function extractCounterpart(desc)   { return parseRow(desc).counterpart }


export function generateDescAI(desc) {
  if (!desc) return '—'
  const r = parseRow(desc)
  return r.descAI || '—'
}


export function autoCategorize(desc, amount, customRules=[]) {
  // Check custom AI rules first
  const descLower = desc.toLowerCase()
  for (const rule of customRules) {
    if (rule.keyword && descLower.includes(rule.keyword.toLowerCase())) {
      return { l1: rule.cat1, l2: rule.cat2||'', conf: 95 }
    }
  }
  for (const [pattern, , l1, l2] of MERCHANT_PATTERNS) {
    if (pattern.test(desc)) {
      const catExists = Object.keys(CATS).includes(l1)
      return { l1: catExists ? l1 : 'Non Categorizzato', l2: l2 || '', conf: 88 }
    }
  }
  // Fallback rules
  if (amount > 0) {
    if (/stipendio|salary|retrib/i.test(desc)) return { l1:'Entrate', l2:'Fra',   conf:90 }
    return                                             { l1:'Entrate', l2:'Altro', conf:55 }
  }
  if (/estratto.*carta|addebito.*carta/i.test(desc)) return { l1:'Non Categorizzato', l2:'', conf:95 }
  return { l1:'Non Categorizzato', l2:'', conf:35 }
}

// Splits CSV text into logical records, keeping embedded newlines inside quoted fields.
// Standard text.split(/\r?\n/) breaks on ANY newline, corrupting multi-line quoted cells.
function splitCSVIntoLines(text) {
  const lines = []
  let line = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch   = text[i]
    const next = text[i + 1]
    if (ch === '"') {
      if (inQ && next === '"') { line += '""'; i++ }  // escaped "" — keep both, splitLine handles it
      else { inQ = !inQ; line += ch }
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && next === '\n') i++           // CRLF → consume both
      if (inQ) {
        line += '\n'                                   // newline inside quoted field — keep
      } else {
        if (line.trim()) lines.push(line)
        line = ''
      }
    } else {
      line += ch
    }
  }
  if (line.trim()) lines.push(line)
  return lines
}

export function parseCSV(text, accountName, customRules=[], existingTxs=[]) {
  const lines = splitCSVIntoLines(text)
  if (!lines.length) return []
  // Find header row
  let hi = lines.findIndex(l => {
    const lower = l.toLowerCase()
    return lower.includes('data') && (lower.includes('importo') || lower.includes('moviment'))
  })
  if (hi < 0) hi = 0

  // Detect separator from the actual header row (lines[0] may be a preamble line)
  const sep = lines[hi].includes(';') ? ';' : ','

  const headers = splitLine(lines[hi], sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ''))

  // Column detection — works across UniCredit, Fineco, BNL, Credem, generic
  // colDate = data valuta — calcolato PRIMA di colDateReg perché quest'ultimo, nel
  // pattern più comune sulle carte (header "Data" + "Data Valuta", vedi sotto), deve
  // sapere quale colonna è già stata presa come valuta per non riprenderla.
  const colDate = (() => {
    // Prefer 'data valuta' over 'data operazione' for accounting date
    const checks = ['data valuta','valuta','data operazione','data op','data','date']
    for (const key of checks) {
      const idx = headers.findIndex(h => h === key || h.startsWith(key))
      if (idx >= 0) return idx
    }
    return 0
  })()
  // colDateReg = data registrazione/contabile (when transaction was posted to account —
  // per le carte è la data che conta per la riconciliazione mensile con l'estratto,
  // vedi cardMonthKey() in ImportModal.jsx).
  const colDateReg = (() => {
    const checks = ['data registrazione','registrazione','booking date','contabil']
    for (const key of checks) {
      const idx = headers.findIndex(h => h.includes(key))
      if (idx >= 0) return idx
    }
    // Pattern reale trovato su un file utente: header "Data" (contabile) + "Data
    // Valuta" (valuta), senza nessuna delle parole sopra — un header ESATTAMENTE
    // "data" (non "data valuta"/"data operazione"/ecc.) diverso dalla colonna già
    // presa come valuta è quasi sempre la data di contabilità. Bug reale: prima
    // questo caso restituiva -1 e faceva ricadere tutto sulla valuta anche con
    // entrambe le colonne presenti nel file.
    const plainDataIdx = headers.findIndex((h, i) => h === 'data' && i !== colDate)
    if (plainDataIdx >= 0) return plainDataIdx
    return -1 // not found
  })()
  const colDesc = (() => {
    const checks = ['descrizione','causale','descrizione operazione','movimento','narration','details']
    for (const key of checks) {
      const idx = headers.findIndex(h => h.includes(key))
      if (idx >= 0) return idx
    }
    return 2
  })()
  const colAmt = (() => {
    // Fineco-style: separate 'entrate' and 'uscite' columns
    const entrate = headers.findIndex(h => h === 'entrate' || h === 'accrediti')
    const uscite  = headers.findIndex(h => h === 'uscite'  || h === 'addebiti')
    if (entrate >= 0 && uscite >= 0) return { fineco: true, entrate, uscite }
    // Standard single importo column
    const checks = ['importo','amount','saldo movimento','importo movimento']
    for (const key of checks) {
      const idx = headers.findIndex(h => h === key || h.includes(key))
      if (idx >= 0) return idx
    }
    return headers.length - 2
  })()

  const txs = []
  for (let i = hi + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = splitLine(line, sep)
    if (cols.length < 3) continue

    const rawDate    = cols[colDate    >= 0 ? colDate    : 0] || ''
    const rawDateReg = cols[colDateReg >= 0 ? colDateReg : colDate >= 0 ? colDate : 0] || ''
    const desc    = (cols[colDesc >= 0 ? colDesc : 2] || '').replace(/\s+/g, ' ').trim()
    let amount
    if (typeof colAmt === 'object' && colAmt.fineco) {
      // Fineco: separate debit/credit columns
      const credit = parseAmount(cols[colAmt.entrate] || '0')
      const debit  = parseAmount(cols[colAmt.uscite]  || '0')
      amount = (credit || 0) - (debit || 0)
    } else {
      const rawAmt = cols[typeof colAmt === 'number' ? colAmt : cols.length - 2] || '0'
      amount = parseAmount(rawAmt)
    }

    const date     = parseDate(rawDate);    if (!date) continue
    const date_reg = parseDate(rawDateReg) || date
    if (amount === null || amount === 0) continue

    const cat          = autoCategorize(desc, amount, customRules)
    const time         = extractTime(desc)
    const p            = parseCardPayment(desc)
    const merchant     = p?.merchant   || null
    const city         = p?.city       || null
    const card         = p?.card       || null
    const streetHint   = p?.streetHint || null
    const counterpart  = p ? null : extractCounterpart(desc)
    const descAI       = generateDescAI(desc)

    txs.push({
      txId:         null, // assigned after sorting below
      date,
      date_reg,
      isBonifico:   /bonifico/i.test(desc),
      time,
      card,
      counterpart,
      merchant,
      city,
      streetHint,
      account:      accountName || 'Conto Corrente',
      description:  desc,
      descAI,
      amount,
      type:         amount >= 0 ? 'Income' : 'Expense',
      cat1:         cat.l1,
      cat2:         cat.l2,
      conf:         cat.conf,
      excluded:     false,
      aiCategorized:false,
    })
  }

  // Build per-year max seq from existing transactions so new IDs never collide
  const yearMax = {}
  for (const t of existingTxs) {
    const m = (t.txId || '').match(/^(\d{2})-(\d+)$/)
    if (m) {
      const yr = m[1], seq = parseInt(m[2], 10)
      if (!yearMax[yr] || seq > yearMax[yr]) yearMax[yr] = seq
    }
  }

  // Sort chronologically ascending: oldest first → lowest txId numbers
  txs.sort((a, b) => a.date.localeCompare(b.date))

  const yearCounter = { ...yearMax }
  txs.forEach(t => {
    const yr = ((t._effDate||t.date||'')).slice(2, 4)   // "2022-11-20" → "22"
    yearCounter[yr] = (yearCounter[yr] || 0) + 1
    t.txId = `${yr}-${String(yearCounter[yr]).padStart(4, '0')}`
  })

  return txs
}


