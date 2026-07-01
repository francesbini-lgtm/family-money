export const CATS = {
  'Entrate': {
    color: '#2a7a4a',
    sub: ['Fra','Sofi','Prestiti','Altro'],
    subEmojis: { 'Fra':'👨', 'Sofi':'👩', 'Prestiti':'💰', 'Altro':'📋' },
  },
  'Casa': {
    color: '#b8942a',
    sub: ['Affitto','Spese Condominio','Utenze','Tari','Garage','Assicurazione','Acquisti','Colf','Altro'],
    subEmojis: { 'Affitto':'🏠', 'Spese Condominio':'🏢', 'Utenze':'💡', 'Tari':'🗑️', 'Garage':'🚗', 'Assicurazione':'🔒', 'Acquisti':'🛒', 'Colf':'🧹', 'Altro':'📋' },
  },
  'Veicoli': {
    color: '#2a5c8a',
    sub: ['Assicurazione','Carburante','Revisione','Tagliando','Gomme','Bollo','Car Washing','Autostrade','Parcheggio','Multa','Ormeggio','Extra','Altro'],
    subEmojis: { 'Assicurazione':'🔒', 'Carburante':'⛽', 'Revisione':'🔧', 'Tagliando':'🔩', 'Gomme':'🔄', 'Bollo':'📄', 'Car Washing':'🚿', 'Autostrade':'🛣️', 'Parcheggio':'🅿️', 'Multa':'🚨', 'Ormeggio':'⚓', 'Extra':'➕', 'Altro':'📋' },
  },
  'Spesa e Alimentari': {
    color: '#c8622a',
    sub: ['Spesa','Pranzo/Cene Lavoro','Altro'],
    subEmojis: { 'Spesa':'🛒', 'Pranzo/Cene Lavoro':'🥡', 'Altro':'📋' },
  },
  'Tempo Libero': {
    color: '#9a4ab8',
    sub: ['Sport','Cene / Pranzi','Aperitivi','Altro'],
    subEmojis: { 'Sport':'🏃', 'Cene / Pranzi':'🍽️', 'Aperitivi':'🍸', 'Altro':'📋' },
  },
  'Weekend e Vacanze': {
    color: '#2a9aa0',
    sub: ['Weekend','Vacanze','Altro'],
    subEmojis: { 'Weekend':'🌅', 'Vacanze':'✈️', 'Altro':'📋' },
  },
  'Shopping': {
    color: '#c8628a',
    sub: ['Shopping Online','Abbigliamento','Altro'],
    subEmojis: { 'Shopping Online':'📦', 'Abbigliamento':'👕', 'Altro':'📋' },
  },
  'Salute e Cura': {
    color: '#4ab87a',
    sub: ['Capelli','Estetista','Visite','Altro'],
    subEmojis: { 'Capelli':'✂️', 'Estetista':'💅', 'Visite':'🏥', 'Altro':'📋' },
  },
  'Figli': {
    color: '#e8a020',
    sub: ['Abbigliamento','Accantonamenti','Nanny','Asilo','Altro'],
    subEmojis: { 'Abbigliamento':'🧒', 'Accantonamenti':'🐷', 'Nanny':'👶', 'Asilo':'🏫', 'Altro':'📋' },
  },
  'Contanti': {
    color: '#888888',
    sub: [],
    subEmojis: {},
  },
  'Altro': {
    color: '#607080',
    sub: ['Tasse e Sanzioni','Regali','Altro'],
    subEmojis: { 'Tasse e Sanzioni':'⚖️', 'Regali':'🎁', 'Altro':'📋' },
  },
  'Non Categorizzato': {
    color: '#aaaaaa',
    sub: [],
    subEmojis: {},
  },
}

export const CAT_NAMES = Object.keys(CATS)

// ── Merge base + custom categories ───────────────────────
// Call this wherever you need the full category list (base + user-added)
export function getMergedCats(customCats = {}) {
  const merged = { ...CATS }
  Object.entries(customCats || {}).forEach(([name, data]) => {
    if (!merged[name]) {
      // Entirely new category
      merged[name] = { color: data.color || '#888', sub: data.sub || [], subEmojis: data.subEmojis || {} }
    } else {
      // Existing base category — if customCats has a sub array, use it directly
      // (this preserves both additions AND deletions of base subs)
      merged[name] = {
        ...merged[name],
        color: data.color || merged[name].color,
        sub: Array.isArray(data.sub) ? data.sub : merged[name].sub,
        subEmojis: { ...(merged[name].subEmojis || {}), ...(data.subEmojis || {}) },
      }
    }
  })
  return merged
}

/** Returns the emoji for a given L2 subcategory, or '' if none. */
export function getSubEmoji(allCats, cat1, cat2) {
  return allCats[cat1]?.subEmojis?.[cat2] || ''
}

export function getMergedCatNames(customCats = {}) {
  return Object.keys(getMergedCats(customCats))
}
