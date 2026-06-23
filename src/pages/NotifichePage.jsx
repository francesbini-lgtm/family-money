import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { navigateRef } from '../utils/navigate'

export default function NotifichePage() {
  const transactions = useStore(s => s.transactions)
  const setFilter    = useStore(s => s.setFilter)
  const _recompute   = useStore(s => s._recomputeFiltered)

  const uncatTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && t.cat1 === 'Non Categorizzato'),
    [transactions]
  )

  function goToUncategorized() {
    setFilter('cat1', 'Non Categorizzato')
    _recompute()
    navigateRef.current?.('transactions')
  }

  return (
    <div style={{maxWidth:720,margin:'0 auto',padding:'24px 16px'}}>
      <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>🔔 Notifiche</div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:24}}>Avvisi e azioni richieste</div>

      {uncatTxs.length > 0 ? (
        <div style={{padding:'16px 20px',background:'#fff8f0',border:'1px solid #f59e0b',
          borderRadius:12,marginBottom:16,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:'#92400e',marginBottom:4}}>
              ⚠️ {uncatTxs.length} transazion{uncatTxs.length===1?'e':'i'} non categorizzat{uncatTxs.length===1?'a':'e'}
            </div>
            <div style={{fontSize:12,color:'#b45309'}}>
              Alcune transazioni non hanno ancora una categoria assegnata
            </div>
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
    </div>
  )
}
