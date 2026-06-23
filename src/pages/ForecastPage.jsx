import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { CATS, getMergedCats } from '../data/categories'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import './ForecastPage.css'
import { fmtIT } from '../utils/format'

// ── Helpers ───────────────────────────────────────────────
const MON = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

// Calcola totale spese per un mese, sostituendo _satiLinked con splits
function expTotal(transactions, ym) {
  let total = 0
  transactions.forEach(t => {
    if (t.excluded || t.amount >= 0) return
    if (!(t._effDate || t.date || '').startsWith(ym)) return
    if (t._satiLinked && t.splits?.length > 0) {
      t.splits.forEach(sp => { if (sp.amount > 0) total += sp.amount })
    } else {
      total += Math.abs(t.amount)
    }
  })
  return total
}

// Lista transazioni di spesa effettive per un set di mesi (satiLinked → splits virtuali)
function expList(transactions, yms) {
  const ymSet = new Set(yms)
  const result = []
  transactions.forEach(t => {
    if (t.excluded || t.amount >= 0) return
    const ym = (t._effDate || t.date || '').slice(0, 7)
    if (!ymSet.has(ym)) return
    if (t._satiLinked && t.splits?.length > 0) {
      t.splits.forEach(sp => {
        if (sp.amount > 0) result.push({ ...t, _virtual: true, amount: -sp.amount,
          cat1: sp.cat1 || 'Non Categorizzato', cat2: sp.cat2 || 'Altro' })
      })
    } else {
      result.push(t)
    }
  })
  return result
}

function fmtK(n) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `€ ${(n/1_000_000).toFixed(2)}M`
  if (a >= 1_000)     return `€ ${fmtIT(n/1_000, 0)}K`
  return `€ ${fmtIT(n, 0)}`
}
function fmtFull(n) { return `€ ${fmtIT(Math.round(n), 0)}` }

function ymToLabel(ym) {
  const [y, m] = ym.split('-')
  return `${MON[parseInt(m)-1]} ${String(y).slice(2)}`
}

// ── Mortgage amortization ────────────────────────────────
function calcMortgage(capital, rateAnnual, durationYears) {
  const r = rateAnnual / 100 / 12
  const n = durationYears * 12
  const rata = r === 0
    ? capital / n
    : capital * r * Math.pow(1+r, n) / (Math.pow(1+r, n) - 1)
  const residuals = []
  let balance = capital
  for (let y = 0; y < durationYears; y++) {
    for (let m = 0; m < 12; m++) {
      const interest  = balance * r
      const principal = rata - interest
      balance = Math.max(0, balance - principal)
    }
    residuals.push(Math.round(balance))
  }
  return { rata: Math.round(rata * 100) / 100, residuals }
}

// ── Slider ────────────────────────────────────────────────
function Slider({ label, value, onChange, min, max, step = 1, format = v => v, hint }) {
  return (
    <div className="fc-slider">
      <div className="fc-slider-header">
        <div>
          <span className="fc-slider-label">{label}</span>
          {hint && <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>{hint}</div>}
        </div>
        <span className="fc-slider-val">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="fc-range"/>
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:10, padding:'10px 14px', fontSize:12,
      boxShadow:'0 4px 20px rgba(0,0,0,.1)'
    }}>
      <div style={{fontWeight:700, marginBottom:6, color:'var(--text2)'}}>{label}</div>
      {payload.filter(p => p.value != null).map((p, i) => (
        <div key={i} style={{display:'flex', justifyContent:'space-between', gap:16, marginBottom:2}}>
          <span style={{color:p.color, fontWeight:600}}>{p.name}</span>
          <span style={{fontFamily:'var(--font-mono)', fontWeight:700}}>
            {fmtFull(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── What If Panel ─────────────────────────────────────────
function WhatIfPanel({ catStats, excludedCats, onToggle }) {
  const cats = Object.entries(catStats).filter(([n]) => n !== 'Entrate' && n !== 'Non Categorizzato')
    .sort((a, b) => b[1].avg - a[1].avg)

  return (
    <div className="fc-whatif-panel">
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.5}}>
        Seleziona le categorie da escludere: il risparmio mensile aumenta dell'importo indicato.
        <span style={{display:'block',marginTop:3,fontStyle:'italic',opacity:.8}}>
          Importi calcolati come: totale spese categoria (ultimi 12 mesi) ÷ 12
        </span>
      </div>
      {cats.map(([c1, info]) => {
        const c1Excluded  = excludedCats.has(c1)
        const subs = Object.entries(info.subs).sort((a, b) => b[1] - a[1])
        return (
          <div key={c1} className="fc-whatif-cat">
            {/* L1 row */}
            <div className="fc-whatif-l1" onClick={() => onToggle(c1)}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div className={`fc-whatif-check ${c1Excluded ? 'on' : ''}`}>
                  {c1Excluded && <span>✓</span>}
                </div>
                <div style={{width:8,height:8,borderRadius:'50%',background:info.color,flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700,color: c1Excluded ? 'var(--green)' : 'var(--text)'}}>
                  {c1}
                </span>
              </div>
              <span style={{
                fontFamily:'var(--font-mono)',fontSize:12,
                color: c1Excluded ? 'var(--green)' : 'var(--text3)',
                fontWeight: c1Excluded ? 700 : 400,
              }}>
                {c1Excluded ? '+' : '−'}{fmtFull(info.avg)}/m
              </span>
            </div>
            {/* L2 rows (only if subs exist and L1 not excluded) */}
            {!c1Excluded && subs.length > 0 && (
              <div className="fc-whatif-subs">
                {subs.map(([c2, avg]) => {
                  const key      = `${c1}:::${c2}`
                  const excluded = excludedCats.has(key)
                  return (
                    <div key={c2} className="fc-whatif-l2" onClick={() => onToggle(key)}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div className={`fc-whatif-check sm ${excluded ? 'on' : ''}`}>
                          {excluded && <span>✓</span>}
                        </div>
                        <span style={{fontSize:12,color: excluded ? 'var(--green)' : 'var(--text2)'}}>
                          {c2}
                        </span>
                      </div>
                      <span style={{
                        fontFamily:'var(--font-mono)',fontSize:11,
                        color: excluded ? 'var(--green)' : 'var(--text3)',
                        fontWeight: excluded ? 700 : 400,
                      }}>
                        {excluded ? '+' : ''}{fmtFull(avg)}/m
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function ForecastPage() {
  const { transactions, customCats, appPrefs, setAppPref } = useStore()
  const excludedMonths = appPrefs?.forecastExcludedMonths || []

  const [detailPopup, setDetailPopup] = useState(null) // 'income' | 'expense' | null

  // Adjustable parameters
  const [growth,    setGrowth]    = useState(2)
  const [inflation, setInflation] = useState(2)
  const [years,     setYears]     = useState(15)

  // Mortgage
  const [showMortgage,  setShowMortgage]  = useState(false)
  const [mortgageOn,    setMortgageOn]    = useState(false)
  const [mortgageAmt,   setMortgageAmt]   = useState(200000)
  const [mortgageYears, setMortgageYears] = useState(20)
  const [mortgageTaeg,  setMortgageTaeg]  = useState(3.5)
  const [mortgageStart, setMortgageStart] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1)
    return `${d.getFullYear()}-01`
  })
  const [mortgageAnticipo, setMortgageAnticipo] = useState(0)

  // What if
  const [whatIfOpen,   setWhatIfOpen]   = useState(false)
  const [excludedCats, setExcludedCats] = useState(() => new Set())

  function toggleExcludedCat(key) {
    setExcludedCats(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        // If removing an L1, no orphan L2 keys since L2 keys are "C1:::C2"
      } else {
        next.add(key)
        // If adding an L1, remove any L2 sub-exclusions (L1 covers all)
        if (!key.includes(':::')) {
          for (const k of next) {
            if (k.startsWith(key + ':::')) next.delete(k)
          }
        }
      }
      return next
    })
  }

  // ── Real data: last 6 FULL months (excluding current month) ──
  const { avgIncome, avgExpense, currentSaldo, historicalPoints, historicalYearPoints, catStats, last6, incomeByMonth, expenseByMonth } = useMemo(() => {
    const now = new Date()
    const active = transactions.filter(t => !t.excluded || t._forcedBalance)

    // Running saldo (all time)
    const currentSaldo = active.reduce((s, t) => s + t.amount, 0)

    // Last 12 months INCLUDING current (for historical chart)
    const histMonths = []
    for (let i = 11; i >= 0; i--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      histMonths.push(ym)
    }

    // Historical running saldo at end of each month
    const historicalPoints = histMonths.map(ym => {
      const saldoUpTo = active.filter(t => (t._effDate||(t._effDate||t.date||'')) <= ym + '-31')
        .reduce((s, t) => s + t.amount, 0)
      return { ym, label: ymToLabel(ym), saldo: Math.round(saldoUpTo) }
    })

    // Last 12 FULL months — EXCLUDING current month
    const last6 = []
    for (let i = 12; i >= 1; i--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      last6.push(ym)
    }

    // Avg income last 6 full months — Fra+Sofi salary entries
    const salaryTxs = transactions.filter(t =>
      !t.excluded && t.amount > 0 && t.cat1 === 'Entrate' &&
      (t.cat2 === 'Fra' || t.cat2 === 'Sofi') &&
      last6.some(ym => (t._effDate||(t._effDate||t.date||'')).startsWith(ym))
    )
    const incomeTxs = salaryTxs.length > 0
      ? salaryTxs
      : transactions.filter(t =>
          !t.excluded && t.amount > 0 &&
          last6.some(ym => (t._effDate||(t._effDate||t.date||'')).startsWith(ym))
        )

    const totalIncome  = incomeTxs.reduce((s, t) => s + t.amount, 0)
    const totalExpense = last6.reduce((s, ym) => s + expTotal(transactions, ym), 0)

    // Monthly breakdown for diagnostics
    const incomeByMonth = last6.map(ym => ({
      ym,
      label: ymToLabel(ym),
      fra:  incomeTxs.filter(t => t.cat2 === 'Fra'  && (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0),
      sofi: incomeTxs.filter(t => t.cat2 === 'Sofi' && (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0),
      other: incomeTxs.filter(t => t.cat2 !== 'Fra' && t.cat2 !== 'Sofi' && (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0),
    }))

    // Monthly expense breakdown (last 12 months)
    const expenseByMonth = last6.map(ym => ({
      ym,
      label: ymToLabel(ym),
      total: expTotal(transactions, ym),
    }))

    // Historical saldo by year (for chart coherence when showing multi-year forecast)
    const historicalYearPoints = []
    for (let y = 3; y >= 1; y--) {
      const year = now.getFullYear() - y
      if (year < 2020) continue
      const endYm = `${year}-12`
      const saldo = active.filter(t => (t._effDate||(t._effDate||t.date||'')) <= endYm + '-31')
        .reduce((s, t) => s + t.amount, 0)
      historicalYearPoints.push({ ym: endYm, label: String(year), saldo: Math.round(saldo) })
    }
    // Also add current year so far
    const curYmLabel = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    const saldoNow = active.reduce((s,t) => s + t.amount, 0)
    historicalYearPoints.push({ ym: curYmLabel, label: String(now.getFullYear()), saldo: Math.round(saldoNow) })

    // Always divide by 12 — fixed window of 12 closed months

    // Cat stats for What If panel — avg monthly per cat1 and cat2
    const catRaw = {}
    expList(transactions, last6).forEach(t => {
      const c1 = t.cat1 || 'Non Categorizzato'
      if (c1 === 'Entrate') return
      if (!catRaw[c1]) catRaw[c1] = { total: 0, subs: {}, color: (getMergedCats(customCats)[c1]?.color) || '#888' }
      catRaw[c1].total += Math.abs(t.amount)
      const c2 = t.cat2 || 'Altro'
      catRaw[c1].subs[c2] = (catRaw[c1].subs[c2] || 0) + Math.abs(t.amount)
    })
    const catStats = {}
    Object.entries(catRaw).forEach(([c1, data]) => {
      catStats[c1] = {
        avg:   Math.round(data.total / 12),
        color: data.color,
        subs:  Object.fromEntries(Object.entries(data.subs).map(([c2, tot]) => [c2, Math.round(tot / 12)])),
      }
    })

    return {
      avgIncome:  Math.round(totalIncome  / 12),
      avgExpense: Math.round(totalExpense / 12),
      currentSaldo,
      historicalPoints,
      historicalYearPoints,
      catStats,
      last6,
      incomeByMonth,
      expenseByMonth,
    }
  }, [transactions, customCats])

  // Effective income avg excluding deselected months
  const effectiveIncomeMths = incomeByMonth.filter(m => !excludedMonths.includes(m.ym))
  const avgIncomeEffective = effectiveIncomeMths.length > 0
    ? Math.round(effectiveIncomeMths.reduce((s, m) => s + m.fra + m.sofi + m.other, 0) / effectiveIncomeMths.length)
    : avgIncome

  // ── Historical yearly data for proiezione table ──────────
  const historicalTableData = useMemo(() => {
    const now = new Date()
    const activeTxs = transactions.filter(t => !t.excluded)
    const rows = []
    for (let y = 3; y >= 1; y--) {
      const year = now.getFullYear() - y
      if (year < 2020) continue
      const yStr = String(year)
      const inc = activeTxs.filter(t => t.amount > 0 && (t._effDate||(t.date||'')).startsWith(yStr))
        .reduce((s,t) => s+t.amount, 0)
      const exp = Math.abs(activeTxs.filter(t => t.amount < 0 && (t._effDate||(t.date||'')).startsWith(yStr))
        .reduce((s,t) => s+t.amount, 0))
      const saldo = activeTxs.filter(t => (t._effDate||(t.date||'')) <= `${yStr}-12-31`)
        .reduce((s,t) => s+t.amount, 0)
      if (inc === 0 && exp === 0) continue
      rows.push({ label: yStr, inc: Math.round(inc), exp: Math.round(exp), saldo: Math.round(saldo) })
    }
    return rows
  }, [transactions])

  // ── What If: saved per month from excluded cats ───────────
  const savedPerMonth = useMemo(() => {
    if (excludedCats.size === 0) return 0
    let saved = 0
    for (const key of excludedCats) {
      if (key.includes(':::')) {
        // L2 key — only count if parent L1 NOT already excluded
        const c1 = key.split(':::')[0]
        if (!excludedCats.has(c1)) {
          const [, c2] = key.split(':::')
          saved += catStats[c1]?.subs[c2] || 0
        }
      } else {
        // L1 key
        saved += catStats[key]?.avg || 0
      }
    }
    return saved
  }, [excludedCats, catStats])

  const effectiveExpense = avgExpense - savedPerMonth

  // ── Mortgage calculation ──────────────────────────────────
  const mortgage = useMemo(() => {
    if (!mortgageOn || !mortgageAmt || !mortgageTaeg) return null
    return calcMortgage(mortgageAmt, mortgageTaeg, Math.min(mortgageYears, years + 30))
  }, [mortgageOn, mortgageAmt, mortgageYears, mortgageTaeg, years])

  // ── Forecast data (uses effectiveExpense) ─────────────────
  const monthlySavings = avgIncomeEffective - effectiveExpense - (mortgage ? mortgage.rata : 0)
  const savingsRate    = avgIncomeEffective > 0 ? Math.round(monthlySavings / avgIncomeEffective * 100) : 0

  const mortgageStartYear = useMemo(() => {
    if (!mortgageStart) return new Date().getFullYear()
    return parseInt(mortgageStart.split('-')[0])
  }, [mortgageStart])

  const forecastData = useMemo(() => {
    const now = new Date()
    const pts = []
    const startSaldo = currentSaldo - (mortgageOn && mortgageAnticipo > 0 ? mortgageAnticipo : 0)
    let saldo = startSaldo
    let inc   = avgIncomeEffective
    let exp   = effectiveExpense

    for (let y = 0; y <= years; y++) {
      const year = now.getFullYear() + y
      const mortgageActive  = mortgageOn && mortgage && year >= mortgageStartYear
      const mortgageMonthly = mortgageActive ? mortgage.rata : 0
      saldo += (inc - exp - mortgageMonthly) * 12

      const yearsIntoMortgage = year - mortgageStartYear
      const residual = (mortgageActive && yearsIntoMortgage >= 0 && yearsIntoMortgage < mortgage.residuals.length)
        ? mortgage.residuals[yearsIntoMortgage]
        : (mortgageOn && year >= mortgageStartYear ? 0 : null)

      pts.push({
        label:    String(year),
        forecast: Math.round(saldo),
        residual: residual !== null ? residual : undefined,
      })

      inc *= (1 + growth / 100)
      exp *= (1 + inflation / 100)
    }
    return pts
  }, [avgIncomeEffective, effectiveExpense, growth, inflation, years, currentSaldo, mortgage, mortgageOn, mortgageStartYear, mortgageAnticipo])

  // ── Combined chart data ───────────────────────────────────
  const chartData = useMemo(() => {
    // Use yearly historical when forecast horizon > 1 year (for label coherence)
    const srcHist = years > 1 ? historicalYearPoints : historicalPoints
    const histPts = srcHist.map(p => ({
      label:      p.label,
      historical: p.saldo,
      forecast:   null,
      residual:   null,
      _ym:        p.ym,
    }))
    if (histPts.length > 0) {
      histPts[histPts.length - 1].forecast = histPts[histPts.length - 1].historical
    }
    const fcPts = forecastData.map(d => ({
      label:      d.label,
      historical: null,
      forecast:   d.forecast,
      residual:   d.residual ?? null,
    }))
    return [...histPts, ...fcPts]
  }, [historicalPoints, historicalYearPoints, forecastData, years])

  const finalPoint    = forecastData[forecastData.length - 1]
  const finalSaldo    = finalPoint?.forecast || 0
  const finalResidual = finalPoint?.residual || 0

  const breakeven = mortgage
    ? forecastData.findIndex(d => (d.residual ?? Infinity) <= d.forecast)
    : -1

  const now = new Date()
  const sourceLabel = transactions.some(t =>
    !t.excluded && t.amount > 0 && t.cat1 === 'Entrate' &&
    (t.cat2 === 'Fra' || t.cat2 === 'Sofi')
  ) ? 'stipendi Fra+Sofi' : 'tutte le entrate'

  return (
    <div className="fc-page">
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,gap:16,flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600}}>📊 Forecast Finanziario</h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>
            Proiezione basata su dati reali · {sourceLabel} ·{' '}
            {last6.length >= 6 && (
              <span style={{fontFamily:'var(--font-mono)',fontSize:12}}>
                {ymToLabel(last6[0])} → {ymToLabel(last6[last6.length - 1])}
              </span>
            )}
          </div>
        </div>
        {/* Horizon quick selector */}
        <div style={{display:'flex',gap:4,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:9,padding:3}}>
          {[{v:1,l:'1A'},{v:3,l:'3A'},{v:5,l:'5A'},{v:10,l:'10A'},{v:20,l:'20A'},{v:35,l:'35A'}].map(opt=>(
            <button key={opt.v} onClick={()=>setYears(opt.v)}
              style={{padding:'5px 12px',borderRadius:7,border:'none',
                background:years===opt.v?'var(--surface)':'none',
                color:years===opt.v?'var(--text)':'var(--text3)',
                fontWeight:years===opt.v?700:500,cursor:'pointer',fontSize:12,
                fontFamily:'var(--font-sans)',
                boxShadow:years===opt.v?'0 1px 4px rgba(0,0,0,.08)':'none',transition:'all .15s'}}>
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      <div className="fc-layout">
        {/* ── Left: controls ── */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Real data summary */}
          <div className="card fc-controls" style={{position:'relative'}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700}}>📈 Dati Reali (Ultimi 12 mesi)</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>somma ultimi 12 mesi ÷ 12</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              {/* Entrate — clickable */}
              <div onClick={()=>setDetailPopup(detailPopup==='income'?null:'income')}
                style={{padding:'10px 12px',background: detailPopup==='income'?'rgba(50,180,100,.08)':'var(--surface2)',
                  borderRadius:8,border:`1px solid ${detailPopup==='income'?'var(--green)':'var(--border)'}`,
                  cursor:'pointer',userSelect:'none'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:3,display:'flex',justifyContent:'space-between'}}>
                  <span>Entrate (totale / 12)</span><span style={{opacity:.5}}>▼</span>
                </div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--green)',fontFamily:'var(--font-mono)'}}>{fmtFull(avgIncome)}</div>
              </div>
              {/* Spese — clickable */}
              <div onClick={()=>setDetailPopup(detailPopup==='expense'?null:'expense')}
                style={{padding:'10px 12px',background: detailPopup==='expense'?'rgba(220,50,50,.08)':'var(--surface2)',
                  borderRadius:8,border:`1px solid ${detailPopup==='expense'?'var(--red)':'var(--border)'}`,
                  cursor:'pointer',userSelect:'none'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:3,display:'flex',justifyContent:'space-between'}}>
                  <span>Spese (totale / 12)</span><span style={{opacity:.5}}>▼</span>
                </div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--red)',fontFamily:'var(--font-mono)'}}>{fmtFull(avgExpense)}</div>
              </div>
              {[
                ['Saldo attuale',    fmtFull(currentSaldo),  currentSaldo >= 0 ? 'var(--blue)' : 'var(--red)'],
                ['Risparmio netto',  fmtFull(avgIncome - avgExpense), (avgIncome - avgExpense) >= 0 ? 'var(--green)' : 'var(--red)'],
              ].map(([l, v, c]) => (
                <div key={l} style={{padding:'10px 12px',background:'var(--surface2)',borderRadius:8,border:'1px solid var(--border)'}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:3}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:c,fontFamily:'var(--font-mono)'}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Monthly detail popup */}
            {detailPopup && (()=>{
              const isInc = detailPopup === 'income'
              const rows = isInc
                ? incomeByMonth.map(m=>({ label: m.label, val: m.fra+m.sofi+m.other }))
                : expenseByMonth.map(m=>({ label: m.label, val: m.total }))
              const total = rows.reduce((s,r)=>s+r.val,0)
              const avg   = Math.round(total/12)
              const color = isInc ? 'var(--green)' : 'var(--red)'
              return (
                <div style={{position:'absolute',top:0,left:0,right:0,zIndex:50,
                  background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:12,padding:'14px 16px',
                  boxShadow:'0 8px 32px rgba(0,0,0,.18)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div style={{fontSize:13,fontWeight:700,color}}>
                      {isInc ? '📥 Entrate' : '📤 Spese'} — ultimi 12 mesi
                    </div>
                    <button onClick={()=>setDetailPopup(null)}
                      style={{border:'none',background:'none',cursor:'pointer',fontSize:16,color:'var(--text3)',lineHeight:1}}>✕</button>
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <tbody>
                      {rows.map(r=>(
                        <tr key={r.label} style={{borderBottom:'1px solid var(--border)'}}>
                          <td style={{padding:'4px 0',color:'var(--text2)'}}>{r.label}</td>
                          <td style={{padding:'4px 0',textAlign:'right',fontFamily:'var(--font-mono)',color,fontWeight:600}}>
                            {fmtFull(Math.round(r.val))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'2px solid var(--border)'}}>
                        <td style={{padding:'6px 0',fontWeight:700,fontSize:11,color:'var(--text3)'}}>Totale</td>
                        <td style={{padding:'6px 0',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color}}>{fmtFull(Math.round(total))}</td>
                      </tr>
                      <tr>
                        <td style={{padding:'2px 0',fontWeight:700,fontSize:11,color:'var(--text3)'}}>Totale / 12</td>
                        <td style={{padding:'2px 0',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color}}>{fmtFull(avg)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })()}

            {/* What If toggle button */}
            <button className={`fc-whatif-btn ${whatIfOpen ? 'open' : ''}`}
              onClick={() => setWhatIfOpen(v => !v)}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span>🤔</span>
                <div style={{textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:700}}>What if…</div>
                  <div style={{fontSize:10,color: whatIfOpen ? 'rgba(255,255,255,.7)' : 'var(--text3)'}}>
                    {excludedCats.size > 0
                      ? `+${fmtFull(savedPerMonth)}/mese risparmiati`
                      : 'E se eliminassi alcune spese?'}
                  </div>
                </div>
              </div>
              <span style={{fontSize:12,opacity:.7}}>{whatIfOpen ? '▲' : '▼'}</span>
            </button>

            {/* What If panel */}
            {whatIfOpen && Object.keys(catStats).length > 0 && (
              <>
                {savedPerMonth > 0 && (
                  <div className="fc-whatif-savings">
                    <div style={{fontSize:11,color:'var(--text3)'}}>Risparmio aggiuntivo</div>
                    <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                      <span style={{fontSize:18,fontWeight:800,color:'var(--green)',fontFamily:'var(--font-mono)'}}>
                        +{fmtFull(savedPerMonth)}/mese
                      </span>
                      <span style={{fontSize:11,color:'var(--text3)'}}>
                        → +{fmtK(savedPerMonth * 12 * years)} in {years} anni
                      </span>
                    </div>
                    <button onClick={() => setExcludedCats(new Set())}
                      style={{marginTop:4,fontSize:10,padding:'2px 8px',borderRadius:5,
                        border:'1px solid var(--border)',background:'var(--surface)',
                        cursor:'pointer',fontFamily:'var(--font-sans)',color:'var(--text3)'}}>
                      Azzera selezione
                    </button>
                  </div>
                )}
                <WhatIfPanel
                  catStats={catStats}
                  excludedCats={excludedCats}
                  onToggle={toggleExcludedCat}
                />
              </>
            )}
          </div>

          {/* Sliders */}
          <div className="card fc-controls">
            <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>⚙️ Parametri</div>
            <Slider
              label="Crescita stipendi / anno" value={growth} onChange={setGrowth}
              min={0} max={10} step={0.5} format={v=>`${v}%`}
              hint={`+${fmtFull(Math.round(avgIncome * growth / 100))} / mese ogni anno`}
            />
            <Slider
              label="Inflazione spese / anno" value={inflation} onChange={setInflation}
              min={0} max={8} step={0.5} format={v=>`${v}%`}
              hint={`+${fmtFull(Math.round(effectiveExpense * inflation / 100))} / mese ogni anno`}
            />
            <Slider
              label="Orizzonte (anni)" value={years} onChange={setYears}
              min={1} max={35} step={1} format={v=>`${v} anni`}
            />
          </div>

          {/* Mortgage */}
          <div className="card fc-mortgage">
            <button className="fc-mortgage-header" onClick={()=>setShowMortgage(v=>!v)}>
              <span style={{fontSize:14,fontWeight:700}}>🏦 Mutuo / Finanziamento</span>
              <span style={{fontSize:12,color:'var(--text3)'}}>{showMortgage?'▲':'▼'}</span>
            </button>

            {showMortgage && (
              <div className="fc-mortgage-body">
                <label className="fc-mortgage-toggle">
                  <input type="checkbox" checked={mortgageOn} onChange={e=>setMortgageOn(e.target.checked)}/>
                  <span className={`ob-toggle ${mortgageOn?'on':''}`}/>
                  <span style={{fontSize:13,fontWeight:600,color:mortgageOn?'var(--text)':'var(--text3)'}}>
                    {mortgageOn ? 'Attivo — incluso nel forecast' : 'Disattivato'}
                  </span>
                </label>

                <div className="fc-mortgage-fields">
                  <div className="fc-mortgage-field">
                    <label className="form-lbl-sm">Importo (€)</label>
                    <input className="fc-input" type="number" value={mortgageAmt}
                      onChange={e=>setMortgageAmt(Number(e.target.value))} placeholder="200000"/>
                  </div>
                  <div className="fc-mortgage-field">
                    <label className="form-lbl-sm">TAEG (%)</label>
                    <input className="fc-input" type="number" value={mortgageTaeg}
                      onChange={e=>setMortgageTaeg(Number(e.target.value))} step="0.1" placeholder="3.5"/>
                  </div>
                  <div className="fc-mortgage-field">
                    <label className="form-lbl-sm">Anticipo (€)</label>
                    <input className="fc-input" type="number" value={mortgageAnticipo}
                      onChange={e=>setMortgageAnticipo(Number(e.target.value))} placeholder="0"/>
                    <div className="fc-input-hint">Dedotto dal saldo</div>
                  </div>
                  <div className="fc-mortgage-field">
                    <label className="form-lbl-sm">Durata (anni)</label>
                    <input className="fc-input" type="number" value={mortgageYears}
                      onChange={e=>setMortgageYears(Number(e.target.value))} min="1" max="35" placeholder="20"/>
                  </div>
                  <div className="fc-mortgage-field">
                    <label className="form-lbl-sm">Inizio</label>
                    <input className="fc-input" type="month" value={mortgageStart}
                      onChange={e=>setMortgageStart(e.target.value)}/>
                    <div className="fc-input-hint">{mortgageStart ? ymToLabel(mortgageStart) : 'Mese di inizio'}</div>
                  </div>
                </div>

                {mortgage && mortgageOn && (
                  <div className="fc-mortgage-preview">
                    <div className="fc-preview-item">
                      <span>Rata mensile</span>
                      <strong style={{color:'var(--accent)'}}>€ {fmtIT(mortgage.rata, 2)}</strong>
                    </div>
                    <div className="fc-preview-item">
                      <span>Totale interessi</span>
                      <strong style={{color:'var(--red)'}}>
                        € {fmtIT(Math.round(mortgage.rata * mortgageYears * 12 - mortgageAmt), 0)}
                      </strong>
                    </div>
                    <div className="fc-preview-item">
                      <span>Costo totale</span>
                      <strong>€ {fmtIT(Math.round(mortgage.rata * mortgageYears * 12), 0)}</strong>
                    </div>
                    <div className="fc-preview-item">
                      <span>Impatto mensile</span>
                      <strong style={{color:'var(--red)'}}>−{fmtFull(mortgage.rata)}</strong>
                    </div>
                    {mortgageAnticipo > 0 && (
                      <div className="fc-preview-item">
                        <span>Anticipo</span>
                        <strong style={{color:'var(--red)'}}>−{fmtFull(mortgageAnticipo)}</strong>
                      </div>
                    )}
                    {breakeven >= 0 && (
                      <div className="fc-preview-item">
                        <span>Saldo {'>'} Debito dal</span>
                        <strong style={{color:'var(--green)'}}>{forecastData[breakeven]?.label || '—'}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="card fc-controls" style={{paddingTop:14}}>
            <div style={{fontSize:11,fontWeight:700,marginBottom:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.06em'}}>
              Riepilogo proiezione ({years} anni)
            </div>
            <div className="fc-summary">
              {savedPerMonth > 0 && (
                <div className="fc-sum-row" style={{background:'rgba(50,180,100,.06)',borderRadius:6,padding:'6px 8px',marginBottom:2}}>
                  <span style={{color:'var(--green)'}}>Spese eliminate (what if)</span>
                  <strong style={{color:'var(--green)'}}>−{fmtFull(savedPerMonth)}/m</strong>
                </div>
              )}
              <div className="fc-sum-row">
                <span>Risparmio mensile netto</span>
                <strong style={{color:monthlySavings>=0?'var(--green)':'var(--red)'}}>
                  {monthlySavings>=0?'+':''}{fmtFull(Math.round(monthlySavings))}
                </strong>
              </div>
              <div className="fc-sum-row">
                <span>Tasso risparmio</span>
                <strong style={{color:savingsRate>=20?'var(--green)':savingsRate>=10?'var(--gold)':'var(--red)'}}>
                  {savingsRate}%
                </strong>
              </div>
              {mortgageOn && mortgage && (
                <div className="fc-sum-row">
                  <span>Debito residuo tra {years} anni</span>
                  <strong style={{color:'var(--red)'}}>{fmtK(finalResidual)}</strong>
                </div>
              )}
              <div className="fc-sum-row" style={{borderTop:'1px solid var(--border)',paddingTop:8,marginTop:4}}>
                <span>Saldo previsto nel {now.getFullYear() + years}</span>
                <strong style={{color:'var(--blue)',fontSize:15}}>{fmtK(finalSaldo)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: chart + table ── */}
        <div style={{display:'flex',flexDirection:'column',gap:16,flex:1}}>

          {/* Main chart */}
          <div className="card" style={{padding:'18px 20px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontSize:14,fontWeight:700}}>Andamento Saldo Conto</div>
                {savedPerMonth > 0 && (
                  <div style={{fontSize:11,color:'var(--green)',marginTop:2}}>
                    🤔 What if attivo · +{fmtFull(savedPerMonth)}/mese
                  </div>
                )}
              </div>
              <div style={{display:'flex',gap:16,fontSize:11,flexWrap:'wrap'}}>
                <span style={{display:'flex',alignItems:'center',gap:5}}>
                  <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#c8622a" strokeWidth="2.5"/></svg>
                  Storico (reale)
                </span>
                <span style={{display:'flex',alignItems:'center',gap:5}}>
                  <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#c8622a" strokeWidth="2.5" strokeDasharray="5 3"/></svg>
                  Forecast
                </span>
                {mortgageOn && (
                  <span style={{display:'flex',alignItems:'center',gap:5}}>
                    <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#2a5c8a" strokeWidth="2.5"/></svg>
                    Mutuo residuo
                  </span>
                )}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 10))}/>
                <YAxis
                  tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={64}
                  tickFormatter={v => {
                    const a = Math.abs(v)
                    return a >= 1_000_000 ? `€${(v/1_000_000).toFixed(1)}M`
                         : a >= 1_000    ? `€${(v/1_000).toFixed(0)}K`
                         : `€${v}`
                  }}
                />
                <Tooltip content={<CustomTooltip/>}/>
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4"/>
                <Line type="monotone" dataKey="historical" name="Storico (reale)"
                  stroke="#c8622a" strokeWidth={2.5} dot={false} connectNulls={false} strokeDasharray="0"/>
                <Line type="monotone" dataKey="forecast" name="Forecast"
                  stroke="#c8622a" strokeWidth={2} dot={false} connectNulls={false}
                  strokeDasharray="7 4" strokeOpacity={0.75}/>
                {mortgageOn && (
                  <Line type="monotone" dataKey="residual" name="Mutuo residuo"
                    stroke="#2a5c8a" strokeWidth={2.5} dot={false} connectNulls={false}/>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* KPI row */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
            {[
              ['Saldo ' + (now.getFullYear() + years), fmtK(finalSaldo), 'var(--accent)'],
              ['Risparmio / mese', (monthlySavings>=0?'+':'')+fmtFull(Math.round(monthlySavings)), monthlySavings>=0?'var(--green)':'var(--red)'],
              ['Tasso risparmio', savingsRate+'%', savingsRate>=20?'var(--green)':savingsRate>=10?'var(--gold)':'var(--red)'],
              mortgageOn && mortgage
                ? ['Mutuo estinto', breakeven>=0 ? (forecastData[breakeven]?.label||'—') : '> orizzonte', 'var(--blue)']
                : ['Orizzonte', years+' anni', 'var(--text2)'],
            ].map(([l,v,color])=>(
              <div key={l} className="card" style={{padding:'12px 16px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:5}}>{l}</div>
                <div style={{fontSize:17,fontWeight:800,color,fontFamily:'var(--font-serif)'}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Projection table */}
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',fontSize:14,fontWeight:700,background:'var(--surface2)',display:'flex',alignItems:'center',gap:10}}>
              📋 Proiezione Annuale
              {savedPerMonth > 0 && (
                <span style={{fontSize:11,fontWeight:500,color:'var(--green)',padding:'2px 8px',background:'rgba(50,180,100,.1)',borderRadius:5}}>
                  🤔 what if incluso
                </span>
              )}
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  {[
                    'Anno','Entrate annue','Spese annue',
                    mortgageOn ? 'Rata mutuo annua' : null,
                    'Cash flow','Saldo previsto',
                    mortgageOn ? 'Debito residuo' : null,
                  ].filter(Boolean).map(h=>(
                    <th key={h} style={{padding:'8px 12px',fontSize:10,fontWeight:700,
                      letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',
                      background:'var(--surface2)',borderBottom:'1px solid var(--border)',
                      textAlign: h==='Anno' ? 'left' : 'right', whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Historical years (real data) */}
                {historicalTableData.map(d => {
                  const cf = d.inc - d.exp
                  return (
                    <tr key={d.label} style={{borderBottom:'1px solid var(--border)',background:'var(--surface2)',opacity:.85}}>
                      <td style={{padding:'8px 12px',fontWeight:700,color:'var(--text3)'}}>
                        {d.label} <span style={{fontSize:9,fontWeight:500,background:'var(--border)',padding:'1px 5px',borderRadius:4,marginLeft:4}}>storico</span>
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--green)',fontSize:12}}>
                        € {fmtIT(d.inc, 0)}
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--red)',fontSize:12}}>
                        € {fmtIT(d.exp, 0)}
                      </td>
                      {mortgageOn && <td style={{padding:'8px 12px',textAlign:'right',color:'var(--text3)',fontSize:12}}>—</td>}
                      <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                        color:cf>=0?'var(--green)':'var(--red)',fontWeight:700,fontSize:12}}>
                        {cf>=0?'+':''}€ {fmtIT(Math.abs(cf), 0)}
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                        fontWeight:700,color:'var(--text2)',fontSize:12}}>
                        € {fmtIT(d.saldo, 0)}
                      </td>
                      {mortgageOn && <td style={{padding:'8px 12px',textAlign:'right',color:'var(--text3)',fontSize:12}}>—</td>}
                    </tr>
                  )
                })}
                {/* Forecast rows */}
                {forecastData
                  .filter((_,i) => i % Math.max(1, Math.floor(years / 8)) === 0 || i === forecastData.length - 1)
                  .map((d) => {
                    const year = parseInt(d.label)
                    const yOffset = year - now.getFullYear()
                    const inc = avgIncome  * Math.pow(1 + growth / 100, yOffset)
                    const exp = effectiveExpense * Math.pow(1 + inflation / 100, yOffset)
                    const mortgageActive = mortgageOn && mortgage && year >= mortgageStartYear
                    const rataAnnua = mortgageActive ? mortgage.rata * 12 : 0
                    const cf = (inc - exp) * 12 - rataAnnua
                    return (
                      <tr key={d.label} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'8px 12px',fontWeight:700}}>{d.label}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--green)',fontSize:12}}>
                          € {fmtIT(Math.round(inc * 12), 0)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--red)',fontSize:12}}>
                          € {fmtIT(Math.round(exp * 12), 0)}
                        </td>
                        {mortgageOn && (
                          <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--accent)',fontSize:12}}>
                            {rataAnnua > 0 ? `€ ${fmtIT(Math.round(rataAnnua), 0)}` : '—'}
                          </td>
                        )}
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                          color:cf>=0?'var(--green)':'var(--red)',fontWeight:700,fontSize:12}}>
                          {cf>=0?'+':''}€ {fmtIT(Math.abs(Math.round(cf)), 0)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                          fontWeight:700,color:'var(--accent)',fontSize:12}}>
                          € {fmtIT(d.forecast, 0)}
                        </td>
                        {mortgageOn && (
                          <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                            color:'var(--blue)',fontSize:12}}>
                            {d.residual != null ? `€ ${fmtIT(d.residual, 0)}` : '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  )
}
