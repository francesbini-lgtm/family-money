export const CATS = {
  'Entrate':           { color: '#2a7a4a', sub: ['Fra','Sofi','Prestiti','Altro'] },
  'Casa':              { color: '#b8942a', sub: ['Affitto','Spese Condominio','Utenze','Tari','Garage','Assicurazione','Acquisti','Colf','Altro'] },
  'Veicoli':           { color: '#2a5c8a', sub: ['Assicurazione','Carburante','Revisione','Tagliando','Gomme','Bollo','Car Washing','Autostrade','Parcheggio','Multa','Extra','Altro'] },
  'Spesa e Alimentari':{ color: '#c8622a', sub: ['Spesa','Pranzo/Cene Lavoro','Altro'] },
  'Tempo Libero':      { color: '#9a4ab8', sub: ['Sport','Cene / Pranzi','Aperitivi','Altro'] },
  'Weekend e Vacanze': { color: '#2a9aa0', sub: ['Weekend','Vacanze','Altro'] },
  'Shopping':          { color: '#c8628a', sub: ['Shopping Online','Abbigliamento','Altro'] },
  'Salute e Cura':     { color: '#4ab87a', sub: ['Capelli','Estetista','Visite','Altro'] },
  'Figli':             { color: '#e8a020', sub: ['Abbigliamento','Accantonamenti','Nanny','Asilo','Altro'] },
  'Contanti':          { color: '#888888', sub: [] },
  'Altro':             { color: '#607080', sub: ['Tasse e Sanzioni','Regali','Altro'] },
  'Non Categorizzato': { color: '#aaaaaa', sub: [] },
}

export const CAT_NAMES = Object.keys(CATS)

// ── Merge base + custom categories ───────────────────────
// Call this wherever you need the full category list (base + user-added)
export function getMergedCats(customCats = {}) {
  const merged = { ...CATS }
  Object.entries(customCats || {}).forEach(([name, data]) => {
    if (!merged[name]) {
      // Entirely new category
      merged[name] = { color: data.color || '#888', sub: data.sub || [] }
    } else {
      // Existing base category — if customCats has a sub array, use it directly
      // (this preserves both additions AND deletions of base subs)
      merged[name] = {
        ...merged[name],
        color: data.color || merged[name].color,
        sub: Array.isArray(data.sub) ? data.sub : merged[name].sub,
      }
    }
  })
  return merged
}

export function getMergedCatNames(customCats = {}) {
  return Object.keys(getMergedCats(customCats))
}
