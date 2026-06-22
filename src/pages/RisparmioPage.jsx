import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useFinancials } from '../hooks/useFinancials'
import { SavingsChart } from '../components/Charts'
import { getMergedCats, getMergedCatNames } from '../data/categories'
import { fmtIT } from '../utils/format'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

// ── helpers ───────────────────────────────────────────────
function ymOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

function monthsBack(n) {
  const now = new Date()
  return Array.from({length:n},(_,i)=>{
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
    return ymOf(d)
  }).reverse()
}

const MONTHS_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function ymLabel(ym) {
  const [,m] = ym.split('-').map(Number)
  return MONTHS_IT[m-1]
}

function savColor(n) {
  if (n===null) return 'var(--text3)'
  return n>=0 ? 'var(--green)' : 'var(--red)'
}
function fmtSav(n) {
  if (n===null) return '—'
  return (n>=0?'+':'-')+'€ '+fmtIT(Math.abs(n),0)
}

// ── What-If selector modal ────────────────────────────────
// excluded = Set of "Cat L1" or "Cat L1 > Sub L2" strings
function WhatIfModal({ excluded, onApply, onClose, customCats }) {
  const mergedCats = getMergedCats(customCats)
  const [draft, setDraft] = useState(new Set(excluded))
  const [expanded, setExpanded] = useState(new Set())

  function toggle(key) {
    setDraft(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function toggleExpand(cat) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }
  // Check if all L2 subs of a cat are selected
  function allSubsOn(cat) {
    const subs = mergedCats[cat]?.sub || []
    return subs.length > 0 && subs.every(s => draft.has(`${cat} > ${s}`))
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',display:'flex',
      alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'28px 32px',maxWidth:500,width:'92%',
        maxHeight:'82vh',display:'flex',flexDirection:'column',boxShadow:'0 16px 48px rgba(0,0,0,.2)'}}>

        <div style={{fontSize:17,fontWeight:800,marginBottom:4}}>🔮 Simulazione What-If</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:18}}>
          Seleziona categorie L1 (intera categoria) o singole sotto-categorie L2 da escludere.
        </div>

        <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:4}}>
          {Object.entries(mergedCats).map(([cat, data])=>{
            const color = data.color || '#888'
            const subs  = data.sub || []
            const onL1  = draft.has(cat)
            const exp   = expanded.has(cat)
            const someSub = subs.some(s => draft.has(`${cat} > ${s}`))

            return (
              <div key={cat}>
                {/* L1 row */}
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                  borderRadius:8,border:'1px solid var(--border)',
                  background:onL1?'var(--accent-l)':someSub?'var(--surface2)':'var(--surface)'}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:color,flexShrink:0}}/>
                  <label style={{display:'flex',alignItems:'center',gap:8,flex:1,cursor:'pointer'}}>
                    <input type="checkbox" checked={onL1} onChange={()=>toggle(cat)}
                      style={{width:14,height:14,accentColor:'var(--accent)'}}/>
                    <span style={{fontSize:13,fontWeight:600}}>{cat}</span>
                    {someSub && !onL1 && <span style={{fontSize:10,color:'var(--accent)',fontWeight:700}}>(parziale)</span>}
                  </label>
                  {subs.length > 0 && (
                    <button onClick={()=>toggleExpand(cat)}
                      style={{border:'none',background:'transparent',cursor:'pointer',
                        color:'var(--text3)',fontSize:12,padding:'0 4px',
                        fontFamily:'var(--font-sans)'}}>
                      {exp ? '▲' : '▼'} L2
                    </button>
                  )}
                </div>
                {/* L2 subcategories */}
                {exp && subs.length > 0 && (
                  <div style={{marginLeft:20,marginTop:3,display:'flex',flexDirection:'column',gap:3}}>
                    {subs.map(sub=>{
                      const key = `${cat} > ${sub}`
                      const on  = draft.has(key) || onL1
                      return (
                        <label key={sub} style={{display:'flex',alignItems:'center',gap:8,
                          padding:'5px 10px',borderRadius:6,cursor:onL1?'not-allowed':'pointer',
                          border:'1px solid var(--border)',
                          background:on?'var(--accent-l)':'var(--surface)',opacity:onL1?.6:1}}>
                          <input type="checkbox" checked={on} disabled={onL1}
                            onChange={()=>toggle(key)}
                            style={{width:13,height:13,accentColor:'var(--accent)'}}/>
                          <div style={{width:6,height:6,borderRadius:'50%',background:color,flexShrink:0}}/>
                          <span style={{fontSize:12}}>{sub}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
          <button className="btn btn-ghost" style={{fontSize:13}} onClick={()=>{setDraft(new Set());onApply(new Set())}}>
            Azzera
          </button>
          <button className="btn btn-ghost" style={{fontSize:13}} onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" style={{fontSize:13}}
            onClick={()=>{onApply(draft);onClose()}}>
            ✓ Applica simulazione
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Savings Insights ────────────────────────────────────
function SavingsInsights({ transactions, excludedCats }) {
  const [insights, setInsights] = useState(null)

  useEffect(()=>{
    if (!transactions.length) return
    const now   = new Date()
    const thisYM = ymOf(now)
    const prevYM = ymOf(new Date(now.getFullYear(), now.getMonth()-1, 1))

    function monthExp(ym) {
      return transactions.filter(t=>!t.excluded&&t.amount<0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)&&!excludedCats.has(t.cat1))
    }
    function monthInc(ym) {
      return transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym))
    }

    // Per-category spending this vs last month
    const cats = [...new Set(transactions.filter(t=>t.cat1).map(t=>t.cat1))]
    const catStats = cats.map(cat=>{
      const thisAmt = Math.abs(transactions.filter(t=>!t.excluded&&t.amount<0&&(t._effDate||(t._effDate||t.date||'')).startsWith(thisYM)&&t.cat1===cat).reduce((s,t)=>s+t.amount,0))
      const prevAmt = Math.abs(transactions.filter(t=>!t.excluded&&t.amount<0&&(t._effDate||(t._effDate||t.date||'')).startsWith(prevYM)&&t.cat1===cat).reduce((s,t)=>s+t.amount,0))
      const delta   = prevAmt>0 ? Math.round((thisAmt-prevAmt)/prevAmt*100) : null
      const avg6m   = (() => {
        let total=0,count=0
        for(let i=1;i<=6;i++){
          const d=new Date(now.getFullYear(),now.getMonth()-i,1)
          const ym=ymOf(d)
          const a=Math.abs(transactions.filter(t=>!t.excluded&&t.amount<0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)&&t.cat1===cat).reduce((s,t)=>s+t.amount,0))
          if(a>0){total+=a;count++}
        }
        return count>0?Math.round(total/count):null
      })()
      return {cat, thisAmt, prevAmt, delta, avg6m}
    }).filter(c=>c.thisAmt>0||c.prevAmt>0)

    // Categories most saved vs last month (biggest negative delta)
    const savedMost = [...catStats]
      .filter(c=>c.delta!==null&&c.delta<0&&c.prevAmt>10)
      .sort((a,b)=>a.delta-b.delta)
      .slice(0,3)

    // Categories where could save more (spending > avg6m significantly)
    const couldSave = [...catStats]
      .filter(c=>c.avg6m!==null&&c.thisAmt>c.avg6m*1.15&&c.thisAmt>20)
      .sort((a,b)=>(b.thisAmt-b.avg6m)-(a.thisAmt-a.avg6m))
      .slice(0,3)

    // Savings rate this vs prev
    const thisInc = monthInc(thisYM).reduce((s,t)=>s+t.amount,0)
    const thisExp = Math.abs(monthExp(thisYM).reduce((s,t)=>s+t.amount,0))
    const prevInc = monthInc(prevYM).reduce((s,t)=>s+t.amount,0)
    const prevExp = Math.abs(monthExp(prevYM).reduce((s,t)=>s+t.amount,0))
    const thisSavRate = thisInc>0 ? Math.round((thisInc-thisExp)/thisInc*100) : null
    const prevSavRate = prevInc>0 ? Math.round((prevInc-prevExp)/prevInc*100) : null

    setInsights({ savedMost, couldSave, thisSavRate, prevSavRate })
  }, [transactions, excludedCats])

  if (!insights) return null

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>
      {/* Saved most */}
      <div className="card" style={{padding:'18px 20px'}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:7}}>
          <span>🎯</span> Categorie dove hai risparmiato di più
          <span style={{fontSize:11,color:'var(--text3)',fontWeight:400}}>vs mese scorso</span>
        </div>
        {insights.savedMost.length===0
          ? <div style={{fontSize:12,color:'var(--text3)'}}>Nessun risparmio significativo questo mese.</div>
          : insights.savedMost.map(c=>(
            <div key={c.cat} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:13}}>{c.cat}</span>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--green)'}}>
                  {c.delta}% — € {fmtIT(c.prevAmt-c.thisAmt,0)} risparmiato
                </div>
                <div style={{fontSize:11,color:'var(--text3)'}}>
                  € {fmtIT(c.thisAmt,0)} vs € {fmtIT(c.prevAmt,0)} scorso
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Could save more */}
      <div className="card" style={{padding:'18px 20px'}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:7}}>
          <span>💡</span> Dove potresti risparmiare di più
          <span style={{fontSize:11,color:'var(--text3)',fontWeight:400}}>vs media 6m</span>
        </div>
        {insights.couldSave.length===0
          ? <div style={{fontSize:12,color:'var(--text3)'}}>Spese nella norma questo mese.</div>
          : insights.couldSave.map(c=>(
            <div key={c.cat} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:13}}>{c.cat}</span>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--gold)'}}>
                  +€ {fmtIT(c.thisAmt-c.avg6m,0)} sopra media
                </div>
                <div style={{fontSize:11,color:'var(--text3)'}}>
                  € {fmtIT(c.thisAmt,0)} vs media € {fmtIT(c.avg6m,0)}/mese
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function RisparmioPage() {
  const { transactions, customCats } = useStore()
  const { monthly, isEmpty } = useFinancials()

  const [excludedCats, setExcludedCats] = useState(new Set())
  const [showWhatIf,   setShowWhatIf]   = useState(false)
  const [pieMonth, setPieMonth] = useState(null) // ym for pie chart popup

  const now   = new Date()
  const thisYM = ymOf(now)
  const prevD  = new Date(now.getFullYear(), now.getMonth()-1, 1)
  const prevYM = ymOf(prevD)
  const yr     = now.getFullYear()

  // Filtered transactions (excluding what-if L1 or L2 categories)
  const activeTxs = useMemo(()=>
    transactions.filter(t=>{
      if (t.excluded) return false
      if (excludedCats.has(t.cat1)) return false
      if (t.cat2 && excludedCats.has(`${t.cat1} > ${t.cat2}`)) return false
      return true
    })
  , [transactions, excludedCats])

  // Month income/expense helpers on activeTxs
  function mInc(ym)  { return activeTxs.filter(t=>t.amount>0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0) }
  function mExp(ym)  { return Math.abs(activeTxs.filter(t=>t.amount<0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0)) }
  function mSav(ym)  { return mInc(ym) - mExp(ym) }
  function mRate(ym) { const i=mInc(ym); return i>0 ? Math.round(mSav(ym)/i*100) : null }

  // Monthly savings for last 12 months
  const last12 = monthsBack(12)
  const savingsMonthly = useMemo(()=>
    last12.map(ym=>({
      label: ymLabel(ym),
      ym,
      saving: mSav(ym),
      rate:   mRate(ym) ?? 0,
      income: mInc(ym),
      expense: mExp(ym),
    }))
  , [activeTxs])

  // Averages — only CLOSED months (strictly before current month-year)
  function savgMonths(n) {
    let total=0, count=0
    for(let i=1;i<=n;i++){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1)
      const ym=ymOf(d)
      if(ym >= thisYM) continue // skip current or future months (safety guard)
      const inc=mInc(ym)
      if(inc>0){total+=mSav(ym);count++}
    }
    return count>0 ? Math.round(total/count) : null
  }
  function savgYear(y) {
    let totalInc = 0, totalExp = 0
    for (let m = 0; m < 12; m++) {
      const ym = `${y}-${String(m+1).padStart(2,'0')}`
      if (ym >= thisYM) break
      totalInc += activeTxs.filter(t => t.amount > 0 && (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0)
      totalExp += Math.abs(activeTxs.filter(t => t.amount < 0 && (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0))
    }
    // return total savings for the year (only if we have some data)
    return totalInc > 0 || totalExp > 0 ? Math.round(totalInc - totalExp) : null
  }

  const avg12m   = savgMonths(12)
  const total12  = Math.round(savingsMonthly.filter(m => m.ym < thisYM).slice(-12).reduce((s,m) => s+m.saving, 0))

  // Cumulative savings chart
  let cumulative = 0
  const cumulData = savingsMonthly.map(m=>{
    cumulative += m.saving
    return { ...m, cumulative }
  })

  if (isEmpty) return (
    <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>
      Importa transazioni per vedere i dati di risparmio.
    </div>
  )

  return (
    <div style={{padding:'28px 32px',maxWidth:1100}}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600,margin:0}}>
            🐷 Risparmio
          </h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>
            Analisi del risparmio mensile e tasso di risparmio
            {excludedCats.size>0 && (
              <span style={{marginLeft:8,padding:'2px 8px',borderRadius:10,background:'var(--gold-l)',
                color:'var(--gold)',fontWeight:700,fontSize:11}}>
                🔮 Simulazione attiva — {excludedCats.size} categorie escluse
              </span>
            )}
          </div>
        </div>
        <button
          onClick={()=>setShowWhatIf(true)}
          style={{display:'flex',alignItems:'center',gap:7,padding:'8px 16px',
            borderRadius:8,border:`1px solid ${excludedCats.size>0?'var(--gold)':'var(--border)'}`,
            background:excludedCats.size>0?'var(--gold-l)':'var(--surface)',
            color:excludedCats.size>0?'var(--gold)':'var(--text2)',
            cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:13,fontWeight:600}}>
          🔮 E se non avessi queste spese?
          {excludedCats.size>0 && <span style={{fontSize:11}}>({excludedCats.size})</span>}
        </button>
      </div>

      {/* ── KPI Row 2 — medie ─────────────────────────── */}
      <div style={{display:'flex',alignItems:'baseline',gap:10,fontSize:11,fontWeight:700,
        letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:8}}>
        📊 Risparmio medio mensile
        <span style={{fontSize:10,fontWeight:400,textTransform:'none',letterSpacing:0,
          color:'var(--text3)',opacity:.7}}>totale entrate anno − totale uscite anno</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:28}}>
        {[
          ['Ultimi 12 mesi', total12, avg12m],
          [`Anno ${yr-1}`, savgYear(yr-1), savgYear(yr-1)!=null ? Math.round(savgYear(yr-1)/12) : null],
          [`Anno ${yr-2}`, savgYear(yr-2), savgYear(yr-2)!=null ? Math.round(savgYear(yr-2)/12) : null],
          [`Anno ${yr-3}`, savgYear(yr-3), savgYear(yr-3)!=null ? Math.round(savgYear(yr-3)/12) : null],
          [`Anno ${yr-4}`, savgYear(yr-4), savgYear(yr-4)!=null ? Math.round(savgYear(yr-4)/12) : null],
        ].map(([label,total,avg])=>(
          <div key={label} className="card" style={{padding:'12px 16px',borderLeft:`3px solid ${savColor(total)}`}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',
              color:'var(--text3)',marginBottom:5}}>{label}</div>
            <div style={{fontSize:18,fontWeight:800,fontFamily:'var(--font-mono)',color:savColor(total)}}>
              {fmtSav(total)}
            </div>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
              {avg!=null ? `media/mese ${fmtSav(avg)}` : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts + Table ─────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>

        {/* LEFT: combined bar (risparmio) + line (tasso%) dual-axis chart */}
        <div className="card" style={{padding:'18px 20px'}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Risparmio mensile — ultimi 12 mesi</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={savingsMonthly} margin={{top:4,right:32,bottom:0,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="left" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={56}
                tickFormatter={v=>`€${v>=1000?(v/1000).toFixed(0)+'K':v}`}/>
              <YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={32}
                tickFormatter={v=>`${v}%`}/>
              <Tooltip
                formatter={(v,n)=>{
                  if (n==='Tasso %') return [`${v}%`, n]
                  return [`€ ${fmtIT(Math.round(v),0)}`, n==='saving'?'Risparmio':n]
                }}
                contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:8}}/>
              <ReferenceLine yAxisId="left" y={0} stroke="var(--border)" strokeWidth={1}/>
              <ReferenceLine yAxisId="right" y={20} stroke="var(--green)" strokeDasharray="4 4"
                label={{value:'20%',position:'right',fontSize:9,fill:'var(--green)'}}/>
              <Bar yAxisId="left" dataKey="saving" name="Risparmio" radius={[4,4,0,0]} isAnimationActive={false}>
                {savingsMonthly.map((entry,i)=>(
                  <Cell key={i} fill={entry.saving>=0?'var(--green)':'var(--red)'}/>
                ))}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="rate" name="Tasso %" stroke="var(--accent)" strokeWidth={2}
                dot={{r:3,fill:'var(--accent)'}} activeDot={{r:5}}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* RIGHT: last 6 closed months table */}
        <div className="card" style={{padding:'18px 20px'}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Dettaglio mensile</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr>
                  {['Mese','Entrate','Uscite','Risparmio','Tasso %'].map(h=>(
                    <th key={h} style={{padding:'6px 10px',textAlign:h==='Mese'?'left':'right',
                      fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
                      color:'var(--text3)',borderBottom:'1px solid var(--border)',paddingBottom:8}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {savingsMonthly.slice().reverse().slice(0,6).reverse().map((m,i)=>(
                  <tr key={m.ym} style={{borderBottom:'1px solid var(--border)',
                    background:i%2===0?'transparent':'var(--surface2)'}}>
                    <td style={{padding:'7px 10px',fontWeight:600,color:'var(--text)'}}>{m.label}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',
                      color:'var(--green)',fontWeight:600}}>
                      € {fmtIT(Math.round(m.income),0)}
                    </td>
                    <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',
                      color:'var(--red)',fontWeight:600,cursor:'pointer',textDecoration:'underline dotted'}}
                      onClick={()=>setPieMonth(pieMonth===m.ym?null:m.ym)}
                      title="Clicca per dettaglio categorie">
                      € {fmtIT(Math.round(m.expense),0)}
                      {pieMonth===m.ym && ' 📊'}
                    </td>
                    <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',
                      color:m.saving>=0?'var(--green)':'var(--red)',fontWeight:700}}>
                      {m.saving>=0?'+':''}{fmtIT(Math.round(m.saving),0)}
                    </td>
                    <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',
                      color:m.rate>=20?'var(--green)':m.rate>=10?'var(--gold)':'var(--red)',fontWeight:700}}>
                      {m.rate!==null?`${m.rate}%`:'—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {(() => {
                  const rows6 = savingsMonthly.slice().reverse().slice(0,6).reverse()
                  const totInc = rows6.reduce((s,m)=>s+m.income,0)
                  const totExp = rows6.reduce((s,m)=>s+m.expense,0)
                  const totSav = rows6.reduce((s,m)=>s+m.saving,0)
                  const totRate = totInc>0 ? Math.round(totSav/totInc*100) : null
                  return (
                    <tr style={{borderTop:'2px solid var(--border)',background:'var(--surface2)',fontWeight:700}}>
                      <td style={{padding:'7px 10px',fontSize:12,color:'var(--text3)'}}>Totale</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',
                        color:'var(--green)',fontSize:12}}>€ {fmtIT(Math.round(totInc),0)}</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',
                        color:'var(--red)',fontSize:12}}>€ {fmtIT(Math.round(totExp),0)}</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',
                        color:totSav>=0?'var(--green)':'var(--red)',fontSize:12}}>
                        {totSav>=0?'+':''}{fmtIT(Math.round(totSav),0)}
                      </td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',
                        color:totRate>=20?'var(--green)':totRate>=10?'var(--gold)':'var(--red)',fontSize:12}}>
                        {totRate!=null?`${totRate}%`:'—'}
                      </td>
                    </tr>
                  )
                })()}
              </tfoot>
            </table>
          </div>

          {/* Pie chart for selected month */}
          {pieMonth && (() => {
            const mergedCats = getMergedCats(customCats)
            const expByL1 = {}
            activeTxs.filter(t=>t.amount<0&&(t._effDate||(t._effDate||t.date||'')).startsWith(pieMonth))
              .forEach(t=>{
                const k = t.cat1||'Altro'
                expByL1[k] = (expByL1[k]||0)+Math.abs(t.amount)
              })
            const pieData = Object.entries(expByL1).sort((a,b)=>b[1]-a[1])
              .map(([name,value])=>({name,value:Math.round(value),color:mergedCats[name]?.color||'#888'}))
            const pieLabel = savingsMonthly.find(m=>m.ym===pieMonth)?.label
            return (
              <div style={{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:14}}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:10,color:'var(--text2)'}}>
                  📊 Uscite per categoria — {pieLabel}
                  <button onClick={()=>setPieMonth(null)} style={{marginLeft:8,border:'none',background:'none',
                    cursor:'pointer',color:'var(--text3)',fontSize:11,fontFamily:'var(--font-sans)'}}>✕</button>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <PieChart width={120} height={120}>
                    <Pie data={pieData} dataKey="value" cx={55} cy={55} innerRadius={28} outerRadius={52}
                      paddingAngle={2}>
                      {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                    </Pie>
                    <Tooltip formatter={v=>[`€ ${fmtIT(v,0)}`]} contentStyle={{fontSize:10}}/>
                  </PieChart>
                  <div style={{flex:1,overflowY:'auto',maxHeight:110}}>
                    {pieData.slice(0,8).map(d=>(
                      <div key={d.name} style={{display:'flex',justifyContent:'space-between',
                        alignItems:'center',padding:'2px 0',fontSize:11}}>
                        <span style={{display:'flex',alignItems:'center',gap:4}}>
                          <span style={{width:7,height:7,borderRadius:'50%',background:d.color,flexShrink:0}}/>
                          {d.name}
                        </span>
                        <span style={{fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>
                          €{fmtIT(d.value,0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Cumulative savings */}
      <div className="card" style={{padding:'18px 20px',marginBottom:24}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Risparmio cumulativo — ultimi 12 mesi</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={cumulData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={64}
              tickFormatter={v=>`€${v>=1000?(v/1000).toFixed(1)+'K':v}`}/>
            <Tooltip formatter={v=>[`€ ${fmtIT(Math.round(v),0)}`,'Cumulativo']}
              contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:8}}/>
            <ReferenceLine y={0} stroke="var(--border)"/>
            <Line type="monotone" dataKey="cumulative" stroke="var(--blue)" strokeWidth={2.5}
              dot={false} activeDot={{r:5}}/>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── AI Insights ─────────────────────────────────── */}
      <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
        color:'var(--text3)',marginBottom:10}}>🤖 AI Insights</div>
      <SavingsInsights transactions={transactions} excludedCats={excludedCats}/>

      {/* ── What-if info banner (when active) ─────────── */}
      {excludedCats.size > 0 && (
        <div style={{padding:'14px 18px',background:'var(--gold-l)',border:'1px solid var(--gold)',
          borderRadius:'var(--radius)',marginTop:8,display:'flex',alignItems:'center',
          justifyContent:'space-between',gap:12}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'var(--gold)'}}>
              🔮 Simulazione attiva — {excludedCats.size} voc{excludedCats.size===1?'e':'i'} esclus{excludedCats.size===1?'a':'e'}: {[...excludedCats].join(', ')}
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              Tutti i KPI mostrano il risparmio <em>senza</em> queste categorie di spesa.
            </div>
          </div>
          <button className="btn btn-ghost" style={{color:'var(--gold)',border:'1px solid var(--gold)',
            fontSize:12,flexShrink:0}} onClick={()=>setExcludedCats(new Set())}>
            ✕ Rimuovi simulazione
          </button>
        </div>
      )}

      {showWhatIf && (
        <WhatIfModal
          excluded={excludedCats}
          customCats={customCats}
          onApply={setExcludedCats}
          onClose={()=>setShowWhatIf(false)}
        />
      )}
    </div>
  )
}
