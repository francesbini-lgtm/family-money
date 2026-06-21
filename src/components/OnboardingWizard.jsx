import { useState } from 'react'
import { useStore } from '../store/useStore'
import { parseCSV } from '../data/csvParser'
import { categorizeBatch } from '../data/aiService'
import { Sparkles, Upload, ChevronRight, ChevronLeft, Check, X } from 'lucide-react'
import './OnboardingWizard.css'

const STEPS = [
  { id: 'welcome',  title: 'Benvenuto in Family Money', icon: '💎' },
  { id: 'account',  title: 'Aggiungi il tuo conto',     icon: '🏦' },
  { id: 'import',   title: 'Importa le transazioni',    icon: '📄' },
  { id: 'scadenza', title: 'Prima scadenza',             icon: '📅' },
  { id: 'done',     title: 'Sei pronto!',               icon: '🎉' },
]

// ── Step: Welcome ─────────────────────────────────────────
function StepWelcome({ onNext, onSkip }) {
  return (
    <div className="ob-step">
      <div className="ob-step-icon">💎</div>
      <h2 className="ob-step-title">Benvenuto in Family Money</h2>
      <p className="ob-step-desc">
        Questo wizard ti guida in 4 passi per configurare l'app e inserire i tuoi primi dati.
        Ci vogliono circa 3 minuti.
      </p>
      <div className="ob-feature-list">
        {[
          ['💳', 'Importa il CSV della tua banca'],
          ['✨', 'AI categorizza automaticamente'],
          ['📊', 'Dashboard con i tuoi dati reali'],
          ['🔔', 'Notifiche per le scadenze'],
        ].map(([icon, text]) => (
          <div key={text} className="ob-feature">
            <span className="ob-feature-icon">{icon}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
      <div className="ob-actions">
        <button className="btn btn-primary ob-btn-main" onClick={onNext}>
          Inizia la configurazione <ChevronRight size={16}/>
        </button>
        <button className="btn btn-ghost ob-btn-skip" onClick={onSkip}>
          Salta e vai all'app →
        </button>
      </div>
    </div>
  )
}

// ── Step: Account ─────────────────────────────────────────
function StepAccount({ onNext, onBack, data, setData }) {
  const [name, setName]   = useState(data.accountName || 'Conto Corrente')
  const [bank, setBank]   = useState(data.accountBank || '')
  const [type, setType]   = useState(data.accountType || 'conto')
  const { setUserAccounts } = useStore()

  function confirm() {
    const account = { id: 1, name, bank, type }
    setData(d => ({ ...d, accountName: name, accountBank: bank, accountType: type, account }))
    setUserAccounts(null, [account])
    onNext()
  }

  return (
    <div className="ob-step">
      <div className="ob-step-icon">🏦</div>
      <h2 className="ob-step-title">Aggiungi il tuo conto principale</h2>
      <p className="ob-step-desc">Questo è il conto da cui importerai le transazioni.</p>

      <div className="ob-form">
        <div className="ob-field">
          <label className="ob-label">Nome conto</label>
          <input className="ob-input" value={name} onChange={e=>setName(e.target.value)} placeholder="es. Conto Corrente"/>
        </div>
        <div className="ob-field">
          <label className="ob-label">Banca</label>
          <input className="ob-input" value={bank} onChange={e=>setBank(e.target.value)} placeholder="es. UniCredit, Fineco, BNL…"/>
        </div>
        <div className="ob-field">
          <label className="ob-label">Tipo</label>
          <select className="ob-input" value={type} onChange={e=>setType(e.target.value)}>
            <option value="conto">🏦 Conto Corrente</option>
            <option value="carta">💳 Carta di Credito</option>
          </select>
        </div>
      </div>

      <div className="ob-actions">
        <button className="btn btn-primary ob-btn-main" onClick={confirm}>
          Continua <ChevronRight size={16}/>
        </button>
        <button className="btn btn-ghost" onClick={onBack}>
          <ChevronLeft size={14}/> Indietro
        </button>
      </div>
    </div>
  )
}

// ── Step: Import CSV ──────────────────────────────────────
function StepImport({ onNext, onBack, data }) {
  const { addTransactions } = useStore()
  const [file,     setFile]     = useState(null)
  const [useAI,    setUseAI]    = useState(true)
  const [progress, setProgress] = useState(null)
  const [result,   setResult]   = useState(null)

  async function doImport() {
    if (!file) return
    setProgress('Lettura file…')
    const text = await file.text()
    const txs  = parseCSV(text, data.accountName || 'Conto Corrente')
    if (!txs.length) { setProgress('Nessuna transazione trovata nel file.'); return }

    let final = txs
    if (useAI) {
      setProgress(`Categorizzazione AI di ${txs.length} transazioni…`)
      const batches = []
      for (let i = 0; i < txs.length; i += 20) batches.push(txs.slice(i, i+20))
      final = []
      for (let b = 0; b < batches.length; b++) {
        const done = await categorizeBatch(batches[b])
        final.push(...done)
        setProgress(`AI: ${Math.min((b+1)*20, txs.length)} / ${txs.length}…`)
      }
    }
    addTransactions(final)
    setProgress(null)
    setResult(final.length)
  }

  return (
    <div className="ob-step">
      <div className="ob-step-icon">📄</div>
      <h2 className="ob-step-title">Importa le transazioni</h2>
      <p className="ob-step-desc">
        Esporta il CSV dal tuo internet banking (di solito: Movimenti → Esporta → CSV).
      </p>

      {!result ? (
        <>
          <div className="ob-upload-area" onClick={()=>document.getElementById('ob-file').click()}>
            <Upload size={28} color="var(--text3)"/>
            <div className="ob-upload-text">
              {file ? file.name : 'Clicca per selezionare il file CSV'}
            </div>
            <div className="ob-upload-hint">Formato CSV bancario italiano · .csv o .txt</div>
            <input id="ob-file" type="file" accept=".csv,.txt" style={{display:'none'}}
              onChange={e=>setFile(e.target.files[0])}/>
          </div>

          <div className="ob-ai-toggle" onClick={()=>setUseAI(v=>!v)}>
            <div>
              <div className="ob-ai-title"><Sparkles size={13} color="var(--gold)"/> Categorizzazione AI (Gemini)</div>
              <div className="ob-ai-sub">Richiede Firebase AI Logic abilitato</div>
            </div>
            <div className={`ob-toggle ${useAI ? 'on' : ''}`}/>
          </div>

          {progress && (
            <div className="ob-progress">{progress}</div>
          )}

          <div className="ob-actions">
            <button className="btn btn-primary ob-btn-main" onClick={doImport} disabled={!file || !!progress}>
              {progress ? '⏳ Elaborazione…' : <><Upload size={14}/> Importa</>}
            </button>
            <button className="btn btn-ghost" onClick={onNext}>Salta questo passo →</button>
          </div>
        </>
      ) : (
        <div className="ob-success">
          <div className="ob-success-icon">✓</div>
          <div className="ob-success-title">{result} transazioni importate!</div>
          <div className="ob-success-sub">La dashboard è già popolata con i tuoi dati.</div>
          <button className="btn btn-primary ob-btn-main" onClick={onNext}>
            Continua <ChevronRight size={16}/>
          </button>
        </div>
      )}

      <button className="btn btn-ghost ob-back" onClick={onBack}>
        <ChevronLeft size={14}/> Indietro
      </button>
    </div>
  )
}

// ── Step: First scadenza ──────────────────────────────────
function StepScadenza({ onNext, onBack }) {
  const { addScadenza } = useStore()
  const [added,  setAdded]  = useState(false)
  const [form,   setForm]   = useState({ nome:'', data:'', importo:'', cat:'Utenze', cadenza:'Mensile' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function save() {
    if (!form.nome || !form.data) { onNext(); return }
    addScadenza({ ...form, importo: parseFloat(form.importo)||0, pagata: false })
    setAdded(true)
    setTimeout(onNext, 1200)
  }

  return (
    <div className="ob-step">
      <div className="ob-step-icon">📅</div>
      <h2 className="ob-step-title">Aggiungi la tua prima scadenza</h2>
      <p className="ob-step-desc">Una bolletta, un abbonamento o una rata. Riceverai notifiche quando si avvicina.</p>

      {added ? (
        <div className="ob-success">
          <div className="ob-success-icon">✓</div>
          <div className="ob-success-title">Scadenza aggiunta!</div>
        </div>
      ) : (
        <div className="ob-form">
          <div className="ob-field">
            <label className="ob-label">Nome</label>
            <input className="ob-input" value={form.nome} onChange={e=>set('nome',e.target.value)} placeholder="es. Netflix, Mutuo, Bollo Auto"/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="ob-field">
              <label className="ob-label">Scadenza</label>
              <input className="ob-input" type="date" value={form.data} onChange={e=>set('data',e.target.value)}/>
            </div>
            <div className="ob-field">
              <label className="ob-label">Importo (€)</label>
              <input className="ob-input" type="number" value={form.importo} onChange={e=>set('importo',e.target.value)} placeholder="0"/>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="ob-field">
              <label className="ob-label">Categoria</label>
              <select className="ob-input" value={form.cat} onChange={e=>set('cat',e.target.value)}>
                {['Utenze','Abbonamento','Mutuo/Prestito','Assicurazione','Auto','Tasse','Altro'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="ob-field">
              <label className="ob-label">Cadenza</label>
              <select className="ob-input" value={form.cadenza} onChange={e=>set('cadenza',e.target.value)}>
                {['Mensile','Trimestrale','Semestrale','Annuale','Una tantum'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {!added && (
        <div className="ob-actions">
          <button className="btn btn-primary ob-btn-main" onClick={save}>
            {form.nome ? <><Check size={14}/> Aggiungi e continua</> : 'Salta →'}
          </button>
          <button className="btn btn-ghost" onClick={onBack}><ChevronLeft size={14}/> Indietro</button>
        </div>
      )}
    </div>
  )
}

// ── Step: Done ────────────────────────────────────────────
function StepDone({ onFinish }) {
  const { transactions, scadenze } = useStore()
  return (
    <div className="ob-step ob-step-done">
      <div className="ob-done-confetti">🎉</div>
      <h2 className="ob-step-title">Sei pronto!</h2>
      <p className="ob-step-desc">Family Money è configurato e pronto all'uso.</p>

      <div className="ob-done-stats">
        {[
          ['💳', transactions.length, 'transazioni importate'],
          ['📅', scadenze.length,     'scadenze registrate'],
        ].map(([icon, val, label]) => (
          <div key={label} className="ob-done-stat">
            <span className="ob-done-stat-icon">{icon}</span>
            <span className="ob-done-stat-val">{val}</span>
            <span className="ob-done-stat-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="ob-done-tips">
        <div className="ob-tip">💡 Vai nella <strong>Dashboard</strong> per vedere i tuoi KPI</div>
        <div className="ob-tip">✨ Usa l'<strong>AI Assistant</strong> per analizzare le spese</div>
        <div className="ob-tip">🔔 Attiva le <strong>notifiche</strong> in Scadenze</div>
      </div>

      <button className="btn btn-primary ob-btn-main" onClick={onFinish}>
        Vai alla Dashboard →
      </button>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────
export default function OnboardingWizard({ onComplete }) {
  const [step,    setStep]  = useState(0)
  const [data,    setData]  = useState({})
  const { setOnboardingDone } = useStore()

  function next()  { setStep(s => Math.min(s+1, STEPS.length-1)) }
  function back()  { setStep(s => Math.max(s-1, 0)) }
  function skip()  { finish() }
  function finish(goTo) {
    setOnboardingDone()
    onComplete(goTo || 'dashboard')
  }

  const current = STEPS[step]

  return (
    <div className="ob-overlay">
      <div className="ob-wizard">
        {/* Progress bar */}
        <div className="ob-progress-bar">
          {STEPS.map((s, i) => (
            <div key={s.id} className={'ob-progress-dot' + (i <= step ? ' active' : '') + (i < step ? ' done' : '')}>
              {i < step ? <Check size={10}/> : i + 1}
            </div>
          ))}
          <div className="ob-progress-line">
            <div className="ob-progress-fill" style={{width: (step/(STEPS.length-1)*100)+'%'}}/>
          </div>
        </div>

        {/* Close button */}
        <button className="ob-close" onClick={skip} title="Salta wizard">
          <X size={16}/>
        </button>

        {/* Steps */}
        {step === 0 && <StepWelcome  onNext={next} onSkip={skip}/>}
        {step === 1 && <StepAccount  onNext={next} onBack={back} data={data} setData={setData}/>}
        {step === 2 && <StepImport   onNext={next} onBack={back} data={data}/>}
        {step === 3 && <StepScadenza onNext={next} onBack={back}/>}
        {step === 4 && <StepDone     onFinish={()=>finish('dashboard')}/>}
      </div>
    </div>
  )
}
