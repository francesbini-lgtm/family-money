import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { CATS } from '../data/categories'

// ── Date helpers ──────────────────────────────────────────
export function getYM(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function prevYM(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function getLast6Months() {
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(getYM(d))
  }
  return months
}

export function ymLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  const names = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${names[m - 1]} ${String(y).slice(2)}`
}

// Robust formatter — works in all browsers including Node/Safari
export function fmtIT(n, decimals = 0) {
  const fixed = Math.abs(n).toFixed(decimals)
  const [int, dec] = fixed.split('.')
  const intF = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decimals > 0 ? intF + ',' + dec : intF
}
const fmt = (n) => '€\u00a0' + fmtIT(Math.abs(n), 0)
const fmtK = (n) => {
  const abs = Math.abs(n)
  return abs >= 1000 ? `€\u00a0${fmtIT(abs/1000, 1)}K` : `€\u00a0${fmtIT(Math.round(abs), 0)}`
}
// Signed variants — fmt/fmtK above drop the sign (call sites rely on abs)
const fmtSigned  = (n) => ((Number(n) || 0) < 0 ? '-' : '') + fmt(n)
const fmtKSigned = (n) => ((Number(n) || 0) < 0 ? '-' : '') + fmtK(n)

// ── Main hook ─────────────────────────────────────────────
export function useFinancials() {
  const transactions = useStore(s => s.transactions)

  return useMemo(() => {
    const now = new Date()
    const thisYM = getYM(now)
    const lastYM = prevYM(thisYM)
    const last6  = getLast6Months()

    const active = transactions.filter(t => !t.excluded)

    function txForMonth(ym) {
      return active.filter(t => (t.competenza || (t._effDate||t.date||'')).startsWith(ym))
    }

    function income(txs)  { return txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0) }
    function expense(txs) { return Math.abs(txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)) }

    const thisTxs = txForMonth(thisYM)
    const lastTxs = txForMonth(lastYM)

    const thisIncome  = income(thisTxs)
    const thisExpense = expense(thisTxs)
    const lastIncome  = income(lastTxs)
    const lastExpense = expense(lastTxs)

    const savingsRate = thisIncome > 0 ? Math.round((thisIncome - thisExpense) / thisIncome * 100) : 0
    const cashflow    = thisIncome - thisExpense

    // Month-over-month deltas
    const deltaIncome  = lastIncome  > 0 ? Math.round((thisIncome  - lastIncome)  / lastIncome  * 100) : null
    const deltaExpense = lastExpense > 0 ? Math.round((thisExpense - lastExpense) / lastExpense * 100) : null

    // Last 6 months data for charts
    const monthly = last6.map(ym => {
      const txs = txForMonth(ym)
      return {
        ym,
        label:   ymLabel(ym),
        income:  income(txs),
        expense: expense(txs),
        savings: income(txs) - expense(txs),
      }
    })

    // Category breakdown for current month
    const catBreakdown = {}
    thisTxs.filter(t => t.amount < 0).forEach(t => {
      catBreakdown[t.cat1] = (catBreakdown[t.cat1] || 0) + Math.abs(t.amount)
    })
    const catList = Object.entries(catBreakdown)
      .map(([name, total]) => ({ name, total, color: CATS[name]?.color || '#aaa' }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)

    // Recent transactions (last 8)
    const recent = active.slice(0, 8)

    // YTD stats
    const ytdTxs = active.filter(t => ((t._effDate||t.date||'')).startsWith(now.getFullYear().toString()))
    const ytdIncome  = income(ytdTxs)
    const ytdExpense = expense(ytdTxs)

    // YTD per category
    const ytdCatBreakdown = {}
    active.filter(t => (t._effDate||(t._effDate||t.date||'')).startsWith(now.getFullYear().toString()) && t.amount < 0).forEach(t => {
      ytdCatBreakdown[t.cat1] = (ytdCatBreakdown[t.cat1] || 0) + Math.abs(t.amount)
    })
    const ytdCatList = Object.entries(ytdCatBreakdown)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)

    return {
      // This month
      thisIncome, thisExpense, savingsRate, cashflow,
      deltaIncome, deltaExpense,
      // Charts
      monthly,
      catList,
      // Recent
      recent,
      // YTD
      ytdIncome, ytdExpense,
      // Helpers
      fmt, fmtK, fmtSigned, fmtKSigned,
      thisYM, lastYM,
      ytdCatList,
      isEmpty: transactions.length === 0,
    }
  }, [transactions])
}
