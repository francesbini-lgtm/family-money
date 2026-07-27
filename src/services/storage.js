import { storage } from '../firebase'
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'

/**
 * Upload files for a vehicle expense.
 * @param {string} expenseId
 * @param {File[]} files
 * @returns {Promise<{name, url, type, size}[]>}
 */
export async function uploadExpenseFiles(expenseId, files) {
  const results = []
  for (const file of files) {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const storageRef = ref(storage, `veh-expenses/${expenseId}/${safeName}`)
    await uploadBytes(storageRef, file, { contentType: file.type })
    const url = await getDownloadURL(storageRef)
    results.push({ name: file.name, url, type: file.type, size: file.size, path: storageRef.fullPath })
  }
  return results
}

/**
 * Upload files as receipt attachments for a bank transaction (or a not-yet-imported
 * "pending receipt" placeholder id) — richiesta utente 2026-07-27, flusso mobile
 * "📷 Foto ricevuta". Stessa identica logica di uploadExpenseFiles, solo prefix
 * diverso (tx-attachments/ invece di veh-expenses/) così i due namespace Storage
 * non si mescolano. Il chiamante decide se `id` è un txId reale o un id di
 * pendingReceipt (per foto scattate PRIMA che la transazione sia stata importata).
 * @param {string} id
 * @param {File[]} files
 * @param {(pct:number)=>void} [onProgress] — percentuale 0-100 (aggregata su più file), per mostrare
 *   una barra di avanzamento reale invece di uno spinner generico (richiesta utente 2026-07-27).
 * @returns {Promise<{name, url, type, size, path}[]>}
 */
export async function uploadTransactionFiles(id, files, onProgress) {
  const results = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const storageRef = ref(storage, `tx-attachments/${id}/${safeName}`)
    try {
      // Tentativo 1: upload "resumable" (a sessione, con progress reale).
      await uploadResumableWithTimeout(storageRef, file, i, files.length, onProgress, 15000)
    } catch (e) {
      // Fallback: upload "semplice" (un solo POST, senza sessione) — alcune reti/proxy
      // mobili bloccano silenziosamente la sessione resumable (nessun errore, nessuna
      // risposta: si blocca e basta). Segnalazione utente 2026-07-27, confermata con
      // errore riportato "tempo scaduto" senza alcun code Firebase — il problema è a
      // livello di rete/richiesta, non di regole. Se anche questo fallback va in
      // timeout, l'errore risale come prima al chiamante.
      await uploadBytes(storageRef, file, { contentType: file.type })
    }
    const url = await getDownloadURL(storageRef)
    results.push({ name: file.name, url, type: file.type, size: file.size, path: storageRef.fullPath })
  }
  onProgress?.(100)
  return results
}

function uploadResumableWithTimeout(storageRef, file, i, total, onProgress, timeoutMs) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type })
    const timer = setTimeout(() => { try { task.cancel() } catch {}; reject(new Error('resumable-timeout')) }, timeoutMs)
    task.on('state_changed',
      snapshot => {
        const filePct = snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0
        // Riserviamo il 100% al completamento reale (dopo getDownloadURL), così la barra
        // non "finisce" mentre in realtà l'operazione è ancora in corso.
        onProgress?.(Math.min(99, Math.round(((i + filePct) / total) * 100)))
      },
      err => { clearTimeout(timer); reject(err) },
      () => { clearTimeout(timer); resolve() }
    )
  })
}

/**
 * Delete a single attachment by its storage path.
 * @param {string} path  — the `path` field stored on the attachment
 */
export async function deleteExpenseFile(path) {
  try {
    await deleteObject(ref(storage, path))
  } catch (e) {
    console.warn('deleteExpenseFile:', e)
  }
}
