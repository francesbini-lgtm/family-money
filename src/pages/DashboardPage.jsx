import { useStore } from '../store/useStore'
import { useFinancials } from '../hooks/useFinancials'
import { IncomeExpenseChart, SavingsChart, CategoryDonut } from '../components/Charts'
import { TrendingUp, TrendingDown, PiggyBank, Percent, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import './DashboardPage.css'
import { fmtIT } from '../utils/format'
import { useMemo, useState } from 'react'
import { CATS, CAT_NAMES, getMergedCats } from '../data/categories'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

// ── Helper: calcola totale spese effettive per mese (satiLinked → splits) ──
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

// ── Saldo Chart ───────────────────────────────────────────
function SaldoChart({ transactions }) {
  const [view, setView] = useState('M')
  const [year, setYear] = useState('all')

  // Excluded transactions don't count — except _forcedBalance (tappo) which must always be included
  const activeTxs = useMemo(() =>
    transactions.filter(t => !t.excluded || t._forcedBalance)
  , [transactions])

  const sorted = useMemo(() =>
    [...activeTxs].sort((a,b)=>(a._effDate||a.date||'').localeCompare(b._effDate||b.date||''))
  , [activeTxs])

  const allYears = useMemo(() => {
    const yrs = new Set(sorted.map(t=>(t._effDate||(t._effDate||t.date||'')).slice(0,4)).filter(Boolean))
    return [...yrs].sort()
  }, [sorted])

  const chartData = useMemo(() => {
    const buckets = {}
    sorted.forEach(tx => {
      const d = (tx._effDate||tx.date||''); if (!d) return
      const yr=d.slice(0,4), mo=d.slice(5,7), q=Math.ceil(parseInt(mo)/3)
      const key = view==='M' ? `${yr}-${mo}` : view==='Q' ? `${yr}-Q${q}` : yr
      if (!buckets[key]) buckets[key]={net:0}
      buckets[key].net += tx.amount
    })
    const keys = Object.keys(buckets).sort()
    let running = 0
    const full = keys.map(k => {
      running += buckets[k].net
      const label = view==='M'
        ? MONTHS_SHORT[parseInt(k.slice(5,7))-1]+' '+k.slice(2,4)
        : view==='Q' ? k.replace(/(\d{4})-/,'$1 ') : k
      return { label, saldo: Math.round(running*100)/100, key:k }
    })
    return year==='all' ? full : full.filter(d=>d.key.startsWith(year))
  }, [sorted, view, year])

  const minVal = Math.min(...chartData.map(d=>d.saldo), 0)
  const maxVal = Math.max(...chartData.map(d=>d.saldo), 0)
  const pad = (maxVal - minVal) * 0.08

  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:4}}>
          {[['M','Mensile'],['Q','Trimestrale'],['A','Annuale']].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{
              padding:'3px 10px',borderRadius:14,border:`1px solid ${view===v?'var(--accent)':'var(--border)'}`,
              background:view===v?'var(--accent-l)':'var(--surface)',
              color:view===v?'var(--accent)':'var(--text3)',
              fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
            }}>{l}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:4,marginLeft:8}}>
          {['all',...allYears].map(y=>(
            <button key={y} onClick={()=>setYear(y)} style={{
              padding:'3px 10px',borderRadius:14,
              border:`1px solid ${year===y?'var(--blue)':'var(--border)'}`,
              background:year===y?'rgba(59,130,246,.1)':'var(--surface)',
              color:year===y?'var(--blue)':'var(--text3)',
              fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
            }}>{y==='all'?'Tutti':y}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{top:8,right:4,bottom:0,left:4}}>
          <defs>
            <linearGradient id="saldoGradDB" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
          <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}
            interval={chartData.length>24?Math.floor(chartData.length/12):0}/>
          <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={58}
            tickFormatter={v=>Math.abs(v)>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}
            domain={[minVal-pad, maxVal+pad]}/>
          <Tooltip formatter={v=>[`€ ${fmtIT(v,2)}`,'Saldo']}
            contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
          <Area type="monotone" dataKey="saldo" stroke="#3b82f6" strokeWidth={2}
            fill="url(#saldoGradDB)" dot={false} activeDot={{r:4,fill:'#3b82f6'}}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Custom Pie label ─────────────────────────────────────
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) {
  if (percent < 0.04) return null
  const RADIAN = Math.PI / 180
  const r  = innerRadius + (outerRadius - innerRadius) * 0.55
  const x  = cx + r * Math.cos(-midAngle * RADIAN)
  const y  = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{fontSize:10,fontWeight:700,pointerEvents:'none'}}>
      {percent>=0.08 ? name.split(' ')[0] : ''}
    </text>
  )
}

// ── Transaction Modal ────────────────────────────────────
function TxModal({ tx, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats = useStore(s => s.customCats)
  const [editCat1, setEditCat1] = useState(tx?.cat1 || '')
  const [editCat2, setEditCat2] = useState(tx?.cat2 || '')
  const [editDescAI, setEditDescAI] = useState(tx?.descAI || '')
  const [saved, setSaved] = useState(false)
  const [toReview, setToReview] = useState(tx?._toReview || false)
  function toggleReview() { const n=!toReview; setToReview(n); updateTransaction(tx.txId,{_toReview:n}) }

  if (!tx) return null

  const _allCats = getMergedCats(customCats)
  const effDate = tx._effDate || tx.date || ''
  const fmtDate = (d) => {
    if (!d) return '—'
    const parts = d.slice(0,10).split('-')
    return parts.length===3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d
  }

  const cat1Subs = _allCats[editCat1]?.sub || []

  const handleSave = () => {
    updateTransaction(tx.txId, { cat1: editCat1, cat2: editCat2, conf: 100 })
    setSaved(true)
    setTimeout(onClose, 1000)
  }

  return (
    <div style={{
      position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:9999,
      display:'flex',alignItems:'center',justifyContent:'center',padding:16,
    }} onClick={onClose}>
      <div style={{
        background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
        padding:24,maxWidth:520,width:'100%',maxHeight:'90vh',overflowY:'auto',
        boxShadow:'0 8px 40px rgba(0,0,0,.35)',position:'relative',
      }} onClick={e=>e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} style={{
          position:'absolute',top:12,right:14,background:'none',border:'none',
          fontSize:20,cursor:'pointer',color:'var(--text3)',lineHeight:1,
        }}>✕</button>

        {/* Header */}
        <div style={{marginBottom:16,paddingRight:28}}>
          <div style={{fontSize:15,fontWeight:700,color:'var(--text)',lineHeight:1.3,marginBottom:4}}>
            {tx.descAI || (tx.description||'').slice(0,60) || '—'}
          </div>
          <div style={{fontSize:22,fontWeight:800,color:'var(--red)',fontFamily:'var(--font-mono)'}}>
            {tx.amount < 0 ? '−' : '+'}€ {fmtIT(Math.abs(tx.amount),2)}
          </div>
        </div>

        {/* Info grid */}
        <div style={{
          display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px',
          marginBottom:20,padding:'14px 16px',
          background:'var(--surface2)',borderRadius:8,
          border:'1px solid var(--border)',
        }}>
          {[
            ['Data contabile', fmtDate(tx.date)],
            ['Data valuta', fmtDate(tx.effectiveDate || tx._effDate)],
            ['Merchant', tx.merchant || '—'],
            ['Controparte', tx.counterpart || tx.counterparty || '—'],
            ['Città', tx.city || '—'],
            ['Categoria', tx.cat1 ? (tx.cat1 + (tx.cat2 ? ' › ' + tx.cat2 : '')) : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:2}}>{label}</div>
              <div style={{fontSize:12,color:'var(--text)',fontWeight:500}}>{value}</div>
            </div>
          ))}
          <div style={{gridColumn:'1 / -1'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:2}}>Descrizione originale</div>
            <div style={{fontSize:12,color:'var(--text2)',wordBreak:'break-word'}}>{tx.description || '—'}</div>
          </div>
        </div>

        {/* ── To Review flag ── */}
        <div onClick={toggleReview}
          style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'10px 14px',borderRadius:8,cursor:'pointer',userSelect:'none',
            background:toReview?'rgba(245,158,11,.08)':'var(--surface2)',
            border:`1px solid ${toReview?'#f59e0b':'var(--border)'}`}}>
          <span style={{fontSize:13,fontWeight:600,color:toReview?'#92400e':'var(--text2)'}}>
            🔍 Da rivedere
          </span>
          <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,fontWeight:700,
            background:toReview?'#f59e0b':'var(--border)',
            color:toReview?'#fff':'var(--text3)'}}>
            {toReview ? 'Attivo' : 'Off'}
          </span>
        </div>
        {/* AI Descr */}
        <div style={{padding:'12px 16px',background:'var(--surface2)',borderRadius:10,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
            color:'var(--text3)',marginBottom:6}}>✏️ Descrizione AI</div>
          <input
            value={editDescAI}
            onChange={e=>setEditDescAI(e.target.value)}
            onBlur={()=>{ if(editDescAI.trim()!==tx.descAI) updateTransaction(tx.txId,{descAI:editDescAI.trim()}) }}
            placeholder="Descrizione AI personalizzata..."
            style={{width:'100%',boxSizing:'border-box',padding:'7px 10px',borderRadius:7,
              border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',
              fontSize:13,fontFamily:'var(--font-sans)',outline:'none'}}
          />
        </div>
        {/* Category editor */}
        <div style={{borderTop:'1px solid var(--border)',paddingTop:16}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',marginBottom:10}}>
            Modifica Categoria
          </div>
          <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:140}}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Categoria</div>
              <select value={editCat1} onChange={e=>{setEditCat1(e.target.value);setEditCat2('')}} style={{
                width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',
                background:'var(--surface)',color:'var(--text)',fontSize:13,cursor:'pointer',
              }}>
                <option value="">— Nessuna —</option>
                {Object.keys(_allCats).filter(n=>n!=='Non Categorizzato').map(n=>(
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            {cat1Subs.length > 0 && (
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Sottocategoria</div>
                <select value={editCat2} onChange={e=>setEditCat2(e.target.value)} style={{
                  width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',
                  background:'var(--surface)',color:'var(--text)',fontSize:13,cursor:'pointer',
                }}>
                  <option value="">— Nessuna —</option>
                  {cat1Subs.map(s=>(
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            <button onClick={handleSave} style={{
              padding:'7px 18px',borderRadius:8,border:'none',cursor:'pointer',
              background: saved ? 'var(--green)' : 'var(--accent)',
              color:'#fff',fontSize:13,fontWeight:700,fontFamily:'var(--font-sans)',
              transition:'background .2s',whiteSpace:'nowrap',
            }}>
              {saved ? '✓ Salvato' : 'Salva'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Spese per categoria — Pie Chart, L1+L2 toggle, no Entrate ──
function SpeseCatChart({ transactions }) {
  const [showL2, setShowL2]       = useState(false)
  const [period, setPeriod]       = useState('M')
  const [hoverIdx, setHoverIdx]   = useState(null)
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedTx, setSelectedTx]   = useState(null)
  const now = new Date()

  const getMonths = () => {
    const months = []
    for (let i=5;i>=0;i--) {
      const d=new Date(now.getFullYear(),now.getMonth()-i,1)
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    }
    return months
  }

  const catData = useMemo(() => {
    const months = getMonths()
    return Object.entries(CATS)
      .filter(([name]) => name!=='Entrate' && name!=='Non Categorizzato')
      .map(([name, info]) => {
        const txs = transactions.filter(t=>!t.excluded&&t.amount<0&&t.cat1===name)
        const periodTxs = period==='M'
          ? txs.filter(t=>(t._effDate||t.date||'').startsWith(months[5]))
          : period==='Q'
            ? txs.filter(t=>(t._effDate||t.date||'')>=months[months.length-3])
            : txs.filter(t=>(t._effDate||t.date||'')>=months[0])
        const total = Math.abs(periodTxs.reduce((s,t)=>s+t.amount,0))
        const l2 = {}
        periodTxs.forEach(t=>{ const k=t.cat2||'Altro'; l2[k]=(l2[k]||0)+Math.abs(t.amount) })
        const l2list = Object.entries(l2).sort((a,b)=>b[1]-a[1])
        return { name, color:info.color, total, l2list, periodTxs }
      })
      .filter(d=>d.total>0)
      .sort((a,b)=>b.total-a.total)
  }, [transactions, period])

  // When L2 is on, expand each L1 slice into its L2 children
  const pieData = useMemo(() => {
    if (!showL2) return catData.map(d=>({ name:d.name, value:d.total, color:d.color, parent:null }))
    const out = []
    catData.forEach(d => {
      if (d.l2list.length === 0) {
        out.push({ name:d.name, value:d.total, color:d.color, parent:d.name })
      } else {
        d.l2list.forEach(([s,v]) => {
          out.push({ name:s, value:v, color:d.color, parent:d.name })
        })
      }
    })
    return out
  }, [catData, showL2])

  const totalSpese = catData.reduce((s,d)=>s+d.total,0)

  // The active index for display: hover takes priority, else selected cat
  const activeIdx = useMemo(() => {
    if (hoverIdx !== null) return hoverIdx
    if (selectedCat !== null) {
      const idx = pieData.findIndex(p =>
        showL2 ? p.parent === selectedCat : p.name === selectedCat
      )
      return idx >= 0 ? idx : null
    }
    return null
  }, [hoverIdx, selectedCat, pieData, showL2])

  const activeCat = activeIdx !== null ? pieData[activeIdx] : null

  const periodLabel = period==='M' ? MONTHS_SHORT[now.getMonth()]+' '+String(now.getFullYear()).slice(2)
    : period==='Q' ? 'Ultimi 3 mesi' : 'Ultimi 6 mesi'

  // Transactions for selected category, sorted by absolute amount descending
  const catTxs = useMemo(() => {
    if (!selectedCat) return []
    const months = getMonths()
    let txs = transactions.filter(t => !t.excluded && t.amount < 0)
    if (showL2) {
      txs = txs.filter(t => t.cat2 === selectedCat)
    } else {
      txs = txs.filter(t => t.cat1 === selectedCat)
    }
    // Apply period filter
    if (period === 'M') {
      txs = txs.filter(t => (t._effDate||t.date||'').startsWith(months[5]))
    } else if (period === 'Q') {
      txs = txs.filter(t => (t._effDate||t.date||'') >= months[months.length-3])
    } else {
      txs = txs.filter(t => (t._effDate||t.date||'') >= months[0])
    }
    return [...txs].sort((a,b) => Math.abs(a.amount) - Math.abs(b.amount)).reverse()
  }, [selectedCat, transactions, period, showL2])

  const btnStyle = (active) => ({
    padding:'3px 10px',borderRadius:14,
    border:`1px solid ${active?'var(--accent)':'var(--border)'}`,
    background:active?'var(--accent-l)':'var(--surface)',
    color:active?'var(--accent)':'var(--text3)',
    fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',
  })

  const handlePieClick = (_, idx) => {
    const clickedName = showL2 ? pieData[idx]?.parent : pieData[idx]?.name
    setSelectedCat(prev => prev === clickedName ? null : clickedName)
  }

  const handleLegendClick = (catName) => {
    setSelectedCat(prev => prev === catName ? null : catName)
  }

  const fmtShortDate = (d) => {
    if (!d) return '—'
    const s = (d||'').slice(0,10)
    const parts = s.split('-')
    return parts.length===3 ? `${parts[2]}/${parts[1]}` : s
  }

  // Color for selected cat in legend
  const selectedColor = selectedCat ? (CATS[selectedCat]?.color || 'var(--accent)') : null

  return (
    <div>
      {/* Toolbar */}
      <div style={{display:'flex',gap:6,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        {[['M','Mese'],['Q','Trimestre'],['A','6 Mesi']].map(([v,l])=>(
          <button key={v} onClick={()=>{setPeriod(v);setSelectedCat(null)}} style={btnStyle(period===v)}>{l}</button>
        ))}
        <button onClick={()=>{setShowL2(s=>!s);setSelectedCat(null)}} style={{...btnStyle(showL2),marginLeft:'auto'}}>
          {showL2?'▾ L2':'▸ L2'}
        </button>
      </div>

      {/* 50/50 grid */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,alignItems:'flex-start'}}>

        {/* LEFT: Pie + legend */}
        <div>
          {/* Pie */}
          <div style={{position:'relative',width:'100%',display:'flex',justifyContent:'center',marginBottom:12}}>
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={showL2?50:60}
                  outerRadius={showL2?100:100}
                  dataKey="value"
                  labelLine={false}
                  label={!showL2 ? PieLabel : false}
                  onMouseEnter={(_,idx)=>setHoverIdx(idx)}
                  onMouseLeave={()=>setHoverIdx(null)}
                  onClick={handlePieClick}
                  strokeWidth={1}
                  stroke="var(--surface)"
                >
                  {pieData.map((entry,idx)=>(
                    <Cell key={idx} fill={entry.color}
                      opacity={activeIdx===null||activeIdx===idx?1:0.45}
                      style={{cursor:'pointer',transition:'opacity .15s'}}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`€ ${fmtIT(value,0)}`, name]}
                  contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)'}}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
              textAlign:'center',pointerEvents:'none'}}>
              {activeCat ? (
                <>
                  <div style={{fontSize:10,color:'var(--text3)',fontWeight:600,lineHeight:1.2}}>{activeCat.name}</div>
                  <div style={{fontSize:14,fontWeight:800,color:activeCat.color}}>€ {fmtIT(activeCat.value,0)}</div>
                  {activeCat.parent && activeCat.parent!==activeCat.name &&
                    <div style={{fontSize:9,color:'var(--text3)'}}>{activeCat.parent}</div>}
                </>
              ) : (
                <>
                  <div style={{fontSize:10,color:'var(--text3)',fontWeight:600}}>{periodLabel}</div>
                  <div style={{fontSize:14,fontWeight:800,color:'var(--text)'}}>€ {fmtIT(totalSpese,0)}</div>
                </>
              )}
            </div>
          </div>

          {/* Legend list */}
          <div style={{display:'flex',flexDirection:'column',gap:0,maxHeight:220,overflowY:'auto'}}>
            {catData.map((d)=>(
              <div key={d.name}>
                <div style={{
                  display:'flex',alignItems:'center',gap:7,padding:'5px 4px',borderRadius:6,
                  cursor:'pointer',
                  background: selectedCat===d.name ? d.color+'18' : 'transparent',
                  outline: selectedCat===d.name ? `1px solid ${d.color}44` : 'none',
                  transition:'background .12s',
                }}
                  onMouseEnter={()=>{
                    const idx = pieData.findIndex(p=>showL2 ? p.parent===d.name : p.name===d.name)
                    setHoverIdx(idx>=0?idx:null)
                  }}
                  onMouseLeave={()=>setHoverIdx(null)}
                  onClick={()=>handleLegendClick(d.name)}
                >
                  <span style={{width:9,height:9,borderRadius:'50%',background:d.color,flexShrink:0}}/>
                  <span style={{fontSize:12,flex:1,color:'var(--text2)',fontWeight:selectedCat===d.name?700:600}}>{d.name}</span>
                  <span style={{fontSize:12,fontWeight:800,color:d.color,fontFamily:'var(--font-mono)'}}>
                    € {fmtIT(d.total,0)}
                  </span>
                  <span style={{fontSize:10,color:'var(--text3)',marginLeft:4,minWidth:30,textAlign:'right'}}>
                    {totalSpese>0?Math.round(d.total/totalSpese*100):0}%
                  </span>
                </div>
                {showL2 && d.l2list.length>0 && (
                  <div style={{marginLeft:16,marginBottom:2}}>
                    {d.l2list.map(([s,v])=>(
                      <div key={s} style={{display:'flex',alignItems:'center',gap:7,padding:'2px 4px'}}>
                        <span style={{width:5,height:5,borderRadius:'50%',background:d.color+'99',flexShrink:0}}/>
                        <span style={{fontSize:11,flex:1,color:'var(--text3)'}}>{s}</span>
                        <span style={{fontSize:11,color:d.color,fontFamily:'var(--font-mono)'}}>€ {fmtIT(v,0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Transaction list */}
        <div style={{display:'flex',flexDirection:'column'}}>
          {selectedCat ? (
            <>
              <div style={{
                fontSize:12,fontWeight:700,color: selectedColor,
                marginBottom:8,display:'flex',alignItems:'center',gap:6,
              }}>
                <span style={{width:8,height:8,borderRadius:'50%',background:selectedColor,display:'inline-block'}}/>
                {selectedCat}
                <span style={{fontSize:11,color:'var(--text3)',fontWeight:500,marginLeft:2}}>
                  ({catTxs.length} transazioni)
                </span>
              </div>
              <div style={{
                maxHeight:340,overflowY:'auto',
                border:'1px solid var(--border)',borderRadius:8,
              }}>
                {catTxs.length === 0 ? (
                  <div style={{padding:20,textAlign:'center',color:'var(--text3)',fontSize:12}}>
                    Nessuna transazione nel periodo
                  </div>
                ) : catTxs.map((tx, i) => {
                  const d = tx._effDate || tx.date || ''
                  const desc = tx.descAI || (tx.description||'').slice(0,40)
                  return (
                    <div key={tx.txId || i} onClick={()=>setSelectedTx(tx)} style={{
                      display:'flex',alignItems:'center',gap:8,
                      padding:'7px 10px',
                      borderBottom: i < catTxs.length-1 ? '1px solid var(--border)' : 'none',
                      cursor:'pointer',
                      transition:'background .1s',
                    }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                    >
                      <span style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',flexShrink:0,width:38}}>
                        {fmtShortDate(d)}
                      </span>
                      <span style={{fontSize:12,color:'var(--text2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {desc || '—'}
                      </span>
                      <span style={{fontSize:12,fontWeight:700,color:'var(--red)',fontFamily:'var(--font-mono)',flexShrink:0}}>
                        € {fmtIT(Math.abs(tx.amount),2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div style={{
              display:'flex',alignItems:'center',justifyContent:'center',
              height:200,borderRadius:8,border:'1px dashed var(--border)',
              color:'var(--text3)',fontSize:12,textAlign:'center',padding:16,
            }}>
              Clicca una categoria per vedere le transazioni
            </div>
          )}
        </div>

      </div>

      {/* Transaction modal */}
      {selectedTx && (
        <TxModal tx={selectedTx} onClose={()=>setSelectedTx(null)} />
      )}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────
function KPICard({ icon, label, value, sub, color, delta, deltaLabel }) {
  const isPos = delta > 0
  const isNeg = delta < 0
  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ background: `${color}18`, color }}>{icon}</div>
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value" style={{ color }}>{value}</div>
        <div className="kpi-sub">
          {delta !== null && delta !== undefined ? (
            <span className={'kpi-delta ' + (isPos ? 'pos' : isNeg ? 'neg' : 'neu')}>
              {isPos ? <ArrowUpRight size={11}/> : isNeg ? <ArrowDownRight size={11}/> : null}
              {Math.abs(delta)}% {deltaLabel || 'vs mese scorso'}
            </span>
          ) : (
            <span style={{ color: 'var(--text3)' }}>{sub}</span>
          )}
          {sub && delta !== null && delta !== undefined && (
            <span style={{ color: 'var(--text3)', fontSize: 11, display: 'block', marginTop: 2 }}>{sub}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── AI Insights ──────────────────────────────────────────
function AIInsights({ transactions, catList, monthly }) {
  const now    = new Date()
  const thisYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const prevYM = (() => { const d=new Date(now.getFullYear(),now.getMonth()-1,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })()
  const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

  if (!transactions.length) return null

  const thisTxs  = transactions.filter(t=>!t.excluded&&(t._effDate||(t._effDate||t.date||'')).startsWith(thisYM))
  const prevTxs  = transactions.filter(t=>!t.excluded&&(t._effDate||(t._effDate||t.date||'')).startsWith(prevYM))
  const thisInc  = thisTxs.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)
  const thisExp  = expTotal(transactions, thisYM)
  const prevInc  = prevTxs.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)
  const prevExp  = expTotal(transactions, prevYM)
  const thisSav  = thisInc - thisExp
  const prevSav  = prevInc - prevExp
  const thisSavRate = thisInc > 0 ? Math.round(thisSav/thisInc*100) : null
  const prevSavRate = prevInc > 0 ? Math.round(prevSav/prevInc*100) : null

  // Avg monthly savings last 6 months
  const avg6m = (() => {
    let total=0, count=0
    for (let i=1; i<=6; i++) {
      const d  = new Date(now.getFullYear(), now.getMonth()-i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const inc = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0)
      const exp = expTotal(transactions, ym)
      if (inc>0) { total += inc-exp; count++ }
    }
    return count>0 ? total/count : null
  })()

  // Category growth vs prev month
  const catSpendThis={}, catSpendPrev={}
  thisTxs.filter(t=>t.amount<0).forEach(t=>{ catSpendThis[t.cat1]=(catSpendThis[t.cat1]||0)+Math.abs(t.amount) })
  prevTxs.filter(t=>t.amount<0).forEach(t=>{ catSpendPrev[t.cat1]=(catSpendPrev[t.cat1]||0)+Math.abs(t.amount) })
  const catGrowth = Object.entries(catSpendThis)
    .map(([cat,amt])=>({ cat, amt, prev: catSpendPrev[cat]||0, delta: catSpendPrev[cat]?Math.round((amt-catSpendPrev[cat])/catSpendPrev[cat]*100):null }))
    .filter(c=>c.prev>0&&c.delta!==null)
    .sort((a,b)=>b.delta-a.delta)
  const fastestGrowing   = catGrowth[0]
  const fastestShrinking = catGrowth[catGrowth.length-1]

  // Largest single expense this month
  const largestExp = [...thisTxs].filter(t=>t.amount<0).sort((a,b)=>a.amount-b.amount)[0]

  // Projection to end of month
  const dayOfMonth  = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
  const dailyRate   = dayOfMonth > 3 ? thisExp/dayOfMonth : 0
  const projectedExp = Math.round(dailyRate * daysInMonth)
  const projectedSav = Math.round(thisInc - projectedExp)

  // Negative cashflow months this year
  const negMonths = (() => {
    let count=0
    for (let m=0; m<now.getMonth(); m++) {
      const ym = `${now.getFullYear()}-${String(m+1).padStart(2,'0')}`
      const inc = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0)
      const exp = expTotal(transactions, ym)
      if (inc>0 && inc<exp) count++
    }
    return count
  })()

  // Best savings month this year
  const bestMonth = (() => {
    let best=null, bestAmt=-Infinity
    for (let m=0; m<now.getMonth(); m++) {
      const ym = `${now.getFullYear()}-${String(m+1).padStart(2,'0')}`
      const inc = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0)
      const exp = expTotal(transactions, ym)
      const sav = inc-exp
      if (inc>0 && sav>bestAmt) { bestAmt=sav; best=MONTHS_IT[m] }
    }
    return { name:best, amt:bestAmt }
  })()

  // Dining/ristoranti trend
  const diningThis = thisTxs.filter(t=>t.amount<0&&(t.cat1==='Tempo Libero'||(t.cat2||'').toLowerCase().includes('ristoran')||(t.cat2||'').toLowerCase().includes('bar')||(t.cat2||'').toLowerCase().includes('cena'))).reduce((s,t)=>s+Math.abs(t.amount),0)
  const diningPrev = prevTxs.filter(t=>t.amount<0&&(t.cat1==='Tempo Libero'||(t.cat2||'').toLowerCase().includes('ristoran')||(t.cat2||'').toLowerCase().includes('bar')||(t.cat2||'').toLowerCase().includes('cena'))).reduce((s,t)=>s+Math.abs(t.amount),0)
  const diningDelta = diningPrev>0 ? Math.round((diningThis-diningPrev)/diningPrev*100) : null

  // Savings rate change
  const savRateDelta = thisSavRate!==null && prevSavRate!==null ? thisSavRate-prevSavRate : null

  const insights = []

  // 1. Risparmio vs media
  if (avg6m!==null) {
    const vsAvg = Math.round((thisSav-avg6m)/Math.abs(avg6m||1)*100)
    insights.push({ icon:'🐷', title:'Risparmio vs media 6 mesi',
      text: vsAvg>=0 ? `+${vsAvg}% sopra la media` : `${vsAvg}% sotto la media`,
      sub: `Media: € ${fmtIT(Math.round(avg6m),0)} · Questo mese: ${thisSav>=0?'+':''}€ ${fmtIT(Math.round(thisSav),0)}`,
      color: vsAvg>=5?'var(--green)':vsAvg>=-10?'var(--gold)':'var(--red)' })
  }

  // 2. Tasso risparmio
  if (thisSavRate!==null) {
    const msg = thisSavRate>=20?'Eccellente — sopra soglia 20%':thisSavRate>=10?'Accettabile — obiettivo 20%':'Sotto il livello consigliato'
    const color = thisSavRate>=20?'var(--green)':thisSavRate>=10?'var(--gold)':'var(--red)'
    insights.push({ icon:'💰', title:'Tasso risparmio mese',
      text:`${thisSavRate}% del reddito risparmiato`,
      sub: savRateDelta!==null ? `${savRateDelta>=0?'+':''}${savRateDelta}pp vs mese scorso · ${msg}` : msg,
      color })
  }

  // 3. Proiezione fine mese
  if (thisInc>0 && dayOfMonth>5) {
    insights.push({ icon:'📈', title:'Proiezione fine mese',
      text: projectedSav>=0 ? `Risparmio previsto: +€ ${fmtIT(projectedSav,0)}` : `Rischio deficit: −€ ${fmtIT(Math.abs(projectedSav),0)}`,
      sub: `Ritmo attuale: € ${fmtIT(Math.round(dailyRate),0)}/giorno · ${daysInMonth-dayOfMonth} giorni rimanenti`,
      color: projectedSav>=0?'var(--blue)':'var(--red)' })
  }

  // 4. Categoria in maggiore crescita
  if (fastestGrowing && fastestGrowing.delta>15) {
    insights.push({ icon:'⚠️', title:'Categoria in crescita',
      text:`${fastestGrowing.cat} +${fastestGrowing.delta}% vs mese scorso`,
      sub:`€ ${fmtIT(Math.round(fastestGrowing.prev),0)} → € ${fmtIT(Math.round(fastestGrowing.amt),0)}`,
      color: fastestGrowing.delta>40?'var(--red)':'var(--gold)' })
  }

  // 5. Categoria in calo
  if (fastestShrinking && fastestShrinking.delta<-15) {
    insights.push({ icon:'✂️', title:'Categoria in calo',
      text:`${fastestShrinking.cat} ${fastestShrinking.delta}% vs mese scorso`,
      sub:`€ ${fmtIT(Math.round(fastestShrinking.prev),0)} → € ${fmtIT(Math.round(fastestShrinking.amt),0)}`,
      color:'var(--green)' })
  }

  // 6. Spesa più alta del mese
  if (largestExp) {
    insights.push({ icon:'💸', title:'Spesa più alta del mese',
      text: largestExp.descAI||(largestExp.description||'').slice(0,40)||'—',
      sub:`€ ${fmtIT(Math.abs(largestExp.amount),2)} · ${largestExp.cat1}${largestExp.cat2?' › '+largestExp.cat2:''}`,
      color:'var(--text2)' })
  }

  // 7. Ristoranti/Cene trend
  if (diningThis>0||diningPrev>0) {
    insights.push({ icon:'🍽️', title:'Cene & Ristoranti',
      text: diningDelta!==null ? `${diningDelta>=0?'+':''}${diningDelta}% vs mese scorso` : `€ ${fmtIT(Math.round(diningThis),0)} questo mese`,
      sub: diningThis>0 ? `Totale: € ${fmtIT(Math.round(diningThis),0)}` : null,
      color: diningDelta===null||diningDelta<=0?'var(--green)':diningDelta>20?'var(--red)':'var(--gold)' })
  }

  // 8. Mesi negativi
  if (now.getMonth()>0) {
    insights.push({ icon: negMonths===0?'🏅':'📉', title:`Mesi in deficit — ${now.getFullYear()}`,
      text: negMonths===0 ? 'Nessun mese in rosso quest\'anno!' : `${negMonths} ${negMonths===1?'mese':' mesi'} in rosso su ${now.getMonth()} chiusi`,
      sub: negMonths===0?'Ottima gestione annuale':'Mesi in cui uscite > entrate',
      color: negMonths===0?'var(--green)':negMonths>=3?'var(--red)':'var(--gold)' })
  }

  // 9. Miglior mese anno
  if (bestMonth.name && bestMonth.amt>0) {
    insights.push({ icon:'🏆', title:`Miglior mese — ${now.getFullYear()}`,
      text:`${bestMonth.name}: +€ ${fmtIT(bestMonth.amt,0)} risparmiati`,
      sub:'Il mese con il risparmio più alto dell\'anno',
      color:'var(--green)' })
  }

  if (!insights.length) return null

  return (
    <div style={{marginBottom:20}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:7}}>
        <span style={{fontSize:16}}>✨</span> AI Insights
        <span style={{fontSize:11,color:'var(--text3)',fontWeight:500}}>· {new Date().toLocaleDateString('it-IT')}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:12}}>
        {insights.map((ins,i)=>(
          <div key={i} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'14px 16px',borderLeft:`3px solid ${ins.color}`}}>
            <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
              <span style={{fontSize:20,lineHeight:1}}>{ins.icon}</span>
              <div>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',marginBottom:2}}>{ins.title}</div>
                <div style={{fontSize:13,fontWeight:600,lineHeight:1.4,color:'var(--text)'}}>{ins.text}</div>
                {ins.sub && <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{ins.sub}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────
function EmptyState() {
  return (
    <div className="dash-empty">
      <div className="dash-empty-icon">💎</div>
      <div className="dash-empty-title">Benvenuto in Family Money</div>
      <div className="dash-empty-sub">
        Importa il tuo primo CSV dalla sezione <strong>Transazioni</strong> per vedere
        la dashboard popolata con i tuoi dati reali.
      </div>
      <div className="dash-empty-steps">
        <div className="dash-empty-step">
          <span className="step-num">1</span>
          Vai in <strong>Transazioni</strong>
        </div>
        <div className="dash-empty-step">
          <span className="step-num">2</span>
          Clicca <strong>Importa CSV</strong>
        </div>
        <div className="dash-empty-step">
          <span className="step-num">3</span>
          Carica il file della tua banca
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────
export default function DashboardPage() {
  const {
    thisIncome, thisExpense, savingsRate, cashflow,
    deltaIncome, deltaExpense,
    monthly, catList,
    ytdIncome, ytdExpense,
    ytdCatList,
    fmt, fmtK,
    isEmpty,
  } = useFinancials()
  const { transactions } = useStore()

  if (isEmpty) return (
    <div className="dash-page"><EmptyState /></div>
  )

  const now = new Date()
  const monthName = now.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  const thisYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const prevYM = (() => { const d=new Date(now.getFullYear(),now.getMonth()-1,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })()
  const thisSalaryInc = transactions.filter(t=>!t.excluded&&t.amount>0&&t.cat1==='Entrate'&&(t.cat2==='Fra'||t.cat2==='Sofi')&&(t._effDate||t.date||'').startsWith(thisYM)).reduce((s,t)=>s+t.amount,0)
  const thisOtherInc  = Math.round(thisIncome - thisSalaryInc)
  const prevSalaryInc = transactions.filter(t=>!t.excluded&&t.amount>0&&t.cat1==='Entrate'&&(t.cat2==='Fra'||t.cat2==='Sofi')&&(t._effDate||t.date||'').startsWith(prevYM)).reduce((s,t)=>s+t.amount,0)
  const prevIncTotal  = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||t.date||'').startsWith(prevYM)).reduce((s,t)=>s+t.amount,0)
  const prevOtherInc  = Math.round(prevIncTotal - prevSalaryInc)

  return (
    <div className="dash-page">

      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🏠 Summary</h1>
          <div className="dash-sub">
            {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
          </div>
        </div>
      </div>

            {/* YTD bar */}
      <div className="ytd-bar">
        <div className="ytd-item">
          <span className="ytd-label">YTD Entrate</span>
          <span className="ytd-value" style={{ color: 'var(--green)' }}>{fmtK(ytdIncome)}</span>
        </div>
        <div className="ytd-divider" />
        <div className="ytd-item">
          <span className="ytd-label">YTD Uscite</span>
          <span className="ytd-value" style={{ color: 'var(--red)' }}>{fmtK(ytdExpense)}</span>
        </div>
        <div className="ytd-divider" />
        <div className="ytd-item">
          <span className="ytd-label">YTD Risparmio</span>
          <span className="ytd-value" style={{ color: 'var(--blue)' }}>{fmtK(ytdIncome - ytdExpense)}</span>
        </div>
      </div>

      {/* ── KPI block ── */}
      {(() => {
        const now2 = new Date()
        // Previous month
        const prevD  = new Date(now2.getFullYear(), now2.getMonth()-1, 1)
        const prevYM = `${prevD.getFullYear()}-${String(prevD.getMonth()+1).padStart(2,'0')}`
        const prevName = prevD.toLocaleDateString('it-IT',{month:'long',year:'numeric'})
        const prevInc  = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||(t._effDate||t.date||'')).startsWith(prevYM)).reduce((s,t)=>s+t.amount,0)
        const prevExp  = expTotal(transactions, prevYM)
        const prevSav  = prevInc - prevExp
        const prevRate = prevInc>0?Math.round(prevSav/prevInc*100):0

        // Savings averages
        const savgMonths = (n) => {
          let total = 0, count = 0
          for (let i=1;i<=n;i++){
            const d = new Date(now2.getFullYear(),now2.getMonth()-i,1)
            const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
            const inc = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0)
            const exp = expTotal(transactions, ym)
            if (inc>0) { total += (inc-exp); count++ }
          }
          return count>0?Math.round(total/count):null
        }
        const savgYear = (yr) => {
          let total=0,count=0
          for(let m=0;m<12;m++){
            const ym=`${yr}-${String(m+1).padStart(2,'0')}`
            const inc=transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0)
            const exp=expTotal(transactions, ym)
            if(inc>0){total+=inc-exp;count++}
          }
          return count>0?Math.round(total/count):null
        }
        const avg3m  = savgMonths(3)
        const avg6m  = savgMonths(6)
        const avg12m = savgMonths(12)
        const yr = now2.getFullYear()

        const fmtSav = n => n===null?'—':(n>=0?'+':'-')+'€ '+Math.abs(n).toLocaleString('it-IT')
        const savColor = n => n===null?'var(--text3)':n>=0?'var(--green)':'var(--red)'

        return (
          <>
            {/* Row 1 — mese corrente */}
            <div style={{marginBottom:6}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:8}}>
                📅 {new Date().toLocaleDateString('it-IT',{month:'long',year:'numeric'}).toUpperCase()} — MESE CORRENTE
              </div>
              <div className="kpi-grid">
                <KPICard icon={<TrendingUp size={18}/>} label="Entrate" value={fmt(thisIncome)} color="var(--green)" delta={deltaIncome}
                  sub={thisOtherInc > 0 ? `di cui € ${fmtIT(thisOtherInc)} altre entrate` : undefined}/>
                <KPICard icon={<TrendingDown size={18}/>} label="Uscite" value={fmt(thisExpense)} color="var(--red)" delta={deltaExpense} deltaLabel="vs mese scorso"/>
                <KPICard icon={<PiggyBank size={18}/>} label="Risparmio"
                  value={(cashflow>=0?'+':'')+fmt(cashflow)}
                  color={cashflow>=0?'var(--green)':'var(--red)'}
                  sub="Entrate − Uscite"/>
                <KPICard icon={<Percent size={18}/>} label="Tasso Risparmio"
                  value={savingsRate+'%'}
                  color={savingsRate>=20?'var(--green)':savingsRate>=10?'var(--gold)':'var(--red)'}
                  sub="del reddito mensile"/>
              </div>
            </div>

            {/* Row 2 — mese precedente */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:8}}>
                📅 {prevName.toUpperCase()} — MESE CHIUSO
              </div>
              <div className="kpi-grid">
                <KPICard icon={<TrendingUp size={18}/>} label="Entrate" value={fmt(prevInc)} color="var(--green)"
                  sub={prevOtherInc > 0 ? `di cui € ${fmtIT(prevOtherInc)} altre entrate` : undefined}/>
                <KPICard icon={<TrendingDown size={18}/>} label="Uscite" value={fmt(prevExp)} color="var(--red)"/>
                <KPICard icon={<PiggyBank size={18}/>} label="Risparmio"
                  value={(prevSav>=0?'+':'')+fmt(prevSav)}
                  color={prevSav>=0?'var(--green)':'var(--red)'}
                  sub="Entrate − Uscite"/>
                <KPICard icon={<Percent size={18}/>} label="Tasso Risparmio"
                  value={prevRate+'%'}
                  color={prevRate>=20?'var(--green)':prevRate>=10?'var(--gold)':'var(--red)'}
                  sub="del reddito mensile"/>
              </div>
            </div>

          </>
        )
      })()}

      {/* ── Saldo Conto ── */}
      <div className="card" style={{ marginBottom: 20, padding: '18px 20px' }}>
        <div className="card-title-row" style={{ marginBottom: 14 }}>
          <span className="card-title">Andamento Saldo</span>
        </div>
        <SaldoChart transactions={transactions} />
      </div>

      {/* Charts row */}
      <div className="dash-charts">
        <div className="card dash-chart-card">
          <div className="card-title-row">
            <span className="card-title">Entrate vs Uscite</span>
            <span className="card-sub-label">Ultimi 6 mesi</span>
          </div>
          <IncomeExpenseChart data={monthly} />
        </div>

        <div className="card dash-chart-card">
          <div className="card-title-row">
            <span className="card-title">Risparmio</span>
            <span className="card-sub-label">Trend mensile</span>
          </div>
          <SavingsChart data={monthly} />
        </div>
      </div>

      {/* Top Categorie Anno — between charts and dash-bottom */}
      {ytdCatList.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '18px 20px' }}>
          <div className="card-title-row" style={{ marginBottom: 14 }}>
            <span className="card-title">Top Categorie Anno</span>
            <span className="card-sub-label">{new Date().getFullYear()}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {ytdCatList.slice(0, 6).map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{c.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>€ {fmtIT(c.total, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Spese per Categoria ── */}
      <div style={{display:'flex',gap:16,marginBottom:20,alignItems:'stretch'}}>
        <div className="card" style={{flex:'1 1 0',minWidth:0,padding:'18px 20px'}}>
          <div className="card-title-row" style={{marginBottom:4}}>
            <span className="card-title">Spese per Categoria</span>
          </div>
          <SpeseCatChart transactions={transactions} />
        </div>
      </div>



    </div>
  )
}
