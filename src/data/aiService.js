import { getAIPrompts } from './aiPrompts'
import { buildRulesPrompt } from './aiRules'
import { CATS, CAT_NAMES } from './categories'
import { parseRow } from './csvParser'
import { useStore } from '../store/useStore'

// ── Merchant abbreviation overrides ──────────────────────
// When AI returns a known abbreviation instead of the real name,
// override both merchant and descAI. Pattern matched against description.
const MERCHANT_ABBREVS = [
  { pattern: /\bcrf\s*m[kr]?kt?\b/i,               merchant: 'Carrefour',        descAI: 'Carrefour' },
  { pattern: /\bamzn\s*mktp\b/i,                    merchant: 'Amazon',           descAI: 'Amazon' },
  { pattern: /\baliexpr/i,                          merchant: 'AliExpress',       descAI: 'AliExpress' },
  // Satispay inbound transfers — AI must NEVER override these
  { pattern: /satispay\s*europe/i,                  merchant: null,               descAI: 'Accredito Satispay' },
  { pattern: /accredito\s+dall.app\s+satispay/i,    merchant: null,               descAI: 'Accredito Satispay' },
  // Satispay outbound bonifici (fondi accantonamento) — force descAI
  { pattern: /disposizione\s+di\s+bonifico.*satispay/i, merchant: null,           descAI: 'Accantonamento Satispay' },
]
function applyMerchantAbbrevs(description, aiMerchant, aiDescAI) {
  for (const { pattern, merchant, descAI } of MERCHANT_ABBREVS) {
    if (pattern.test(description || '')) {
      console.log(`[merchantOverride] "${description.slice(0,50)}" → merchant:"${merchant}"`)
      return { merchant, descAI }
    }
  }
  return { merchant: aiMerchant, descAI: aiDescAI }
}


// ── descAI logic — no AI needed ──────────────────────────
// Rules (in order of priority):
// 1. If merchant is set → use merchant name
// 2. If bonifico + positive → "Bonifico da CONTROPARTE"
// 3. If bonifico + negative → "Bonifico a CONTROPARTE"
// 4. Fallback → let AI decide
export function computeDescAI(t) {
  const merchant     = t.merchant    && t.merchant    !== 'null' ? t.merchant    : null
  const counterpart  = t.counterpart && t.counterpart !== 'null' ? t.counterpart : null
  const isBonifico   = t.isBonifico || /bonifico/i.test(t.description || '')

  if (/\bprelievo\b/i.test(t.description || '') && !isBonifico) return 'Prelievo'
  if (merchant) return merchant
  if (isBonifico && counterpart) {
    return t.amount > 0
      ? `Bonifico da ${counterpart}`
      : `Bonifico a ${counterpart}`
  }
  return null // let AI handle it
}

// ── Fallback descAI: pulizia della descrizione bancaria grezza ────────────
// Quando né AI né regole producono una descAI e si ricade sulla descrizione
// originale della banca (fallback introdotto il 2026-07-11), la ripuliamo dal
// rumore che "non ha senso e allunga solo" (richiesta utente): prefissi tecnici
// tipo "Pagamento Contactless/POS/Apple Pay…" e codici numerici lunghi.
// L'importo estero finale "(35,00 USD)" viene mantenuto: è informazione utile.
export function cleanRawDescFallback(desc) {
  if (!desc) return desc
  let s = String(desc)
  s = s.replace(/\b\d{8,}\b/g, ' ')  // codici riferimento/transazione lunghi
  // Sequenza di token tecnici di pagamento in testa — combinabili in QUALSIASI ordine/
  // numero (es. "PAGAMENTO APPLE PAY MASTERCARD NFC..." non veniva ripulito del tutto
  // prima del 2026-07-13 perché il vecchio regex ne accettava solo uno alla volta)
  s = s.replace(/^\s*(pagamento\s+)?((contactless|c-?less|pos|apple\s*pay|google\s*pay|maestro|mastercard|visa|nfc)\s+)+/i, '')
  s = s.replace(/^\s*pagamento\s+/i, '')
  // Bancomat/carta, italiani ed esteri (Svizzera/PostFinance e simili — 2026-07-13, tx
  // che arrivavano al fallback quasi del tutto grezze perché questi formati non erano
  // coperti): "CARTA *2476 DI EUR 40,20 ...", "PAGOBANCOMAT C-LESS CON CARTA *8623 DEL
  // 25/03 ...", "del 08/08/2025 CARTA *6587 DI EUR 20,10 ...", "22/11/22 CARTA *8623 DI
  // CHF 26,50 ..." — data prima o dopo "carta", con o senza prefisso pagobancomat
  s = s.replace(/^\s*(pagobancomat\s+(c-?less\s+)?(con\s+)?)?(del\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?\s+)?carta\s*\*?\d{3,4}\s*(del\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?)?\s*(di\s+[a-z]{3}\s+[\d.,]+)?\s*/i, '')
  s = s.replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s+carta\s*\*?\d{3,4}\s*(di\s+[a-z]{3}\s+[\d.,]+)?\s*/i, '')
  s = s.replace(/\s{2,}/g, ' ').trim()
  return s || desc
}

// ── API keys — Firestore (appPrefs) con fallback localStorage ──
function getApiKey() {
  const k = useStore.getState().appPrefs?.geminiKey || ''
  return k || localStorage.getItem('fm-gemini-key') || ''
}

// Usato da DashboardPage (alert chiave mancante) e ImportModal (check pre-import)
// — stessa identica logica/fallback di getApiKey(), esposta pubblicamente.
export function hasGeminiKey() {
  return !!getApiKey()
}

function getPlacesKey() {
  const k = useStore.getState().appPrefs?.placesKey || ''
  return k || localStorage.getItem('fm-places-key') || ''
}

// ── Detect proxy URL — locale o Vercel Function ──────────
function proxyUrl(path) {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://localhost:3001${path}`
  }
  // Su Vercel: usa le API routes
  return `/api${path}`
}

// ── Gemini call via proxy ─────────────────────────────────
// For OpenAI keys (sk-*): calls OpenAI directly from the browser to bypass
// Vercel's 10s hobby-plan timeout. For Gemini keys: uses the proxy (needed for CORS).
export async function callGemini(prompt) {
  const key = getApiKey()
  if (!key) throw new Error('GEMINI_KEY_MISSING')

  // ── OpenAI key: direct browser → OpenAI (no Vercel proxy, no 10s timeout) ──
  if (key.startsWith('sk-')) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 8000,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || `OpenAI HTTP ${res.status}`)
      }
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content?.trim() || ''
      if (!text) throw new Error('Empty response from AI')
      return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    } catch(e) {
      if (e.message.includes('fetch') || e.message.includes('Failed to fetch')) {
        throw new Error('PROXY_NOT_RUNNING')
      }
      throw e
    }
  }

  // ── Gemini key: go through proxy (CORS not allowed direct) ──
  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 60_000)

    let response
    try {
      response = await fetch(proxyUrl('/gemini'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, key }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const msg = err?.error?.message || (typeof err?.error === 'string' ? err.error : null) || `HTTP ${response.status}`
      console.error('[callGemini] proxy error:', msg)
      throw new Error('PROXY_ERROR: ' + msg)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!text) throw new Error('Empty response from AI')
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  } catch(e) {
    if (e.message === 'GEMINI_KEY_MISSING') throw e
    if (e.name === 'AbortError') throw new Error('PROXY_TIMEOUT')
    if (e.message.includes('fetch') || e.message.includes('Failed to fetch') || e.message.includes('ECONNREFUSED')) {
      throw new Error('PROXY_NOT_RUNNING')
    }
    throw e
  }
}

// ── Vehicle market value estimate (AI) ────────────────────
// Richiesta utente 2026-07-14: bottone accanto a "Valore di mercato (€)" nel
// modale veicolo (VeicoliRegistroPage). Usa la stessa chiave AI già
// configurata (gpt-4o-mini via callGemini, che gestisce sia chiavi OpenAI
// che Gemini). Il prompt chiede esplicitamente una stima "da Autoscout" e
// forza una risposta JSON con min/max — se l'AI dà un range, qui si
// calcola la media per restituire un unico numero, come richiesto.
export async function estimateVehicleMarketValue({ marca, modello, anno, carburante, km }) {
  const key = getApiKey()
  if (!key) throw new Error('Nessuna chiave AI configurata nelle impostazioni')

  const prompt = `Sei un esperto di mercato dell'auto e moto usate in Italia. Stima il valore di mercato attuale di questo veicolo, come se stessi consultando gli annunci di vendita su Autoscout.

Marca: ${marca || '—'}
Modello: ${modello || '—'}
Anno: ${anno || '—'}
Carburante: ${carburante || '—'}
Chilometraggio: ${km != null && km !== '' ? `${km} km` : 'non disponibile'}

Rispondi SOLO con un JSON valido, nessun testo extra, in questo formato esatto:
{"min": <numero intero in euro>, "max": <numero intero in euro>}

Se hai un valore singolo invece di un range, usa lo stesso numero sia per min che per max.`

  const raw = await callGemini(prompt)
  let parsed
  try { parsed = JSON.parse(raw) } catch { throw new Error('Risposta AI non valida: ' + raw.slice(0, 120)) }
  const min = Number(parsed.min), max = Number(parsed.max)
  if (!isFinite(min) || !isFinite(max)) throw new Error('Risposta AI senza valori numerici validi')
  return Math.round((min + max) / 2)
}

// ── Merchant lookup — direct OpenAI call (bypasses proxy to avoid Vercel timeout) ──
export async function lookupMerchantInfo(merchant, description, amount) {
  const key = getApiKey()
  if (!key) throw new Error('Nessuna chiave AI configurata nelle impostazioni')

  const prompt = `Sei un assistente finanziario italiano. Fornisci informazioni BREVI (max 2 frasi) su questa attività commerciale o transazione bancaria. Rispondi SOLO con la descrizione, niente altro.

Merchant/Descrizione: "${merchant || description}"
Importo: €${Math.abs(amount || 0).toFixed(2)}

Esempio risposta: "Supermercato della catena Esselunga. Vendita prodotti alimentari e per la casa."

Risposta:`

  // OpenAI key → chiama direttamente (evita timeout Vercel)
  if (key.startsWith('sk-')) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 150,
      })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `OpenAI HTTP ${res.status}`)
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || ''
  }

  // Gemini key → usa proxy come prima
  return callGemini(prompt)
}

// ── Merchant + Places lookup (Discovery AI button) ────────
// Returns: { merchantName, merchantType, category, notes, place: { name, city, address, lat, lng } | null }
export async function lookupMerchantAndPlace(merchant, description, amount, city) {
  const aiKey = getApiKey()
  if (!aiKey) throw new Error('Nessuna chiave AI configurata nelle impostazioni')

  // Use full original description for best merchant extraction
  const fullDesc = [merchant, description].filter(Boolean).join(' | ')
  const prompt = `Sei un assistente finanziario italiano. Analizza questa transazione bancaria e rispondi SOLO con un JSON valido (nessun testo extra).

IMPORTANTE: estrai il nome REALE del negozio o attività commerciale dalla descrizione originale della transazione. Non interpretare parole italiane generiche come nomi di categorie — "Bolli Blu" è un nome di negozio, non una tassa.

{
  "merchantName": "nome esatto del negozio/attività come appare nella transazione (es. 'Bolli Blu', 'Esselunga', 'Amazon')",
  "merchantType": "tipo di attività reale (es. Abbigliamento bambini, Supermercato, E-commerce)",
  "category": "categoria di spesa suggerita in italiano",
  "notes": "una frase descrittiva sull'attività commerciale"
}

Descrizione transazione: "${fullDesc}"
Importo: €${Math.abs(amount || 0).toFixed(2)}${city ? `\nCittà: ${city}` : ''}`

  let aiResult = {}
  if (aiKey.startsWith('sk-')) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `OpenAI HTTP ${res.status}`)
    }
    const data = await res.json()
    try { aiResult = JSON.parse(data.choices?.[0]?.message?.content || '{}') } catch { aiResult = {} }
  } else {
    const text = await callGemini(prompt)
    try {
      const match = text.match(/\{[\s\S]*\}/)
      aiResult = match ? JSON.parse(match[0]) : { notes: text }
    } catch { aiResult = { notes: text } }
  }

  // Step 2: Google Places lookup via proxy (CORS blocked direct)
  const placesKey = getPlacesKey()
  let place = null
  if (placesKey && aiResult.merchantName) {
    try {
      const res = await fetch(proxyUrl('/places'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Include city in query for better local match (e.g. "Bolli Blu Como")
        body: JSON.stringify({ query: [aiResult.merchantName, city].filter(Boolean).join(' '), key: placesKey }),
      })
      if (res.ok) {
        const data = await res.json()
        if (!data.error && (data.lat || data.address)) place = data
      }
    } catch(e) {
      console.warn('[places lookup]', e.message)
    }
  }

  return { ...aiResult, place }
}

// ── Standalone Places lookup (for post-enrichBatch map display) ─────────────
// First tries Google Places (if key configured), then falls back to OpenAI direct.
export async function lookupPlaceForMerchant(merchantName, city) {
  if (!merchantName) return null
  const query = [merchantName, city].filter(Boolean).join(' ')

  // 1. Try Google Places (fast, accurate — needs placesKey)
  const placesKey = getPlacesKey()
  if (placesKey) {
    try {
      const res = await fetch(proxyUrl('/places'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, key: placesKey }),
      })
      if (res.ok) {
        const data = await res.json()
        if (!data.error && (data.lat || data.address)) return data
      }
    } catch(e) {
      console.warn('[lookupPlaceForMerchant] Places failed, falling back to AI:', e.message)
    }
  }

  // 2. Fallback: ask OpenAI directly for location (no proxy, no timeout issue)
  const aiKey = getApiKey()
  if (!aiKey?.startsWith('sk-')) return null
  try {
    const prompt = `Given this Italian merchant/business transaction:
Merchant: "${merchantName}"${city ? `\nCity: "${city}"` : ''}

Find the most likely physical address and GPS coordinates for this business in Italy.
Return ONLY valid JSON (no other text):
{"name":"exact business name","address":"full street address, city","lat":45.123,"lng":9.456}

If you cannot determine the exact location with confidence, return:
{"name":null,"address":null,"lat":null,"lng":null}`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 150,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(text)
    if (parsed.lat && parsed.lng) return parsed
    return null
  } catch(e) {
    console.warn('[lookupPlaceForMerchant] AI fallback failed:', e.message)
    return null
  }
}

// ── Category validators ───────────────────────────────────
function validCat1(cat1) {
  return CAT_NAMES.includes(cat1) ? cat1 : null
}
function validCat2(cat1, cat2) {
  if (!cat1 || !cat2) return ''
  const subs = CATS[cat1]?.sub || []
  return subs.includes(cat2) ? cat2 : ''
}

// Build category list for prompts
const CAT_LIST = CAT_NAMES
  .filter(n => n !== 'Non Categorizzato')
  .map(n => `• ${n}: [${(CATS[n]?.sub||[]).join(', ')}]`)
  .join('\n')

// ── Batch enrichment — MAIN FUNCTION ─────────────────────
// overrideUserEdits: quando l'utente ri-arricchisce ESPLICITAMENTE una selezione di
// transazioni (✨ AI Enrichment su selezione in Transazioni, AI lookup in Discovery),
// i risultati AI devono sovrascrivere anche i campi protetti dai flag
// userEditedDesc/userEditedCat/cityUserEdited — l'intento esplicito dell'utente
// ("rifai questa transazione") vince sulla protezione. Bug reale segnalato (2026-07-11):
// l'AI restituiva descAI/cat corrette per una tx del 2024 con flag di modifica manuale,
// ma tutto veniva scartato in silenzio e la riga restava con descAI "-" e senza categoria.
// Default false: il Re-enrich globale e l'✨ AI di massa continuano a rispettare i flag.
export async function enrichBatch(transactions, { force = false, throwOnError = false, overrideUserEdits = false } = {}) {
  if (!transactions.length) return []

  // Step 1 — Regex pre-enrichment (instant, no API)
  // Extracts: card, time, city, counterpart, descAI (for known patterns)
  const preEnriched = transactions.map(t => {
    const r = parseRow(t.description || '')
    // Use regex for fields it can extract reliably (card, time, city, counterpart, merchant)
    // merchant from regex is reliable for UniCredit card format
    const regexMerchant = r.merchant && r.merchant !== 'null' ? r.merchant : null
    return {
      ...t,
      card:        r.card        || t.card        || null,
      time:        r.time        || t.time        || null,
      // City is always determined by AI — regex city is unreliable
      // force=true: clear existing city so AI re-evaluates (unless user-edited)
      // force=false: keep existing AI-set city (don't re-evaluate unless missing)
      city:        (force && (overrideUserEdits || !t.cityUserEdited)) ? null : (t.city || null),
      // force=true: always use regex counterpart (ignores stale old value) — stessa
      // logica di merchant, per lo stesso motivo (vedi descAI sotto)
      counterpart: force ? (r.counterpart || null) : (r.counterpart || t.counterpart || null),
      // force=true: always use regex merchant (ignores stale old value)
      merchant:    force ? (regexMerchant || null) : (regexMerchant || t.merchant || null),
      // force=true: dimentica la descAI esistente prima di richiamare l'AI. BUG TROVATO
      // 2026-07-13 (segnalato dall'utente, si ripresentava dopo 2 fix precedenti): se la
      // AI risponde null/senza confidenza per una transazione (conf:0 — capita quando il
      // testo bancario originale è troppo povero per essere interpretato), il codice più
      // sotto usa pick(aiVal, existing) e ricade sul valore ESISTENTE — che però, se questa
      // stessa transazione era già stata contaminata da un run precedente (vedi guardrail
      // anti-contaminazione qualche riga sotto), è proprio il valore SBAGLIATO da correggere.
      // Risultato: un re-enrichment esplicito non riusciva MAI ad autocorreggersi, restituiva
      // sempre lo stesso descAI errato all'infinito. Senza questo azzeramento, il fallback
      // "descAI vuoto → pulisci la descrizione originale" (TransactionsPage.jsx/ImportModal.jsx,
      // cleanRawDescFallback) non scattava mai perché descAI non risultava mai vuoto.
      descAI:      force ? null : (t.descAI || null),
    }
  })

  // Step 2 — Send to AI transactions that are missing ANY field
  // force=true: send ALL (re-enrichment of already-enriched transactions)
  const needsAI = force
    ? preEnriched
    : preEnriched.filter(t =>
        !t.merchant    ||   // missing merchant (card payments)
        !t.counterpart ||   // missing counterpart (transfers)
        !t.descAI      ||   // missing AI description
        !t.city        ||   // missing city
        !t.cat1        ||   // missing category
        t.cat1 === 'Non Categorizzato'
      )

  console.log(`enrichBatch: ${preEnriched.length} total, ${needsAI.length} need AI enrichment`)

  if (needsAI.length > 0) {
    const list = needsAI.map((t, i) => {
      // Include pre-extracted merchant/counterpart as hints to help AI infer city
      const hints = []
      if (t.merchant)    hints.push(`merchant:"${t.merchant}"`)
      if (t.counterpart) hints.push(`counterpart:"${t.counterpart}"`)
      const hintStr = hints.length ? ` | ${hints.join(' | ')}` : ''
      return `${i+1}. [ID:${t.txId}] "${(t.description||'').slice(0,120)}" | amount:${t.amount}${hintStr}`
    }).join('\n')

    const p = getAIPrompts()
    const rulesPrompt = buildRulesPrompt()
    console.log('[enrichBatch] Prompts loaded:', {
      merchant_len: p.merchant?.length,
      counterpart_len: p.counterpart?.length,
      descAI_len: p.descAI?.length,
    })
    console.log('[enrichBatch] First tx description:', needsAI[0]?.description?.slice(0,80))
    console.log('[enrichBatch] needsAI count:', needsAI.length)

    // Build home-locations hint for category prompt
    const homeCity   = useStore.getState().appPrefs?.homeCity   || 'Como'
    const homeRadius = useStore.getState().appPrefs?.homeRadius ?? 300
    const locationHint = `\nLOCATION RULE: If the extracted city is NOT null AND is geographically MORE THAN ${homeRadius}km straight-line from ${homeCity}, Italy, assign cat1="Weekend e Vacanze" ONLY if the expense type is leisure/hospitality (restaurant, bar, hotel, museum, attraction, theme park, spa, entertainment). Use your geographic knowledge to estimate the distance. EXCEPTIONS — always use the natural category regardless of location: online/digital, utilities, salary, transfers, shopping/retail/clothing/electronics/outlet stores, supermarkets, fuel, pharmacies, banks. Cities within ${homeRadius}km of ${homeCity} (northern Italy, Switzerland/Ticino, Lombardia, Piemonte, Liguria, Trentino, Veneto) → normal rules. City=null → normal rules.`

    const prompt = `You are an expert Italian bank transaction parser (UniCredit format).
Analyze each transaction and return the requested fields.

FIELD: merchant
${p.merchant}

FIELD: counterpart
${p.counterpart}

FIELD: descAI
${rulesPrompt}${p.descAI}

FIELD: city
${p.city}

FIELD: cat1 and cat2
${p.category}${locationHint}
Available categories:
${CAT_LIST}

CRITICAL — TRANSACTIONS ARE INDEPENDENT: the list below often contains many transactions with
the SAME bank template text (e.g. "PAGAMENTO ... CARTA *XXXX DEL DD/MM ...") that differ ONLY in
the merchant name at the end, because the same person/place appears repeatedly. Do NOT let this
similarity bias you: for EACH transaction, derive merchant/descAI/city ONLY from the literal text
of THAT transaction's own description — never copy or reuse the answer from a different, merely
similar-looking transaction elsewhere in this list, even if most other transactions in the batch
share the same merchant. Read every description character-by-character before answering; a
transaction that looks superficially similar to others is very often a DIFFERENT place.

TRANSACTIONS TO ANALYZE:
${list}

Reply ONLY with a JSON array of exactly ${needsAI.length} objects in the SAME ORDER, no other text.
Each object must include the txId from the transaction above, plus the extracted fields.
EXAMPLE FORMAT (do NOT copy these values — analyze the real transactions above):
[
  {"txId":"EXAMPLE_A","merchant":"Calzedonia","counterpart":null,"descAI":"Calzedonia","city":"Como","cat1":"Shopping","cat2":"Abbigliamento","conf":90},
  {"txId":"EXAMPLE_B","merchant":null,"counterpart":"Bini Francesco","descAI":"Bini Francesco","city":null,"cat1":"Entrate","cat2":"Altro","conf":85}
]`

    try {
      console.log('[enrichBatch] Sending prompt to AI, length:', prompt.length)
      const text   = await callGemini(prompt)
      console.log('[enrichBatch] AI response:', text.slice(0, 300))
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('Not array')

      // Clean "null" strings from AI response — AI sometimes returns "null" as text
      const cleanAI = (obj) => {
        const out = {}
        for (const [k,v] of Object.entries(obj)) {
          out[k] = (v === 'null' || v === 'undefined' || v === '') ? null : v
        }
        return out
      }
      const aiMap = new Map()
      // Match by AI-returned txId when every item carries one; otherwise fall back
      // to positional matching, which is only safe when counts line up exactly
      const byTxId  = parsed.length > 0 && parsed.every(p => p && p.txId)
      const idIndex = new Map(needsAI.map(t => [String(t.txId), t]))
      if (!byTxId && parsed.length !== needsAI.length) {
        throw new Error(`AI returned ${parsed.length} items for ${needsAI.length} transactions`)
      }
      parsed.forEach((aiRaw, i) => {
        const ai   = cleanAI(aiRaw)
        const t    = byTxId ? idIndex.get(String(aiRaw.txId)) : needsAI[i]
        if (!t) return
        const txId = t.txId      // use real txId as key, not ai.txId
        const cat1 = validCat1(ai.cat1)
        const pick = (aiVal, existing) => (aiVal && String(aiVal).trim() && String(aiVal).trim() !== 'null') ? String(aiVal).trim() : (existing || null)
        const isBonifico = t.isBonifico || /bonifico/i.test(t.description||'')
        // Base merchant + descAI from AI
        const rawMerchant = isBonifico ? null : pick(ai.merchant, t.merchant)
        const rawDescAI   = pick(ai.descAI, t.descAI)
        // Apply abbreviation overrides AFTER AI — runs on ALL tx including bonifici
        // (needed to catch Satispay inbound transfers misclassified by AI)
        const abbrev = applyMerchantAbbrevs(t.description, isBonifico ? null : rawMerchant, rawDescAI)
        const finalMerchant = abbrev ? abbrev.merchant : rawMerchant
        const finalDescAI   = abbrev ? abbrev.descAI   : rawDescAI
        const ruleDescAI = computeDescAI({
          ...t,
          merchant:    finalMerchant,
          counterpart: pick(ai.counterpart, t.counterpart),
        })
        aiMap.set(txId, {
          merchant:    finalMerchant,
          counterpart: pick(ai.counterpart, t.counterpart),
          descAI:      finalDescAI || ruleDescAI,
          city:        pick(ai.city,        t.city),
          cat1:        cat1 || t.cat1 || null,
          cat2:        validCat2(cat1 || t.cat1, ai.cat2) || t.cat2 || '',
          conf:        typeof ai.conf === 'number' ? Math.min(100,Math.max(0,ai.conf)) : (t.conf || 70),
        })
      })

      // ── Guardrail anti-contaminazione batch ────────────────────────────
      // L'istruzione nel prompt ("CRITICAL — TRANSACTIONS ARE INDEPENDENT") non basta
      // sempre a evitare che l'AI "appiattisca" una transazione minoritaria sul merchant
      // dominante del batch (confermato più volte dall'utente: stessa tx, sbagliata in
      // batch, corretta se rifatta da sola). Verifica deterministica: se il merchant/
      // descAI restituito NON compare nel testo originale di QUELLA transazione, E lo
      // stesso identico valore è stato assegnato anche ad altre transazioni del batch
      // (segnale di "copia-incolla" dal pattern dominante), ri-arricchiamo quella singola
      // transazione da sola — i batch da 1 sono affidabili (confermato dall'utente).
      // Parole generiche di categoria (ristorante/hotel/bar/...) vanno escluse dal
      // confronto: compaiono spesso in TUTTE le descrizioni di un batch di spese simili
      // (es. "Hotel Ristorante Aurora" vs "Ristorante Kum" condividono "ristorante"),
      // quindi da sole farebbero risultare qualunque coppia come "trovata nel testo"
      // anche quando il nome proprio del merchant è completamente diverso.
      const GENERIC_BIZ_WORDS = ['ristorante','ristorantepizzeria','pizzeria','trattoria','osteria',
        'locanda','agriturismo','hotel','albergo','resort','hostel','residence','bar','pub',
        'caffe','cafe','gelateria','pasticceria','market','supermercato','negozio','spa']
      const normAlnum = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const stripGeneric = s => {
        let out = String(s || '').toLowerCase()
        for (const w of GENERIC_BIZ_WORDS) out = out.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ')
        return out
      }
      // Ritorna null quando needle è vuoto — "non verificabile", non "trovato". Distinzione
      // importante: BUG TROVATO 2026-07-13 nella prima versione di questo guardrail, questa
      // funzione ritornava `true` per needle vuoto, e siccome veniva combinata con `||` tra
      // merchant e descAI, un merchant:null (comunissimo — molte tx enrichate hanno merchant
      // null "isBonifico" o semplicemente non estratto) faceva risultare l'INTERO controllo
      // "trovato" a prescindere da cosa dicesse descAI — il guardrail non scattava MAI per
      // queste transazioni, motivo per cui il fix del push precedente non ha funzionato.
      const textContains = (haystackRaw, needleRaw) => {
        if (!needleRaw) return null // non verificabile — non conta né a favore né contro
        const h = normAlnum(stripGeneric(haystackRaw)), n = normAlnum(stripGeneric(needleRaw))
        if (!n) return null // idem: il valore era fatto solo di parole generiche
        if (h.includes(n)) return true
        const head = n.slice(0, Math.max(3, Math.floor(n.length * 0.6)))
        return h.includes(head)
      }
      const valueCounts = new Map()
      for (const v of aiMap.values()) {
        const key = `${v.merchant || ''}|${v.descAI || ''}`
        valueCounts.set(key, (valueCounts.get(key) || 0) + 1)
      }
      const suspicious = needsAI.filter(t => {
        const v = aiMap.get(t.txId)
        if (!v) return false
        const key = `${v.merchant || ''}|${v.descAI || ''}`
        const isDuplicateValue = (valueCounts.get(key) || 0) > 1
        // Considera solo i campi effettivamente verificabili (non null): se ALMENO UNO dei
        // campi verificabili combacia col testo originale, va bene; se nessun campo è
        // verificabile, non si può dire nulla → non sospetta (non abbiamo prove del contrario)
        const checks = [textContains(t.description, v.merchant), textContains(t.description, v.descAI)]
          .filter(r => r !== null)
        const foundInSource = checks.length === 0 ? true : checks.some(Boolean)
        return isDuplicateValue && !foundInSource
      })
      if (suspicious.length > 0) {
        console.log(`[enrichBatch] ${suspicious.length} tx sospette (valore duplicato nel batch, assente nel testo originale) — ri-arricchisco singolarmente:`, suspicious.map(t => t.txId))
        for (const t of suspicious) {
          try {
            const [fixed] = await enrichBatch([t], { force: true, overrideUserEdits: true, throwOnError: true })
            if (fixed) {
              aiMap.set(t.txId, {
                merchant: fixed.merchant, counterpart: fixed.counterpart, descAI: fixed.descAI,
                city: fixed.city, cat1: fixed.cat1, cat2: fixed.cat2, conf: fixed.conf,
              })
              console.log(`[enrichBatch] ${t.txId}: corretto individualmente →`, fixed.descAI)
            }
          } catch (e) {
            console.warn(`[enrichBatch] ${t.txId}: re-verifica individuale fallita, mantengo il risultato del batch —`, e.message)
          }
        }
      }

      return preEnriched.map(t => {
        const ai = aiMap.get(t.txId)
        if (!ai) return { ...t, aiEnriched: true, aiEnrichedAt: new Date().toISOString() }
        const pick = (aiVal, existing) => (aiVal && aiVal.trim()) ? aiVal.trim() : (existing || null)
        // Con overrideUserEdits i flag di modifica manuale NON bloccano i valori AI
        // (richiesta esplicita dell'utente di rifare questa transazione — vedi nota
        // sopra la firma della funzione). Log diagnostico quando una protezione scatta
        // o viene scavalcata, così un risultato AI "sparito" non è mai più silenzioso.
        const editedDesc = !overrideUserEdits && t.userEditedDesc
        const editedCity = !overrideUserEdits && t.cityUserEdited
        const editedCat  = !overrideUserEdits && t.userEditedCat
        if (t.userEditedDesc || t.cityUserEdited || t.userEditedCat) {
          console.log(`[enrichBatch] ${t.txId}: flag modifiche manuali`,
            { userEditedDesc: !!t.userEditedDesc, cityUserEdited: !!t.cityUserEdited, userEditedCat: !!t.userEditedCat },
            overrideUserEdits ? '→ SCAVALCATI (re-enrich esplicito)' : '→ risultati AI su questi campi SCARTATI')
        }
        return {
          ...t,
          merchant:      pick(ai.merchant,    t.merchant),
          counterpart:   pick(ai.counterpart, t.counterpart),
          descAI:        editedDesc ? t.descAI : pick(ai.descAI, t.descAI),
          city:          editedCity ? t.city : pick(ai.city, t.city),
          cat1:          editedCat ? (t.cat1 || null) : (ai.cat1 || t.cat1 || null),
          cat2:          editedCat ? (t.cat2 || '') : (ai.cat2 !== undefined ? ai.cat2 : (t.cat2||'')),
          conf:          ai.conf        || t.conf  || 70,
          aiEnriched:    true,
          aiEnrichedAt:  new Date().toISOString(),
          aiCategorized: true,
        }
      })

    } catch(e) {
      if (e.message === 'GEMINI_KEY_MISSING') throw e
      if (e.message === 'PROXY_NOT_RUNNING')  throw e
      if (e.message === 'PROXY_TIMEOUT')      throw e
      console.warn('[enrichBatch] AI failed, falling back to regex:', e.message)
      if (throwOnError) throw e
      // Failure: return regex results only (no aiEnriched flag — so user can retry)
      return preEnriched
    }
  }

  return preEnriched.map(t => ({
    ...t,
    aiEnriched:   true,
    aiEnrichedAt: new Date().toISOString(),
  }))
}

// ── Single categorize ─────────────────────────────────────
export async function categorizeOne(description, amount) {
  try {
    const prompt = `Categorizza questa transazione bancaria italiana.
Descrizione: "${description}"
Importo: ${amount}

Scegli SOLO tra queste categorie:
${CAT_LIST}

Rispondi SOLO con JSON: {"cat1":"...","cat2":"...","conf":85}`
    const text   = await callGemini(prompt)
    const parsed = JSON.parse(text)
    const cat1   = validCat1(parsed.cat1)
    return {
      cat1:          cat1 || 'Non Categorizzato',
      cat2:          validCat2(cat1, parsed.cat2),
      conf:          Math.min(100, Math.max(0, parsed.conf || 70)),
      aiCategorized: true,
    }
  } catch(e) {
    return { cat1: 'Non Categorizzato', cat2: '', conf: 50, aiCategorized: false }
  }
}

// ── Batch categorize ──────────────────────────────────────
export async function categorizeBatch(transactions) {
  if (!transactions.length) return []
  const list = transactions.map((t, i) =>
    `${i+1}. "${(t.description||'').slice(0,80)}" | ${t.amount}`
  ).join('\n')

  const prompt = `Categorizza queste ${transactions.length} transazioni.
Scegli SOLO tra queste categorie:
${CAT_LIST}
${list}

Rispondi SOLO con array JSON: [{"cat1":"...","cat2":"...","conf":85},...]`

  try {
    const text   = await callGemini(prompt)
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) throw new Error('Not array')
    return parsed.map((item, i) => {
      const cat1 = validCat1(item.cat1)
      return {
        ...transactions[i],
        cat1: cat1,
        cat2: validCat2(cat1, item.cat2),
        conf: Math.min(100, Math.max(0, item.conf || 70)),
        aiCategorized: true,
      }
    })
  } catch(e) {
    console.warn('categorizeBatch failed:', e.message)
    return transactions
  }
}

// ── AI Feedback ───────────────────────────────────────────
export async function processFeedback(tx, feedback) {
  const prompt = `Transazione bancaria italiana classificata male.

Descrizione originale: "${tx.description}"
Classificazione attuale: descAI="${tx.descAI}", città="${tx.city||'—'}", categoria="${tx.cat1}"
Feedback utente: "${feedback}"

Categorie disponibili:
${CAT_LIST}

Correggi e rispondi SOLO con JSON:
{"descAI":"...","city":"...","cat1":"...","cat2":"...","note":"spiegazione"}`

  try {
    const text = await callGemini(prompt)
    const p    = JSON.parse(text)
    const cat1 = validCat1(p.cat1)
    return { ...p, cat1, cat2: validCat2(cat1, p.cat2) }
  } catch(e) {
    return null
  }
}

// ── AI Chat ───────────────────────────────────────────────
export async function chatWithData(message, transactions) {
  const recentTxs = (transactions || [])
    .filter(t => !t.excluded)
    .slice(0, 50)
    .map(t => `${t._effDate||t.date} | ${t.descAI||t.description?.slice(0,30)} | ${t.cat1} | €${t.amount}`)
    .join('\n')

  const prompt = `Sei un assistente finanziario personale italiano.
Ultime 50 transazioni: ${recentTxs}
Domanda: ${message}
Rispondi in italiano, conciso.`

  try { return await callGemini(prompt) }
  catch(e) { return `Errore: ${e.message}` }
}
// ── Google Places city enrichment ────────────────────────
// Calls Places Text Search API for each transaction with a merchant.
// Uses two-layer cache: in-memory Map (session) + Firestore places_cache (persistent).
// Runs in parallel batches of 5 to avoid hammering the API.
// Returns a new array with city filled in where Places found a match.
export async function enrichCitiesBatch(transactions, { onProgress, skipCache = false } = {}) {
  const key = getPlacesKey()
  if (!key) {
    console.log('[places] No Places API key — skipping')
    return transactions
  }

  const { getCachedPlace, setCachedPlace } = await import('../services/placesCache')

  const STREET_RE = /\b(?:VIA|VIALE|PIAZZA|P\.ZZA|CORSO|LARGO|VICOLO|STRADA)\s+\S+/i

  // Only enrich card-payment transactions that:
  // 1. Have a merchant name
  // 2. Are not bonifici or prelievi
  // 3. Have a street address in the description — without it Places results are unreliable
  //    (e.g. "CARREFOUR MARKET" could match any store in Italy)
  const eligible = transactions.filter(t =>
    t.merchant &&
    !t.isBonifico &&
    !t.cityUserEdited &&                              // never overwrite manual edits
    !/prelievo/i.test(t.description || '') &&
    (t.streetHint || STREET_RE.test(t.description || ''))
  )
  if (!eligible.length) return transactions

  console.log(`[places] enrichCitiesBatch: ${eligible.length} eligible (have street address)`)

  const results = transactions.map(t => ({ ...t }))  // shallow copy

  const PLACES_PARALLEL = 5
  let done = 0

  for (let i = 0; i < eligible.length; i += PLACES_PARALLEL) {
    const batch = eligible.slice(i, i + PLACES_PARALLEL)

    await Promise.all(batch.map(async t => {
      try {
        // Re-derive street hint from description if not stored in transaction
        // (transactions imported before streetHint feature won't have it)
        const streetFromDesc = (t.description || '').match(STREET_RE)?.[0]
        const streetHintFinal = t.streetHint || streetFromDesc || null

        // Currency-aware country: CHF = Switzerland, others = Italy
        const isCHF = /\bCHF\b/i.test(t.description || '')
        const country = isCHF ? 'Svizzera' : 'Italia'

        // Build query: street first (if available), then merchant, then country
        // Putting the address first matches Google Places' preferred format
        const queryParts = streetHintFinal
          ? [streetHintFinal, t.merchant, country]
          : [t.merchant, country]
        const query = queryParts.join(' ')

        // Check cache — skipped for small/manual enrichments so fresh API data is used
        const cached = skipCache ? null : await getCachedPlace(t.merchant)
        let city    = (cached?.city)    || undefined
        let address = (cached?.address) || undefined
        let placeId = (cached?.placeId) || undefined

        if (city !== undefined) {
          console.log(`[places] Cache hit for "${t.merchant}" → city: ${city}`)
        } else {
          // Not cached (or cached null) — call the proxy
          console.log(`[places] Calling API for: "${query}"`)
          let resp
          try {
            resp = await fetch(proxyUrl('/places'), {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ query, key }),
            })
          } catch(fetchErr) {
            console.warn(`[places] fetch failed for "${t.merchant}":`, fetchErr.message)
            return
          }
          if (resp.ok) {
            const data = await resp.json()
            city    = data.city    || null
            address = data.address || null
            placeId = data.placeId || null
            console.log(`[places] query="${query}" → city: ${city}, address: ${address}`)
          } else {
            // Prova a leggere il messaggio d'errore vero dal proxy (api/places.js
            // risponde {error: e.message} sui 500) — prima veniva scartato, lasciando
            // solo "HTTP 500" in console senza dire PERCHÉ (richiesta utente, non si
            // riusciva a capire se fosse la chiave, la quota o altro)
            const errBody = await resp.json().catch(() => null)
            console.warn(`[places] HTTP ${resp.status} for "${t.merchant}"${errBody?.error ? ' — ' + errBody.error : ''}`)
            city = null
          }
          // Only cache positive results — nulls are retried next run
          if (city) {
            await setCachedPlace(t.merchant, { city, address, placeId })
          }
        }

        if (city) {
          const idx = results.findIndex(r => r.txId === t.txId)
          if (idx >= 0) results[idx] = { ...results[idx], city }
        }
      } catch(e) {
        // Ignore individual failures — leave city as-is
        console.warn(`[places] Error for "${t.merchant}":`, e.message)
      }

      done++
      onProgress?.(done, eligible.length)
    }))
  }

  return results
}

// ── AI Enrichment ─────────────────────────────────────────
// Step 1: regex (instant) → Step 2: Gemini batch

// ── Shared PayPal AI prompt ───────────────────────────────
const paypalPromptSuffix = (year, merchantHistory) => {
  const yr = year || new Date().getFullYear()
  const histSection = merchantHistory && Object.keys(merchantHistory).length > 0
    ? `\nStorico categorie merchant già noti (usa queste per merchant identici o molto simili, hanno la precedenza sul tuo giudizio):\n${
        Object.entries(merchantHistory)
          .slice(0, 60)
          .map(([m, { cat1, cat2 }]) => `- ${m} → ${cat1}${cat2 ? ' / ' + cat2 : ''}`)
          .join('\n')
      }\n`
    : ''
  return `Per ogni transazione restituisci:
- merchant: nome esatto del merchant/negozio/servizio (stringa)
- date: data nel formato YYYY-MM-DD. Se l'anno non è indicato usa ${yr}. Mesi italiani: gen=01 feb=02 mar=03 apr=04 mag=05 giu=06 lug=07 ago=08 set=09 ott=10 nov=11 dic=12
- amount: importo come numero (negativo per uscite, positivo per entrate/rimborsi)
- type: tipo operazione originale (es. "Pagamento", "Pagamento automatico", "Rimborso", "Trasferimento")
- cat1_suggestion: categoria L1 suggerita tra: Casa, Veicoli, Spesa e Alimentari, Tempo Libero, Weekend e Vacanze, Shopping, Salute e Cura, Figli, Altro
- cat2_suggestion: sottocategoria L2 appropriata
${histSection}
Rispondi SOLO con un array JSON valido, nessun testo aggiuntivo. Esempio:
[{"merchant":"Netflix","date":"${yr}-06-15","amount":-15.99,"type":"Pagamento automatico","cat1_suggestion":"Tempo Libero","cat2_suggestion":"Altro"}]`
}

async function parsePaypalResponse(res) {
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`API error ${res.status}: ${errBody.slice(0,200)}`)
  }
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  const text = data.choices?.[0]?.message?.content || data.text || ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Nessun JSON trovato nella risposta AI')
  return JSON.parse(match[0])
}

// ── PayPal Vision — screenshots (images, direct OpenAI call) ─────────
export async function callPaypalVision(imagesBase64, key, year, merchantHistory) {
  const prompt = `Sei un assistente finanziario. Analizza questi screenshot dell'app PayPal italiana e estrai TUTTE le transazioni visibili.\n\n${paypalPromptSuffix(year, merchantHistory)}`
  const content = [
    { type: 'text', text: prompt },
    ...imagesBase64.map(b64 => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'high' }
    }))
  ]
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content }], temperature: 0.1, max_tokens: 4096 })
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`OpenAI error ${res.status}: ${errBody.slice(0, 300)}`)
  }
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  const text = data.choices?.[0]?.message?.content || ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Nessun JSON trovato nella risposta AI')
  return JSON.parse(match[0])
}

// ── PayPal Text — PDF text extraction (direct OpenAI call, no proxy) ───
// Calls OpenAI directly from the browser — avoids Vercel proxy timeout/crash
export async function callPaypalText(pdfText, key, year, merchantHistory) {
  const CHUNK = 10000
  const chunks = []
  for (let i = 0; i < pdfText.length; i += CHUNK) chunks.push(pdfText.slice(i, i + CHUNK))
  const allResults = []
  for (const chunk of chunks) {
    const prompt = `Sei un assistente finanziario. Analizza questo testo estratto da un PDF di cronologia PayPal italiana ed estrai TUTTE le transazioni presenti in questo estratto.\n\nTESTO:\n${chunk}\n\n${paypalPromptSuffix(year, merchantHistory)}`
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 8192 })
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`OpenAI error ${res.status}: ${errBody.slice(0, 300)}`)
    }
    const data = await res.json()
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
    const text = data.choices?.[0]?.message?.content || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('Nessun JSON trovato nella risposta AI')
    allResults.push(...JSON.parse(match[0]))
  }
  // Deduplicate at chunk boundaries
  const seen = new Set()
  return allResults.filter(t => {
    const k = `${t.date}|${t.amount}|${t.merchant}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

// ── PayPal Reclassify — batch re-categorisation of existing imports ─────
// Takes a list of {id, merchant, amount} and returns [{id, cat1, cat2}]
export async function callPaypalReclassify(items, key, merchantHistory) {
  const CHUNK = 40
  const allResults = []
  for (let offset = 0; offset < items.length; offset += CHUNK) {
    const chunk = items.slice(offset, offset + CHUNK)
    const histSection = merchantHistory && Object.keys(merchantHistory).length > 0
      ? `Storico categorie merchant già noti (usa queste ESATTAMENTE per merchant identici o molto simili):\n${
          Object.entries(merchantHistory).slice(0, 60)
            .map(([m, { cat1, cat2 }]) => `- ${m} → ${cat1}${cat2 ? ' / ' + cat2 : ''}`)
            .join('\n')
        }\n\n`
      : ''
    const prompt = `${histSection}Assegna categoria L1 e L2 a ciascun merchant PayPal italiano. Usa lo storico sopra se disponibile. Se non presente, usa il tuo giudizio.

Merchant da categorizzare:
${chunk.map((it, i) => `${i}. ${it.merchant} (€${Math.abs(Number(it.amount)||0).toFixed(2)})`).join('\n')}

Categorie L1 disponibili: Casa, Veicoli, Spesa e Alimentari, Tempo Libero, Weekend e Vacanze, Shopping, Salute e Cura, Figli, Altro

Rispondi SOLO con un array JSON, un oggetto per ogni merchant nell'ordine ricevuto. Usa "index" come indice nell'array sopra (0-based).
Esempio: [{"index":0,"cat1":"Weekend e Vacanze","cat2":"Vacanze"},{"index":1,"cat1":"Veicoli","cat2":"Parcheggio"}]`
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 2048 })
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`OpenAI error ${res.status}: ${errBody.slice(0, 300)}`)
    }
    const data = await res.json()
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
    const text = data.choices?.[0]?.message?.content || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('Nessun JSON trovato nella risposta AI')
    const parsed = JSON.parse(match[0])
    // Map chunk-relative index back to item id
    parsed.forEach(r => {
      const item = chunk[r.index]
      if (item) allResults.push({ id: item.id, cat1: r.cat1 || '', cat2: r.cat2 || '' })
    })
  }
  return allResults
}
