// ── Anthropic API Key ─────────────────────────────────────
// Viene letta da localStorage (impostata in Impostazioni → Profilo & Conti).
// In alternativa, puoi hardcodarla qui:
// export const ANTHROPIC_API_KEY = 'sk-ant-api03-...'

// Lazy read — picks up changes made in Impostazioni without a page reload.
export function getAnthropicApiKey() {
  try {
    return localStorage.getItem('fm-anthropic-key') || ''
  } catch {
    return ''
  }
}
