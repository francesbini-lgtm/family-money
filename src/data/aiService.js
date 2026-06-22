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

// ── API keys — Firestore (appPrefs) con fallback localStorage ──
function getApiKey() {
  const k = useStore.getState().appPrefs?.geminiKey || ''
  return k || localStorage.getItem('fm-gemini-key') || ''
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
export async function callGemini(prompt) {
  const key = getApiKey()
  if (!key) throw new Error('GEMINI_KEY_MISSING')

  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 60_000) // 60s timeout

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
      const msg = err?.error?.message || `HTTP ${response.status}`
      console.error('[callGemini] proxy error:', msg)
      throw new Error('PROXY_ERROR: ' + msg)
    }

    const data = await response.json()
    // OpenAI format: choices[0].message.content
    // Gemini format: candidates[0].content.parts[0].text
    const text = data.choices?.[0]?.message?.content
               || data.candidates?.[0]?.content?.parts?.[0]?.text
               || ''
    console.log('[callGemini] response keys:', Object.keys(data), '| text length:', text.length)
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
export async function enrichBatch(transactions, { force = false } = {}) {
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
      // force=true: clear existing city so AI re-evaluates
      // force=false: keep existing AI-set city (don't re-evaluate unless missing)
      city:        force ? null : (t.city || null),
      counterpart: r.counterpart || t.counterpart || null,
      // force=true: always use regex merchant (ignores stale old value)
      merchant:    force ? (regexMerchant || null) : (regexMerchant || t.merchant || null),
      // descAI: let AI + computeDescAI handle this
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
      // Always key by ACTUAL txId (positional), ignore AI-returned txId which may be wrong
      parsed.forEach((aiRaw, i) => {
        const ai   = cleanAI(aiRaw)
        const t    = needsAI[i]  // positional match — always correct
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

      return preEnriched.map(t => {
        const ai = aiMap.get(t.txId)
        if (!ai) return { ...t, aiEnriched: true, aiEnrichedAt: new Date().toISOString() }
        const pick = (aiVal, existing) => (aiVal && aiVal.trim()) ? aiVal.trim() : (existing || null)
        return {
          ...t,
          merchant:      pick(ai.merchant,    t.merchant),
          counterpart:   pick(ai.counterpart, t.counterpart),
          descAI:        t.userEditedDesc ? t.descAI : pick(ai.descAI, t.descAI),
          city:          pick(ai.city,        t.city),
          cat1:          ai.cat1        || t.cat1  || null,
          cat2:          ai.cat2        !== undefined ? ai.cat2 : (t.cat2||''),
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
      // Fall through: return regex results only (no aiEnriched flag — so user can retry)
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
            console.warn(`[places] HTTP ${resp.status} for "${t.merchant}"`)
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

// ── PayPal Vision — extract transactions from screenshots ─
export async function callPaypalVision(imagesBase64, key) {
  const prompt = `Sei un assistente finanziario. Analizza questi screenshot dell'app PayPal italiana e estrai TUTTE le transazioni visibili.

Per ogni transazione restituisci:
- merchant: nome esatto del merchant/negozio/servizio (stringa)
- date: data nel formato YYYY-MM-DD. Se l'anno non è indicato usa 2026. Mesi italiani: gen=01 feb=02 mar=03 apr=04 mag=05 giu=06 lug=07 ago=08 set=09 ott=10 nov=11 dic=12
- amount: importo come numero (negativo per uscite, positivo per entrate/rimborsi)
- type: tipo operazione originale (es. "Pagamento", "Pagamento automatico", "Rimborso", "Trasferimento")
- cat1_suggestion: categoria L1 suggerita tra: Casa, Veicoli, Spesa e Alimentari, Tempo Libero, Weekend e Vacanze, Shopping, Salute e Cura, Figli, Altro
- cat2_suggestion: sottocategoria L2 appropriata

Rispondi SOLO con un array JSON valido, nessun testo aggiuntivo. Esempio:
[{"merchant":"Netflix","date":"2026-06-15","amount":-15.99,"type":"Pagamento automatico","cat1_suggestion":"Tempo Libero","cat2_suggestion":"Altro"}]`

  const res = await fetch(proxyUrl('/gemini'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, key, images: imagesBase64 })
  })
  if (!res.ok) throw new Error('Vision API error')
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || data.text || ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array in response')
  return JSON.parse(match[0])
}
