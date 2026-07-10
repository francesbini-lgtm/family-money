import { useMemo, useState, useEffect } from 'react'
import { useStore, computeUser } from '../store/useStore'
import { fmtIT } from '../utils/format'
import { getMergedCats } from '../data/categories'
import { showToast } from '../services/notifications'
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
function CardTxRow({ t, allCats, updateTransaction, userAccounts, appPrefs, selected, onToggleSelect, onRemoveComp }) {
  const [descVal, setDescVal] = useState(t.descAI || '')
  useEffect(() => { setDescVal(t.descAI || '') }, [t.descAI])

  function commitDesc() {
    const v = descVal.trim()
    if (v !== (t.descAI || '')) updateTransaction(t.txId, { descAI: v || null, aiEnriched: true })
  }

  const cat2Options = allCats[t.cat1]?.sub || []

  // Utente: ricalcolato usando cardImportCard4 come riferimento carta (più affidabile
  // di t.card, spesso vuoto per righe di dettaglio importate da CSV/XLS carta),
  // con fallback a t.user (già calcolato/salvato altrove) se il ricalcolo non risolve nulla.
  const user = computeUser({...t, card: t.cardImportCard4 || t.card}, userAccounts, appPrefs) || t.user || null

  const isComp = t._compensatedAmt > 0
  const displayAmt = isComp ? Math.max(0, Math.abs(t.amount) - t._compensatedAmt) : Math.abs(t.amount)

  return (
    <tr style={{borderBottom:'1px solid var(--border)', opacity: selected ? 1 : undefined, background: selected ? 'var(--accent-l)' : undefined}}>
      <td style={{padding:'8px 10px',textAlign:'center'}}>
        <input type="checkbox" checked={selected} onChange={()=>onToggleSelect(t.txId)} style={{cursor:'pointer'}}/>
      </td>
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
      <td style={{padding:'8px 14px'}}>
        {user
          ? <span style={{fontSize:12,fontWeight:700,color:'var(--accent)'}}>{user}</span>
          : <span style={{color:'var(--text3)',opacity:.4,fontSize:11}}>—</span>}
      </td>
      <td style={{padding:'8px 14px',textAlign:'right',fontFamily:'var(--font-mono)',
        fontSize:13,fontWeight:700,color:t.amount>=0?'var(--green)':'var(--red)'}}>
        {t.amount>=0?'+':'−'}€ {fmtIT(displayAmt,2)}{isComp && '*'}
        {isComp && (
          <button onClick={()=>onRemoveComp(t)} title="Rimuovi abbinamento/compensazione"
            style={{marginLeft:6,background:'none',border:'none',cursor:'pointer',
              color:'var(--gold)',fontSize:11,fontWeight:700,verticalAlign:'middle'}}>
            🔗✕
          </button>
        )}
      </td>
    </tr>
  )
}

export default function CarteCreditoPage() {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats        = useStore(s => s.customCats)
  const userAccounts      = useStore(s => s.userAccounts)
  const appPrefs          = useStore(s => s.appPrefs)
  const allCats           = useMemo(() => getMergedCats(customCats), [customCats])
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Solo le transazioni ITEMIZZATE, importate via il breakdown CSV/XLS carta
  // (sostituiscono l'estratto aggregato, che viene escluso al momento della conferma)
  const cardTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && t.cardImportCard4)
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  const uniqueCards = useMemo(() => [...new Set(cardTxs.map(t=>t.cardImportCard4))], [cardTxs])

  const totalSpesa = cardTxs.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0)

  // Categoria L1 più usata (per spesa totale) tra le transazioni importate
  const topCat = useMemo(() => {
    const map = {}
    cardTxs.filter(t=>t.amount<0 && t.cat1).forEach(t => { map[t.cat1] = (map[t.cat1]||0) + Math.abs(t.amount) })
    const entries = Object.entries(map)
    if (!entries.length) return null
    return entries.sort((a,b)=>b[1]-a[1])[0] // [cat1, totale]
  }, [cardTxs])
  const topCatPct = topCat && totalSpesa > 0 ? (topCat[1] / totalSpesa * 100) : 0

  // ── Selezione + abbina/compensa (come nello sheet PayPal) ──────────
  // A differenza dei sistemi compLinks (PayPal/AltreEntrate, un'entrata : N spese),
  // qui si selezionano N transazioni qualsiasi (tipicamente un rimborso/storno positivo
  // + una o più spese negative) e si compensano tra loro proporzionalmente: l'importo
  // che si annulla reciprocamente è min(totale positivi, totale negativi), distribuito
  // in proporzione su ciascuna transazione coinvolta (_compensatedAmt/_compensatedBy,
  // stessa convenzione di visualizzazione "zero*/residuo" usata in tutta l'app).
  function toggleSelect(txId) {
    setSelectedIds(s => {
      const n = new Set(s)
      n.has(txId) ? n.delete(txId) : n.add(txId)
      return n
    })
  }

  function handleAbbina() {
    const sel = cardTxs.filter(t => selectedIds.has(t.txId))
    if (sel.length < 2) return
    const pos = sel.filter(t => t.amount > 0)
    const neg = sel.filter(t => t.amount < 0)
    if (!pos.length || !neg.length) {
      showToast('Seleziona almeno una transazione positiva (rimborso/storno) e una negativa (spesa) da compensare', 'error')
      return
    }
    const totalPos = pos.reduce((s,t)=>s+t.amount, 0)
    const totalNegAbs = neg.reduce((s,t)=>s+Math.abs(t.amount), 0)
    const compAmt = Math.min(totalPos, totalNegAbs)
    const ids = sel.map(t=>t.txId)
    // _compensatedBy: stringa (singolo txId) quando il gruppo è 1:1, come nella convenzione
    // già usata altrove (Satispay) — così anche il popup "dettaglio compensazione" già
    // esistente in TransactionsPage.jsx (che si aspetta un singolo txId) resta compatibile.
    // Con più di 2 transazioni nel gruppo diventa un array (nessun singolo "altro lato").
    const byFor = txId => {
      const others = ids.filter(id=>id!==txId)
      return others.length === 1 ? others[0] : others
    }
    pos.forEach(t => {
      const amt = Math.round((t.amount / totalPos) * compAmt * 100) / 100
      updateTransaction(t.txId, { _compensatedAmt: amt, _compensatedBy: byFor(t.txId) })
    })
    neg.forEach(t => {
      const amt = Math.round((Math.abs(t.amount) / totalNegAbs) * compAmt * 100) / 100
      updateTransaction(t.txId, { _compensatedAmt: amt, _compensatedBy: byFor(t.txId) })
    })
    setSelectedIds(new Set())
    showToast(`✅ ${sel.length} transazioni abbinate e compensate`, 'success')
  }

  function handleRemoveComp(t) {
    const group = [t.txId, ...(Array.isArray(t._compensatedBy) ? t._compensatedBy : (t._compensatedBy ? [t._compensatedBy] : []))]
    group.forEach(txId => updateTransaction(txId, { _compensatedAmt: null, _compensatedBy: null }))
    showToast('Abbinamento rimosso', 'info')
  }

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

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
        {[
          ['Utilizzo medio/mese', avgMensile > 0 ? `€ ${fmtIT(avgMensile,0)}` : '—', 'var(--accent)'],
          ['Estratti da abbinare', lumpTxs.length > 0 ? `${lumpTxs.length} (€ ${fmtIT(lumpTotal,0)})` : '0', lumpTxs.length > 0 ? 'var(--gold)' : 'var(--text2)'],
          ['Carte rilevate', uniqueCards.length || '—', 'var(--text)'],
          [topCat ? `% ${topCat[0]}` : '% categoria più usata', topCat ? `${fmtIT(topCatPct,1)}%` : '—', 'var(--red)'],
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
            display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
            <span style={{fontSize:14,fontWeight:700}}>Transazioni importate (dettaglio carta)</span>
            {selectedIds.size >= 2 ? (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:12,color:'var(--text3)'}}>{selectedIds.size} selezionate</span>
                <button className="btn btn-primary" style={{fontSize:12,padding:'5px 12px'}} onClick={handleAbbina}>
                  🔗 Abbina e compensa
                </button>
                <button className="btn btn-ghost" style={{fontSize:12,padding:'5px 12px'}} onClick={()=>setSelectedIds(new Set())}>
                  Annulla selezione
                </button>
              </div>
            ) : (
              <span style={{fontSize:12,color:'var(--text3)'}}>{cardTxs.length} transazioni · {uniqueCards.length} carte</span>
            )}
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:700}}>
              <thead>
                <tr>
                  {['','Data','AI Descrizione','Descrizione','Categoria','Sottocategoria','Carta','Utente','Importo'].map((h,i)=>(
                    <th key={i} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                      textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                      borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cardTxs.slice(0,200).map((t,i)=>(
                  <CardTxRow key={t.txId||i} t={t} allCats={allCats} updateTransaction={updateTransaction}
                    userAccounts={userAccounts} appPrefs={appPrefs}
                    selected={selectedIds.has(t.txId)} onToggleSelect={toggleSelect} onRemoveComp={handleRemoveComp}/>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
