// ── Anthropic API Key ─────────────────────────────────────
// Viene letta da localStorage (impostata in Impostazioni → Profilo & Conti).
// In alternativa, puoi hardcodarla qui:
// export const ANTHROPIC_API_KEY = 'sk-ant-api03-...'

export const ANTHROPIC_API_KEY = (() => {
  try {
    return localStorage.getItem('fm-anthropic-key') || ''
  } catch {
    return ''
  }
})()
