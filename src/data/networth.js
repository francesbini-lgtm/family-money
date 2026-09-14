// Calcolo del Patrimonio Netto condiviso — stessa identica logica della pagina
// Patrimonio (PatrimonioPage.jsx), estratta qui così anche il mobile mostra lo
// STESSO valore (segnalazione utente 2026-09-14: il patrimonio netto mobile era
// diverso da quello vero — mancavano Satispay, valore veicoli e asset/passività
// manuali, e usava il campo prestito sbagliato).

// Valore di mercato di una posizione di portafoglio
export function posVal(p) {
  if (p.currentValue != null) return p.currentValue
  return (p.quantity || 0) * (p.currentPrice || 0) * (p.currency === '$' ? 0.92 : 1)
}

// Totale accumulato in un salvadanaio Satispay (somma di tutte le celle mensili)
export function potTotal(pot) {
  const voci = pot.voci || []
  const n = new Date()
  const nowYM = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  function addM(ym) {
    let [y, m] = ym.split('-').map(Number); m++
    if (m > 12) { m = 1; y++ }
    return `${y}-${String(m).padStart(2, '0')}`
  }
  const list = []; let cur = pot.startYM || nowYM, i = 0
  while (cur <= nowYM && i++ < 600) { list.push(cur); cur = addM(cur) }
  return list.reduce((ms, ym) => {
    const cells = pot.data?.[ym]?.cells || {}
    return ms + voci.reduce((vs, v) => vs + (parseFloat(cells[v.id]) || 0), 0)
  }, 0)
}

// Patrimonio netto = attivi (conto + investimenti + Satispay netto + veicoli +
// asset manuali) − passività (mutui/prestiti + passività manuali).
export function computeNetWorth({ transactions = [], portfolios = [], loans = [], satiPots = [], vehicles = [], appPrefs = {} }) {
  // Conto corrente = saldo di tutte le transazioni non escluse (+ tappo forzato).
  // Come nella pagina Patrimonio, entra come attivo solo se positivo.
  const ccBalance = transactions.filter(t => !t.excluded || t._forcedBalance).reduce((s, t) => s + (t.amount || 0), 0)
  const ccAsset = ccBalance > 0 ? ccBalance : 0

  const invTotal = (portfolios || []).reduce((s, p) => s + (p.positions || []).reduce((ps, pos) => ps + posVal(pos), 0), 0)

  const satiGross = (satiPots || []).reduce((s, p) => s + potTotal(p), 0)
  const satiReleases = (transactions || []).filter(t => {
    if (t.excluded || t.amount <= 0) return false
    const desc = (t.description || '').toUpperCase()
    const merch = (t.merchant || '').toUpperCase()
    return t.cat1 === 'Satispay' || desc.includes('SATISPAY') || merch.includes('SATISPAY')
  }).reduce((s, t) => s + t.amount, 0)
  const satiNet = Math.max(0, satiGross - satiReleases)

  const vehTotal = (vehicles || []).filter(v => parseFloat(v.valoreMercato) > 0)
    .reduce((s, v) => s + parseFloat(v.valoreMercato), 0)

  const extraA = (appPrefs?.extraAssets || []).reduce((s, a) => s + (a.value || 0), 0)
  const extraL = (appPrefs?.extraLiabilities || []).reduce((s, l) => s + (l.value || 0), 0)

  const loanTotal = (loans || []).reduce((s, l) => s + (l.residual || 0), 0)

  const totalAssets = ccAsset + invTotal + satiNet + vehTotal + extraA
  const totalLiabilities = loanTotal + extraL

  // Componenti itemizzate (per il breakdown visuale nel popup Patrimonio mobile)
  const assets = [
    { name: 'Conto Corrente', value: ccAsset,  color: '#2a5c8a' },
    { name: 'Investimenti',   value: invTotal, color: '#2a7a4a' },
    { name: 'Satispay',       value: satiNet,  color: '#c8622a' },
    { name: 'Veicoli',        value: vehTotal, color: '#b8942a' },
    { name: 'Altri asset',    value: extraA,   color: '#9b59b6' },
  ].filter(a => a.value > 0)
  const liabilities = [
    { name: 'Mutui / Prestiti', value: loanTotal, color: '#c0392b' },
    { name: 'Altre passività',  value: extraL,    color: '#e07b39' },
  ].filter(l => l.value > 0)

  return { netWorth: totalAssets - totalLiabilities, totalAssets, totalLiabilities, assets, liabilities, ccBalance, invTotal, satiNet, vehTotal }
}
