import { useMemo, useState, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { CATS, getMergedCats } from '../data/categories'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
  Cell, Legend, AreaChart, Area
} from 'recharts'
import './AnalyticsPage.css'
import { fmtIT } from '../utils/format'

const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

// ── Spending heatmap (GitHub-style) ──────────────────────
function SpendingHeatmap({ transactions }) {
  const now  = new Date()
  const year = now.getFullYear()

  const byDay = useMemo(() => {
    const map = {}
    transactions
      .filter(t => !t.excluded && t.amount < 0 && (t._effDate||(t._effDate||t.date||'')).startsWith(year.toString()))
      .forEach(t => { map[t._effDate||t.date] = (map[t._effDate||t.date] || 0) + Math.abs(t.amount) })
    return map
  }, [transactions, year])

  const maxVal = Math.max(...Object.values(byDay), 1)

  // Build grid: 53 weeks × 7 days
  const weeks = []
  const startOfYear = new Date(year, 0, 1)
  const startDOW = startOfYear.getDay() // 0=Sun

  let day = new Date(year, 0, 1 - startDOW)
  for (let w = 0; w < 53; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const dateStr = day.toISOString().slice(0, 10)
      const inYear  = day.getFullYear() === year
      week.push({ date: dateStr, val: inYear ? (byDay[dateStr] || 0) : null })
      day = new Date(day.getTime() + 86400000)
    }
    weeks.push(week)
    if (day.getFullYear() > year) break
  }

  function intensity(val) {
    if (val === null || val === 0) return 0
    return Math.min(4, Math.ceil(val / maxVal * 4))
  }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-months">
        {MONTHS.map(m => <span key={m}>{m}</span>)}
      </div>
      <div className="heatmap-grid">
        <div className="heatmap-days">
          {['Lun','Mer','Ven'].map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="heatmap-weeks">
          {weeks.map((week, wi) => (
            <div key={wi} className="heatmap-week">
              {week.map((day, di) => (
                <div
                  key={di}
                  className={`heatmap-cell i${intensity(day.val)}`}
                  title={day.val ? `${day.date}: €${fmtIT(day.val, 0)}` : day.date}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Meno</span>
        {[0,1,2,3,4].map(i => <div key={i} className={`heatmap-cell i${i}`}/>)}
        <span>Di più</span>
      </div>
    </div>
  )
}

// ── Year comparison ───────────────────────────────────────
function YearComparison({ transactions }) {
  const now       = new Date()
  const thisYear  = now.getFullYear()
  const lastYear  = thisYear - 1

  const data = useMemo(() => MONTHS.map((label, mi) => {
    const mo = String(mi + 1).padStart(2, '0')
    const thisYMStr = `${thisYear}-${mo}`
    const lastYMStr = `${lastYear}-${mo}`
    const txThis = transactions.filter(t => !t.excluded && t.amount < 0 && (t._effDate||(t._effDate||t.date||'')).startsWith(thisYMStr))
    const txLast = transactions.filter(t => !t.excluded && t.amount < 0 && (t._effDate||(t._effDate||t.date||'')).startsWith(lastYMStr))
    return {
      label,
      [thisYear]: Math.abs(txThis.reduce((s,t)=>s+t.amount,0)),
      [lastYear]: Math.abs(txLast.reduce((s,t)=>s+t.amount,0)),
    }
  }), [transactions, thisYear, lastYear])

  const hasLastYear = data.some(d => d[lastYear] > 0)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
        <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
        <YAxis tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={50}
          tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(1)}K`:`€${v}`}/>
        <Tooltip
          formatter={(v,n)=>[`€ ${fmtIT(v, 0)}`, String(n)]}
          contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
        <Legend iconType="circle" iconSize={8} formatter={v=><span style={{fontSize:11,color:'var(--text2)'}}>{v}</span>}/>
        <Bar dataKey={thisYear} fill="var(--accent)" radius={[3,3,0,0]}/>
        {hasLastYear && <Bar dataKey={lastYear} fill="var(--border)" radius={[3,3,0,0]}/>}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Category scatter ──────────────────────────────────────
function CategoryScatter({ transactions }) {
  const data = useMemo(() => {
    const now = new Date()
    const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

    const cats = {}
    transactions
      .filter(t => !t.excluded && t.amount < 0 && (t._effDate||(t._effDate||t.date||'')).startsWith(ym.slice(0,4)))
      .forEach(t => {
        if (!cats[t.cat1]) cats[t.cat1] = { total: 0, count: 0 }
        cats[t.cat1].total += Math.abs(t.amount)
        cats[t.cat1].count++
      })

    return Object.entries(cats)
      .filter(([,v]) => v.count >= 2)
      .map(([name, v]) => ({
        name,
        avg:   Math.round(v.total / v.count),
        total: Math.round(v.total),
        count: v.count,
        color: CATS[name]?.color || '#888',
      }))
  }, [transactions])

  if (!data.length) return (
    <div style={{height:200,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:13}}>
      Importa le transazioni per vedere il grafico
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{top:10,right:20,bottom:10,left:10}}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
        <XAxis dataKey="count" name="Transazioni" type="number"
          tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}
          label={{value:'N° transazioni',position:'insideBottom',offset:-5,fontSize:11,fill:'var(--text3)'}}/>
        <YAxis dataKey="avg" name="Media €" type="number"
          tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={45}
          tickFormatter={v=>`€${v}`}/>
        <Tooltip
          cursor={{strokeDasharray:'3 3'}}
          content={({active,payload}) => {
            if(!active||!payload?.length) return null
            const d = payload[0].payload
            return (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px',fontSize:12}}>
                <div style={{fontWeight:700,marginBottom:4,color:d.color}}>{d.name}</div>
                <div>Totale: € {fmtIT(d.total, 0)}</div>
                <div>Transazioni: {d.count}</div>
                <div>Media: € {fmtIT(d.avg, 0)}</div>
              </div>
            )
          }}
        />
        <Scatter data={data} dataKey="avg">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} opacity={0.85}/>
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// ── Category ranks over time ──────────────────────────────
function CategoryRanking({ transactions }) {
  const now = new Date()

  const monthly = useMemo(() => {
    const months = []
    for (let m = 5; m >= 0; m--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - m, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const cats = {}
      transactions
        .filter(t => !t.excluded && t.amount < 0 && (t._effDate||(t._effDate||t.date||'')).startsWith(ym))
        .forEach(t => { cats[t.cat1] = (cats[t.cat1]||0) + Math.abs(t.amount) })
      const top3 = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,3)
      months.push({ ym: ym.slice(2), top3 })
    }
    return months
  }, [transactions])

  return (
    <div className="cat-rank-table">
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={{padding:'8px 12px',fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:'left'}}>Mese</th>
            {['🥇 1°','🥈 2°','🥉 3°'].map(h=>(
              <th key={h} style={{padding:'8px 12px',fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:'left'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthly.map(m => (
            <tr key={m.ym} style={{borderBottom:'1px solid var(--border)'}}>
              <td style={{padding:'9px 12px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{m.ym}</td>
              {[0,1,2].map(i => {
                const entry = m.top3[i]
                return (
                  <td key={i} style={{padding:'9px 12px'}}>
                    {entry ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{width:8,height:8,borderRadius:'50%',background:CATS[entry[0]]?.color||'#888',display:'inline-block'}}/>
                        <span style={{fontSize:12,fontWeight:500}}>{entry[0]}</span>
                        <span style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',marginLeft:'auto'}}>€{Math.round(entry[1]/1000*10)/10}K</span>
                      </div>
                    ) : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


// ── Category Report Grid ──────────────────────────────────
// ── Running balance (saldo) chart ────────────────────────
function SaldoChart({ transactions }) {
  const [view, setView]   = useState('M')   // M=monthly Q=quarterly A=annual
  const [year, setYear]   = useState('all') // 'all' or specific year string

  // Excluded transactions don't count — except _forcedBalance (tappo) which must always be included
  const activeTxs = useMemo(() =>
    transactions.filter(t => !t.excluded || t._forcedBalance)
  , [transactions])

  const sorted = useMemo(() =>
    [...activeTxs].sort((a,b) => (a._effDate||a.date||'').localeCompare(b._effDate||b.date||''))
  , [activeTxs])

  const allYears = useMemo(() => {
    const yrs = new Set(sorted.map(t => (t._effDate||(t._effDate||t.date||'')).slice(0,4)).filter(Boolean))
    return [...yrs].sort()
  }, [sorted])

  // Build running saldo data — always compute ALL buckets first, then filter for display
  const chartData = useMemo(() => {
    const buckets = {}
    sorted.forEach(tx => {
      const d = (tx._effDate||tx.date||'')
      if (!d) return
      const yr = d.slice(0,4)
      const mo = d.slice(5,7)
      const q  = Math.ceil(parseInt(mo) / 3)
      let key
      if (view === 'M')      key = `${yr}-${mo}`
      else if (view === 'Q') key = `${yr}-Q${q}`
      else                   key = yr
      if (!buckets[key]) buckets[key] = { net: 0 }
      buckets[key].net += tx.amount
    })

    // Build full running total across ALL buckets (sorted chronologically)
    const keys = Object.keys(buckets).sort()
    let running = 0
    const full = keys.map(k => {
      running += buckets[k].net
      const label = view === 'M'
        ? MONTHS[parseInt(k.slice(5,7))-1] + ' ' + k.slice(2,4)
        : view === 'Q' ? k.replace(/(\d{4})-/, '$1 ') : k
      return { label, saldo: Math.round(running * 100) / 100, key: k }
    })

    // Filter to selected year if needed (but keep the correct running balance)
    return year === 'all' ? full : full.filter(d => d.key.startsWith(year))
  }, [sorted, view, year])

  const minVal = Math.min(...chartData.map(d=>d.saldo), 0)
  const maxVal = Math.max(...chartData.map(d=>d.saldo), 0)

  return (
    <div>
      {/* Controls */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:4}}>
          {[['M','Mensile'],['Q','Trimestrale'],['A','Annuale']].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{
              padding:'4px 12px',borderRadius:16,border:`1px solid ${view===v?'var(--accent)':'var(--border)'}`,
              background:view===v?'var(--accent-l)':'var(--surface)',
              color:view===v?'var(--accent)':'var(--text3)',
              fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
            }}>{l}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:4,marginLeft:8}}>
          <button onClick={()=>setYear('all')} style={{
            padding:'4px 10px',borderRadius:16,border:`1px solid ${year==='all'?'var(--blue)':'var(--border)'}`,
            background:year==='all'?'rgba(59,130,246,.1)':'var(--surface)',
            color:year==='all'?'var(--blue)':'var(--text3)',
            fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
          }}>Tutti</button>
          {allYears.map(y=>(
            <button key={y} onClick={()=>setYear(y)} style={{
              padding:'4px 10px',borderRadius:16,border:`1px solid ${year===y?'var(--blue)':'var(--border)'}`,
              background:year===y?'rgba(59,130,246,.1)':'var(--surface)',
              color:year===y?'var(--blue)':'var(--text3)',
              fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
            }}>{y}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{top:8,right:8,bottom:0,left:8}}>
          <defs>
            <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--blue)" stopOpacity={0.25}/>
              <stop offset="95%" stopColor="var(--blue)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
          <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}
            interval={chartData.length > 24 ? Math.floor(chartData.length/12) : 0}/>
          <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={60}
            tickFormatter={v=>v>=1000||v<=-1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}
            domain={[minVal*1.05, maxVal*1.05]}/>
          <Tooltip
            formatter={v=>[`€ ${fmtIT(v,2)}`,'Saldo']}
            contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
          <Area type="monotone" dataKey="saldo" stroke="var(--blue)" strokeWidth={2}
            fill="url(#saldoGrad)" dot={false} activeDot={{r:4,fill:'var(--blue)'}}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function CategoryReport({ transactions }) {
  const customCats = useStore(s => s.customCats)
  const [selected, setSelected] = useState(null)
  const [period,   setPeriod]   = useState('M') // M=month, Q=quarter, A=year
  const [showL2,   setShowL2]   = useState(false)
  const now = new Date()

  const getMonths = () => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    }
    return months
  }

  const catData = useMemo(() => {
    const months = getMonths()
    return Object.entries(getMergedCats(customCats))
      .filter(([name]) => name !== 'Entrate' && name !== 'Non Categorizzato')
      .map(([name, info]) => {
        const txs = transactions.filter(t => !t.excluded && t.amount < 0 && t.cat1 === name)
        const byMonth = months.map(ym => ({
          label: MONTHS[parseInt(ym.slice(5))-1],
          v: Math.abs(txs.filter(t=>(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0))
        }))
        const mult = period==='M'?1:period==='Q'?3:6
        const periodTxs = period==='M'
          ? txs.filter(t=>(t._effDate||(t._effDate||t.date||'')).startsWith(months[5]))
          : txs.filter(t=>(t._effDate||(t._effDate||t.date||''))>=months[0])
        const total = Math.abs(periodTxs.reduce((s,t)=>s+t.amount,0))
        const avg   = mult > 0 ? Math.round(total/mult) : 0
        return { name, color: info.color, sub: info.sub||[], total, avg, byMonth }
      })
      .filter(d => d.total > 0)
      .sort((a,b) => b.total - a.total)
  }, [transactions, period, customCats])

  const selCat = selected ? catData.find(d=>d.name===selected) : null

  return (
    <div>
      {/* Controls row */}
      <div style={{display:'flex',gap:6,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        {[['M','Mese'],['Q','Trimestre'],['A','6 Mesi']].map(([v,l])=>(
          <button key={v} onClick={()=>setPeriod(v)} style={{
            padding:'4px 12px',borderRadius:16,border:`1px solid ${period===v?'var(--accent)':'var(--border)'}`,
            background:period===v?'var(--accent-l)':'var(--surface)',
            color:period===v?'var(--accent)':'var(--text3)',
            fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
          }}>{l}</button>
        ))}
        <button onClick={()=>setShowL2(s=>!s)} style={{
          marginLeft:'auto',padding:'4px 12px',borderRadius:16,
          border:`1px solid ${showL2?'var(--accent)':'var(--border)'}`,
          background:showL2?'var(--accent-l)':'var(--surface)',
          color:showL2?'var(--accent)':'var(--text3)',
          fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
        }}>{showL2?'▾ L2 on':'▸ L2 off'}</button>
      </div>

      {/* Grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12,marginBottom:16}}>
        {catData.map(d=>(
          <div key={d.name}
            onClick={()=>setSelected(selected===d.name?null:d.name)}
            style={{
              background:'var(--surface)',border:`1px solid ${selected===d.name?'var(--accent)':'var(--border)'}`,
              borderRadius:'var(--radius)',padding:'14px 16px',cursor:'pointer',
              boxShadow:selected===d.name?'0 0 0 2px var(--accent-l)':'none',
              transition:'all .15s',
            }}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <span style={{width:10,height:10,borderRadius:'50%',background:d.color,flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700}}>{d.name}</span>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:16,fontWeight:800,color:d.color}}>€ {fmtIT(d.total, 0)}</div>
                <div style={{fontSize:10,color:'var(--text3)'}}>Ø € {fmtIT(d.avg, 0)}/mese</div>
              </div>
            </div>
            {/* Sub-category chips — only when L2 toggle is on */}
            {showL2 && d.sub.length > 0 && (
              <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:8}}>
                {d.sub.slice(0,4).map(s=>(
                  <span key={s} style={{fontSize:10,padding:'1px 6px',borderRadius:20,
                    background:d.color+'14',color:d.color,border:`1px solid ${d.color}28`}}>{s}</span>
                ))}
              </div>
            )}
            {/* Mini sparkline */}
            <ResponsiveContainer width="100%" height={45}>
              <BarChart data={d.byMonth} margin={{top:0,right:0,left:0,bottom:0}}>
                <Bar dataKey="v" fill={d.color} radius={[2,2,0,0]} maxBarSize={12}/>
                <Tooltip
                  formatter={v=>[`€ ${fmtIT(v, 0)}`]}
                  contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px'}}
                  cursor={{fill:'var(--surface2)'}}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {/* Drill-down detail */}
      {selCat && (
        <div className="card" style={{padding:'18px 20px',border:`1px solid ${selCat.color}`,borderRadius:'var(--radius)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:12,height:12,borderRadius:'50%',background:selCat.color}}/>
              <span style={{fontSize:16,fontWeight:700}}>{selCat.name} — Dettaglio</span>
            </div>
            <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>setSelected(null)}>✕ Chiudi</button>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={selCat.byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={55}
                tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
              <Tooltip formatter={v=>[`€ ${fmtIT(v, 0)}`,selCat.name]}
                contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
              <Bar dataKey="v" fill={selCat.color} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Top Merchants ─────────────────────────────────────────
function TopMerchants({ transactions }) {
  const [n, setN] = useState(10)
  const now = new Date()
  const thisYear = now.getFullYear().toString()

  const merchants = useMemo(() => {
    const map = {}
    transactions
      .filter(t => !t.excluded && t.amount < 0 && (t._effDate||(t._effDate||t.date||'')).startsWith(thisYear) && (t.merchant||t.descAI))
      .forEach(t => {
        const key = t.merchant || t.descAI || '—'
        if (!map[key]) map[key] = { name:key, total:0, count:0, cat1:t.cat1, city:t.city }
        map[key].total += Math.abs(t.amount)
        map[key].count++
      })
    return Object.values(map).sort((a,b)=>b.total-a.total).slice(0, n)
  }, [transactions, n])

  const maxTotal = merchants[0]?.total || 1

  return (
    <div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {merchants.map((m,i)=>{
          const color = CATS[m.cat1]?.color || '#888'
          return (
            <div key={m.name} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:12,fontWeight:700,color:'var(--text3)',minWidth:20,textAlign:'right'}}>{i+1}</span>
              <span style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name}</div>
                <div style={{fontSize:10,color:'var(--text3)'}}>{m.cat1}{m.city?` · ${m.city}`:''} · {m.count} tx</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontSize:13,fontWeight:700,color:color}}>€ {fmtIT(m.total, 0)}</div>
                <div style={{height:3,borderRadius:2,background:'var(--border)',width:80,marginTop:3}}>
                  <div style={{height:'100%',borderRadius:2,background:color,width:Math.round(m.total/maxTotal*100)+'%'}}/>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {merchants.length >= n && (
        <button className="btn btn-ghost" style={{fontSize:12,marginTop:10,width:'100%'}} onClick={()=>setN(n+10)}>
          Mostra altri ▼
        </button>
      )}
    </div>
  )
}

// ── Location Tab ──────────────────────────────────────────
function LocationTab({ transactions }) {
  const cityOverrides        = useStore(s => s.cityOverrides)
  const setCityOverride      = useStore(s => s.setCityOverride)
  const locationExclusions   = useStore(s => s.locationExclusions)
  const addLocationExclusion = useStore(s => s.addLocationExclusion)
  const removeLocationExclusion = useStore(s => s.removeLocationExclusion)

  const [subTab, setSubTab]       = useState('city')      // 'city' | 'noloc'
  const [yearFilter, setYearFilter] = useState('all')
  const [selectedCity, setSelectedCity] = useState(null)
  const [selectedMerchant, setSelectedMerchant] = useState(null)
  const [editingMerchant, setEditingMerchant] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savedFlash, setSavedFlash] = useState(null)
  const [newExclusion, setNewExclusion] = useState('')
  const [showExclusions, setShowExclusions] = useState(false)
  const editRef = useRef(null)
  const exclInputRef = useRef(null)

  // Collect available years
  const years = useMemo(() => {
    const ys = new Set()
    transactions.forEach(t => { if (t.date) ys.add((t._effDate||t.date).slice(0,4)) })
    return [...ys].sort((a,b)=>b-a)
  }, [transactions])

  // Check if transaction is excluded from location views
  const isExcluded = (t) => {
    if (!locationExclusions.length) return false
    const name = (t.merchant || t.descAI || t.description || '').toLowerCase()
    return locationExclusions.some(ex => name.includes(ex.toLowerCase()))
  }

  // Apply city overrides when reading merchant city
  const resolveCity = (t) => {
    const merchant = t.merchant || t.descAI
    if (merchant && cityOverrides[merchant]) return cityOverrides[merchant]
    return t.city || null
  }

  // Build city ranking
  const cityRanking = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (t.excluded || t.amount >= 0) return false
      if (yearFilter !== 'all' && !(t._effDate||(t._effDate||t.date||'')).startsWith(yearFilter)) return false
      if (isExcluded(t)) return false
      return true
    })

    const map = {}
    filtered.forEach(t => {
      const city = resolveCity(t)
      if (!city) return
      if (!map[city]) map[city] = { city, total: 0, count: 0, txIds: new Set() }
      map[city].total += Math.abs(t.amount)
      map[city].count++
    })

    return Object.values(map)
      .sort((a,b) => b.total - a.total)
      .map((d,i) => ({ ...d, rank: i+1 }))
  }, [transactions, yearFilter, cityOverrides])

  // Merchants with NO city (and not excluded)
  const noLocationMerchants = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (t.excluded || t.amount >= 0) return false
      if (yearFilter !== 'all' && !(t._effDate||(t._effDate||t.date||'')).startsWith(yearFilter)) return false
      if (isExcluded(t)) return false
      return !resolveCity(t)
    })
    const map = {}
    filtered.forEach(t => {
      const key = t.merchant || t.descAI || t.description || '—'
      if (!map[key]) map[key] = { name:key, total:0, count:0, cat1:t.cat1, txs:[] }
      map[key].total += Math.abs(t.amount)
      map[key].count++
      map[key].txs.push(t)
    })
    return Object.values(map).sort((a,b) => b.total - a.total)
  }, [transactions, yearFilter, locationExclusions, cityOverrides])

  // Merchants in selected city
  const cityMerchants = useMemo(() => {
    if (!selectedCity) return []
    const filtered = transactions.filter(t => {
      if (t.excluded || t.amount >= 0) return false
      if (yearFilter !== 'all' && !(t._effDate||(t._effDate||t.date||'')).startsWith(yearFilter)) return false
      if (isExcluded(t)) return false
      return resolveCity(t) === selectedCity
    })
    const map = {}
    filtered.forEach(t => {
      const key = t.merchant || t.descAI || '—'
      if (!map[key]) map[key] = { name:key, total:0, count:0, cat1:t.cat1, cityFromTx: t.city }
      map[key].total += Math.abs(t.amount)
      map[key].count++
    })
    return Object.values(map).sort((a,b) => b.total - a.total)
  }, [transactions, selectedCity, yearFilter, cityOverrides])

  // Transactions for selected merchant in selected city
  const merchantTxs = useMemo(() => {
    if (!selectedCity || !selectedMerchant) return []
    return transactions
      .filter(t => {
        if (t.excluded || t.amount >= 0) return false
        if (yearFilter !== 'all' && !(t._effDate||(t._effDate||t.date||'')).startsWith(yearFilter)) return false
        if (resolveCity(t) !== selectedCity) return false
        return (t.merchant || t.descAI || '—') === selectedMerchant
      })
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  }, [transactions, selectedCity, selectedMerchant, yearFilter, cityOverrides])

  const maxTotal = cityRanking[0]?.total || 1

  function startEdit(merchant, currentCity) {
    setEditingMerchant(merchant)
    setEditValue(currentCity || '')
    setTimeout(() => editRef.current?.focus(), 50)
  }

  function saveEdit(merchant) {
    const city = editValue.trim()
    if (city) {
      setCityOverride(merchant, city)
      setSavedFlash(merchant)
      setTimeout(() => setSavedFlash(null), 1800)
    }
    setEditingMerchant(null)
  }

  const MEDAL = ['🥇','🥈','🥉']

  function addExclusion() {
    const v = newExclusion.trim()
    if (!v) return
    addLocationExclusion(v)
    setNewExclusion('')
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>

      {/* Top bar: sub-tabs + year filter + exclusions toggle */}
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        {/* Sub-tabs */}
        {[['city','📍 Per Città'],['noloc','📭 Senza Città']].map(([v,l])=>(
          <button key={v} onClick={()=>{ setSubTab(v); setSelectedCity(null); setSelectedMerchant(null) }} style={{
            padding:'5px 14px',borderRadius:16,
            border:`1px solid ${subTab===v?'var(--accent)':'var(--border)'}`,
            background:subTab===v?'var(--accent)':'var(--surface)',
            color:subTab===v?'#fff':'var(--text2)',
            fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)',
          }}>{l}{v==='noloc'&&noLocationMerchants.length>0?<span style={{marginLeft:5,background:'rgba(255,255,255,0.25)',borderRadius:10,padding:'0 5px',fontSize:10}}>{noLocationMerchants.length}</span>:null}</button>
        ))}
        <div style={{flex:1}}/>
        {/* Year filter */}
        {['all',...years].map(y=>(
          <button key={y} onClick={()=>{ setYearFilter(y); setSelectedCity(null); setSelectedMerchant(null) }} style={{
            padding:'4px 12px',borderRadius:16,
            border:`1px solid ${yearFilter===y?'var(--accent)':'var(--border)'}`,
            background:yearFilter===y?'var(--accent-l)':'var(--surface)',
            color:yearFilter===y?'var(--accent)':'var(--text3)',
            fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
          }}>{y==='all'?'Tutti':y}</button>
        ))}
        {/* Exclusions toggle */}
        <button onClick={()=>setShowExclusions(v=>!v)} style={{
          padding:'4px 12px',borderRadius:16,
          border:`1px solid ${showExclusions?'var(--accent)':'var(--border)'}`,
          background:showExclusions?'var(--accent-l)':'var(--surface)',
          color:showExclusions?'var(--accent)':'var(--text3)',
          fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
          display:'flex',alignItems:'center',gap:5,
        }}>
          🚫 Filtri {locationExclusions.length>0&&<span style={{background:'var(--accent)',color:'#fff',borderRadius:10,padding:'0 5px',fontSize:10}}>{locationExclusions.length}</span>}
        </button>
      </div>

      {/* Exclusions panel */}
      {showExclusions && (
        <div style={{
          background:'var(--surface2)',border:'1px solid var(--border)',
          borderRadius:'var(--radius)',padding:'14px 16px',
        }}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>
            🚫 Filtri esclusione — non compaiono nella classifica né in "Senza Città"
          </div>
          {/* Input */}
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <input
              ref={exclInputRef}
              value={newExclusion}
              onChange={e=>setNewExclusion(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') addExclusion() }}
              placeholder="Es: paypal, bonifico, commissioni..."
              style={{
                flex:1,padding:'6px 10px',borderRadius:6,
                border:'1px solid var(--border)',
                background:'var(--surface)',color:'var(--text1)',
                fontSize:12,fontFamily:'var(--font-sans)',outline:'none',
              }}
            />
            <button onClick={addExclusion} style={{
              padding:'6px 14px',borderRadius:6,
              background:'var(--accent)',color:'#fff',
              border:'none',cursor:'pointer',fontSize:12,fontWeight:700,
              fontFamily:'var(--font-sans)',
            }}>+ Aggiungi</button>
          </div>
          {/* Current exclusions */}
          {locationExclusions.length === 0 ? (
            <div style={{fontSize:12,color:'var(--text3)'}}>Nessun filtro configurato.</div>
          ) : (
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {locationExclusions.map(ex=>(
                <div key={ex} style={{
                  display:'inline-flex',alignItems:'center',gap:5,
                  padding:'3px 10px',borderRadius:20,
                  background:'var(--surface)',border:'1px solid var(--border)',
                  fontSize:12,
                }}>
                  <span>{ex}</span>
                  <button onClick={()=>removeLocationExclusion(ex)} style={{
                    background:'none',border:'none',cursor:'pointer',
                    color:'var(--text3)',fontSize:14,lineHeight:1,padding:0,
                    display:'flex',alignItems:'center',
                  }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main content area */}
      {subTab === 'noloc' ? (
        /* ── No Location view ── */
        <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
          <div style={{flex:1,minWidth:0}}>
            {noLocationMerchants.length === 0 ? (
              <div style={{textAlign:'center',padding:40,color:'var(--text3)',fontSize:13}}>
                Tutte le transazioni hanno una città assegnata 🎉
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:0}}>
                {noLocationMerchants.map((m,i) => {
                  const isSelected = selectedMerchant === m.name
                  const color = CATS[m.cat1]?.color || '#888'
                  return (
                    <div
                      key={m.name}
                      onClick={()=>setSelectedMerchant(isSelected?null:m.name)}
                      style={{
                        display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                        cursor:'pointer',borderRadius:'var(--radius)',
                        background:isSelected?'var(--accent-l)':'transparent',
                        border:`1px solid ${isSelected?'var(--accent)':'transparent'}`,
                        marginBottom:2,transition:'all .12s',
                      }}
                    >
                      <span style={{fontSize:12,fontWeight:700,color:'var(--text3)',minWidth:24,textAlign:'right',fontFamily:'var(--font-mono)'}}>{i+1}</span>
                      <span style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:isSelected?'var(--accent)':'var(--text1)'}}>
                          {m.name}
                        </div>
                        <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>
                          {m.cat1} · {m.count} tx
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:isSelected?'var(--accent)':color}}>€ {fmtIT(m.total,0)}</div>
                      </div>
                      <button
                        onClick={e=>{ e.stopPropagation(); addLocationExclusion(m.name); setSelectedMerchant(null) }}
                        title="Escludi da Location"
                        style={{
                          background:'none',border:'1px solid var(--border)',
                          borderRadius:6,cursor:'pointer',color:'var(--text3)',
                          fontSize:11,padding:'2px 8px',flexShrink:0,
                          fontFamily:'var(--font-sans)',
                        }}
                      >🚫 Escludi</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tx detail for selected no-location merchant */}
          {selectedMerchant && (()=>{
            const m = noLocationMerchants.find(m=>m.name===selectedMerchant)
            if (!m) return null
            const txs = m.txs.slice().sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
            return (
              <div style={{
                width:320,flexShrink:0,
                background:'var(--surface)',border:'1px solid var(--border)',
                borderRadius:'var(--radius)',overflow:'hidden',
                position:'sticky',top:80,
              }}>
                <div style={{
                  padding:'14px 16px',borderBottom:'1px solid var(--border)',
                  background:'var(--surface2)',display:'flex',alignItems:'center',justifyContent:'space-between',
                }}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:230}}>
                      🧾 {m.name}
                    </div>
                    <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                      {txs.length} transazioni · € {fmtIT(m.total,0)}
                    </div>
                  </div>
                  <button onClick={()=>setSelectedMerchant(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:16,padding:'2px 6px'}}>✕</button>
                </div>
                <div style={{maxHeight:480,overflowY:'auto'}}>
                  {txs.map(t=>(
                    <div key={t.txId} style={{padding:'9px 14px',borderBottom:'1px solid var(--border)'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:3}}>
                        <span style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',flexShrink:0}}>{t._effDate||t.date}</span>
                        <span style={{fontSize:13,fontWeight:700,color:CATS[t.cat1]?.color||'var(--accent)',flexShrink:0}}>− € {fmtIT(Math.abs(t.amount),2)}</span>
                      </div>
                      <div style={{fontSize:11,color:'var(--text2)',lineHeight:1.4,wordBreak:'break-word'}}>{t.description}</div>
                      {t.cat1&&<div style={{marginTop:4,display:'flex',alignItems:'center',gap:4}}>
                        <span style={{width:6,height:6,borderRadius:'50%',background:CATS[t.cat1]?.color||'#888',display:'inline-block'}}/>
                        <span style={{fontSize:10,color:'var(--text3)'}}>{t.cat1}{t.cat2?` · ${t.cat2}`:''}</span>
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      ) : (
        /* ── City ranking view ── */
        <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>

      {/* Left: ranking */}
      <div style={{flex:1,minWidth:0}}>

        {/* City list */}
        {cityRanking.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'var(--text3)',fontSize:13}}>
            Nessuna transazione con città per il periodo selezionato
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            {cityRanking.map((c,i) => {
              const isSelected = selectedCity === c.city
              return (
                <div
                  key={c.city}
                  onClick={()=>{ setSelectedCity(isSelected ? null : c.city); setSelectedMerchant(null) }}
                  style={{
                    display:'flex',alignItems:'center',gap:12,padding:'11px 14px',
                    cursor:'pointer',borderRadius:'var(--radius)',
                    background:isSelected?'var(--accent-l)':'transparent',
                    border:`1px solid ${isSelected?'var(--accent)':'transparent'}`,
                    marginBottom:2,transition:'all .12s',
                  }}
                >
                  <span style={{fontSize:i<3?17:13,minWidth:28,textAlign:'center'}}>
                    {i < 3 ? MEDAL[i] : <span style={{color:'var(--text3)',fontWeight:700,fontFamily:'var(--font-mono)'}}>{c.rank}</span>}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:isSelected?'var(--accent)':'var(--text1)'}}>
                      {c.city}
                    </div>
                    <div style={{fontSize:11,color:'var(--text3)',marginTop:1}}>
                      {c.count} transazioni
                    </div>
                    {/* Bar */}
                    <div style={{height:3,borderRadius:2,background:'var(--border)',marginTop:5}}>
                      <div style={{
                        height:'100%',borderRadius:2,
                        background:isSelected?'var(--accent)':'var(--text3)',
                        width:Math.round(c.total/maxTotal*100)+'%',
                        transition:'width .3s',
                      }}/>
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:15,fontWeight:800,color:isSelected?'var(--accent)':'var(--text1)'}}>
                      € {fmtIT(c.total,0)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right: merchant detail panel */}
      {selectedCity && (
        <div style={{
          width:340,flexShrink:0,
          background:'var(--surface)',
          border:'1px solid var(--border)',
          borderRadius:'var(--radius)',
          overflow:'hidden',
          position:'sticky',top:80,
        }}>
          {/* Panel header */}
          <div style={{
            padding:'14px 16px',
            borderBottom:'1px solid var(--border)',
            background:'var(--surface2)',
            display:'flex',alignItems:'center',justifyContent:'space-between',
          }}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>📍 {selectedCity}</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{cityMerchants.length} merchant · € {fmtIT(cityMerchants.reduce((s,m)=>s+m.total,0),0)}</div>
            </div>
            <button onClick={()=>{ setSelectedCity(null); setSelectedMerchant(null) }} style={{
              background:'none',border:'none',cursor:'pointer',
              color:'var(--text3)',fontSize:16,padding:'2px 6px',
            }}>✕</button>
          </div>

          {/* Merchant list */}
          <div style={{maxHeight:520,overflowY:'auto'}}>
            {cityMerchants.map(m => {
              const isEditing   = editingMerchant === m.name
              const isSelected  = selectedMerchant === m.name
              const override    = cityOverrides[m.name]
              const justSaved   = savedFlash === m.name

              return (
                <div key={m.name} style={{
                  padding:'10px 14px',
                  borderBottom:'1px solid var(--border)',
                  background: justSaved ? 'var(--accent-l)' : isSelected ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                  transition:'background .3s',
                  cursor:'pointer',
                }}>
                  <div
                    style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}
                    onClick={e => {
                      // Don't toggle merchant if clicking the edit button
                      if (e.target.closest('button')) return
                      setSelectedMerchant(isSelected ? null : m.name)
                    }}
                  >
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:isSelected?'var(--accent)':'var(--text1)'}}>{m.name}</div>
                      <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>
                        {m.cat1} · {m.count} tx · € {fmtIT(m.total,0)}
                      </div>
                    </div>
                    <button
                      onClick={e=>{ e.stopPropagation(); isEditing ? setEditingMerchant(null) : startEdit(m.name, override || selectedCity) }}
                      style={{
                        background:'none',border:`1px solid var(--border)`,
                        borderRadius:6,cursor:'pointer',
                        color:'var(--text3)',fontSize:11,
                        padding:'2px 8px',flexShrink:0,
                        fontFamily:'var(--font-sans)',
                      }}
                    >
                      {isEditing ? 'Annulla' : '✏️ Città'}
                    </button>
                  </div>

                  {/* Override badge */}
                  {override && !isEditing && (
                    <div style={{
                      marginTop:5,display:'inline-flex',alignItems:'center',gap:4,
                      padding:'2px 7px',borderRadius:20,
                      background:'var(--accent-l)',border:'1px solid var(--accent)',
                      fontSize:10,color:'var(--accent)',fontWeight:600,
                    }}>
                      🔒 {override}
                    </div>
                  )}

                  {/* Edit inline */}
                  {isEditing && (
                    <div style={{marginTop:8,display:'flex',gap:6}}>
                      <input
                        ref={editRef}
                        value={editValue}
                        onChange={e=>setEditValue(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter') saveEdit(m.name); if(e.key==='Escape') setEditingMerchant(null) }}
                        placeholder="Nome città..."
                        style={{
                          flex:1,padding:'5px 9px',borderRadius:6,
                          border:'1px solid var(--accent)',
                          background:'var(--surface)',color:'var(--text1)',
                          fontSize:12,fontFamily:'var(--font-sans)',outline:'none',
                        }}
                      />
                      <button
                        onClick={()=>saveEdit(m.name)}
                        style={{
                          padding:'5px 12px',borderRadius:6,
                          background:'var(--accent)',color:'#fff',
                          border:'none',cursor:'pointer',
                          fontSize:12,fontWeight:700,
                          fontFamily:'var(--font-sans)',
                        }}
                      >Salva</button>
                    </div>
                  )}

                  {justSaved && (
                    <div style={{marginTop:4,fontSize:10,color:'var(--accent)',fontWeight:600}}>✓ Salvato</div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer note */}
          <div style={{
            padding:'10px 14px',
            borderTop:'1px solid var(--border)',
            background:'var(--surface2)',
            fontSize:10,color:'var(--text3)',lineHeight:1.4,
          }}>
            🔒 Le città salvate sono permanenti e sincronizzate su tutti i dispositivi.
          </div>
        </div>
      )}

      {/* Third panel: transaction list for selected merchant */}
      {selectedMerchant && merchantTxs.length > 0 && (
        <div style={{
          width:320,flexShrink:0,
          background:'var(--surface)',
          border:'1px solid var(--border)',
          borderRadius:'var(--radius)',
          overflow:'hidden',
          position:'sticky',top:80,
        }}>
          {/* Header */}
          <div style={{
            padding:'14px 16px',
            borderBottom:'1px solid var(--border)',
            background:'var(--surface2)',
            display:'flex',alignItems:'center',justifyContent:'space-between',
          }}>
            <div>
              <div style={{fontSize:13,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:230}}>
                🧾 {selectedMerchant}
              </div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                {merchantTxs.length} transazioni · € {fmtIT(merchantTxs.reduce((s,t)=>s+Math.abs(t.amount),0),0)}
              </div>
            </div>
            <button onClick={()=>setSelectedMerchant(null)} style={{
              background:'none',border:'none',cursor:'pointer',
              color:'var(--text3)',fontSize:16,padding:'2px 6px',flexShrink:0,
            }}>✕</button>
          </div>

          {/* Transaction rows */}
          <div style={{maxHeight:480,overflowY:'auto'}}>
            {merchantTxs.map(t => (
              <div key={t.txId} style={{
                padding:'9px 14px',
                borderBottom:'1px solid var(--border)',
              }}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:3}}>
                  <span style={{
                    fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',
                    flexShrink:0,
                  }}>{t._effDate||t.date}</span>
                  <span style={{
                    fontSize:13,fontWeight:700,
                    color: CATS[t.cat1]?.color || 'var(--accent)',
                    flexShrink:0,
                  }}>
                    − € {fmtIT(Math.abs(t.amount),2)}
                  </span>
                </div>
                <div style={{
                  fontSize:11,color:'var(--text2)',
                  lineHeight:1.4,
                  wordBreak:'break-word',
                }}>
                  {t.description}
                </div>
                {t.cat1 && (
                  <div style={{marginTop:4,display:'flex',alignItems:'center',gap:4}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:CATS[t.cat1]?.color||'#888',display:'inline-block',flexShrink:0}}/>
                    <span style={{fontSize:10,color:'var(--text3)'}}>{t.cat1}{t.cat2?` · ${t.cat2}`:''}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  )
}

// ── Tab pill ──────────────────────────────────────────────
function TabPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'6px 18px',borderRadius:20,
      border:`1px solid ${active?'var(--accent)':'var(--border)'}`,
      background:active?'var(--accent)':'var(--surface)',
      color:active?'#fff':'var(--text2)',
      fontSize:13,fontWeight:700,cursor:'pointer',
      fontFamily:'var(--font-sans)',transition:'all .15s',
    }}>{label}</button>
  )
}

// ── Draggable block wrapper ───────────────────────────────
function DragBlock({ id, dragState, onDragStart, onDragOver, onDrop, children }) {
  const isOver    = dragState.over === id && dragState.dragging !== id
  const isDragging = dragState.dragging === id
  const [hover, setHover] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(id) }}
      onDrop={() => onDrop(id)}
      style={{
        borderRadius:'var(--radius)',
        outline: isOver ? '2px dashed var(--accent)' : '2px solid transparent',
        opacity: isDragging ? 0.45 : 1,
        transition:'opacity .15s, outline .1s',
      }}
    >
      {/* Drag handle bar — only this is draggable */}
      <div
        draggable
        onDragStart={e => { e.stopPropagation(); onDragStart(id) }}
        onDragEnd={() => onDragStart(null)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          height:22, cursor:'grab', userSelect:'none',
          background: hover ? 'var(--surface2)' : 'transparent',
          borderRadius:'var(--radius) var(--radius) 0 0',
          borderBottom: hover ? '1px solid var(--border)' : '1px solid transparent',
          transition:'background .15s, border-color .15s',
          marginBottom:0,
        }}
      >
        <span style={{
          fontSize:11, color: hover ? 'var(--text3)' : 'transparent',
          letterSpacing:3, transition:'color .15s', fontWeight:700,
        }}>· · · · · ·</span>
        {hover && <span style={{fontSize:10, color:'var(--text3)', fontStyle:'italic'}}>trascina per spostare</span>}
        <span style={{
          fontSize:11, color: hover ? 'var(--text3)' : 'transparent',
          letterSpacing:3, transition:'color .15s', fontWeight:700,
        }}>· · · · · ·</span>
      </div>
      {children}
    </div>
  )
}

const DEFAULT_BLOCK_ORDER = ['saldo','heatmap','yearscatter','ranking','catreport','merchants']

// ── Main page ─────────────────────────────────────────────
export default function AnalyticsPage() {
  const transactions = useStore(s => s.transactions)
  const [tab, setTab] = useState('overview')
  const [blockOrder, setBlockOrder] = useState(DEFAULT_BLOCK_ORDER)
  const [dragState, setDragState] = useState({ dragging: null, over: null })
  const isEmpty = transactions.length === 0

  function handleDragStart(id) {
    setDragState(s => ({ ...s, dragging: id }))
  }
  function handleDragOver(id) {
    setDragState(s => s.over === id ? s : { ...s, over: id })
  }
  function handleDrop(targetId) {
    setDragState({ dragging: null, over: null })
    const from = dragState.dragging
    if (!from || from === targetId) return
    setBlockOrder(order => {
      const next = [...order]
      const fi = next.indexOf(from)
      const ti = next.indexOf(targetId)
      next.splice(fi, 1)
      next.splice(ti, 0, from)
      return next
    })
  }

  const blocks = {
    saldo: (
      <div className="card analytics-card">
        <div className="analytics-card-title">
          <span>📈 Andamento Saldo Conto</span>
        </div>
        <SaldoChart transactions={transactions}/>
      </div>
    ),
    heatmap: (
      <div className="card analytics-card">
        <div className="analytics-card-title">
          <span>🗓 Mappa Spese {new Date().getFullYear()}</span>
          <span style={{fontSize:11,color:'var(--text3)'}}>Ogni cella = un giorno</span>
        </div>
        <SpendingHeatmap transactions={transactions}/>
      </div>
    ),
    yearscatter: (
      <div className="analytics-grid-2">
        <div className="card analytics-card">
          <div className="analytics-card-title">
            <span>📅 Anno corrente vs anno precedente</span>
          </div>
          <YearComparison transactions={transactions}/>
        </div>
        <div className="card analytics-card">
          <div className="analytics-card-title">
            <span>🎯 Frequenza vs Importo medio</span>
            <span style={{fontSize:11,color:'var(--text3)'}}>Per categoria · YTD</span>
          </div>
          <CategoryScatter transactions={transactions}/>
        </div>
      </div>
    ),
    ranking: (
      <div className="card analytics-card">
        <div className="analytics-card-title">
          <span>🏆 Top 3 categorie per mese</span>
          <span style={{fontSize:11,color:'var(--text3)'}}>Ultimi 6 mesi</span>
        </div>
        <CategoryRanking transactions={transactions}/>
      </div>
    ),
    catreport: (
      <div className="card analytics-card">
        <div className="analytics-card-title" style={{marginBottom:0}}>
          <span>📂 Spese per Categoria</span>
          <span style={{fontSize:11,color:'var(--text3)'}}>Clicca una categoria per il dettaglio</span>
        </div>
        <CategoryReport transactions={transactions}/>
      </div>
    ),
    merchants: (
      <div className="card analytics-card">
        <div className="analytics-card-title">
          <span>🏪 Top Merchant per Spesa</span>
          <span style={{fontSize:11,color:'var(--text3)'}}>Anno corrente</span>
        </div>
        <TopMerchants transactions={transactions}/>
      </div>
    ),
  }

  return (
    <div className="analytics-page">
      <div style={{marginBottom:20}}>
        <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600}}>📊 Analytics Avanzate</h1>
        <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>Grafici e analisi dettagliate dei tuoi dati</div>
      </div>

      {/* Tab switcher */}
      <div style={{display:'flex',gap:8,marginBottom:24}}>
        <TabPill label="📊 Overview"  active={tab==='overview'}  onClick={()=>setTab('overview')}/>
        <TabPill label="📍 Location"  active={tab==='location'}  onClick={()=>setTab('location')}/>
      </div>

      {isEmpty ? (
        <div style={{textAlign:'center',padding:'60px 24px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
          <div style={{fontSize:48,marginBottom:16}}>📊</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>Nessun dato disponibile</div>
          <div style={{fontSize:13,color:'var(--text3)'}}>Importa le transazioni per vedere le analytics avanzate.</div>
        </div>
      ) : tab === 'location' ? (
        <div className="card analytics-card">
          <div className="analytics-card-title" style={{marginBottom:16}}>
            <span>📍 Classifica per Città</span>
            <span style={{fontSize:11,color:'var(--text3)'}}>Clicca una città per vedere i merchant</span>
          </div>
          <LocationTab transactions={transactions}/>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          {blockOrder.map(id => (
            <DragBlock key={id} id={id} dragState={dragState}
              onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}>
              {blocks[id]}
            </DragBlock>
          ))}
          {/* Reset order */}
          {JSON.stringify(blockOrder) !== JSON.stringify(DEFAULT_BLOCK_ORDER) && (
            <button onClick={()=>setBlockOrder(DEFAULT_BLOCK_ORDER)}
              style={{alignSelf:'flex-end',padding:'4px 12px',borderRadius:12,fontSize:11,
                border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text3)',cursor:'pointer'}}>
              ↺ Ripristina ordine
            </button>
          )}
        </div>
      )}
    </div>
  )
}
