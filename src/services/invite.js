import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { getHouseholdId } from './firestore'

// ── Generate invite link ──────────────────────────────────
export async function createInvite(inviterName, inviterEmail) {
  const householdId = getHouseholdId()
  if (!householdId) throw new Error('No household')

  const token    = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await setDoc(doc(db, 'invitations', token), {
    householdId,
    inviterName,
    inviterEmail,
    token,
    expiresAt,
    createdAt: serverTimestamp(),
    used: false,
  })

  // Return the invite URL
  const base = window.location.origin
  return `${base}?invite=${token}`
}

// ── Accept invite ─────────────────────────────────────────
export async function acceptInvite(token, userId, displayName, email) {
  const invRef  = doc(db, 'invitations', token)
  const invSnap = await getDoc(invRef)

  if (!invSnap.exists())       throw new Error('Invito non trovato')
  const inv = invSnap.data()
  if (inv.used)                throw new Error('Invito già utilizzato')
  if (new Date(inv.expiresAt) < new Date()) throw new Error('Invito scaduto')

  // Add user to household
  await setDoc(doc(db, 'household_members', userId), {
    householdId: inv.householdId,
    userId, displayName, email,
    role: 'member',
    joinedAt: serverTimestamp(),
  })

  // Mark invite as used
  await setDoc(invRef, { used: true, usedBy: userId, usedAt: serverTimestamp() }, { merge: true })

  return inv.householdId
}

// ── Check for invite on startup ───────────────────────────
export function getInviteTokenFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('invite')
}
