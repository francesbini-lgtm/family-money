import { initializeApp } from 'firebase/app'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getAI, getGenerativeModel } from 'firebase/ai'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            "AIzaSyAN6a-mFPbfY3tLXuo1tVljd9GR0M4NjUw",
  authDomain:        "money-tracker-49b40.firebaseapp.com",
  projectId:         "money-tracker-49b40",
  storageBucket:     "money-tracker-49b40.firebasestorage.app",
  messagingSenderId: "89766428674",
  appId:             "1:89766428674:web:6a316cac1a93e2cdc1a71b"
}

export const app     = initializeApp(firebaseConfig)
export const storage = getStorage(app)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
})
export const auth = getAuth(app)
export const gProvider = new GoogleAuthProvider()

// ── Firebase AI Logic (Gemini) ────────────────────────────
// Try models in order of preference - use the most recent available
const ai = getAI(app)
export const gemini = getGenerativeModel(ai, {
  model: 'gemini-1.5-flash',   // stable, available in all regions/plans
})
