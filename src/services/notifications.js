// ── Push notification helpers ─────────────────────────────

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied')  return 'denied'
  const result = await Notification.requestPermission()
  return result
}

export function scheduleScadenzeNotifications(scadenze) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  scadenze
    .filter(s => !s.pagata && s.data >= todayStr)
    .forEach(s => {
      const daysLeft = Math.round((new Date(s.data) - today) / 86400000)
      if (daysLeft <= 7) {
        // Show immediate notification for upcoming deadlines
        const title = daysLeft === 0
          ? `⚠️ Scade oggi: ${s.nome}`
          : `📅 Scade tra ${daysLeft} giorni: ${s.nome}`
        const body = s.importo > 0
          ? `€ ${s.importo.toLocaleString('it-IT')} · ${s.cat}`
          : s.cat

        // Small delay to not spam on load
        setTimeout(() => {
          new Notification(title, {
            body,
            icon: '/icon.svg',
            tag: `scadenza-${s.id}`,
            requireInteraction: daysLeft === 0,
          })
        }, 2000 + Math.random() * 3000)
      }
    })
}

// Toast con azione "Annulla" (richiesta utente 2026-09-11): resta visibile a lungo
// (default 20s) e permette di annullare un'azione appena fatta — es. rimozione
// compensazione fatta per errore. onUndo viene chiamato una sola volta.
export function showUndoToast(message, onUndo, duration = 20000) {
  // Un solo undo-toast per volta (evita sovrapposizioni in basso a destra)
  document.getElementById('undo-toast')?.remove()

  const toast = document.createElement('div')
  toast.id = 'undo-toast'
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: #2b2b2b; color: #fff; padding: 12px 14px 12px 18px;
    border-radius: 10px; font-size: 13px; font-weight: 600;
    z-index: 10000; box-shadow: 0 6px 24px rgba(0,0,0,.28);
    display: flex; align-items: center; gap: 14px; animation: slideIn .2s ease;
  `
  const label = document.createElement('span')
  label.textContent = `ℹ ${message}`

  const btn = document.createElement('button')
  btn.textContent = '↩︎ Annulla'
  btn.style.cssText = `
    background: rgba(255,255,255,.14); color: #fff;
    border: 1px solid rgba(255,255,255,.4); border-radius: 7px;
    padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;
  `

  let done = false
  const close = () => {
    if (done) return
    done = true
    toast.style.opacity = '0'
    toast.style.transition = 'opacity .3s'
    setTimeout(() => toast.remove(), 300)
  }
  btn.onclick = () => {
    if (done) return
    try { onUndo?.() } catch (e) { console.error('undo-toast:', e) }
    close()
  }

  toast.appendChild(label)
  toast.appendChild(btn)
  document.body.appendChild(toast)
  setTimeout(close, duration)
  return toast
}

export function showToast(message, type = 'success', duration = 3000) {
  const toast = document.createElement('div')
  const colors = {
    success: 'var(--green)',
    error:   'var(--red)',
    warning: 'var(--gold)',
    info:    'var(--blue)',
  }
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: ${colors[type] || colors.success};
    color: #fff; padding: 12px 20px;
    border-radius: 10px; font-size: 13px; font-weight: 600;
    z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,.2);
    display: flex; align-items: center; gap: 8px;
    animation: slideIn .2s ease;
  `
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }
  toast.textContent = `${icons[type] || '✓'} ${message}`
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity .3s'
    setTimeout(() => toast.remove(), 300)
  }, duration)
}
