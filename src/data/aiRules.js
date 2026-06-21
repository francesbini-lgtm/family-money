// ── AI Naming Rules ─────────────────────────────────────
// Rules are now stored in Firestore via appPrefs.aiNamingRules (useStore)
// This module provides helper functions that read from the store.

import { useStore } from '../store/useStore'

export function getAIRules() {
  return useStore.getState()?.appPrefs?.aiNamingRules || []
}

export function addAIRule({ merchant, description, matchField, matchValue, matchLabel }) {
  const rules = getAIRules()
  const nextId = String(rules.length + 1).padStart(4, '0')
  const _matchField = matchField || 'merchant'
  const _matchValue = matchValue || merchant || ''
  const _matchLabel = matchLabel || `Merchant = "${_matchValue}"`
  const newRule = {
    id:          `cod-${nextId}`,
    merchant:    merchant || '',
    description: description || '',
    matchField:  _matchField,
    matchValue:  _matchValue,
    matchLabel:  _matchLabel,
    rule:        `if ${_matchLabel} then "${description}"`,
    enabled:     true,
    createdAt:   new Date().toISOString(),
  }
  useStore.getState()?.setAppPref?.('aiNamingRules', [...rules, newRule])
  return newRule
}

export function updateAIRule(id, patch) {
  const rules = getAIRules().map(r => r.id === id ? { ...r, ...patch } : r)
  useStore.getState()?.setAppPref?.('aiNamingRules', rules)
  return rules
}

export function deleteAIRule(id) {
  const rules = getAIRules().filter(r => r.id !== id)
  useStore.getState()?.setAppPref?.('aiNamingRules', rules)
  return rules
}

// Build rules section for AI prompt
export function buildRulesPrompt() {
  const rules = getAIRules().filter(r => r.enabled)
  if (!rules.length) return ''
  return `\nUSER-DEFINED NAMING RULES (highest priority — always apply these):\n` +
    rules.map(r => {
      const label = r.matchLabel || (r.matchField ? `${r.matchField} contains "${r.matchValue}"` : `Merchant = "${r.merchant}"`)
      return `- if ${label} then "${r.description}" [${r.id}]`
    }).join('\n') + '\n'
}
