import {
  doc, getDoc, setDoc, collection,
  getDocs, writeBatch, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from 'firebase/firestore'
import { db } from '../firebase'

// ── Household path helper ─────────────────────────────────
let _householdId = null
export const setHouseholdId = (id) => { _householdId = id }
export const getHouseholdId = () => _householdId
const hCol = (col) => `households/${_householdId}/${col}`

// ── Household setup ───────────────────────────────────────
export async function getOrCreateHousehold(userId, displayName, email) {
  // Check if user already belongs to a household
  const memberRef = doc(db, 'household_members', userId)
  const memberSnap = await getDoc(memberRef)

  if (memberSnap.exists()) {
    const householdId = memberSnap.data().householdId
    setHouseholdId(householdId)
    return householdId
  }

  // Create new household
  const householdId = `hh_${userId}`
  setHouseholdId(householdId)

  await setDoc(doc(db, 'households', householdId), {
    createdAt: serverTimestamp(),
    ownerId: userId,
    name: 'La Nostra Famiglia',
  })

  await setDoc(memberRef, {
    householdId,
    userId,
    displayName,
    email,
    role: 'owner',
    joinedAt: serverTimestamp(),
  })

  return householdId
}

// ── TOTP secret ───────────────────────────────────────────
export async function saveTotpSecret(userId, secret) {
  await setDoc(doc(db, 'totp_secrets', userId), {
    secret, userId, createdAt: serverTimestamp()
  })
  // Also store in localStorage as backup
  try { localStorage.setItem(`totp_${userId}`, secret) } catch {}
}

export async function loadTotpSecret(userId) {
  try {
    const snap = await getDoc(doc(db, 'totp_secrets', userId))
    if (snap.exists()) return snap.data().secret
  } catch (e) {
    console.warn('loadTotpSecret Firestore error:', e.message)
  }
  // Fallback to localStorage
  try { return localStorage.getItem(`totp_${userId}`) || null } catch {}
  return null
}

// ── Generic collection helpers ────────────────────────────
export async function loadCollection(colName) {
  if (!_householdId) return []
  try {
    const snap = await getDocs(collection(db, hCol(colName)))
    return snap.docs.map(d => { const data = d.data(); delete data._updated; return data })
  } catch (e) {
    console.warn(`loadCollection(${colName}) error:`, e.message)
    return []
  }
}

export async function saveDocument(colName, id, data) {
  if (!_householdId) return
  try {
    await setDoc(
      doc(db, hCol(colName), String(id)),
      { ...data, _updated: Date.now() }
    )
  } catch (e) {
    console.warn(`saveDocument(${colName}/${id}) error:`, e.message)
  }
}

export async function loadDocument(colName, id) {
  if (!_householdId) return null
  try {
    const snap = await getDoc(doc(db, hCol(colName), String(id)))
    if (!snap.exists()) return null
    const data = snap.data()
    delete data._updated
    return data
  } catch (e) {
    console.warn(`loadDocument(${colName}/${id}) error:`, e.message)
    return null
  }
}

// Batch-save multiple documents (max 500 per Firestore batch)
export async function batchSaveDocuments(colName, items) {
  if (!_householdId || !items.length) return
  const CHUNK = 499
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db)
    items.slice(i, i + CHUNK).forEach(({ id, data }) => {
      batch.set(doc(db, hCol(colName), String(id)), { ...data, _updated: Date.now() })
    })
    await batch.commit()
  }
}

export async function deleteDocument(colName, id) {
  if (!_householdId) return
  try {
    await deleteDoc(doc(db, hCol(colName), String(id)))
  } catch (e) {
    console.warn(`deleteDocument(${colName}/${id}) error:`, e.message)
  }
}

export async function deleteAllFromCollection(colName) {
  if (!_householdId) return 0
  try {
    const snap = await getDocs(collection(db, hCol(colName)))
    if (!snap.docs.length) return 0
    const CHUNK = 400 // Firestore batch limit is 500
    for (let i = 0; i < snap.docs.length; i += CHUNK) {
      const batch = writeBatch(db)
      snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    return snap.docs.length
  } catch(e) {
    console.warn(`deleteAllFromCollection(${colName}) error:`, e.message)
    return 0
  }
}

export async function saveBatch(colName, items, idField = 'id') {
  if (!_householdId || !items.length) return
  const CHUNK = 400 // Firestore batch limit is 500
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db)
    items.slice(i, i + CHUNK).forEach(item => {
      const id = String(item[idField] || Date.now())
      batch.set(doc(db, hCol(colName), id), { ...item, _updated: Date.now() })
    })
    await batch.commit()
  }
}

// ── Real-time listeners ───────────────────────────────────
export function subscribeToCollection(colName, callback) {
  if (!_householdId) return () => {}
  return onSnapshot(
    collection(db, hCol(colName)),
    (snap) => {
      const items = snap.docs.map(d => {
        const data = d.data()
        delete data._updated
        return data
      })
      callback(items)
    },
    (err) => console.warn(`subscribe(${colName}) error:`, err.message)
  )
}

// ── User accounts ─────────────────────────────────────────
export async function loadUserAccounts(userId) {
  try {
    const snap = await getDoc(doc(db, 'user_settings', userId))
    return snap.exists() ? (snap.data().accounts || []) : []
  } catch { return [] }
}

export async function saveUserAccounts(userId, accounts) {
  try {
    await setDoc(doc(db, 'user_settings', userId), { accounts }, { merge: true })
  } catch (e) {
    console.warn('saveUserAccounts error:', e.message)
  }
}
