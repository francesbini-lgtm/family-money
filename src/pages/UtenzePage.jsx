import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { getYM, getLast6Months, ymLabel } from '../hooks/useFinancials'
import Modal, { ModalFooter, FormRow, Input } from '../components/Modal'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
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

// Colori FISSI per anno, uguali in TUTTI i grafici della pagina (non dipendono dal tipo
// di utenza) — scelti ben distinguibili tra loro. L'ultimo (anno corrente) è tratteggiato.
const YEAR_COLORS = ['#5b7fbd', '#a855f7', '#e0821f'] // anno-2 (blu), anno-1 (viola), corrente (arancio)

function getUtilYears() {
  const y = new Date().getFullYear()
  return [y-2, y-1, y]
}

// ── Legenda anni condivisa (una sola volta per l'intera pagina) ──
function YearLegend({ years }) {
  return (
    <div style={{display:'flex',gap:20,alignItems:'center',marginBottom:14,fontSize:12,color:'var(--text2)'}}>
      <span style={{fontWeight:700,color:'var(--text3)',fontSize:11,textTransform:'uppercase',letterSpacing:'.05em'}}>Anni:</span>
      {years.map((y,i) => (
        <span key={y} style={{display:'flex',alignItems:'center',gap:6}}>
          <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={YEAR_COLORS[i]} strokeWidth="2.5"
            strokeDasharray={i===years.length-1?'5 3':undefined}/></svg>
          <span style={{fontWeight:600}}>{y}{i===years.length-1?' (in corso)':''}</span>
        </span>
      ))}
    </div>
  )
}

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
// Grafico "dot line" multi-anno: una linea per ciascuno degli ultimi 3 anni (stessi
// colori YEAR_COLORS in tutta la pagina), Gen→Dic in ascissa, anno corrente tratteggiato.
function UtilityChartCard({ type, transactions, merchants, years }) {
  const MON = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

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

  // Righe per la mini-tabella sotto il grafico: solo i mesi in cui è arrivato almeno
  // un addebito (in uno qualsiasi dei 3 anni), max 5, in ordine cronologico (Gen→Dic).
  const monthRows = useMemo(() => {
    const withData = chartData.filter(row => years.some(y => row[y] != null))
    return withData.slice(-5)
  }, [chartData, years])

  // Tabella dettaglio: chiusa di default, si apre solo su click dell'utente.
  const [tableOpen, setTableOpen] = useState(false)

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
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={chartData} margin={{top:4,right:10,bottom:0,left:2}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={38}
              tickFormatter={v => `€${fmtIT(v,0)}`}/>
            <Tooltip formatter={(v,name)=>v==null?['—',name]:[`€ ${fmtIT(v,0)}`,name]}
              contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px'}}/>
            {years.map((y, i) => (
              <Line key={y} type="monotone" dataKey={y} name={String(y)}
                stroke={YEAR_COLORS[i]}
                strokeWidth={2} strokeDasharray={i===years.length-1 ? '5 4' : undefined}
                dot={{ r: 3, fill: YEAR_COLORS[i], strokeWidth: 0 }}
                connectNulls activeDot={{ r: 4 }}/>
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{height:190,display:'flex',alignItems:'center',justifyContent:'center',
          color:'var(--text3)',fontSize:11,fontStyle:'italic'}}>
          Nessuna transazione
        </div>
      )}

      {/* Mini-tabella: mesi con addebito (righe) × anni (colonne), max 5 righe, chiusa di default */}
      {monthRows.length > 0 && (
        <div style={{marginTop:10,borderTop:'1px solid var(--border)',paddingTop:6}}>
          <button onClick={() => setTableOpen(o => !o)} style={{
            display:'flex',alignItems:'center',gap:6,width:'100%',background:'none',border:'none',
            cursor:'pointer',padding:'2px 4px',fontSize:10,fontWeight:700,textTransform:'uppercase',
            letterSpacing:'.03em',color:'var(--text3)'}}>
            <span style={{display:'inline-block',transition:'transform .15s',transform:tableOpen?'rotate(90deg)':'rotate(0deg)'}}>▸</span>
            Dettaglio mensile
          </button>
          {tableOpen && (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,marginTop:4}}>
              <thead>
                <tr>
                  <th style={{textAlign:'left',padding:'3px 4px',color:'var(--text3)',fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Mese</th>
                  {years.map((y,i) => (
                    <th key={y} style={{textAlign:'right',padding:'3px 4px',color:YEAR_COLORS[i],fontWeight:700}}>{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthRows.map(row => (
                  <tr key={row.label} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'4px 4px',color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{row.label}</td>
                    {years.map((y,i) => (
                      <td key={y} style={{padding:'4px 4px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:600,
                        color: row[y]!=null ? 'var(--text)' : 'var(--text3)', opacity: row[y]!=null ? 1 : .4}}>
                        {row[y]!=null ? `€ ${fmtIT(row[y],0)}` : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
  const [search, setSearch] = useState('')
  const [colFilters, setColFilters] = useState({}) // { fornitore: Set, tipo: Set } — set = valori inclusi
  const [openFilterCol, setOpenFilterCol] = useState(null)

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

  // Metadati derivati per riga (fornitore/tipo) — usati sia per il rendering che per i filtri
  const rowsMeta = useMemo(() => utilTxs.map(t => {
    const detected = detectUtilType(t, merchants)
    const isCat     = t.cat1==='Casa' && t.cat2==='Utenze'
    const typeInfo  = detected || (isCat ? { label:'Utenze', color:'#888', icon:'🏠' } : null)
    return { t, typeInfo, fornitoreVal: t.merchant || t.counterpart || '—', tipoVal: typeInfo?.label || '—' }
  }), [utilTxs, merchants])

  const uniqueFornitori = useMemo(() => [...new Set(rowsMeta.map(r=>r.fornitoreVal))].sort(), [rowsMeta])
  const uniqueTipi      = useMemo(() => [...new Set(rowsMeta.map(r=>r.tipoVal))].sort(), [rowsMeta])

  function openFilter(col, allValues) {
    setColFilters(cf => ({ ...cf, [col]: cf[col] || new Set(allValues) }))
    setOpenFilterCol(oc => oc === col ? null : col)
  }
  function toggleFilterVal(col, val) {
    setColFilters(cf => {
      const cur = new Set(cf[col])
      cur.has(val) ? cur.delete(val) : cur.add(val)
      return { ...cf, [col]: cur }
    })
  }
  function resetFilter(col, allValues) {
    setColFilters(cf => ({ ...cf, [col]: new Set(allValues) }))
  }
  const isColFiltered = (col, allValues) => colFilters[col] && colFilters[col].size < allValues.length

  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rowsMeta.filter(({ t, fornitoreVal, tipoVal }) => {
      if (colFilters.fornitore && !colFilters.fornitore.has(fornitoreVal)) return false
      if (colFilters.tipo && !colFilters.tipo.has(tipoVal)) return false
      if (q) {
        const hay = `${t.descAI||''} ${t.description||''} ${t.merchant||''} ${t.counterpart||''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rowsMeta, colFilters, search])

  const displayRows = hideSatispay ? searchedRows.filter(r => !isSatispay(r.t)) : searchedRows
  const displayTxs  = displayRows.map(r => r.t)
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
    { k:'merchant',l:'Fornitore',   align:'left',  filterCol:'fornitore', values:uniqueFornitori },
    { k:'utilType',l:'Tipo',        align:'left',  noSort:true, filterCol:'tipo', values:uniqueTipi },
    { k:'amount',  l:'Importo',     align:'right' },
  ]

  return (
    <>
    {/* Ricerca — come Excel: cerca in descrizione/fornitore/controparte */}
    <div style={{marginBottom:10,position:'relative',maxWidth:320}}>
      <input
        value={search}
        onChange={e=>setSearch(e.target.value)}
        placeholder="🔎 Cerca transazione…"
        style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',
          fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',
          fontFamily:'var(--font-sans)',boxSizing:'border-box'}}
      />
    </div>
    {openFilterCol && (
      <div onClick={() => setOpenFilterCol(null)} style={{position:'fixed',inset:0,zIndex:40}}/>
    )}
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
                style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                  textTransform:'uppercase',color:'var(--text3)',borderBottom:'1px solid var(--border)',
                  textAlign:c.align,whiteSpace:'nowrap',userSelect:'none',position:'relative'}}>
                <span onClick={() => !c.noSort && toggleSort(c.k)} style={{cursor:c.noSort?'default':'pointer'}}>
                  {c.l} {!c.noSort && <span style={{fontSize:9}}>{si(c.k)}</span>}
                </span>
                {c.filterCol && (
                  <>
                    <button onClick={() => openFilter(c.filterCol, c.values)}
                      title="Filtra"
                      style={{marginLeft:5,background:'none',border:'none',cursor:'pointer',
                        color:isColFiltered(c.filterCol,c.values)?'var(--accent)':'var(--text3)',
                        fontSize:10,verticalAlign:'middle'}}>
                      {isColFiltered(c.filterCol,c.values) ? '▼' : '▽'}
                    </button>
                    {openFilterCol === c.filterCol && (
                      <div style={{position:'absolute',top:'100%',left:0,zIndex:50,
                        background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
                        boxShadow:'0 8px 24px rgba(0,0,0,.18)',padding:'8px 10px',minWidth:170,
                        maxHeight:240,overflowY:'auto',marginTop:4,textTransform:'none',fontWeight:400}}
                        onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,gap:8}}>
                          <button onClick={() => resetFilter(c.filterCol, c.values)}
                            style={{fontSize:10,background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontWeight:700}}>
                            Seleziona tutti
                          </button>
                          <button onClick={() => setOpenFilterCol(null)}
                            style={{fontSize:11,background:'none',border:'none',color:'var(--text3)',cursor:'pointer'}}>✕</button>
                        </div>
                        {c.values.map(v => (
                          <label key={v} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,
                            padding:'3px 0',cursor:'pointer',color:'var(--text)'}}>
                            <input type="checkbox"
                              checked={colFilters[c.filterCol]?.has(v) ?? true}
                              onChange={() => toggleFilterVal(c.filterCol, v)}/>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map(({ t, typeInfo }) => {
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

  const utilYears = useMemo(() => getUtilYears(), [])

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
          "Altro" (leftover automatico Casa › Utenze) è sempre visibile. Legenda anni
          UNA SOLA VOLTA per tutta la griglia (stessi colori in ogni grafico). */}
      <YearLegend years={utilYears}/>
      <div className="util-grid" style={{marginBottom:28}}>
        {UTILITY_TYPES
          .filter(t => t.id === 'altro' || (merchants[t.id]||[]).some(m => m.trim()))
          .map(t => (
            <UtilityChartCard key={t.id} type={t} transactions={transactions} merchants={merchants} years={utilYears}/>
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
