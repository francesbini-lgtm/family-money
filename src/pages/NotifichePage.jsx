import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { navigateRef } from '../utils/navigate'
import { fmtIT, fmtDate } from '../utils/format'

// ── Response modal for a clarification request ────────────
function ChiarimentoResponseModal({ req, onClose }) {
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const updateTransaction = useStore(s => s.updateTransaction)
  const [note, setNote]   = useState('')
  const [saved, setSaved] = useState(false)

  const info = req.txInfo || {}

  function saveResponse() {
    if (!note.trim()) return

    // 1. Mark request as responded
    const reqs = (appPrefs.clarificationRequests || []).map(r =>
      r.id === req.id ? { ...r, status: 'responded', note: note.trim(), respondedAt: new Date().toISOString() } : r
    )
    setAppPref('clarificationRequests', reqs)

    // 2. Save note to aeNotes (same key as AltreEntrate)
    const aeNotes = { ...(appPrefs.aeNotes || {}), [req.entryKey]: note.trim() }
    setAppPref('aeNotes', aeNotes)

    // 3. If entryKey is a txId, also update the transaction note (via _note field)
    if (req.entryKey && req.entryKey.startsWith('tx')) {
      updateTransaction(req.entryKey, { _note: note.trim() })
    }

    setSaved(true)
    setTimeout(onClose, 1000)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
        width:500,maxWidth:'92vw',maxHeight:'85vh',overflowY:'auto',padding:24,boxShadow:'0 8px 32px rgba(0,0,0,.22)'}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>💬 Chiarimento richiesto da {req.fromUser}</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:16}}>Aggiungi una nota su questa entrata</div>

        {/* Transaction info */}
        <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
          <div style={{display:'grid',gridTemplateColumns:'max-content 1fr',gap:'6px 16px',fontSize:12}}>
            {info.descAI && <><span style={{color:'var(--text3)',fontWeight:600}}>AI Descr.</span><span style={{fontWeight:600}}>{info.descAI}</span></>}
            {info.date   && <><span style={{color:'var(--text3)',fontWeight:600}}>Data</span><span>{fmtDate(info.date)}</span></>}
            {info.amount !== undefined && <><span style={{color:'var(--text3)',fontWeight:600}}>Importo</span><span style={{color:'var(--green)',fontWeight:700}}>+€{fmtIT(info.amount,2)}</span></>}
            {info.cat1   && <><span style={{color:'var(--text3)',fontWeight:600}}>Categoria</span><span>{info.cat1}{info.cat2?` › ${info.cat2}`:''}</span></>}
            {info.merchant && <><span style={{color:'var(--text3)',fontWeight:600}}>Merchant</span><span>{info.merchant}</span></>}
          </div>
          {info.description && (
            <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Descrizione originale</div>
              <div style={{fontSize:11,color:'var(--text2)',fontFamily:'var(--font-mono)',wordBreak:'break-all'}}>{info.description}</div>
            </div>
          )}
        </div>

        <div style={{marginBottom:16}}>
          <label style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:6}}>
            La tua nota
          </label>
          <textarea
            value={note} onChange={e=>setNote(e.target.value)} autoFocus
            placeholder="Spiega di cosa si tratta, da dove viene questo importo…"
            style={{width:'100%',minHeight:80,padding:'10px 12px',border:'1px solid var(--border)',
              borderRadius:8,fontSize:13,background:'var(--surface)',color:'var(--text)',
              outline:'none',resize:'vertical',fontFamily:'var(--font-sans)',boxSizing:'border-box'}}
          />
        </div>

        {saved && <div style={{padding:'8px 12px',background:'var(--green-l)',borderRadius:8,marginBottom:12,fontSize:12,color:'var(--green)',fontWeight:600}}>✅ Nota salvata!</div>}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Chiudi</button>
          <button className="btn btn-primary" onClick={saveResponse} disabled={!note.trim()||saved}>Salva nota</button>
        </div>
      </div>
    </div>
  )
}

export default function NotifichePage() {
  const transactions      = useStore(s => s.transactions)
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const setFilter         = useStore(s => s.setFilter)
  const _recompute        = useStore(s => s._recomputeFiltered)
  const [respondTo, setRespondTo] = useState(null)

  const clarReqs = appPrefs?.clarificationRequests || []
  const pendingReqs = clarReqs.filter(r => r.status === 'pending')
  const respondedReqs = clarReqs.filter(r => r.status === 'responded')

  const uncatTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && t.cat1 === 'Non Categorizzato'),
    [transactions]
  )

  function goToUncategorized() {
    setFilter('cat1', 'Non Categorizzato')
    _recompute()
    navigateRef.current?.('transactions')
  }

  function dismissResponded(id) {
    setAppPref('clarificationRequests', clarReqs.filter(r => r.id !== id))
  }

  return (
    <div style={{maxWidth:720,margin:'0 auto',padding:'24px 16px'}}>
      <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>🔔 Notifiche</div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:24}}>Avvisi e azioni richieste</div>

      {/* Pending clarification requests */}
      {pendingReqs.length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--accent)',marginBottom:10}}>
            💬 Chiarimenti richiesti ({pendingReqs.length})
          </div>
          {pendingReqs.map(req => (
            <div key={req.id} style={{padding:'14px 18px',background:'var(--surface)',
              border:'2px solid var(--accent)',borderRadius:12,marginBottom:10,display:'flex',alignItems:'flex-start',gap:14,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>
                  {req.fromUser} → <span style={{color:'var(--accent)'}}>{req.toUser}</span>
                </div>
                <div style={{fontSize:12,color:'var(--text2)',marginBottom:2}}>
                  <strong>{req.txInfo?.descAI || req.txInfo?.merchant || '—'}</strong>
                  {req.txInfo?.date && <span style={{color:'var(--text3)',marginLeft:8}}>{fmtDate(req.txInfo.date)}</span>}
                  {req.txInfo?.amount !== undefined && <span style={{color:'var(--green)',fontWeight:700,marginLeft:8}}>+€{fmtIT(req.txInfo.amount,2)}</span>}
                </div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{new Date(req.requestedAt).toLocaleDateString('it-IT')}</div>
              </div>
              <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>setRespondTo(req)}>
                Rispondi
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Responded requests (dismissible) */}
      {respondedReqs.length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--green)',marginBottom:10}}>
            ✅ Chiarimenti ricevuti ({respondedReqs.length})
          </div>
          {respondedReqs.map(req => (
            <div key={req.id} style={{padding:'12px 16px',background:'var(--surface)',
              border:'1px solid var(--border)',borderRadius:10,marginBottom:8,display:'flex',alignItems:'flex-start',gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:2}}>
                  {req.txInfo?.descAI || req.txInfo?.merchant || '—'}
                  <span style={{color:'var(--text3)',fontWeight:400,marginLeft:8,fontSize:11}}>{fmtDate(req.txInfo?.date)}</span>
                </div>
                <div style={{fontSize:12,color:'var(--text2)',fontStyle:'italic'}}>"{req.note}"</div>
                <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>da {req.toUser} · {new Date(req.respondedAt).toLocaleDateString('it-IT')}</div>
              </div>
              <button onClick={()=>dismissResponded(req.id)}
                style={{border:'none',background:'none',cursor:'pointer',color:'var(--text3)',fontSize:13,padding:2}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Uncategorized transactions */}
      {uncatTxs.length > 0 ? (
        <div style={{padding:'16px 20px',background:'#fff8f0',border:'1px solid #f59e0b',
          borderRadius:12,marginBottom:16,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:'#92400e',marginBottom:4}}>
              ⚠️ {uncatTxs.length} transazion{uncatTxs.length===1?'e':'i'} non categorizzat{uncatTxs.length===1?'a':'e'}
            </div>
            <div style={{fontSize:12,color:'#b45309'}}>Alcune transazioni non hanno ancora una categoria assegnata</div>
          </div>
          <button onClick={goToUncategorized} style={{
            padding:'8px 18px',borderRadius:8,border:'none',cursor:'pointer',
            background:'#f59e0b',color:'#fff',fontSize:13,fontWeight:700,
            fontFamily:'var(--font-sans)',flexShrink:0}}>
            Vai alle transazioni →
          </button>
        </div>
      ) : (
        <div style={{padding:'14px 18px',background:'var(--surface)',border:'1px solid var(--border)',
          borderRadius:12,marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:16}}>✅</span>
          <div style={{fontSize:13,color:'var(--text2)'}}>Tutte le transazioni sono categorizzate</div>
        </div>
      )}

      <div style={{padding:'14px 18px',background:'var(--surface)',border:'1px solid var(--border)',
        borderRadius:12,display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}
        onClick={()=>navigateRef.current?.('scadenze')}>
        <span style={{fontSize:16}}>📅</span>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text1)'}}>Scadenze</div>
          <div style={{fontSize:11,color:'var(--text3)'}}>Visualizza pagamenti e scadenze in arrivo</div>
        </div>
        <span style={{fontSize:13,color:'var(--text3)'}}>→</span>
      </div>

      {respondTo && (
        <ChiarimentoResponseModal
          req={respondTo}
          onClose={()=>setRespondTo(null)}
        />
      )}
    </div>
  )
}
