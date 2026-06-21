import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { chatWithData } from '../data/aiService'
import { Sparkles, Send, Trash2, TrendingUp, ShoppingCart, Calendar, PiggyBank } from 'lucide-react'
import './AIChatPage.css'

const QUICK_PROMPTS = [
  { icon: <TrendingUp size={14}/>, text: 'Quanto ho speso questo mese?' },
  { icon: <ShoppingCart size={14}/>, text: 'Quali sono le mie top 3 categorie di spesa?' },
  { icon: <Calendar size={14}/>, text: 'Come va rispetto al mese scorso?' },
  { icon: <PiggyBank size={14}/>, text: 'Quanto ho risparmiato finora?' },
]

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
        {msg.content}
        {msg.error && <div className="chat-error">⚠️ {msg.error}</div>}
      </div>
    </div>
  )
}

export default function AIChatPage() {
  const { transactions, aiChatHistory, addChatMessage, clearChat } = useStore()
  const [input, setInput]   = useState('')
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

    // Add user message
    addChatMessage({ role: 'user', content: msg })
    setLoading(true)

    try {
      // Build history for Gemini (exclude current msg)
      const history = aiChatHistory.map(m => ({ role: m.role, content: m.content }))
      const reply = await chatWithData(msg, transactions, { history })
      addChatMessage({ role: 'model', content: reply })
    } catch (err) {
      addChatMessage({
        role: 'model',
        content: 'Mi dispiace, si è verificato un errore.',
        error: err.message,
      })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="chat-page">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-gem">
            <Sparkles size={18} color="var(--gold)" />
          </div>
          <div>
            <h1 className="chat-title">AI Financial Assistant</h1>
            <div className="chat-sub">Powered by Gemini — {transactions.length} transazioni · {aiChatHistory.length} messaggi salvati</div>
          </div>
        </div>
        {aiChatHistory.length > 0 && (
          <button className="btn btn-ghost" onClick={clearChat} title="Pulisci chat">
            <Trash2 size={14} /> Cancella
          </button>
        )}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="chat-empty">
          <Sparkles size={32} color="var(--gold)" />
          <div className="chat-empty-title">Nessun dato disponibile</div>
          <div className="chat-empty-sub">
            Importa le transazioni dalla sezione <strong>Transazioni</strong> per abilitare l'assistente AI.
            Potrai poi chiedermi di analizzare le tue spese, confrontare mesi, trovare pattern e molto altro.
          </div>
        </div>
      )}

      {/* Messages */}
      {!isEmpty && (
        <div className="chat-messages">
          {aiChatHistory.length === 0 && (
            <div className="chat-welcome">
              <div className="chat-welcome-icon">💎</div>
              <div className="chat-welcome-title">Ciao! Sono il tuo assistente finanziario</div>
              <div className="chat-welcome-sub">
                Ho accesso alle tue {transactions.length} transazioni. Chiedimi qualsiasi cosa sulle tue finanze.
              </div>
              <div className="quick-prompts">
                {QUICK_PROMPTS.map((q, i) => (
                  <button key={i} className="quick-prompt" onClick={() => sendMessage(q.text)}>
                    {q.icon}
                    {q.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {aiChatHistory.map((msg, i) => (
            <Message key={i} msg={msg} />
          ))}

          {loading && (
            <div className="chat-msg chat-msg-ai">
              <div className="chat-avatar">
                <Sparkles size={14} color="var(--gold)" />
              </div>
              <div className="chat-bubble bubble-ai bubble-loading">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      {!isEmpty && (
        <div className="chat-input-wrap">
          <div className="chat-input-bar">
            <input
              ref={inputRef}
              className="chat-input"
              placeholder="Chiedi qualcosa sulle tue finanze…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={loading}
            />
            <button
              className="btn btn-primary chat-send"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
            >
              <Send size={14} />
            </button>
          </div>
          <div className="chat-input-hint">
            Premi Invio per inviare · Gemini AI · I tuoi dati non lasciano Firebase
          </div>
        </div>
      )}
    </div>
  )
}
