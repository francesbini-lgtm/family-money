import { storage } from '../firebase'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'

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
 * @returns {Promise<{name, url, type, size, path}[]>}
 */
export async function uploadTransactionFiles(id, files) {
  const results = []
  for (const file of files) {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const storageRef = ref(storage, `tx-attachments/${id}/${safeName}`)
    await uploadBytes(storageRef, file, { contentType: file.type })
    const url = await getDownloadURL(storageRef)
    results.push({ name: file.name, url, type: file.type, size: file.size, path: storageRef.fullPath })
  }
  return results
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
