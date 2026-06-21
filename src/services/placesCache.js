// ── Google Places Cache ────────────────────────────────────
// Two-layer cache:
//   1. In-memory Map  — fast, session-scoped
//   2. Firestore places_cache — persistent, shared across family

import { saveDocument, loadDocument, loadCollection, deleteDocument } from './firestore'

// In-memory cache: normalized merchant name → { city, address, placeId, cachedAt }
const memCache = new Map()

function normalizeKey(merchant) {
  return (merchant || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Get cached place data for a merchant.
 * Returns { city, address, placeId, cachedAt } or null.
 */
export async function getCachedPlace(merchant) {
  if (!merchant) return null
  const key = normalizeKey(merchant)

  // 1. In-memory hit
  if (memCache.has(key)) return memCache.get(key)

  // 2. Firestore hit
  try {
    const doc = await loadDocument('places_cache', key)
    if (doc) {
      memCache.set(key, doc)
      return doc
    }
  } catch(e) {
    console.warn('[placesCache] Firestore read error:', e.message)
  }

  return null
}

/**
 * Store place data for a merchant (even if city is null — to avoid repeat API calls).
 */
export async function setCachedPlace(merchant, { city, address, placeId }) {
  if (!merchant) return
  const key = normalizeKey(merchant)
  const entry = {
    merchant,
    city:     city     || null,
    address:  address  || null,
    placeId:  placeId  || null,
    cachedAt: Date.now(),
  }
  memCache.set(key, entry)
  try {
    await saveDocument('places_cache', key, entry)
  } catch(e) {
    console.warn('[placesCache] Firestore write error:', e.message)
  }
}

/**
 * Clear all cached places — in-memory and Firestore.
 * Returns the number of entries deleted.
 */
export async function clearPlacesCache() {
  const count = memCache.size
  memCache.clear()
  try {
    const docs = await loadCollection('places_cache')
    await Promise.all(docs.map(d => deleteDocument('places_cache', d.id || normalizeKey(d.merchant || ''))))
    console.log(`[placesCache] Cleared ${docs.length} entries from Firestore`)
    return docs.length
  } catch(e) {
    console.warn('[placesCache] Clear error:', e.message)
    return count
  }
}
