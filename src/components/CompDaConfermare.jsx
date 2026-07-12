import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { fmtIT } from '../utils/format'
import { isCompensated, compensateGroup } from '../data/compensation'
import { showToast } from '../services/notifications'

// ── Sezione "Da confermare" per PayPal e Carte (richiesta utente 2026-07-11) ──
// Stessa esperienza della modalità "Da confermare" di Satispay (SatiPendingModal):
// il sistema cerca, DENTRO il perimetro di transazioni passato dal chiamante
// (solo PayPal, o solo dettaglio Carte — mai mescolate), coppie formate da una
// transazione negativa (spesa) e una positiva (rimborso/storno) con lo STESSO
// importo, e le propone all'utente una alla volta:
//   ✅ Conferma  → compensateGroup() (stesso motore condiviso di PayPal/Carte/AltreEntrate)
//   Salta →      → resta nella lista "Da confermare", si passa alla successiva
//   ❌ Sono due transazioni diverse → la coppia esatta (expTxId|incTxId) viene
//      salvata in appPrefs.compRejectedPairs[scope] e NON verrà mai più proposta.
//
// Logica di abbinamento volutamente identica allo spirito di autoMatchSati:
// importo uguale al centesimo (<0,02€) e rimborso datato lo stesso giorno o DOPO
// la spesa (un rimborso non precede mai ciò che rimborsa); a parità di importo
// vince la spesa più vicina nel tempo. Nessuna transazione già compensata
// (isCompensated) o esclusa entra mai nei suggerimenti.

const pairKey = (expId, incId) => `${expId}|${incId}`

const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function fmtDate(d) {
  const m = (d||'').match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${String(m[3]).padStart(2,'0')} ${MONTHS[parseInt(m[2])-1]} ${m[1].slice(2)}` : (d||'—')
}

// limitTxIds (opzionale, Set di txId): se presente, vengono proposte SOLO le
// coppie in cui ALMENO UNA delle due transazioni appartiene al set — usato dal
// wizard di importazione per limitare i suggerimenti alle transazioni importate
// in QUEL flusso (richiesta utente 2026-07-12), non a tutto il pending storico.
export function findCompPairs(txs, rejected, limitTxIds = null) {
  const free = (txs||[]).filter(t => t && !t.excluded && !isCompensated(t))
  const exps = free.filter(t => t.amount < 0)
  const incs = free.filter(t => t.amount > 0)
    .sort((a,b) => (a._effDate||a.date||'').localeCompare(b._effDate||b.date||''))
  const usedExp = new Set()
  const pairs = []
  for (const inc of incs) {
    let best = null, bestGap = Infinity
    for (const exp of exps) {
      if (usedExp.has(exp.txId)) continue
      if (rejected[pairKey(exp.txId, inc.txId)]) continue
      if (Math.abs(Math.abs(exp.amount) - Math.abs(inc.amount)) >= 0.02) continue
      const gap = (new Date(inc._effDate||inc.date) - new Date(exp._effDate||exp.date)) / 86400000
      if (gap < 0) continue
      if (gap < bestGap) { bestGap = gap; best = exp }
    }
    if (best) {
      if (limitTxIds && !limitTxIds.has(best.txId) && !limitTxIds.has(inc.txId)) continue
      usedExp.add(best.txId)
      pairs.push({ exp: best, inc, gapDays: Math.round(bestGap) })
    }
  }
  return pairs
}

function TxCard({ title, color, bg, border, tx, sign }) {
  return (
    <div style={{background:bg,border:`1px solid ${border}`,borderRadius:12,padding:'14px 16px'}}>
      <div style={{fontSize:12,fontWeight:700,color,marginBottom:10}}>{title}</div>
      {[
        ['Descrizione', tx.descAI || tx.merchant || tx.description?.slice(0,40) || '—'],
        ['Data', fmtDate(tx._effDate||tx.date)],
        ['Importo', `${sign}€ ${fmtIT(Math.abs(tx.amount),2)}`],
        ...(tx.cat1 ? [['Categoria', `${tx.cat1}${tx.cat2 ? ' › '+tx.cat2 : ''}`]] : []),
      ].map(([l,v]) => (
        <div key={l} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'4px 0',
          borderBottom:'1px solid rgba(0,0,0,.05)',fontSize:13}}>
          <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',
            color:'var(--text3)',flexShrink:0}}>{l}</span>
          <span style={{textAlign:'right'}}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// scope: 'paypal' | 'carte' — chiave separata di appPrefs.compRejectedPairs,
// così un rifiuto in PayPal non tocca Carte e viceversa.
export default function CompDaConfermare({ txs, scope, incomeLabel = '📥 Rimborso/Storno', limitTxIds = null }) {
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const updateTransaction = useStore(s => s.updateTransaction)

  const allRejected = appPrefs?.compRejectedPairs || {}
  const rejected    = allRejected[scope] || {}

  const pairs = useMemo(() => findCompPairs(txs, rejected, limitTxIds), [txs, rejected, limitTxIds])

  const [idx, setIdx] = useState(null) // null = modale chiuso

  // La lista si ricalcola dopo ogni conferma/rifiuto: tieni l'indice dentro i limiti,
  // chiudi il modale quando non c'è più niente da confermare.
  useEffect(() => {
    if (idx === null) return
    if (!pairs.length) setIdx(null)
    else if (idx >= pairs.length) setIdx(0)
  }, [pairs.length, idx])

  if (!pairs.length) return null

  const cur = idx !== null && idx < pairs.length ? pairs[idx] : null

  function handleConfirm() {
    if (!cur) return
    const result = compensateGroup([cur.exp, cur.inc], updateTransaction)
    if (!result.ok) {
      showToast('Impossibile compensare (residuo non disponibile?)', 'error')
      return
    }
    showToast('✅ Transazioni abbinate e compensate', 'success')
    // la coppia sparisce dalla lista al ricalcolo — idx clampato dall'effect
  }

  function handleReject() {
    if (!cur) return
    setAppPref('compRejectedPairs', {
      ...allRejected,
      [scope]: { ...rejected, [pairKey(cur.exp.txId, cur.inc.txId)]: true },
    })
    // la coppia non verrà mai più proposta — idx clampato dall'effect
  }

  function handleSkip() {
    if (!cur) return
    setIdx((idx + 1) % pairs.length)
  }

  return (
    <>
      <button onClick={() => setIdx(0)}
        style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',
          border:'1px solid #f59e0b',borderRadius:20,background:'#fef3c7',color:'#92400e',
          fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
        ⏳ Da confermare ({pairs.length})
      </button>

      {cur && (
        <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e => e.target === e.currentTarget && setIdx(null)}>
          <div style={{background:'var(--surface)',borderRadius:16,padding:'26px 28px',width:'100%',maxWidth:680,
            maxHeight:'90vh',overflowY:'auto',position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,.28)'}}>
            <button onClick={() => setIdx(null)}
              style={{position:'absolute',top:14,right:16,background:'none',border:'none',
                cursor:'pointer',fontSize:18,color:'var(--text3)'}}>✕</button>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <div style={{fontSize:16,fontWeight:800}}>⏳ Abbinamento da confermare</div>
              {pairs.length > 1 && (
                <span style={{fontSize:12,fontWeight:700,padding:'2px 9px',borderRadius:12,
                  background:'var(--surface2)',color:'var(--text3)',border:'1px solid var(--border)'}}>
                  {idx + 1} / {pairs.length}
                </span>
              )}
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:20}}>
              Stesso importo · {cur.gapDays} {cur.gapDays === 1 ? 'giorno' : 'giorni'} di distanza.
              Conferma se il rimborso si riferisce a questa spesa.
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:4}}>
              <TxCard title="🧾 Spesa" color="var(--red)" bg="#fef2f2" border="#fca5a5" tx={cur.exp} sign="−"/>
              <TxCard title={incomeLabel} color="var(--green)" bg="#f0fdf4" border="#6ee7b7" tx={cur.inc} sign="+"/>
            </div>
            <div style={{display:'flex',gap:10,marginTop:20,flexWrap:'wrap',alignItems:'center'}}>
              <button onClick={handleConfirm}
                style={{padding:'9px 20px',background:'#16a34a',color:'#fff',border:'none',
                  borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                ✅ Conferma abbinamento
              </button>
              <button onClick={handleReject}
                style={{padding:'9px 18px',background:'transparent',color:'var(--text2)',
                  border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontWeight:600,
                  cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                ❌ Sono due transazioni diverse
              </button>
              {pairs.length > 1 && (
                <button onClick={handleSkip}
                  style={{marginLeft:'auto',padding:'9px 16px',background:'transparent',color:'var(--text3)',
                    border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontWeight:600,
                    cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                  Salta →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
