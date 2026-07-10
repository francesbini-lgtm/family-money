import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { getYM, getLast6Months, ymLabel } from '../hooks/useFinancials'
import Modal, { ModalFooter, FormRow, Input } from '../components/Modal'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Plus, Settings2 } from 'lucide-react'
import { fmtIT } from '../utils/format'
import './EnergiePage.css'

const UTILITY_TYPES = [
  { id:'luce',     label:'Luce',        icon:'⚡', color:'#b8942a', unit:'kWh' },
  { id:'gas',      label:'Gas',         icon:'🔥', color:'#c8622a', unit:'m³'  },
  { id:'acqua',    label:'Acqua',       icon:'💧', color:'#2a9aa0', unit:'m³'  },
  { id:'internet', label:'Internet/Tel',icon:'📡', color:'#2a5c8a', unit:''    },
  { id:'altro',    label:'Altro',       icon:'🏠', color:'#888888', unit:''    },
]

// ── Firestore helpers ─────────────────────────────────────
function getUtilMerch() { return useStore.getState()?.appPrefs?.utilMerchants || {} }
function saveUtilMerch(d) { useStore.getState()?.setAppPref?.('utilMerchants', d) }

function detectUtilType(tx, merchants) {
  const hay = `${tx.merchant||''} ${tx.description||''} ${tx.descAI||''} ${tx.counterpart||''}`.toLowerCase()
  for (const type of UTILITY_TYPES) {
    const list = merchants[type.id] || []
    if (list.some(m => m.trim() && hay.includes(m.trim().toLowerCase()))) return type
  }
  return null
}

// ── Merchant Settings Modal ───────────────────────────────
function MerchantSettingsModal({ onClose }) {
  const [merchants, setMerchants] = useState(getUtilMerch)
  const [newVal, setNewVal] = useState({})

  function getMList(id) { return merchants[id] || [] }

  function addMerchant(typeId) {
    const val = (newVal[typeId]||'').trim()
    if (!val) return
    const updated = { ...merchants, [typeId]: [...getMList(typeId), val] }
    saveUtilMerch(updated)
    setMerchants(updated)
    setNewVal(v => ({...v, [typeId]:''}))
  }

  function removeMerchant(typeId, idx) {
    const list = getMList(typeId).filter((_,i) => i!==idx)
    const updated = { ...merchants, [typeId]: list }
    saveUtilMerch(updated)
    setMerchants(updated)
  }

  return (
    <Modal title="⚙️ Impostazioni Utenze — Fornitori" onClose={onClose}>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:18}}>
        Aggiungi i nomi dei fornitori per ogni tipo di utenza. Le transazioni vengono
        riconosciute automaticamente in base a questi keyword.
      </div>
      {UTILITY_TYPES.filter(type => type.id !== 'altro').map(type => (
        <div key={type.id} style={{marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:8}}>
            <span style={{fontSize:16}}>{type.icon}</span>
            <span style={{fontSize:13,fontWeight:700,color:type.color}}>{type.label}</span>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:8,minHeight:28}}>
            {getMList(type.id).map((m,i) => (
              <span key={i} style={{display:'inline-flex',alignItems:'center',gap:4,
                fontSize:12,padding:'3px 10px',borderRadius:20,fontWeight:600,
                background:`${type.color}18`,border:`1px solid ${type.color}44`,color:type.color}}>
                {m}
                <button onClick={()=>removeMerchant(type.id,i)}
                  style={{background:'none',border:'none',cursor:'pointer',color:type.color,
                    fontSize:13,lineHeight:1,padding:0,marginLeft:2}}>×</button>
              </span>
            ))}
            {getMList(type.id).length === 0 &&
              <span style={{fontSize:12,color:'var(--text3)',fontStyle:'italic'}}>Nessun fornitore configurato</span>}
          </div>
          <div style={{display:'flex',gap:6}}>
            <input value={newVal[type.id]||''}
              onChange={e => setNewVal(v => ({...v,[type.id]:e.target.value}))}
              onKeyDown={e => e.key==='Enter' && addMerchant(type.id)}
              placeholder={
                type.id==='luce'?'es. Enel, A2A, Edison…':
                type.id==='gas'?'es. ENI Gas, Illumia…':
                type.id==='acqua'?'es. CAP, ACINQUE…':
                type.id==='internet'?'es. Fastweb, TIM, Vodafone…':'es. nome fornitore…'}
              style={{flex:1,padding:'6px 10px',border:'1px solid var(--border)',borderRadius:6,
                fontSize:12,background:'var(--surface)',color:'var(--text)',outline:'none',
                fontFamily:'var(--font-sans)'}}/>
            <button className="btn btn-secondary" style={{fontSize:12,padding:'5px 12px',whiteSpace:'nowrap'}}
              onClick={() => addMerchant(type.id)}>
              <Plus size={12}/> Aggiungi
            </button>
          </div>
        </div>
      ))}
      <div style={{marginBottom:6,padding:'10px 12px',borderRadius:8,
        background:'var(--surface2)',border:'1px solid var(--border)'}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>🏠 Altro</div>
        <div style={{fontSize:12,color:'var(--text3)'}}>
          Nessun fornitore da configurare: include automaticamente tutte le transazioni
          categorizzate come <em>Casa › Utenze</em> che non corrispondono a nessun fornitore
          configurato sopra (Luce, Gas, Acqua, Internet/Tel).
        </div>
      </div>
      <ModalFooter>
        <button className="btn btn-primary" onClick={onClose}>Chiudi</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Utility Chart Card (da transazioni reali) ────────────
// Grafico "dot line" multi-anno: una linea per ciascuno degli ultimi 3 anni,
// Gen→Dic in ascissa, l'anno corrente tratteggiato (dati parziali).
function UtilityChartCard({ type, transactions, merchants }) {
  const MON = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const YEAR_STYLES = [
    { opacity: 0.4,  dashed: false }, // 2 anni fa
    { opacity: 0.7,  dashed: false }, // anno scorso
    { opacity: 1,    dashed: true  }, // anno corrente (tratteggiato, dati parziali)
  ]

  const currentYear = new Date().getFullYear()
  const years = useMemo(() => [currentYear-2, currentYear-1, currentYear], [currentYear])

  const typeTxs = useMemo(() => {
    return transactions.filter(t => {
      if (t.excluded) return false
      if (type.id === 'altro') {
        // "altro" = utenze che non matchano altri tipi (leftover Casa › Utenze)
        const matched = UTILITY_TYPES.filter(u => u.id !== 'altro').some(u => {
          const list = merchants[u.id] || []
          const hay = `${t.merchant||''} ${t.description||''} ${t.descAI||''} ${t.counterpart||''}`.toLowerCase()
          return list.some(m => m.trim() && hay.includes(m.trim().toLowerCase()))
        })
        if (matched) return false
        return t.cat1 === 'Casa' && t.cat2 === 'Utenze'
      }
      const list = merchants[type.id] || []
      if (list.length > 0) {
        const hay = `${t.merchant||''} ${t.description||''} ${t.descAI||''} ${t.counterpart||''}`.toLowerCase()
        return list.some(m => m.trim() && hay.includes(m.trim().toLowerCase()))
      }
      return false
    })
  }, [transactions, merchants, type])

  // Dati: 12 righe (Gen…Dic), una colonna per anno (chiave = anno come stringa)
  const chartData = useMemo(() =>
    MON.map((label, mIdx) => {
      const row = { label }
      years.forEach(y => {
        const ym = `${y}-${String(mIdx+1).padStart(2,'0')}`
        const sum = Math.abs(typeTxs.filter(t => (t._effDate||t.date||'').startsWith(ym)).reduce((s,t) => s+t.amount, 0))
        row[y] = sum > 0 ? sum : null
      })
      return row
    })
  , [typeTxs, years])

  const allVals = useMemo(() =>
    typeTxs.map(t => Math.abs(t.amount)).filter(v => v > 0)
  , [typeTxs])
  const hasData  = allVals.length > 0
  const avg      = hasData ? typeTxs.reduce((s,t)=>s+Math.abs(t.amount),0) / typeTxs.length : 0
  const lastTx   = hasData ? [...typeTxs].sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))[0] : null
  const lastAmt  = lastTx ? Math.abs(lastTx.amount) : 0

  const fornitori = (merchants[type.id] || []).filter(m => m.trim())

  return (
    <div className="card util-card">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:20}}>{type.icon}</span>
          <div style={{fontSize:14,fontWeight:700}}>{type.label}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:18,fontWeight:700,fontFamily:'var(--font-mono)',color:type.color}}>
            {hasData ? `€ ${fmtIT(lastAmt,0)}` : '—'}
          </div>
          {avg > 0 && <div style={{fontSize:10,color:'var(--text3)'}}>media € {fmtIT(avg,0)}/mese</div>}
        </div>
      </div>

      {fornitori.length > 0 && (
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:8}}>
          Fornitore: <span style={{color:'var(--text2)',fontWeight:600}}>{fornitori.join(', ')}</span>
        </div>
      )}

      {hasData ? (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{top:4,right:6,bottom:0,left:2}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:8,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <Tooltip formatter={v=>v==null?['—','']:[`€ ${fmtIT(v,0)}`,'Importo']}
              contentStyle={{fontSize:10,border:'1px solid var(--border)',borderRadius:6,padding:'3px 8px'}}/>
            <Legend wrapperStyle={{fontSize:10}}/>
            {years.map((y, i) => (
              <Line key={y} type="monotone" dataKey={y} name={String(y)}
                stroke={type.color} strokeOpacity={YEAR_STYLES[i].opacity}
                strokeWidth={2} strokeDasharray={YEAR_STYLES[i].dashed ? '5 4' : undefined}
                dot={{ r: 3, fill: type.color, fillOpacity: YEAR_STYLES[i].opacity, strokeWidth: 0 }}
                connectNulls activeDot={{ r: 4 }}/>
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{height:120,display:'flex',alignItems:'center',justifyContent:'center',
          color:'var(--text3)',fontSize:11,fontStyle:'italic'}}>
          Nessuna transazione
        </div>
      )}

      {/* Last 3 txs — solo data + importo, la descrizione AI è sempre la stessa (es. "Bolletta Energia") */}
      {typeTxs.length > 0 && (
        <div style={{marginTop:8,borderTop:'1px solid var(--border)',paddingTop:6}}>
          {[...typeTxs].sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||'')).slice(0,3).map(t => (
            <div key={t.txId} className="util-bill-row">
              <span style={{color:'var(--text3)',fontFamily:'var(--font-mono)',minWidth:60,fontSize:11}}>
                {(t._effDate||(t._effDate||t.date||'')).slice(0,7)}
              </span>
              <span style={{flex:1,fontFamily:'var(--font-mono)',fontWeight:700,fontSize:12,color:type.color,textAlign:'right'}}>
                € {fmtIT(Math.abs(t.amount),2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Utility Transactions Table ────────────────────────────
function UtilityTxTable() {
  const transactions = useStore(s => s.transactions)
  const utilMerchantsPref = useStore(s => s.appPrefs?.utilMerchants)
  const [merchants, setMerchants] = useState(getUtilMerch)
  // Resync when async prefs arrive (avoids stale snapshot)
  useEffect(() => { setMerchants(utilMerchantsPref || {}) }, [utilMerchantsPref])
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [popupTx, setPopupTx] = useState(null)
  const [hideSatispay, setHideSatispay] = useState(false)

  const MON = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const fmtDate = d => {
    const m = (d||'').match(/\d{4}-(\d{2})-(\d{2})/)
    return m ? `${parseInt(m[2])} ${MON[parseInt(m[1])-1]} ${d.slice(0,4)}` : d||'—'
  }

  function toggleSort(k) {
    if (sortKey===k) setSortDir(d => d==='asc'?'desc':'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  const si = k => sortKey===k ? (sortDir==='asc'?'▲':'▼') : null

  const utilTxs = useMemo(() => {
    return [...transactions]
      .filter(t => {
        if (t.excluded) return false
        if (t.cat1 === 'Casa' && t.cat2 === 'Utenze') return true
        if (detectUtilType(t, merchants)) return true
        return false
      })
      .sort((a,b) => {
        if (sortKey==='amount') return sortDir==='asc' ? a.amount-b.amount : b.amount-a.amount
        return sortDir==='asc'
          ? (a[sortKey]||'').localeCompare(b[sortKey]||'')
          : (b[sortKey]||'').localeCompare(a[sortKey]||'')
      })
  }, [transactions, merchants, sortKey, sortDir])

  const isSatispay = t => /satispay/i.test(`${t.account||''} ${t.description||''} ${t.merchant||''}`)
  const displayTxs = hideSatispay ? utilTxs.filter(t => !isSatispay(t)) : utilTxs
  const satispayCount = utilTxs.filter(isSatispay).length

  const total = Math.abs(displayTxs.reduce((s,t) => s + t.amount, 0))

  if (utilTxs.length === 0) return (
    <div style={{padding:'28px',textAlign:'center',color:'var(--text3)',fontSize:13,
      border:'1px solid var(--border)',borderRadius:'var(--radius)',background:'var(--surface)'}}>
      Nessuna transazione utenza trovata.<br/>
      <span style={{fontSize:11,opacity:.7}}>
        Aggiungi fornitori tramite ⚙️ Impostazioni, oppure categorizza transazioni come
        <em> Casa › Utenze</em>.
      </span>
    </div>
  )

  const COLS = [
    { k:'date',    l:'Data',        align:'left'  },
    { k:'descAI',  l:'Descrizione', align:'left'  },
    { k:'merchant',l:'Fornitore',   align:'left'  },
    { k:'utilType',l:'Tipo',        align:'left',  noSort:true },
    { k:'amount',  l:'Importo',     align:'right' },
  ]

  return (
    <>
    <div style={{overflowX:'auto',border:'1px solid var(--border)',borderRadius:'var(--radius)',
      background:'var(--surface)'}}>
      {/* Satispay filter bar */}
      {satispayCount > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',
          background:'var(--surface2)',borderBottom:'1px solid var(--border)'}}>
          <span style={{fontSize:12,color:'var(--text3)'}}>
            {satispayCount} transazioni Satispay
          </span>
          <button
            onClick={() => setHideSatispay(v => !v)}
            style={{fontSize:11,padding:'3px 10px',borderRadius:12,border:'1px solid var(--border)',
              background:hideSatispay?'var(--accent-l)':'var(--surface)',
              color:hideSatispay?'var(--accent)':'var(--text3)',
              cursor:'pointer',fontWeight:600,fontFamily:'var(--font-sans)'}}>
            {hideSatispay ? '✓ Satispay nascosto' : 'Nascondi Satispay'}
          </button>
        </div>
      )}
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr style={{background:'var(--surface2)'}}>
            {COLS.map(c => (
              <th key={c.k}
                onClick={() => !c.noSort && toggleSort(c.k)}
                style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                  textTransform:'uppercase',color:'var(--text3)',borderBottom:'1px solid var(--border)',
                  textAlign:c.align,cursor:c.noSort?'default':'pointer',whiteSpace:'nowrap',
                  userSelect:'none'}}>
                {c.l} {!c.noSort && <span style={{fontSize:9}}>{si(c.k)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayTxs.map(t => {
            const detected = detectUtilType(t, merchants)
            const isCat    = t.cat1==='Casa' && t.cat2==='Utenze'
            const typeInfo = detected || (isCat ? { label:'Utenze', color:'#888', icon:'🏠' } : null)
            return (
              <tr key={t.txId} style={{borderBottom:'1px solid var(--border)',transition:'background .1s'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                onMouseLeave={e=>e.currentTarget.style.background=''}>
                <td style={{padding:'8px 14px',fontSize:12,color:'var(--text3)',
                  fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
                <td style={{padding:'8px 14px',fontSize:13,fontWeight:600,
                  maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                  cursor:'pointer',textDecoration:'underline dotted'}}
                  onClick={() => setPopupTx(t)}>
                  {t.descAI || (t.description||'').slice(0,50) || '—'}
                </td>
                <td style={{padding:'8px 14px',fontSize:12,color:'var(--text2)',
                  maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {t.merchant || t.counterpart || '—'}
                </td>
                <td style={{padding:'8px 14px'}}>
                  {typeInfo ? (
                    <span style={{fontSize:11,padding:'2px 9px',borderRadius:10,fontWeight:700,
                      background:`${typeInfo.color}18`,color:typeInfo.color,
                      border:`1px solid ${typeInfo.color}44`,whiteSpace:'nowrap'}}>
                      {typeInfo.icon} {typeInfo.label}
                    </span>
                  ) : <span style={{fontSize:11,color:'var(--text3)'}}>—</span>}
                </td>
                <td style={{padding:'8px 14px',textAlign:'right',fontWeight:700,
                  fontFamily:'var(--font-mono)',color:t.amount>0?'var(--green)':'var(--red)'}}>
                  {t.amount>0?'+':'−'}€ {fmtIT(Math.abs(t.amount),2)}
                </td>
              </tr>
            )
          })}
          <tr style={{background:'var(--surface2)',fontWeight:700,borderTop:'2px solid var(--border)'}}>
            <td colSpan={4} style={{padding:'9px 14px',fontSize:12,color:'var(--text2)'}}>
              Totale · {displayTxs.length} transazioni
            </td>
            <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--accent)'}}>
              € {fmtIT(total,2)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* Description popup */}

    {popupTx && (
      <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
        display:'flex',alignItems:'center',justifyContent:'center'}}
        onClick={() => setPopupTx(null)}>
        <div style={{background:'var(--surface)',borderRadius:14,padding:'24px 28px',
          maxWidth:520,width:'92%',boxShadow:'0 16px 48px rgba(0,0,0,.25)'}}
          onClick={e => e.stopPropagation()}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:16}}>🧾 Dettaglio transazione</div>
          <div style={{display:'flex',flexDirection:'column',gap:10,fontSize:13}}>
            <div>
              <span style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Descrizione AI</span>
              <div style={{marginTop:3,fontWeight:600}}>{popupTx.descAI || '—'}</div>
            </div>
            <div>
              <span style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Descrizione originale</span>
              <div style={{marginTop:3,fontFamily:'var(--font-mono)',fontSize:12,
                background:'var(--surface2)',padding:'8px 12px',borderRadius:8,
                wordBreak:'break-all',lineHeight:1.5}}>{popupTx.description || '—'}</div>
            </div>
            {popupTx.merchant && <div>
              <span style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Merchant</span>
              <div style={{marginTop:3}}>{popupTx.merchant}</div>
            </div>}
            {popupTx.counterpart && <div>
              <span style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Controparte</span>
              <div style={{marginTop:3}}>{popupTx.counterpart}</div>
            </div>}
          </div>
          <button className="btn btn-secondary" style={{marginTop:20,width:'100%'}}
            onClick={() => setPopupTx(null)}>Chiudi</button>
        </div>
      </div>
    )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function UtenzePage() {
  const transactions  = useStore(s => s.transactions)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const utilMerchantsPref = useStore(s => s.appPrefs?.utilMerchants)
  const [merchants, setMerchants] = useState(getUtilMerch)
  // Resync when async prefs arrive (avoids stale snapshot)
  useEffect(() => { setMerchants(utilMerchantsPref || {}) }, [utilMerchantsPref])

  const now = new Date()
  const ym  = getYM(now)

  const utilTxsAll = useMemo(() =>
    transactions.filter(t => {
      if (t.excluded) return false
      if (t.cat1 === 'Casa' && t.cat2 === 'Utenze') return true
      if (detectUtilType(t, merchants)) return true
      return false
    })
  , [transactions, merchants])

  const totalThisMonth = useMemo(() =>
    Math.abs(utilTxsAll.filter(t => (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t) => s+t.amount, 0))
  , [utilTxsAll, ym])

  const totalYear = useMemo(() => {
    const y = now.getFullYear().toString()
    return Math.abs(utilTxsAll.filter(t => (t._effDate||(t._effDate||t.date||'')).startsWith(y)).reduce((s,t) => s+t.amount, 0))
  }, [utilTxsAll])

  const avgMonthly = useMemo(() => {
    const months = getLast6Months()
    const vals = months.map(m => Math.abs(utilTxsAll.filter(t => (t._effDate||(t._effDate||t.date||'')).startsWith(m)).reduce((s,t) => s+t.amount, 0)))
    const nonZero = vals.filter(v => v > 0)
    return nonZero.length > 0 ? nonZero.reduce((a,b) => a+b,0) / nonZero.length : 0
  }, [utilTxsAll])

  return (
    <div className="en2-page">
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600,margin:0}}>⚡ Utenze</h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>
            Bollette luce, gas, acqua e altri contratti
          </div>
        </div>
        <button className="btn btn-secondary"
          style={{display:'flex',alignItems:'center',gap:7,fontSize:13}}
          onClick={() => setSettingsOpen(true)}
          title="Impostazioni fornitori">
          <Settings2 size={15}/> Impostazioni
        </button>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[
          ['Mese corrente',     totalThisMonth > 0 ? `€ ${fmtIT(totalThisMonth,0)}` : '—', '#b8942a'],
          ['Anno corrente',     totalYear      > 0 ? `€ ${fmtIT(totalYear,0)}`      : '—', 'var(--accent)'],
          ['Media mensile',     avgMonthly     > 0 ? `€ ${fmtIT(avgMonthly,0)}`     : '—', 'var(--text2)'],
        ].map(([l,v,c]) => (
          <div key={l} className="card" style={{padding:'16px 18px',borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
              color:'var(--text3)',marginBottom:6}}>{l}</div>
            <div style={{fontSize:22,fontWeight:700,fontFamily:'var(--font-mono)',color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Utility cards grid — i tipi con fornitore configurabile (tutti tranne "Altro")
          si mostrano solo se almeno un fornitore è stato indicato in Impostazioni;
          "Altro" (leftover automatico Casa › Utenze) è sempre visibile. */}
      <div className="util-grid" style={{marginBottom:28}}>
        {UTILITY_TYPES
          .filter(t => t.id === 'altro' || (merchants[t.id]||[]).some(m => m.trim()))
          .map(t => (
            <UtilityChartCard key={t.id} type={t} transactions={transactions} merchants={merchants}/>
          ))}
      </div>

      {/* Transactions table */}
      <div style={{marginBottom:8}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontSize:16,fontWeight:700}}>📋 Transazioni Utenze</div>
          <div style={{fontSize:12,color:'var(--text3)'}}>
            Categorizzate come Casa › Utenze + fornitori configurati
          </div>
        </div>
        <UtilityTxTable/>
      </div>

      {/* Settings modal */}
      {settingsOpen && <MerchantSettingsModal onClose={() => setSettingsOpen(false)}/>}
    </div>
  )
}
