import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { fmtIT } from '../utils/format'

const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function fmtDate(d) {
  const m = (d||'').match(/\d{4}-(\d{2})-(\d{2})/)
  return m ? `${parseInt(m[2])} ${MONTHS[parseInt(m[1])-1]}` : (d||'—')
}

export default function CarteCreditoPage() {
  const transactions = useStore(s => s.transactions)

  const cardTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && t.card && t.card !== 'null' && t.card !== 'undefined')
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  const uniqueCards = useMemo(() => [...new Set(cardTxs.map(t=>t.card))], [cardTxs])

  const totalSpesa = cardTxs.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0)
  const avgSpesa   = cardTxs.filter(t=>t.amount<0).length > 0 
    ? totalSpesa / cardTxs.filter(t=>t.amount<0).length : 0

  // Most used card
  const cardCounts = {}
  cardTxs.forEach(t => { cardCounts[t.card] = (cardCounts[t.card]||0) + 1 })
  const topCard = Object.entries(cardCounts).sort((a,b)=>b[1]-a[1])[0]

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
            Questa pagina mostrerà analisi avanzate sull'utilizzo delle carte. Per ora visualizza le transazioni con carta collegata.
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
        {[
          ['Carte rilevate', uniqueCards.length || '—', 'var(--accent)'],
          ['Spesa totale su carte', totalSpesa > 0 ? `€ ${fmtIT(totalSpesa,0)}` : '—', 'var(--red)'],
          ['Carta più usata', topCard ? `*${topCard[0]} (${topCard[1]} tx)` : '—', 'var(--text)'],
          ['Media per transazione', avgSpesa > 0 ? `€ ${fmtIT(avgSpesa,0)}` : '—', 'var(--text2)'],
        ].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:'14px 18px',borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--text3)',marginBottom:5}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-mono)',color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {cardTxs.length === 0 ? (
        <div style={{textAlign:'center',padding:'48px 24px',background:'var(--surface)',
          border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
          <div style={{fontSize:36,marginBottom:12}}>💳</div>
          <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Nessuna transazione con carta</div>
          <div style={{fontSize:13,color:'var(--text3)'}}>
            Le transazioni con carta verranno rilevate automaticamente dopo l'importazione del CSV.
          </div>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:14,fontWeight:700}}>Transazioni su Carta</span>
            <span style={{fontSize:12,color:'var(--text3)'}}>{cardTxs.length} transazioni · {uniqueCards.length} carte</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
              <thead>
                <tr>
                  {['Data','AI Descrizione','Descrizione','Carta','Importo'].map(h=>(
                    <th key={h} style={{padding:'9px 14px',fontSize:10,fontWeight:700,letterSpacing:'.07em',
                      textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                      borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cardTxs.slice(0,200).map((t,i)=>(
                  <tr key={t.txId||i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'8px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                      {fmtDate(t._effDate||t.date)}
                    </td>
                    <td style={{padding:'8px 14px',fontSize:13,fontWeight:600,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {t.descAI||'—'}
                    </td>
                    <td style={{padding:'8px 14px',fontSize:11,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {(t.description||'').slice(0,60)}
                    </td>
                    <td style={{padding:'8px 14px'}}>
                      <span style={{fontSize:11,fontFamily:'var(--font-mono)',padding:'2px 6px',
                        borderRadius:8,background:'var(--surface2)',border:'1px solid var(--border)',
                        color:'var(--text2)',fontWeight:700}}>*{t.card}</span>
                    </td>
                    <td style={{padding:'8px 14px',textAlign:'right',fontFamily:'var(--font-mono)',
                      fontSize:13,fontWeight:700,color:t.amount>=0?'var(--green)':'var(--red)'}}>
                      {t.amount>=0?'+':'−'}€ {fmtIT(Math.abs(t.amount),2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
