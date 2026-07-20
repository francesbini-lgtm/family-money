import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { chatWithData } from '../data/aiService'
import { fmtIT } from '../utils/format'
import {
  Sparkles, Send, Trash2, TrendingUp, ShoppingCart,
  Calendar, PiggyBank, BarChart2, Target, AlertTriangle,
  Zap, ChevronRight
} from 'lucide-react'
import './AIChatPage.css'

// ── Quick prompt categories ───────────────────────────────
const QUICK_CATEGORIES = [
  {
    label: '📊 Analisi mese',
    prompts: [
      { icon: <TrendingUp size={13}/>,    text: 'Quanto ho speso questo mese?' },
      { icon: <PiggyBank size={13}/>,     text: 'Quanto ho risparmiato questo mese?' },
      { icon: <Calendar size={13}/>,      text: 'Come va rispetto al mese scorso?' },
      { icon: <BarChart2 size={13}/>,     text: 'Quali sono le mie top 5 categorie di spesa?' },
    ]
  },
  {
    label: '🔍 Analisi dettagliata',
    prompts: [
      { icon: <ShoppingCart size={13}/>,  text: 'Dove spendo di più in assoluto?' },
      { icon: <AlertTriangle size={13}/>, text: 'Ci sono spese anomale o inusuali?' },
      { icon: <Target size={13}/>,        text: 'Qual è il mio tasso di risparmio quest\'anno?' },
      { icon: <Zap size={13}/>,           text: 'Analizza i miei pattern di spesa settimanali' },
    ]
  },
  {
    label: '📈 Trend e proiezioni',
    prompts: [
      { icon: <TrendingUp size={13}/>,    text: 'Come stanno andando le mie finanze nel 2025?' },
      { icon: <Calendar size={13}/>,      text: 'Qual è stato il mio mese migliore quest\'anno?' },
      { icon: <BarChart2 size={13}/>,     text: 'Proietta le mie spese a fine mese' },
      { icon: <PiggyBank size={13}/>,     text: 'Quanto risparmierò a fine anno se continuo così?' },
    ]
  },
  {
    label: '💡 Consigli',
    prompts: [
      { icon: <Target size={13}/>,        text: 'Dove potrei tagliare le spese?' },
      { icon: <Zap size={13}/>,           text: 'Dammi 3 consigli per risparmiare di più' },
      { icon: <ShoppingCart size={13}/>,  text: 'Quali categorie sono cresciute di più?' },
      { icon: <AlertTriangle size={13}/>, text: 'C\'è qualcosa che dovrei tenere d\'occhio?' },
    ]
  },
]

// ── AI Insights (from DashboardPage) ─────────────────────
function AIInsights({ transactions }) {
  const now    = new Date()
  const thisYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const prevYM = (() => { const d=new Date(now.getFullYear(),now.getMonth()-1,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })()
  const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

  if (!transactions.length) return null

  const thisTxs = transactions.filter(t=>!t.excluded&&(t._effDate||t.date||'').startsWith(thisYM))
  const prevTxs = transactions.filter(t=>!t.excluded&&(t._effDate||t.date||'').startsWith(prevYM))
  const thisInc = thisTxs.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)
  const thisExp = Math.abs(thisTxs.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))
  const prevInc = prevTxs.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)
  const prevExp = Math.abs(prevTxs.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))
  const thisSav = thisInc - thisExp
  const prevSav = prevInc - prevExp
  const thisSavRate = thisInc > 0 ? Math.round(thisSav/thisInc*100) : null
  const prevSavRate = prevInc > 0 ? Math.round(prevSav/prevInc*100) : null

  const avg6m = (() => {
    let total=0, count=0
    for (let i=1; i<=6; i++) {
      const d  = new Date(now.getFullYear(), now.getMonth()-i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const inc = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||t.date||'').startsWith(ym)).reduce((s,t)=>s+t.amount,0)
      const exp = Math.abs(transactions.filter(t=>!t.excluded&&t.amount<0&&(t._effDate||t.date||'').startsWith(ym)).reduce((s,t)=>s+t.amount,0))
      if (inc>0) { total += inc-exp; count++ }
    }
    return count>0 ? total/count : null
  })()

  const catSpendThis={}, catSpendPrev={}
  thisTxs.filter(t=>t.amount<0).forEach(t=>{ catSpendThis[t.cat1]=(catSpendThis[t.cat1]||0)+Math.abs(t.amount) })
  prevTxs.filter(t=>t.amount<0).forEach(t=>{ catSpendPrev[t.cat1]=(catSpendPrev[t.cat1]||0)+Math.abs(t.amount) })
  const catGrowth = Object.entries(catSpendThis)
    .map(([cat,amt])=>({ cat, amt, prev: catSpendPrev[cat]||0, delta: catSpendPrev[cat]?Math.round((amt-catSpendPrev[cat])/catSpendPrev[cat]*100):null }))
    .filter(c=>c.prev>0&&c.delta!==null).sort((a,b)=>b.delta-a.delta)
  const fastestGrowing   = catGrowth[0]
  const fastestShrinking = catGrowth[catGrowth.length-1]
  const largestExp = [...thisTxs].filter(t=>t.amount<0).sort((a,b)=>a.amount-b.amount)[0]

  const dayOfMonth  = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
  const dailyRate   = dayOfMonth > 3 ? thisExp/dayOfMonth : 0
  const projectedExp = Math.round(dailyRate * daysInMonth)
  const projectedSav = Math.round(thisInc - projectedExp)

  const negMonths = (() => {
    let count=0
    for (let m=0; m<now.getMonth(); m++) {
      const ym = `${now.getFullYear()}-${String(m+1).padStart(2,'0')}`
      const inc = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||t.date||'').startsWith(ym)).reduce((s,t)=>s+t.amount,0)
      const exp = Math.abs(transactions.filter(t=>!t.excluded&&t.amount<0&&(t._effDate||t.date||'').startsWith(ym)).reduce((s,t)=>s+t.amount,0))
      if (inc>0 && inc<exp) count++
    }
    return count
  })()

  const bestMonth = (() => {
    let best=null, bestAmt=-Infinity
    for (let m=0; m<now.getMonth(); m++) {
      const ym = `${now.getFullYear()}-${String(m+1).padStart(2,'0')}`
      const inc = transactions.filter(t=>!t.excluded&&t.amount>0&&(t._effDate||t.date||'').startsWith(ym)).reduce((s,t)=>s+t.amount,0)
      const exp = Math.abs(transactions.filter(t=>!t.excluded&&t.amount<0&&(t._effDate||t.date||'').startsWith(ym)).reduce((s,t)=>s+t.amount,0))
      const sav = inc-exp
      if (inc>0 && sav>bestAmt) { bestAmt=sav; best=MONTHS_IT[m] }
    }
    return { name:best, amt:bestAmt }
  })()

  const diningThis = thisTxs.filter(t=>t.amount<0&&(t.cat1==='Tempo Libero'||(t.cat2||'').toLowerCase().includes('ristoran')||(t.cat2||'').toLowerCase().includes('bar')||(t.cat2||'').toLowerCase().includes('cena'))).reduce((s,t)=>s+Math.abs(t.amount),0)
  const diningPrev = prevTxs.filter(t=>t.amount<0&&(t.cat1==='Tempo Libero'||(t.cat2||'').toLowerCase().includes('ristoran')||(t.cat2||'').toLowerCase().includes('bar')||(t.cat2||'').toLowerCase().includes('cena'))).reduce((s,t)=>s+Math.abs(t.amount),0)
  const diningDelta = diningPrev>0 ? Math.round((diningThis-diningPrev)/diningPrev*100) : null
  const savRateDelta = thisSavRate!==null && prevSavRate!==null ? thisSavRate-prevSavRate : null

  const insights = []
  if (avg6m!==null) {
    const vsAvg = Math.round((thisSav-avg6m)/Math.abs(avg6m||1)*100)
    insights.push({ icon:'🐷', title:'Risparmio vs media 6 mesi',
      text: vsAvg>=0 ? `+${vsAvg}% sopra la media` : `${vsAvg}% sotto la media`,
      sub: `Media: € ${fmtIT(Math.round(avg6m),0)} · Questo mese: ${thisSav>=0?'+':''}€ ${fmtIT(Math.round(thisSav),0)}`,
      color: vsAvg>=5?'var(--green)':vsAvg>=-10?'var(--gold)':'var(--red)' })
  }
  if (thisSavRate!==null) {
    const msg = thisSavRate>=20?'Eccellente':thisSavRate>=10?'Accettabile':'Sotto soglia'
    insights.push({ icon:'💰', title:'Tasso risparmio',
      text:`${thisSavRate}% del reddito risparmiato`,
      sub: savRateDelta!==null ? `${savRateDelta>=0?'+':''}${savRateDelta}pp vs mese scorso · ${msg}` : msg,
      color: thisSavRate>=20?'var(--green)':thisSavRate>=10?'var(--gold)':'var(--red)' })
  }
  if (thisInc>0 && dayOfMonth>5) {
    insights.push({ icon:'📈', title:'Proiezione fine mese',
      text: projectedSav>=0 ? `+€ ${fmtIT(projectedSav,0)} previsti` : `Rischio deficit −€ ${fmtIT(Math.abs(projectedSav),0)}`,
      sub: `€ ${fmtIT(Math.round(dailyRate),0)}/giorno · ${daysInMonth-dayOfMonth}gg rimanenti`,
      color: projectedSav>=0?'var(--blue)':'var(--red)' })
  }
  if (fastestGrowing && fastestGrowing.delta>15) {
    insights.push({ icon:'⚠️', title:'Categoria in crescita',
      text:`${fastestGrowing.cat} +${fastestGrowing.delta}% vs mese scorso`,
      sub:`€ ${fmtIT(Math.round(fastestGrowing.prev),0)} → € ${fmtIT(Math.round(fastestGrowing.amt),0)}`,
      color: fastestGrowing.delta>40?'var(--red)':'var(--gold)' })
  }
  if (fastestShrinking && fastestShrinking.delta<-15) {
    insights.push({ icon:'✂️', title:'Categoria in calo',
      text:`${fastestShrinking.cat} ${fastestShrinking.delta}% vs mese scorso`,
      sub:`€ ${fmtIT(Math.round(fastestShrinking.prev),0)} → € ${fmtIT(Math.round(fastestShrinking.amt),0)}`,
      color:'var(--green)' })
  }
  if (largestExp) {
    insights.push({ icon:'💸', title:'Spesa più alta del mese',
      text: largestExp.descAI||(largestExp.description||'').slice(0,40)||'—',
      sub:`€ ${fmtIT(Math.abs(largestExp.amount),2)} · ${largestExp.cat1||'—'}`,
      color:'var(--text2)' })
  }
  if (diningThis>0||diningPrev>0) {
    insights.push({ icon:'🍽️', title:'Cene & Ristoranti',
      text: diningDelta!==null ? `${diningDelta>=0?'+':''}${diningDelta}% vs mese scorso` : `€ ${fmtIT(Math.round(diningThis),0)} questo mese`,
      sub: diningThis>0 ? `Totale: € ${fmtIT(Math.round(diningThis),0)}` : null,
      color: diningDelta===null||diningDelta<=0?'var(--green)':diningDelta>20?'var(--red)':'var(--gold)' })
  }
  if (now.getMonth()>0) {
    insights.push({ icon: negMonths===0?'🏅':'📉', title:`Mesi in deficit ${now.getFullYear()}`,
      text: negMonths===0 ? 'Nessun mese in rosso!' : `${negMonths} ${negMonths===1?'mese':'mesi'} in rosso su ${now.getMonth()} chiusi`,
      sub: negMonths===0?'Ottima gestione annuale':'Mesi in cui uscite > entrate',
      color: negMonths===0?'var(--green)':negMonths>=3?'var(--red)':'var(--gold)' })
  }
  if (bestMonth.name && bestMonth.amt>0) {
    insights.push({ icon:'🏆', title:`Miglior mese ${now.getFullYear()}`,
      text:`${bestMonth.name}: +€ ${fmtIT(bestMonth.amt,0)} risparmiati`,
      sub:'Mese con risparmio più alto dell\'anno',
      color:'var(--green)' })
  }

  if (!insights.length) return null

  return (
    <div className="ai-insights-section">
      <div className="ai-insights-header">
        <span>✨</span>
        <span>Insights automatici</span>
        <span className="ai-insights-date">{now.toLocaleDateString('it-IT',{day:'2-digit',month:'long'})}</span>
      </div>
      <div className="ai-insights-grid">
        {insights.map((ins,i)=>(
          <div key={i} className="ai-insight-card" style={{borderLeftColor: ins.color}}>
            <span className="ai-insight-icon">{ins.icon}</span>
            <div>
              <div className="ai-insight-title">{ins.title}</div>
              <div className="ai-insight-text">{ins.text}</div>
              {ins.sub && <div className="ai-insight-sub">{ins.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Rendering minimale markdown per i messaggi AI ─────────
// Richiesta utente 2026-07-19: il testo **grassetto** veniva mostrato con gli
// asterischi letterali invece che in grassetto vero — l'AI (Gemini) risponde
// spesso in markdown ma il messaggio era renderizzato come testo puro. Qui si
// gestisce solo **grassetto** (il caso segnalato); il div `.chat-bubble` ha già
// `white-space:pre-wrap` quindi gli a-capo del testo restano invariati senza
// bisogno di ricostruire paragrafi/<br/> a mano.
function renderChatContent(text) {
  if (!text) return null
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

// ── Message ───────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={'chat-msg ' + (isUser ? 'chat-msg-user' : 'chat-msg-ai')}>
      {!isUser && (
        <div className="chat-avatar">
          <Sparkles size={14} color="var(--gold)" />
        </div>
      )}
      <div className={'chat-bubble ' + (isUser ? 'bubble-user' : 'bubble-ai')}>
        {isUser ? msg.content : renderChatContent(msg.content)}
        {msg.error && <div className="chat-error">⚠️ {msg.error}</div>}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function AIChatPage() {
  // Richiesta utente 2026-07-19: rimossa la sub-tab "Chat" — l'esperienza
  // chat era già interamente presente (colonna centrale) dentro "Insights",
  // quindi la tab standalone era ridondante; ora la pagina mostra sempre
  // il layout a 3 colonne, senza più bisogno di uno switch di tab.
  const { transactions, aiChatHistory, addChatMessage, clearChat } = useStore()
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiChatHistory, loading])

  const isEmpty = transactions.length === 0

  async function sendMessage(text) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    addChatMessage({ role: 'user', content: msg })
    setLoading(true)
    try {
      const history = aiChatHistory.map(m => ({ role: m.role, content: m.content }))
      const reply = await chatWithData(msg, transactions, { history })
      addChatMessage({ role: 'model', content: reply })
    } catch (err) {
      addChatMessage({ role: 'model', content: 'Mi dispiace, si è verificato un errore.', error: err.message })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="chat-page" style={{maxWidth:'100%',margin:0}}>
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-gem"><Sparkles size={18} color="var(--gold)" /></div>
          <div>
            <h1 className="chat-title">AI Assistant</h1>
            <div className="chat-sub">{transactions.length} transazioni · Gemini AI</div>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {aiChatHistory.length > 0 && (
            <button className="btn btn-ghost" onClick={clearChat} title="Pulisci chat">
              <Trash2 size={14} /> Cancella
            </button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="chat-empty">
          <Sparkles size={32} color="var(--gold)" />
          <div className="chat-empty-title">Nessun dato disponibile</div>
          <div className="chat-empty-sub">
            Importa le transazioni dalla sezione <strong>Transazioni</strong> per abilitare l'AI Assistant.
          </div>
        </div>
      ) : (
        <>
          {/* Layout unico a 3 colonne (era la tab "Insights") */}
          {(
            <div style={{flex:1,display:'grid',gridTemplateColumns:'260px 1fr 260px',overflow:'hidden'}}>

              {/* LEFT — insight cards */}
              <div style={{overflowY:'auto',padding:'16px 14px',borderRight:'1px solid var(--border)'}}>
                <AIInsights transactions={transactions} />
              </div>

              {/* CENTER — chat */}
              <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
                <div className="chat-messages" style={{flex:1,padding:'16px 20px'}}>
                  {aiChatHistory.length === 0 && (
                    <div className="chat-welcome">
                      <div className="chat-welcome-icon">💬</div>
                      <div className="chat-welcome-title">Chiedimi qualsiasi cosa</div>
                      <div className="chat-welcome-sub">
                        Ho accesso alle tue {transactions.length} transazioni. Usa i prompt a destra per iniziare.
                      </div>
                    </div>
                  )}
                  {aiChatHistory.map((msg, i) => <Message key={i} msg={msg} />)}
                  {loading && (
                    <div className="chat-msg chat-msg-ai">
                      <div className="chat-avatar"><Sparkles size={14} color="var(--gold)" /></div>
                      <div className="chat-bubble bubble-ai bubble-loading"><span /><span /><span /></div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
                <div className="chat-input-wrap">
                  <div className="chat-input-bar">
                    <input ref={inputRef} className="chat-input"
                      placeholder="Chiedi qualcosa sulle tue finanze…"
                      value={input} onChange={e=>setInput(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&sendMessage()}
                      disabled={loading}/>
                    <button className="btn btn-primary chat-send" onClick={()=>sendMessage()} disabled={loading||!input.trim()}>
                      <Send size={14}/>
                    </button>
                  </div>
                  <div className="chat-input-hint">Invio per inviare · Gemini AI</div>
                </div>
              </div>

              {/* RIGHT — quick prompts */}
              <div style={{overflowY:'auto',padding:'16px 14px',borderLeft:'1px solid var(--border)'}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14,display:'flex',alignItems:'center',gap:6}}>
                  <Sparkles size={13} color="var(--gold)"/>Chiedi all'AI
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  {QUICK_CATEGORIES.map((cat,ci)=>(
                    <div key={ci}>
                      <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.06em'}}>
                        {cat.label}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:5}}>
                        {cat.prompts.map((p,pi)=>(
                          <button key={pi} className="quick-prompt"
                            style={{justifyContent:'flex-start',borderRadius:8,padding:'7px 10px',textAlign:'left',gap:6,width:'100%'}}
                            onClick={()=>sendMessage(p.text)}>
                            {p.icon}
                            <span style={{fontSize:11}}>{p.text}</span>
                            <ChevronRight size={10} style={{marginLeft:'auto',opacity:.4,flexShrink:0}}/>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
