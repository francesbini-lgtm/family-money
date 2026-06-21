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
