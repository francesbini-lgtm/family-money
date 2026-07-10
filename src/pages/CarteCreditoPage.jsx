import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { fmtIT } from '../utils/format'
import { getMergedCats } from '../data/categories'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const SEL_STYLE = {
  width:'100%', padding:'4px 6px', borderRadius:5, border:'1px solid var(--border)',
  fontSize:11, background:'var(--surface)', color:'var(--text)', outline:'none', cursor:'pointer',
  fontFamily:'var(--font-sans)',
}

const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function fmtDate(d) {
  const m = (d||'').match(/\d{4}-(\d{2})-(\d{2})/)
  return m ? `${parseInt(m[2])} ${MONTHS[parseInt(m[1])-1]}` : (d||'—')
}
function fmtMonthLabel(ym) {
  const mm = (ym||'').match(/^(\d{4})-(\d{2})$/)
  return mm ? `${MONTHS[parseInt(mm[2])-1]} '${mm[1].slice(2)}` : ym
}

// Riga di "estratto conto carta" ancora non riconciliata (non ancora sostituita
// dal dettaglio importato via CSV/XLS) — stessa firma testuale usata in
// ImportModal.jsx (findEstrattoCandidates), più il segnale descAI indicato
// dall'utente ("Carte di credito").
const CARD_LUMP_REGEX = /estratto|utilizzo carte|carta di credito/i

function CardChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const daAbbinare = payload.find(p=>p.dataKey==='daAbbinare')?.value || 0
  const importato  = payload.find(p=>p.dataKey==='importato')?.value || 0
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
      padding:'8px 12px',fontSize:12,boxShadow:'0 4px 14px rgba(0,0,0,.15)'}}>
      <div style={{fontWeight:700,marginBottom:4}}>{label}</div>
      {importato > 0 && (
        <div style={{color:'var(--accent)'}}>Importato: € {fmtIT(importato,2)}</div>
      )}
      {daAbbinare > 0 && (
        <div style={{color:'var(--gold)'}}>Da abbinare: € {fmtIT(daAbbinare,2)}</div>
      )}
      <div style={{marginTop:4,paddingTop:4,borderTop:'1px solid var(--border)',fontWeight:700}}>
        Totale: € {fmtIT(daAbbinare+importato,2)}
      </div>
    </div>
  )
}

// ── Riga tabella con AI Descrizione + Categoria L1/L2 editabili ──────────
function CardTxRow({ t, allCats, updateTransaction }) {
  const [descVal, setDescVal] = useState(t.descAI || '')
  useEffect(() => { setDescVal(t.descAI || '') }, [t.descAI])

  function commitDesc() {
    const v = descVal.trim()
    if (v !== (t.descAI || '')) updateTransaction(t.txId, { descAI: v || null, aiEnriched: true })
  }

  const cat2Options = allCats[t.cat1]?.sub || []

  return (
    <tr style={{borderBottom:'1px solid var(--border)'}}>
      <td style={{padding:'8px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
        {fmtDate(t._effDate||t.date)}
      </td>
      <td style={{padding:'6px 10px',maxWidth:160}}>
        <input
          value={descVal}
          onChange={e=>setDescVal(e.target.value)}
          onBlur={commitDesc}
          onKeyDown={e=>{ if (e.key==='Enter') e.target.blur() }}
          placeholder="—"
          style={{width:'100%',padding:'4px 6px',borderRadius:5,border:'1px solid transparent',
            background:'transparent',fontSize:13,fontWeight:600,color:'var(--text)',
            outline:'none',fontFamily:'var(--font-sans)',boxSizing:'border-box'}}
          onFocus={e=>{e.target.style.border='1px solid var(--accent)'; e.target.style.background='var(--surface)'}}
          onBlurCapture={e=>{e.target.style.border='1px solid transparent'; e.target.style.background='transparent'}}
        />
      </td>
      <td style={{padding:'8px 14px',fontSize:11,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {(t.description||'').slice(0,60)}
      </td>
      <td style={{padding:'6px 10px',minWidth:130}}>
        <select value={t.cat1||''} onChange={e=>updateTransaction(t.txId,{cat1:e.target.value,cat2:''})} style={SEL_STYLE}>
          <option value="">—</option>
          {Object.keys(allCats).map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={{padding:'6px 10px',minWidth:120}}>
        <select value={t.cat2||''} onChange={e=>updateTransaction(t.txId,{cat2:e.target.value})}
          disabled={!cat2Options.length} style={SEL_STYLE}>
          <option value="">—</option>
          {cat2Options.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{padding:'8px 14px'}}>
        <span style={{fontSize:11,fontFamily:'var(--font-mono)',padding:'2px 6px',
          borderRadius:8,background:'var(--surface2)',border:'1px solid var(--border)',
          color:'var(--text2)',fontWeight:700}}>*{t.cardImportCard4}</span>
      </td>
      <td style={{padding:'8px 14px',textAlign:'right',fontFamily:'var(--font-mono)',
        fontSize:13,fontWeight:700,color:t.amount>=0?'var(--green)':'var(--red)'}}>
        {t.amount>=0?'+':'−'}€ {fmtIT(Math.abs(t.amount),2)}
      </td>
    </tr>
  )
}

export default function CarteCreditoPage() {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats        = useStore(s => s.customCats)
  const allCats           = useMemo(() => getMergedCats(customCats), [customCats])

  // Solo le transazioni ITEMIZZATE, importate via il breakdown CSV/XLS carta
  // (sostituiscono l'estratto aggregato, che viene escluso al momento della conferma)
  const cardTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && t.cardImportCard4)
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  const uniqueCards = useMemo(() => [...new Set(cardTxs.map(t=>t.cardImportCard4))], [cardTxs])

  const totalSpesa = cardTxs.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0)

  // Righe di estratto conto carta ancora NON abbinate/riconciliate (non ancora escluse
  // perché non è ancora stato importato il dettaglio via CSV/XLS per quel mese/carta)
  const lumpTxs = useMemo(() =>
    transactions.filter(t =>
      !t.excluded && t.amount < 0 &&
      ((t.descAI||'').trim().toLowerCase() === 'carte di credito' || CARD_LUMP_REGEX.test(t.description||''))
    )
  , [transactions])
  const lumpTotal = lumpTxs.reduce((s,t)=>s+Math.abs(t.amount),0)

  // Istogramma mensile: utilizzo carte combinato (dettaglio importato + estratti in attesa)
  const monthlyData = useMemo(() => {
    const map = {}
    const add = (ym, key, amt) => {
      if (!ym) return
      if (!map[ym]) map[ym] = { ym, daAbbinare:0, importato:0 }
      map[ym][key] += amt
    }
    lumpTxs.forEach(t => add((t._effDate||t.date||'').slice(0,7), 'daAbbinare', Math.abs(t.amount)))
    cardTxs.filter(t=>t.amount<0).forEach(t => add((t._effDate||t.date||'').slice(0,7), 'importato', Math.abs(t.amount)))
    return Object.values(map)
      .sort((a,b)=>a.ym.localeCompare(b.ym))
      .map(m => ({ ...m, label: fmtMonthLabel(m.ym) }))
  }, [lumpTxs, cardTxs])

  const avgMensile = monthlyData.length > 0
    ? monthlyData.reduce((s,m)=>s+m.daAbbinare+m.importato,0) / monthlyData.length
    : 0

  return (
    <div style={{padding:'28px 32px',maxWidth:980}}>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600,margin:0}}>
          💳 Carte di Credito
        </h1>
        <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>
          Monitoraggio utilizzo carte di credito e debito
        </div>
      </div>

      {/* In costruzione banner */}
      <div style={{padding:'12px 18px',background:'var(--gold-l)',border:'1px solid var(--gold)',
        borderRadius:10,marginBottom:20,display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:18}}>🚧</span>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--gold)'}}>Sezione in costruzione</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>
            Questa pagina mostrerà analisi avanzate sull'utilizzo delle carte. Per ora visualizza le transazioni importate col dettaglio carta.
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
        {[
          ['Utilizzo medio/mese', avgMensile > 0 ? `€ ${fmtIT(avgMensile,0)}` : '—', 'var(--accent)'],
          ['Estratti da abbinare', lumpTxs.length > 0 ? `${lumpTxs.length} (€ ${fmtIT(lumpTotal,0)})` : '0', lumpTxs.length > 0 ? 'var(--gold)' : 'var(--text2)'],
          ['Carte rilevate', uniqueCards.length || '—', 'var(--text)'],
          ['Spesa importata (dettaglio)', totalSpesa > 0 ? `€ ${fmtIT(totalSpesa,0)}` : '—', 'var(--red)'],
        ].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:'14px 18px',borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--text3)',marginBottom:5}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-mono)',color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Istogramma mensile utilizzo carte */}
      {monthlyData.length > 0 && (
        <div className="card" style={{padding:'16px 18px',marginBottom:24}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:14,fontWeight:700}}>Utilizzo carte per mese</span>
            <div style={{display:'flex',gap:14,fontSize:11,color:'var(--text3)'}}>
              <span><span style={{display:'inline-block',width:9,height:9,borderRadius:2,background:'var(--accent)',marginRight:5}}/>Importato</span>
              <span><span style={{display:'inline-block',width:9,height:9,borderRadius:2,background:'var(--gold)',marginRight:5}}/>Da abbinare</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{top:6,right:8,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={{stroke:'var(--border)'}} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={40}
                tickFormatter={v => `€${fmtIT(v,0)}`}/>
              <Tooltip content={<CardChartTooltip/>} cursor={{fill:'var(--surface2)'}}/>
              <Bar dataKey="importato" stackId="a" fill="var(--accent)" radius={[0,0,0,0]}/>
              <Bar dataKey="daAbbinare" stackId="a" fill="var(--gold)" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      {cardTxs.length === 0 ? (
        <div style={{textAlign:'center',padding:'48px 24px',background:'var(--surface)',
          border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
          <div style={{fontSize:36,marginBottom:12}}>💳</div>
          <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Nessuna transazione importata</div>
          <div style={{fontSize:13,color:'var(--text3)'}}>
            Le transazioni appariranno qui dopo aver importato ed abbinato l'estratto conto carta tramite CSV/XLS.
          </div>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:14,fontWeight:700}}>Transazioni importate (dettaglio carta)</span>
            <span style={{fontSize:12,color:'var(--text3)'}}>{cardTxs.length} transazioni · {uniqueCards.length} carte</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
              <thead>
                <tr>
                  {['Data','AI Descrizione','Descrizione','Categoria','Sottocategoria','Carta','Importo'].map(h=>(
                    <th key={h} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                      textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                      borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cardTxs.slice(0,200).map((t,i)=>(
                  <CardTxRow key={t.txId||i} t={t} allCats={allCats} updateTransaction={updateTransaction}/>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
