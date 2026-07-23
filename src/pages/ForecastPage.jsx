import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { CATS, getMergedCats } from '../data/categories'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import './ForecastPage.css'
import { fmtIT, fmtDate } from '../utils/format'
import Modal, { ModalFooter } from '../components/Modal'
// Importi NETTI post-compensazione (fix 2026-07-13: questa pagina era rimasta
// indietro rispetto a UscitePage/RisparmioPage, che già usano netAmt — vedi
// audit richiesto dall'utente sulla coerenza dei totali Uscite tra le 3 pagine)
import { netAmt } from '../data/compensation'

// ── Helpers ───────────────────────────────────────────────
const MON = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

// Calcola totale spese per un mese, sostituendo _satiLinked con splits
function expTotal(transactions, ym) {
  let total = 0
  transactions.forEach(t => {
    if (t.excluded || t.amount >= 0 || t.cat1 === 'Entrate') return
    if (!(t._effDate || t.date || '').startsWith(ym)) return
    if (t._satiLinked && t.splits?.length > 0) {
      t.splits.forEach(sp => { if (sp.amount > 0) total += sp.amount })
    } else {
      total += Math.abs(netAmt(t))  // netto post-compensazione, come UscitePage/RisparmioPage
    }
  })
  return total
}

// Lista transazioni di spesa effettive per un set di mesi (satiLinked → splits virtuali)
function expList(transactions, yms) {
  const ymSet = new Set(yms)
  const result = []
  transactions.forEach(t => {
    if (t.excluded || t.amount >= 0) return
    const ym = (t._effDate || t.date || '').slice(0, 7)
    if (!ymSet.has(ym)) return
    if (t._satiLinked && t.splits?.length > 0) {
      t.splits.forEach(sp => {
        // _compensatedAmt/_compensatedBy azzerati esplicitamente: sono dell'intera
        // transazione satiLinked, non di questo singolo split — se non li si pulisce,
        // netAmt() sul virtuale applicherebbe per errore la compensazione del
        // genitore a un importo che non le appartiene (fix 2026-07-13).
        if (sp.amount > 0) result.push({ ...t, _virtual: true, amount: -sp.amount,
          cat1: sp.cat1 || 'Non Categorizzato', cat2: sp.cat2 || 'Altro',
          _compensatedAmt: null, _compensatedBy: null })
      })
    } else {
      result.push(t)
    }
  })
  return result
}

function fmtK(n) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `€ ${(n/1_000_000).toFixed(2)}M`
  if (a >= 1_000)     return `€ ${fmtIT(n/1_000, 0)}K`
  return `€ ${fmtIT(n, 0)}`
}
function fmtFull(n) { return `€ ${fmtIT(Math.round(n), 0)}` }

function ymToLabel(ym) {
  const [y, m] = ym.split('-')
  return `${MON[parseInt(m)-1]} ${String(y).slice(2)}`
}

// ── Mortgage amortization ────────────────────────────────
function calcMortgage(capital, rateAnnual, durationYears) {
  // Guard su input degeneri (fix 2026-07-12): capitale/durata nulli o non validi
  // producevano Infinity/NaN nel grafico (es. capital/n con n=0)
  if (!Number.isFinite(capital) || capital <= 0 ||
      !Number.isFinite(durationYears) || durationYears <= 0 ||
      !Number.isFinite(rateAnnual)) {
    return { rata: 0, residuals: [], monthlyResiduals: [] }
  }
  const r = rateAnnual / 100 / 12
  const n = durationYears * 12
  const rata = r === 0
    ? capital / n
    : capital * r * Math.pow(1+r, n) / (Math.pow(1+r, n) - 1)
  const residuals = []
  // Residuo mese per mese (oltre a quello annuale già esistente) — richiesta
  // utente 2026-07-19 per la vista "Proiezione Mensile" del piano ammortamento.
  const monthlyResiduals = []
  let balance = capital
  for (let y = 0; y < durationYears; y++) {
    for (let m = 0; m < 12; m++) {
      const interest  = balance * r
      const principal = rata - interest
      balance = Math.max(0, balance - principal)
      monthlyResiduals.push(Math.round(balance))
    }
    residuals.push(Math.round(balance))
  }
  return { rata: Math.round(rata * 100) / 100, residuals, monthlyResiduals }
}

// Ricalcola la rata per un capitale residuo e un numero di mesi rimanenti
// arbitrario — usata dopo un rimborso anticipato (automatico o manuale) per
// abbassare la rata mantenendo la STESSA scadenza originale del mutuo
// (2026-07-23, richiesta utente: "riduci la rata, stessa scadenza").
function calcMortgagePayment(capital, rateAnnual, months) {
  if (!Number.isFinite(capital) || capital <= 0 ||
      !Number.isFinite(months) || months <= 0 ||
      !Number.isFinite(rateAnnual)) return 0
  const r = rateAnnual / 100 / 12
  if (r === 0) return Math.round((capital / months) * 100) / 100
  return Math.round((capital * r * Math.pow(1+r, months) / (Math.pow(1+r, months) - 1)) * 100) / 100
}

// ── Money field with thousands separator (visual only, valore numerico puro) ──
function MoneyField({ label, value, onChange, placeholder, hint }) {
  function handleChange(e) {
    const digits = e.target.value.replace(/[^\d]/g, '')
    onChange(digits ? parseInt(digits, 10) : 0)
  }
  const display = value ? Number(value).toLocaleString('it-IT') : ''
  return (
    <div className="fc-mortgage-field">
      <label className="form-lbl-sm">{label}</label>
      <input className="fc-input" type="text" inputMode="numeric" value={display}
        onChange={handleChange} placeholder={placeholder}/>
      {hint && <div className="fc-input-hint">{hint}</div>}
    </div>
  )
}

// ── Slider ────────────────────────────────────────────────
function Slider({ label, value, onChange, min, max, step = 1, format = v => v, hint }) {
  return (
    <div className="fc-slider">
      <div className="fc-slider-header">
        <div>
          <span className="fc-slider-label">{label}</span>
          {hint && <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>{hint}</div>}
        </div>
        <span className="fc-slider-val">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="fc-range"/>
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:10, padding:'10px 14px', fontSize:12,
      boxShadow:'0 4px 20px rgba(0,0,0,.1)'
    }}>
      <div style={{fontWeight:700, marginBottom:6, color:'var(--text2)'}}>{label}</div>
      {payload.filter(p => p.value != null).map((p, i) => (
        <div key={i} style={{display:'flex', justifyContent:'space-between', gap:16, marginBottom:2}}>
          <span style={{color:p.color, fontWeight:600}}>{p.name}</span>
          <span style={{fontFamily:'var(--font-mono)', fontWeight:700}}>
            {fmtFull(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── What If Panel ─────────────────────────────────────────
function WhatIfPanel({ catStats, excludedCats, onToggle }) {
  const cats = Object.entries(catStats).filter(([n]) => n !== 'Entrate' && n !== 'Non Categorizzato')
    .sort((a, b) => b[1].avg - a[1].avg)

  return (
    <div className="fc-whatif-panel">
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.5}}>
        Seleziona le categorie da escludere: il risparmio mensile aumenta dell'importo indicato.
        <span style={{display:'block',marginTop:3,fontStyle:'italic',opacity:.8}}>
          Importi calcolati come: totale spese categoria (ultimi 12 mesi) ÷ 12
        </span>
      </div>
      {cats.map(([c1, info]) => {
        const c1Excluded  = excludedCats.has(c1)
        const subs = Object.entries(info.subs).sort((a, b) => b[1] - a[1])
        return (
          <div key={c1} className="fc-whatif-cat">
            {/* L1 row */}
            <div className="fc-whatif-l1" onClick={() => onToggle(c1)}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div className={`fc-whatif-check ${c1Excluded ? 'on' : ''}`}>
                  {c1Excluded && <span>✓</span>}
                </div>
                <div style={{width:8,height:8,borderRadius:'50%',background:info.color,flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700,color: c1Excluded ? 'var(--green)' : 'var(--text)'}}>
                  {c1}
                </span>
              </div>
              <span style={{
                fontFamily:'var(--font-mono)',fontSize:12,
                color: c1Excluded ? 'var(--green)' : 'var(--text3)',
                fontWeight: c1Excluded ? 700 : 400,
              }}>
                {c1Excluded ? '+' : '−'}{fmtFull(info.avg)}/m
              </span>
            </div>
            {/* L2 rows (only if subs exist and L1 not excluded) */}
            {!c1Excluded && subs.length > 0 && (
              <div className="fc-whatif-subs">
                {subs.map(([c2, avg]) => {
                  const key      = `${c1}:::${c2}`
                  const excluded = excludedCats.has(key)
                  return (
                    <div key={c2} className="fc-whatif-l2" onClick={() => onToggle(key)}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div className={`fc-whatif-check sm ${excluded ? 'on' : ''}`}>
                          {excluded && <span>✓</span>}
                        </div>
                        <span style={{fontSize:12,color: excluded ? 'var(--green)' : 'var(--text2)'}}>
                          {c2}
                        </span>
                      </div>
                      <span style={{
                        fontFamily:'var(--font-mono)',fontSize:11,
                        color: excluded ? 'var(--green)' : 'var(--text3)',
                        fontWeight: excluded ? 700 : 400,
                      }}>
                        {excluded ? '+' : ''}{fmtFull(avg)}/m
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Override puntuale mese/anno sulla tabella "Proiezione" (2026-07-23) ────
// Popup che si apre cliccando una riga futura della tabella: permette di
// modificare la composizione delle spese (L1) di QUEL mese/anno specifico,
// con opzione "applica da qui in avanti" (cascata, si ferma da sola al
// prossimo override — vedi commenti su overridesMonthly/overridesYearly).
function ExpenseOverrideModal({ title, catStats, defaultsByCat, initialSpese, initialSpeseL2, initialCascade, hasExisting, onSave, onRemove, onClose }) {
  const [values, setValues] = useState(() => {
    const v = {}
    Object.keys(catStats).forEach(c1 => { v[c1] = Math.round(initialSpese?.[c1] ?? defaultsByCat[c1] ?? 0) })
    return v
  })
  // Breakdown L2 opzionale per singolo L1 (stesso schema di teoricheSpeseL2 in
  // Teoriche > Spese, richiesta utente 2026-07-23: poter vedere/modificare le
  // sotto-categorie anche da questo popup, non solo il totale L1).
  const [valuesL2, setValuesL2] = useState(() => {
    const v = {}
    Object.keys(catStats).forEach(c1 => { v[c1] = { ...(initialSpeseL2?.[c1] || {}) } })
    return v
  })
  const [expandedL1, setExpandedL1] = useState(() => new Set(
    Object.keys(initialSpeseL2 || {}).filter(c1 => Object.keys(initialSpeseL2[c1] || {}).length > 0)
  ))
  const [cascade, setCascade] = useState(!!initialCascade)

  function hasL2(c1) { return Object.keys(valuesL2[c1] || {}).length > 0 }
  function toggleExpand(c1) {
    setExpandedL1(prev => { const n = new Set(prev); if (n.has(c1)) n.delete(c1); else n.add(c1); return n })
  }
  function setValueL2(c1, c2, val) {
    setValuesL2(v => ({ ...v, [c1]: { ...(v[c1] || {}), [c2]: val } }))
  }
  function l1Total(c1) {
    if (hasL2(c1)) {
      const subs = catStats[c1]?.subs || {}
      return Object.keys(subs).reduce((s, c2) => s + (valuesL2[c1]?.[c2] ?? subs[c2] ?? 0), 0)
    }
    return Number(values[c1]) || 0
  }
  const total = Object.keys(catStats).reduce((s, c1) => s + l1Total(c1), 0)

  return (
    <Modal title={title} onClose={onClose} width={480}>
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:10,lineHeight:1.5}}>
        Modifica le spese solo per questo periodo, oppure spunta "da qui in avanti" per farle valere anche sui mesi/anni successivi (finché non incontri un altro override).
        Clicca sul nome per espandere e modificare le singole sotto-categorie.
      </div>
      <div className="fc-whatif-panel" style={{marginTop:0,maxHeight:320,marginBottom:10}}>
        {Object.entries(catStats).sort((a,b)=>b[1].avg-a[1].avg).map(([c1,data]) => {
          const isOpen = expandedL1.has(c1)
          const l2v    = valuesL2[c1] || {}
          const catHasL2 = hasL2(c1)
          const subs   = Object.entries(data.subs || {}).sort((a,b)=>b[1]-a[1])
          return (
            <div key={c1} className="fc-whatif-cat">
              <div className="fc-whatif-l1">
                <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:600,
                    minWidth:0,flex:1,cursor:subs.length>0?'pointer':'default'}}
                  onClick={()=>subs.length>0 && toggleExpand(c1)}>
                  {subs.length > 0 && (
                    <span style={{fontSize:10,color:'var(--text3)',width:10,flexShrink:0,display:'inline-block'}}>{isOpen?'▾':'▸'}</span>
                  )}
                  <span style={{width:8,height:8,borderRadius:'50%',background:data.color,flexShrink:0,display:'inline-block'}}/>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={c1}>{c1}</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
                  <span style={{fontSize:10,color:'var(--text3)'}}>€</span>
                  <input type="number" value={catHasL2 ? l1Total(c1) : values[c1]} disabled={catHasL2}
                    title={catHasL2 ? 'Calcolato come somma delle sotto-categorie — modifica quelle' : undefined}
                    onChange={e=>setValues(v=>({...v,[c1]:Number(e.target.value)||0}))}
                    style={{width:58,padding:'3px 4px',borderRadius:5,border:'1px solid var(--border)',
                      background:'var(--surface)',color:'var(--red)',fontWeight:700,opacity:catHasL2?0.7:1,
                      fontFamily:'var(--font-mono)',fontSize:12,textAlign:'right'}}/>
                  <span style={{fontSize:10,color:'var(--text3)'}}>/m</span>
                </div>
              </div>
              {isOpen && subs.length > 0 && (
                <div className="fc-whatif-subs">
                  {subs.map(([c2, avgC2]) => {
                    const valC2 = l2v[c2] ?? avgC2
                    return (
                      <div key={c2} className="fc-whatif-l2">
                        <span style={{fontSize:12,color:'var(--text2)',minWidth:0,flex:1,
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={c2}>{c2}</span>
                        <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
                          <span style={{fontSize:10,color:'var(--text3)'}}>€</span>
                          <input type="number" value={valC2}
                            onChange={e=>setValueL2(c1, c2, Number(e.target.value)||0)}
                            style={{width:52,padding:'2px 4px',borderRadius:5,border:'1px solid var(--border)',
                              background:'var(--surface)',color:'var(--red)',fontWeight:600,
                              fontFamily:'var(--font-mono)',fontSize:11,textAlign:'right'}}/>
                          <span style={{fontSize:10,color:'var(--text3)'}}>/m</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 9px',
        borderTop:'2px solid var(--border)',fontSize:12,fontWeight:800,marginBottom:12}}>
        <span>Totale</span>
        <span style={{fontFamily:'var(--font-mono)',color:'var(--red)'}}>{fmtFull(total)}</span>
      </div>
      <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,cursor:'pointer',marginBottom:6}}>
        <input type="checkbox" checked={cascade} onChange={e=>setCascade(e.target.checked)}/>
        Applica da qui in avanti
      </label>
      <ModalFooter>
        {hasExisting && (
          <button className="btn btn-secondary" style={{color:'var(--red)'}} onClick={onRemove}>Rimuovi override</button>
        )}
        <button className="btn btn-primary" onClick={()=>{
          // Il totale per-L1 salvato in "spese" è sempre il flattening (somma
          // L2 se presente, altrimenti il valore L1 diretto) — così il motore
          // di proiezione (overrideTotal/catEffectiveBase) non deve sapere
          // nulla della scomposizione L2, che resta solo per ri-editing futuro.
          const flatSpese = {}
          Object.keys(catStats).forEach(c1 => { flatSpese[c1] = l1Total(c1) })
          onSave(flatSpese, valuesL2, cascade)
        }}>Salva</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Popup estinzione anticipata mutuo su mese/anno specifico (2026-07-23,
// richiesta utente: click sulla colonna "Rata mutuo"/"Rata mutuo annua" nella
// tabella Proiezione) — importo one-off che riduce il capitale residuo, la
// rata viene ricalcolata mantenendo la stessa scadenza (stesso principio del
// rimborso automatico "ogni X risparmiati").
function MortgageExtraPaymentModal({ title, initialAmount, hasExisting, onSave, onRemove, onClose }) {
  const [amount, setAmount] = useState(initialAmount || 0)
  return (
    <Modal title={title} onClose={onClose} width={400}>
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:14,lineHeight:1.5}}>
        Importo da versare in questo periodo per estinguere anticipatamente parte del mutuo, oltre alla rata normale. Il capitale residuo si riduce e la rata viene ricalcolata (stessa scadenza, rata più bassa da quel momento in poi). L'importo esce anche dal saldo conto previsto.
      </div>
      <MoneyField label="Importo estinzione (€)" value={amount} onChange={setAmount} placeholder="0"/>
      <ModalFooter>
        {hasExisting && (
          <button className="btn btn-secondary" style={{color:'var(--red)'}} onClick={onRemove}>Rimuovi</button>
        )}
        <button className="btn btn-primary" onClick={()=>onSave(Number(amount) || 0)}>Salva</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Popup selezione mesi storici per le medie di Teoriche > Spese (2026-07-23,
// richiesta utente: poter scegliere manualmente da quali mesi prendere le
// medie per TUTTE le categorie insieme, invece dei soliti ultimi 12 fissi).
function MonthPickerModal({ months, initialSelected, onSave, onClose }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected))
  function toggle(ym) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(ym)) next.delete(ym); else next.add(ym)
      return next
    })
  }
  const isDefault12 = months.slice(-12)
  return (
    <Modal title="Mesi storici per le medie (Spese)" onClose={onClose} width={420}>
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.5}}>
        Scegli da quali mesi calcolare la media mensile di ogni categoria in "Teoriche &gt; Spese". Di default sono gli ultimi 12 mesi pieni.
      </div>
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        <button className="btn btn-secondary" style={{fontSize:11,padding:'4px 10px'}}
          onClick={()=>setSelected(new Set(isDefault12))}>Ultimi 12 (default)</button>
        <button className="btn btn-secondary" style={{fontSize:11,padding:'4px 10px'}}
          onClick={()=>setSelected(new Set(months))}>Seleziona tutti (24)</button>
        <button className="btn btn-secondary" style={{fontSize:11,padding:'4px 10px'}}
          onClick={()=>setSelected(new Set())}>Deseleziona tutti</button>
      </div>
      <div style={{maxHeight:280,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px'}}>
        {months.map(ym => (
          <label key={ym} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 2px',fontSize:12.5,cursor:'pointer'}}>
            <input type="checkbox" checked={selected.has(ym)} onChange={()=>toggle(ym)}/>
            {ymToLabel(ym)}
          </label>
        ))}
      </div>
      <div style={{fontSize:11,color:'var(--text3)',marginTop:8}}>{selected.size} mesi selezionati</div>
      <ModalFooter>
        <button className="btn btn-secondary" onClick={()=>{ onSave(null); }}>Ripristina default</button>
        <button className="btn btn-primary" onClick={()=>onSave([...selected])}>Salva</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Popup override mese/anno sulla colonna ENTRATE della tabella "Proiezione"
// (2026-07-23, richiesta utente: stesso meccanismo delle Spese — Fra/Sofi
// modificabili con opzione "da qui in avanti" — più una riga "Altro" per
// un'entrata extra di quel periodo specifico, con un flag INDIPENDENTE
// scelto dall'utente per decidere se anche "Altro" deve ripetersi nei periodi
// successivi oppure valere solo per quello corrente).
function IncomeOverrideModal({ title, initialEntrate, initialCascade, initialAltro, initialAltroCascade, defaultFra, defaultSofi, hasExisting, onSave, onRemove, onClose }) {
  const [fra, setFra]   = useState(Math.round(initialEntrate?.Fra  ?? defaultFra))
  const [sofi, setSofi] = useState(Math.round(initialEntrate?.Sofi ?? defaultSofi))
  const [cascade, setCascade] = useState(!!initialCascade)
  const [altro, setAltro] = useState(Math.round(initialAltro || 0))
  const [altroCascade, setAltroCascade] = useState(!!initialAltroCascade)
  const total = (Number(fra)||0) + (Number(sofi)||0) + (Number(altro)||0)

  return (
    <Modal title={title} onClose={onClose} width={440}>
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:10,lineHeight:1.5}}>
        Modifica le entrate solo per questo periodo, oppure spunta "da qui in avanti" per farle valere anche sui mesi/anni successivi (finché non incontri un altro override).
      </div>
      <div className="fc-whatif-panel" style={{marginTop:0,marginBottom:10}}>
        {[['Fra', fra, setFra], ['Sofi', sofi, setSofi]].map(([nome, val, setVal]) => (
          <div key={nome} className="fc-whatif-cat">
            <div className="fc-whatif-l1" style={{cursor:'default'}}>
              <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:600,minWidth:0,flex:1}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'var(--green)',flexShrink:0,display:'inline-block'}}/>
                {nome}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
                <span style={{fontSize:10,color:'var(--text3)'}}>€</span>
                <input type="number" value={val}
                  onChange={e=>setVal(Number(e.target.value)||0)}
                  style={{width:70,padding:'3px 4px',borderRadius:5,border:'1px solid var(--border)',
                    background:'var(--surface)',color:'var(--green)',fontWeight:700,
                    fontFamily:'var(--font-mono)',fontSize:12,textAlign:'right'}}/>
                <span style={{fontSize:10,color:'var(--text3)'}}>/m</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,cursor:'pointer',marginBottom:14}}>
        <input type="checkbox" checked={cascade} onChange={e=>setCascade(e.target.checked)}/>
        Applica Fra/Sofi da qui in avanti
      </label>

      <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>
        Altro
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
        padding:'7px 9px',background:'var(--surface2)',borderRadius:6,border:'1px solid var(--border)',marginBottom:8}}>
        <span style={{fontSize:12,color:'var(--text2)'}}>Entrata extra (bonus, rimborso, ecc.)</span>
        <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
          <span style={{fontSize:10,color:'var(--text3)'}}>€</span>
          <input type="number" value={altro}
            onChange={e=>setAltro(Number(e.target.value)||0)}
            style={{width:70,padding:'3px 4px',borderRadius:5,border:'1px solid var(--border)',
              background:'var(--surface)',color:'var(--green)',fontWeight:700,
              fontFamily:'var(--font-mono)',fontSize:12,textAlign:'right'}}/>
        </div>
      </div>
      <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,cursor:'pointer',marginBottom:12}}>
        <input type="checkbox" checked={altroCascade} onChange={e=>setAltroCascade(e.target.checked)}/>
        Applica anche "Altro" da qui in avanti (di norma è un'entrata una tantum, solo per questo periodo)
      </label>

      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 9px',
        borderTop:'2px solid var(--border)',fontSize:12,fontWeight:800,marginBottom:12}}>
        <span>Totale</span>
        <span style={{fontFamily:'var(--font-mono)',color:'var(--green)'}}>{fmtFull(total)}</span>
      </div>
      <ModalFooter>
        {hasExisting && (
          <button className="btn btn-secondary" style={{color:'var(--red)'}} onClick={onRemove}>Rimuovi override</button>
        )}
        <button className="btn btn-primary" onClick={()=>onSave({ Fra: Number(fra)||0, Sofi: Number(sofi)||0 }, cascade, Number(altro)||0, altroCascade)}>Salva</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function ForecastPage() {
  const { transactions, customCats, appPrefs, setAppPref, ceciliaGoals } = useStore()
  const excludedMonths = appPrefs?.forecastExcludedMonths || []

  // Base forecast: storico (media 12 mesi reali) o teoriche (valori editabili manualmente) —
  // richiesta utente 2026-07-20
  const forecastBasis = appPrefs?.forecastBasis || 'storico' // 'storico' | 'teoriche'
  function setForecastBasis(v) { setAppPref('forecastBasis', v) }
  const [teoricheTab, setTeoricheTab] = useState('entrate') // 'entrate' | 'spese' (sub-tab locale)
  const [teoricheDetailPerson, setTeoricheDetailPerson] = useState(null) // 'Fra' | 'Sofi' | null — storico 12 mesi in tab Teoriche
  const [expandedTeoricheL1, setExpandedTeoricheL1] = useState(() => new Set()) // solo UI, quali L1 sono espansi in Teoriche > Spese
  const teoricheEntrate = appPrefs?.forecastTeoricheEntrate || {} // { Fra: number, Sofi: number }
  const teoricheBonus   = appPrefs?.forecastTeoricheBonus   || {} // { Fra: {has13,has14}, Sofi: {...} }
  const teoricheSpese   = appPrefs?.forecastTeoricheSpese   || {} // { [cat1]: number }
  // Breakdown L2 per Teoriche > Spese (2026-07-23, richiesta utente: poter
  // modificare le singole sotto-categorie, non solo il totale L1 — stesso
  // formato "espandi e modifica" già usato nel pannello What if di Storico, ma
  // con input numerici invece di checkbox). Se per un L1 esiste un override L2
  // (anche solo su UNA sotto-categoria), il totale di quel L1 diventa la SOMMA
  // delle sue L2 (default = media 12 mesi reale per le L2 non ancora toccate) e
  // l'input L1 diventa di sola lettura — evita di avere L1 e somma-L2
  // incoerenti tra loro.
  const teoricheSpeseL2 = appPrefs?.forecastTeoricheSpeseL2 || {} // { [cat1]: { [cat2]: number } }
  // Mesi storici usati per calcolare la media di TUTTE le categorie in Teoriche >
  // Spese (2026-07-23, richiesta utente: poter scegliere manualmente da quali
  // mesi prendere le medie, non solo i soliti ultimi 12 fissi). null/vuoto =
  // default (ultimi 12 mesi pieni, comportamento storico invariato).
  const teoricheSpeseMonths = appPrefs?.forecastTeoricheSpeseMonths || null // array di 'YYYY-MM' oppure null
  function setTeoricheSpeseMonths(arr) {
    setAppPref('forecastTeoricheSpeseMonths', (arr && arr.length) ? arr : null)
  }
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  // Mese di pagamento 13ª/14ª (1-based: 6=giugno, 12=dicembre) — richiesta utente
  // 2026-07-20: rendere modificabile (non tutte le aziende le pagano negli stessi mesi)
  const bonusMonths = appPrefs?.forecastBonusMonths || { m13: 6, m14: 12 }
  function setBonusMonth(key, val) {
    setAppPref('forecastBonusMonths', { ...bonusMonths, [key]: val })
  }
  function setTeoricheEntrata(person, val) {
    setAppPref('forecastTeoricheEntrate', { ...teoricheEntrate, [person]: val })
  }
  function setTeoricheBonusFlag(person, key, val) {
    setAppPref('forecastTeoricheBonus', { ...teoricheBonus, [person]: { ...(teoricheBonus[person]||{}), [key]: val } })
  }
  function setTeoricheSpesa(cat1, val) {
    setAppPref('forecastTeoricheSpese', { ...teoricheSpese, [cat1]: val })
  }
  function setTeoricheSpesaL2(cat1, cat2, val) {
    setAppPref('forecastTeoricheSpeseL2', {
      ...teoricheSpeseL2,
      [cat1]: { ...(teoricheSpeseL2[cat1] || {}), [cat2]: val },
    })
  }
  function toggleTeoricheL1Expand(c1) {
    setExpandedTeoricheL1(prev => {
      const next = new Set(prev)
      if (next.has(c1)) next.delete(c1); else next.add(c1)
      return next
    })
  }

  const [detailPopup, setDetailPopup] = useState(null) // 'income' | 'expense' | null
  // Popup override mese/anno sulla tabella Proiezione — { granularity:'mensile'|'annuale', key: ym|year, label }
  const [overridePopup, setOverridePopup] = useState(null)

  // ── Impostazioni persistenti (2026-07-23, richiesta utente: "questa pagina
  // deve salvare le impostazioni che vengono messe... non deve ogni volta che
  // si apre azzerarsi tutto") — growth/inflation/years, mutuo, vista tabella e
  // what-if erano SOLO in useState locale: si azzeravano ad ogni riapertura
  // della pagina. Ora tutto vive in appPrefs, stesso pattern già usato per
  // forecastBasis/forecastTeoriche*. I nomi delle variabili/funzioni restano
  // identici a prima (solo il "dietro le quinte" cambia) per non dover toccare
  // tutti i punti dove vengono lette/usate più sotto nel file.

  // Vista tabella "Proiezione" — richiesta utente 2026-07-19: poter scegliere fra
  // proiezione annuale (una riga per anno) o mensile (una riga per mese)
  const projectionView = appPrefs?.forecastProjectionView || 'annuale' // 'annuale' | 'mensile'
  function setProjectionView(v) { setAppPref('forecastProjectionView', v) }

  // Adjustable parameters
  const growth    = appPrefs?.forecastGrowth    ?? 2
  const inflation = appPrefs?.forecastInflation ?? 2
  const years     = appPrefs?.forecastYears     ?? 15
  function setGrowth(v)    { setAppPref('forecastGrowth', v) }
  function setInflation(v) { setAppPref('forecastInflation', v) }
  function setYears(v)     { setAppPref('forecastYears', v) }

  // Mutuo/Finanziamento — un unico oggetto persistito, patchato pezzo per pezzo
  function defaultMortgageStart() {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1)
    return `${d.getFullYear()}-01`
  }
  const mortgagePrefs = appPrefs?.forecastMortgage || {}
  function patchMortgage(patch) {
    setAppPref('forecastMortgage', { ...(useStore.getState().appPrefs?.forecastMortgage || {}), ...patch })
  }
  const showMortgage     = mortgagePrefs.panelOpen ?? false
  const mortgageOn       = mortgagePrefs.on        ?? false
  const mortgageAmt      = mortgagePrefs.amt       ?? 200000
  const mortgageYears    = mortgagePrefs.years     ?? 20
  const mortgageTaeg     = mortgagePrefs.taeg      ?? 3.5
  const mortgageStart    = mortgagePrefs.start     ?? defaultMortgageStart()
  const mortgageAnticipo = mortgagePrefs.anticipo  ?? 0
  function setShowMortgage(v)     { patchMortgage({ panelOpen: typeof v === 'function' ? v(showMortgage) : v }) }
  function setMortgageOn(v)       { patchMortgage({ on: v }) }
  function setMortgageAmt(v)      { patchMortgage({ amt: v }) }
  function setMortgageYears(v)    { patchMortgage({ years: v }) }
  function setMortgageTaeg(v)     { patchMortgage({ taeg: v }) }
  function setMortgageStart(v)    { patchMortgage({ start: v }) }
  function setMortgageAnticipo(v) { patchMortgage({ anticipo: v }) }

  // Rimborso anticipato automatico "ogni X risparmiati" (2026-07-23, richiesta
  // utente) — quando i risparmi cumulati (entrate-spese-rata) superano la
  // soglia, il surplus viene versato come rimborso anticipato di capitale e la
  // rata viene ricalcolata (STESSA scadenza, rata più bassa da quel momento —
  // scelta confermata dall'utente). L'importo versato esce anche dal saldo
  // conto proiettato quel mese/anno (anche questo confermato dall'utente).
  const extraRepayEnabled   = mortgagePrefs.extraRepayEnabled   ?? false
  const extraRepayThreshold = mortgagePrefs.extraRepayThreshold ?? 20000
  // Strategia rimborso (2026-07-23, richiesta utente): 'rata' = riduci la rata
  // mantenendo la stessa scadenza (comportamento attuale); 'durata' = mantieni
  // la stessa rata e lascia che il mutuo si estingua prima (la rata fissa,
  // applicata a un capitale minore, naturalmente ammortizza più in fretta —
  // non serve nessun ricalcolo esplicito, basta NON richiamare
  // calcMortgagePayment dopo un rimborso extra). Vale sia per il rimborso
  // automatico che per quello manuale (stessa variabile, unica scelta).
  const extraRepayStrategy = mortgagePrefs.extraRepayStrategy ?? 'rata' // 'rata' | 'durata'
  function setExtraRepayEnabled(v)   { patchMortgage({ extraRepayEnabled: v }) }
  function setExtraRepayThreshold(v) { patchMortgage({ extraRepayThreshold: v }) }
  function setExtraRepayStrategy(v)  { patchMortgage({ extraRepayStrategy: v }) }

  // Rimborsi anticipati MANUALI puntuali (2026-07-23, richiesta utente: click
  // sulla colonna "Rata mutuo"/"Rata mutuo annua" in tabella Proiezione per
  // estinguere una cifra in quel mese/anno specifico). Stesso principio del
  // rimborso automatico: riduce il capitale, ricalcola la rata (stessa
  // scadenza), esce dal saldo. Tenuti separati per vista mensile/annuale dato
  // che le due tabelle sono proiezioni indipendenti (stesso pattern già usato
  // per forecastOverridesMonthly/Yearly).
  const mortgageExtraMonthly = appPrefs?.forecastMortgageExtraMonthly || {} // { [ym]: amount }
  const mortgageExtraYearly  = appPrefs?.forecastMortgageExtraYearly  || {} // { [year]: amount }
  function saveMortgageExtraMonthly(ym, amount) {
    setAppPref('forecastMortgageExtraMonthly', { ...mortgageExtraMonthly, [ym]: amount })
  }
  function removeMortgageExtraMonthly(ym) {
    const next = { ...mortgageExtraMonthly }; delete next[ym]
    setAppPref('forecastMortgageExtraMonthly', next)
  }
  function saveMortgageExtraYearly(year, amount) {
    setAppPref('forecastMortgageExtraYearly', { ...mortgageExtraYearly, [year]: amount })
  }
  function removeMortgageExtraYearly(year) {
    const next = { ...mortgageExtraYearly }; delete next[year]
    setAppPref('forecastMortgageExtraYearly', next)
  }
  // Popup estinzione anticipata mese/anno — { granularity:'mensile'|'annuale', key: ym|year, label }
  const [mortgageExtraPopup, setMortgageExtraPopup] = useState(null)

  // What if — selezioni persistite come array (Set ricostruito in memoria)
  const [whatIfOpen, setWhatIfOpen] = useState(false) // solo UI (aperto/chiuso pannello), non serve persisterlo
  const excludedCatsArr = appPrefs?.forecastExcludedCatsWhatIf || []
  const excludedCats = useMemo(() => new Set(excludedCatsArr), [excludedCatsArr])

  function toggleExcludedCat(key) {
    const next = new Set(excludedCats)
    if (next.has(key)) {
      next.delete(key)
      // If removing an L1, no orphan L2 keys since L2 keys are "C1:::C2"
    } else {
      next.add(key)
      // If adding an L1, remove any L2 sub-exclusions (L1 covers all)
      if (!key.includes(':::')) {
        for (const k of next) {
          if (k.startsWith(key + ':::')) next.delete(k)
        }
      }
    }
    setAppPref('forecastExcludedCatsWhatIf', [...next])
  }

  // ── Real data: last 6 FULL months (excluding current month) ──
  const { avgIncome, avgExpense, currentSaldo, historicalPoints, historicalYearPoints, catStats, last6, incomeByMonth, expenseByMonth } = useMemo(() => {
    const now = new Date()
    const active = transactions.filter(t => !t.excluded || t._forcedBalance)

    // Running saldo (all time)
    const currentSaldo = active.reduce((s, t) => s + t.amount, 0)

    // Last 12 months INCLUDING current (for historical chart)
    const histMonths = []
    for (let i = 11; i >= 0; i--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      histMonths.push(ym)
    }

    // Historical running saldo at end of each month
    const historicalPoints = histMonths.map(ym => {
      const saldoUpTo = active.filter(t => (t._effDate||(t._effDate||t.date||'')) <= ym + '-31')
        .reduce((s, t) => s + t.amount, 0)
      return { ym, label: ymToLabel(ym), saldo: Math.round(saldoUpTo) }
    })

    // Last 12 FULL months — EXCLUDING current month
    const last6 = []
    for (let i = 12; i >= 1; i--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      last6.push(ym)
    }

    // Avg income last 6 full months — Fra+Sofi salary entries
    const salaryTxs = transactions.filter(t =>
      !t.excluded && t.amount > 0 && t.cat1 === 'Entrate' &&
      (t.cat2 === 'Fra' || t.cat2 === 'Sofi') &&
      last6.some(ym => (t._effDate||(t._effDate||t.date||'')).startsWith(ym))
    )
    const incomeTxs = salaryTxs.length > 0
      ? salaryTxs
      : transactions.filter(t =>
          !t.excluded && t.amount > 0 &&
          last6.some(ym => (t._effDate||(t._effDate||t.date||'')).startsWith(ym))
        )

    const totalIncome  = incomeTxs.reduce((s, t) => s + t.amount, 0)
    const totalExpense = last6.reduce((s, ym) => s + expTotal(transactions, ym), 0)

    // Monthly breakdown for diagnostics
    const incomeByMonth = last6.map(ym => ({
      ym,
      label: ymToLabel(ym),
      fra:  incomeTxs.filter(t => t.cat2 === 'Fra'  && (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0),
      sofi: incomeTxs.filter(t => t.cat2 === 'Sofi' && (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0),
      other: incomeTxs.filter(t => t.cat2 !== 'Fra' && t.cat2 !== 'Sofi' && (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0),
    }))

    // Monthly expense breakdown (last 12 months)
    const expenseByMonth = last6.map(ym => ({
      ym,
      label: ymToLabel(ym),
      total: expTotal(transactions, ym),
    }))

    // Historical saldo by year (for chart coherence when showing multi-year forecast)
    const historicalYearPoints = []
    for (let y = 3; y >= 1; y--) {
      const year = now.getFullYear() - y
      if (year < 2020) continue
      const endYm = `${year}-12`
      const saldo = active.filter(t => (t._effDate||(t._effDate||t.date||'')) <= endYm + '-31')
        .reduce((s, t) => s + t.amount, 0)
      historicalYearPoints.push({ ym: endYm, label: String(year), saldo: Math.round(saldo) })
    }
    // Also add current year so far
    const curYmLabel = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    const saldoNow = active.reduce((s,t) => s + t.amount, 0)
    historicalYearPoints.push({ ym: curYmLabel, label: String(now.getFullYear()), saldo: Math.round(saldoNow) })

    // Always divide by 12 — fixed window of 12 closed months

    // Cat stats for What If panel — avg monthly per cat1 and cat2
    const catRaw = {}
    expList(transactions, last6).forEach(t => {
      const c1 = t.cat1 || 'Non Categorizzato'
      if (c1 === 'Entrate') return
      if (!catRaw[c1]) catRaw[c1] = { total: 0, subs: {}, color: (getMergedCats(customCats)[c1]?.color) || '#888' }
      catRaw[c1].total += Math.abs(netAmt(t))
      const c2 = t.cat2 || 'Altro'
      catRaw[c1].subs[c2] = (catRaw[c1].subs[c2] || 0) + Math.abs(netAmt(t))
    })
    const catStats = {}
    Object.entries(catRaw).forEach(([c1, data]) => {
      catStats[c1] = {
        avg:   Math.round(data.total / 12),
        color: data.color,
        subs:  Object.fromEntries(Object.entries(data.subs).map(([c2, tot]) => [c2, Math.round(tot / 12)])),
      }
    })

    return {
      avgIncome:  Math.round(totalIncome  / 12),
      avgExpense: Math.round(totalExpense / 12),
      currentSaldo,
      historicalPoints,
      historicalYearPoints,
      catStats,
      last6,
      incomeByMonth,
      expenseByMonth,
    }
  }, [transactions, customCats])

  // Effective income avg excluding deselected months (base storico)
  const effectiveIncomeMths = incomeByMonth.filter(m => !excludedMonths.includes(m.ym))
  const avgIncomeStorico = effectiveIncomeMths.length > 0
    ? Math.round(effectiveIncomeMths.reduce((s, m) => s + m.fra + m.sofi + m.other, 0) / effectiveIncomeMths.length)
    : avgIncome

  // Breakdown mensile per categoria (2026-07-23, richiesta utente: poter scegliere
  // manualmente da quali mesi storici prendere le medie in Teoriche > Spese,
  // invece dei soliti ultimi 12 fissi). Finestra ampia (24 mesi) per dare al
  // selettore abbastanza storia da cui scegliere. SOLO per Teoriche — il
  // catStats condiviso sopra (usato anche dal What If di Storico) resta
  // invariato con la finestra fissa di 12 mesi, per non alterare di riflesso
  // calcoli che l'utente non ha chiesto di toccare.
  const catMonthlyRaw = useMemo(() => {
    const now = new Date()
    const months = []
    for (let i = 24; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    }
    const merged = getMergedCats(customCats)
    const raw = {}
    months.forEach(ym => { raw[ym] = {} })
    expList(transactions, months).forEach(t => {
      const ym = (t._effDate || t.date || '').slice(0, 7)
      if (!raw[ym]) return
      const c1 = t.cat1 || 'Non Categorizzato'
      if (c1 === 'Entrate') return
      if (!raw[ym][c1]) raw[ym][c1] = { total: 0, subs: {}, color: merged[c1]?.color || '#888' }
      raw[ym][c1].total += Math.abs(netAmt(t))
      const c2 = t.cat2 || 'Altro'
      raw[ym][c1].subs[c2] = (raw[ym][c1].subs[c2] || 0) + Math.abs(netAmt(t))
    })
    return { months, raw }
  }, [transactions, customCats])

  // Mesi effettivamente usati per Teoriche > Spese: quelli scelti dall'utente,
  // altrimenti gli stessi ultimi 12 mesi di sempre (comportamento invariato).
  const effectiveSpeseMonths = (teoricheSpeseMonths && teoricheSpeseMonths.length > 0) ? teoricheSpeseMonths : last6

  const catStatsTeoriche = useMemo(() => {
    const divisor = effectiveSpeseMonths.length || 1
    const agg = {}
    effectiveSpeseMonths.forEach(ym => {
      const monthData = catMonthlyRaw.raw[ym]
      if (!monthData) return
      Object.entries(monthData).forEach(([c1, d]) => {
        if (!agg[c1]) agg[c1] = { total: 0, subs: {}, color: d.color }
        agg[c1].total += d.total
        Object.entries(d.subs).forEach(([c2, amt]) => {
          agg[c1].subs[c2] = (agg[c1].subs[c2] || 0) + amt
        })
      })
    })
    const out = {}
    Object.entries(agg).forEach(([c1, d]) => {
      out[c1] = {
        avg: Math.round(d.total / divisor),
        color: d.color,
        subs: Object.fromEntries(Object.entries(d.subs).map(([c2, tot]) => [c2, Math.round(tot / divisor)])),
      }
    })
    return out
  }, [catMonthlyRaw, effectiveSpeseMonths])

  // Valori "Teoriche" — default: Entrate = ultimo mese reale per persona, Spese = media 12 mesi per categoria L1
  const lastMonthIncome = incomeByMonth[incomeByMonth.length - 1] || { fra: 0, sofi: 0 }
  const teoricheFraVal  = teoricheEntrate.Fra  ?? Math.round(lastMonthIncome.fra  || 0)
  const teoricheSofiVal = teoricheEntrate.Sofi ?? Math.round(lastMonthIncome.sofi || 0)
  const teoricheIncomeTotal = teoricheFraVal + teoricheSofiVal
  // Valore effettivo di un L1 in Teoriche: se ha un override L2 (anche parziale),
  // il totale è la somma di TUTTE le sue L2 (override dove presente, altrimenti
  // media reale) — altrimenti il vecchio comportamento (override L1 diretto o
  // media reale del L1 intero).
  function teoricheL1Value(c1) {
    const l2overrides = teoricheSpeseL2[c1]
    const hasL2 = l2overrides && Object.keys(l2overrides).length > 0
    if (hasL2) {
      const subs = catStatsTeoriche[c1]?.subs || {}
      return Object.keys(subs).reduce((s, c2) => s + (l2overrides[c2] ?? subs[c2] ?? 0), 0)
    }
    return teoricheSpese[c1] ?? catStatsTeoriche[c1]?.avg ?? 0
  }

  const teoricheExpenseTotal = Object.keys(catStatsTeoriche).reduce(
    (s, c1) => s + teoricheL1Value(c1), 0
  )

  const avgIncomeEffective = forecastBasis === 'teoriche' ? teoricheIncomeTotal : avgIncomeStorico

  // ── Historical yearly data for proiezione table ──────────
  const historicalTableData = useMemo(() => {
    const now = new Date()
    const activeTxs = transactions.filter(t => !t.excluded)
    const rows = []
    for (let y = 3; y >= 1; y--) {
      const year = now.getFullYear() - y
      if (year < 2020) continue
      const yStr = String(year)
      const inc = activeTxs.filter(t => t.amount > 0 && (t._effDate||(t.date||'')).startsWith(yStr))
        .reduce((s,t) => s+t.amount, 0)
      const exp = Math.abs(activeTxs.filter(t => t.amount < 0 && (t._effDate||(t.date||'')).startsWith(yStr))
        .reduce((s,t) => s+t.amount, 0))
      const saldo = activeTxs.filter(t => (t._effDate||(t.date||'')) <= `${yStr}-12-31`)
        .reduce((s,t) => s+t.amount, 0)
      if (inc === 0 && exp === 0) continue
      rows.push({ label: yStr, inc: Math.round(inc), exp: Math.round(exp), saldo: Math.round(saldo) })
    }
    return rows
  }, [transactions])

  // ── What If: saved per month from excluded cats ───────────
  const savedPerMonth = useMemo(() => {
    if (excludedCats.size === 0) return 0
    let saved = 0
    for (const key of excludedCats) {
      if (key.includes(':::')) {
        // L2 key — only count if parent L1 NOT already excluded
        const c1 = key.split(':::')[0]
        if (!excludedCats.has(c1)) {
          const [, c2] = key.split(':::')
          saved += catStats[c1]?.subs[c2] || 0
        }
      } else {
        // L1 key
        saved += catStats[key]?.avg || 0
      }
    }
    return saved
  }, [excludedCats, catStats])

  const effectiveExpense = forecastBasis === 'teoriche' ? teoricheExpenseTotal : (avgExpense - savedPerMonth)

  // Valore "oggi" (non ancora inflazionato) di un L1, coerente con qualunque
  // modalità/esclusione attiva — usato come DEFAULT per le categorie non
  // esplicitamente toccate da un override puntuale mese/anno (sotto). La somma
  // su tutti i cat1 di catStats torna sempre uguale a effectiveExpense.
  function catEffectiveBase(c1) {
    if (forecastBasis === 'teoriche') return teoricheL1Value(c1)
    if (excludedCats.has(c1)) return 0
    const subs = catStats[c1]?.subs || {}
    let total = catStats[c1]?.avg || 0
    Object.keys(subs).forEach(c2 => {
      if (excludedCats.has(`${c1}:::${c2}`)) total -= subs[c2]
    })
    return Math.max(0, total)
  }

  // ── Override puntuali mese/anno sulla tabella "Proiezione" (2026-07-23,
  // richiesta utente: click su un mese/anno per modificare la composizione
  // delle spese da quel punto, con opzione "applica da qui in avanti"). Solo
  // Spese (non Entrate), per scelta esplicita dell'utente. Formato:
  // { [ym|year]: { spese: {[cat1]: number}, cascade: boolean } }
  // cascade:true → resta valido finché non arriva un ALTRO override più avanti
  // nel tempo (si "ferma" da solo, vedi forecastData/forecastDataMonthly);
  // cascade:false → vale SOLO per quel mese/anno specifico, il mese dopo si
  // ritorna alla traiettoria che ci sarebbe stata comunque.
  const overridesMonthly = appPrefs?.forecastOverridesMonthly || {}
  const overridesYearly  = appPrefs?.forecastOverridesYearly  || {}
  function saveOverrideMonthly(ym, entry) {
    setAppPref('forecastOverridesMonthly', { ...overridesMonthly, [ym]: entry })
  }
  function removeOverrideMonthly(ym) {
    const next = { ...overridesMonthly }; delete next[ym]
    setAppPref('forecastOverridesMonthly', next)
  }
  function saveOverrideYearly(year, entry) {
    setAppPref('forecastOverridesYearly', { ...overridesYearly, [year]: entry })
  }
  function removeOverrideYearly(year) {
    const next = { ...overridesYearly }; delete next[year]
    setAppPref('forecastOverridesYearly', next)
  }
  function overrideTotal(entry) {
    if (!entry) return null
    const spese = entry.spese || {}
    return Object.keys(catStats).reduce((s, c1) => s + (spese[c1] ?? catEffectiveBase(c1)), 0)
  }
  // Valori di default (oggi, non inflazionati) per ogni L1 — usati per
  // precompilare il popup di override quando si clicca un mese/anno.
  const defaultsByCat = useMemo(() => {
    const d = {}
    Object.keys(catStats).forEach(c1 => { d[c1] = catEffectiveBase(c1) })
    return d
  }, [catStats, catStatsTeoriche, forecastBasis, teoricheSpese, teoricheSpeseL2, excludedCats])

  // ── Override puntuali mese/anno sulla colonna ENTRATE (2026-07-23, richiesta
  // utente: stesso meccanismo delle Spese, ma per Fra/Sofi + una riga "Altro"
  // per un'entrata extra di quel periodo). Formato:
  // { [ym|year]: { entrate: {Fra,Sofi}, cascade: bool, altro: number, altroCascade: bool } }
  // cascade → si applica a Fra/Sofi (stessa logica delle Spese: resta valido
  // finché non arriva un altro override). altroCascade è un flag SEPARATO,
  // scelto dall'utente, perché "Altro" è tipicamente un'entrata one-off
  // (es. bonus, rimborso) che di norma NON deve ripetersi nei mesi successivi
  // — ma l'utente può scegliere di farla ripetere (es. un nuovo affitto extra).
  const overridesEntrateMonthly = appPrefs?.forecastOverridesEntrateMonthly || {}
  const overridesEntrateYearly  = appPrefs?.forecastOverridesEntrateYearly  || {}
  function saveOverrideEntrateMonthly(ym, entry) {
    setAppPref('forecastOverridesEntrateMonthly', { ...overridesEntrateMonthly, [ym]: entry })
  }
  function removeOverrideEntrateMonthly(ym) {
    const next = { ...overridesEntrateMonthly }; delete next[ym]
    setAppPref('forecastOverridesEntrateMonthly', next)
  }
  function saveOverrideEntrateYearly(year, entry) {
    setAppPref('forecastOverridesEntrateYearly', { ...overridesEntrateYearly, [year]: entry })
  }
  function removeOverrideEntrateYearly(year) {
    const next = { ...overridesEntrateYearly }; delete next[year]
    setAppPref('forecastOverridesEntrateYearly', next)
  }
  // Ritorna { base: Fra+Sofi (soggetto a cascade), altro, total: base+altro } —
  // "base" e "altro" separati perché hanno cascade indipendenti nel loop di
  // proiezione (vedi forecastData/forecastDataMonthly).
  function overrideIncomeParts(entry, defaultFra, defaultSofi) {
    if (!entry) return null
    const ent = entry.entrate || {}
    const base = (ent.Fra ?? defaultFra) + (ent.Sofi ?? defaultSofi)
    const altro = entry.altro || 0
    return { base, altro, total: base + altro, cascade: !!entry.cascade, altroCascade: !!entry.altroCascade }
  }
  // Popup override Entrate mese/anno — { granularity:'mensile'|'annuale', key: ym|year, label }
  const [overrideIncomePopup, setOverrideIncomePopup] = useState(null)

  // ── Mortgage calculation ──────────────────────────────────
  const mortgage = useMemo(() => {
    if (!mortgageOn || !mortgageAmt || !mortgageTaeg) return null
    return calcMortgage(mortgageAmt, mortgageTaeg, Math.min(mortgageYears, years + 30))
  }, [mortgageOn, mortgageAmt, mortgageYears, mortgageTaeg, years])

  // ── Forecast data (uses effectiveExpense) ─────────────────
  const monthlySavings = avgIncomeEffective - effectiveExpense - (mortgage ? mortgage.rata : 0)
  const savingsRate    = avgIncomeEffective > 0 ? Math.round(monthlySavings / avgIncomeEffective * 100) : 0

  const mortgageStartYear = useMemo(() => {
    if (!mortgageStart) return new Date().getFullYear()
    return parseInt(mortgageStart.split('-')[0])
  }, [mortgageStart])

  // BUG FIX (2026-07-23, segnalato utente): l'Anticipo (acconto) veniva
  // dedotto dal saldo previsto al PRIMO punto della proiezione ogni volta che
  // il mutuo era già in corso (mortgageStart nel passato), perché la
  // condizione era "year/ym >= mortgageStartYear/YM" — vera fin da subito per
  // un mutuo già partito. L'utente ha confermato: "non deve succedere niente
  // il mese del mutuo" quando il mutuo è già attivo — l'anticipo è un evento
  // storico già riflesso nel saldo attuale, non va ridedotto nella proiezione.
  // L'anticipo va tolto dal saldo SOLO se il mutuo non è ancora partito (data
  // di inizio nel futuro rispetto ad oggi) — cioè per un mutuo pianificato.
  const mortgageNotYetStarted = useMemo(() => {
    if (!mortgageStart) return false
    const nowYM = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
    return mortgageStart > nowYM
  }, [mortgageStart])

  const forecastData = useMemo(() => {
    const now = new Date()
    const pts = []
    const monthsRemaining = 12 - now.getMonth() // getMonth() is 0-based, so July = 6, remaining = 6
    const currentYearFraction = monthsRemaining / 12
    let saldo = currentSaldo
    let inc   = avgIncomeEffective
    let exp   = effectiveExpense
    let anticipoApplied = false

    // Stato dinamico del mutuo (2026-07-23, richiesta utente: rimborsi
    // anticipati automatici "ogni X risparmiati" + estinzioni manuali puntuali
    // — vedi extraRepayEnabled/mortgageExtraYearly sopra). Simulato mese per
    // mese DENTRO il loop annuale (per interessi composti corretti) ma esposto
    // solo a livello di anno nei punti restituiti.
    const durationMonths = mortgage ? Math.min(mortgageYears, years + 30) * 12 : 0
    let mortBalance = (mortgageOn && mortgage) ? mortgageAmt : 0
    let mortRata     = (mortgageOn && mortgage) ? mortgage.rata : 0
    // Rimborso anticipato automatico — vedi commento analogo nel loop mensile
    // sotto: si traccia il SALDO vero (stimato mese per mese anche qui, per
    // interessi/soglia corretti), non un contatore di risparmi separato.
    // `simSaldo` segue lo stesso percorso del vero `saldo` annuale ma a grana
    // mensile (necessaria per sapere ESATTAMENTE quando si supera la soglia).
    let extraBaseSaldo = null
    let simSaldo = currentSaldo
    let mortMonthsElapsed  = 0
    // Mesi trascorsi sul piano di ammortamento NOMINALE (rata fissa, nessun
    // extra) — 2026-07-23, richiesta utente: mostrare in chart/KPI ANCHE il
    // mutuo "originale" per confronto quando il rimborso anticipato
    // automatico è attivo. Avanza SEMPRE (indipendentemente da mortBalance
    // reale/mortgageActive) così non si blocca se il mutuo vero si estingue
    // in anticipo — il piano nominale continua ad ammortizzarsi per conto suo.
    let nominalMonthsElapsed = 0

    for (let y = 0; y <= years; y++) {
      const year = now.getFullYear() + y
      // Override puntuale su questo anno (solo Spese) — vedi overrideTotal/
      // overridesYearly sopra. preOverrideExp serve a "far ripartire" la
      // traiettoria normale l'anno dopo se l'override NON è a cascata (vale
      // solo per questo anno specifico, non altera il futuro).
      const ovY = overridesYearly[String(year)]
      const preOverrideExp = exp
      let expThisYear = exp
      if (ovY) {
        const total = overrideTotal(ovY)
        if (total != null) expThisYear = total
      }
      // Override puntuale ENTRATE su questo anno (2026-07-23) — vedi
      // overrideIncomeParts/overridesEntrateYearly sopra. Fra/Sofi hanno un
      // cascade, "Altro" ne ha uno separato scelto dall'utente.
      const ovYE = overridesEntrateYearly[String(year)]
      const preOverrideInc = inc
      let incThisYear = inc
      let incParts = null
      if (ovYE) {
        incParts = overrideIncomeParts(ovYE, teoricheFraVal, teoricheSofiVal)
        incThisYear = incParts.total
      }
      const mortgageActive  = mortgageOn && mortgage && year >= mortgageStartYear && mortBalance > 0
      const rataAtYearStart = mortRata
      // Deduct the anticipo (down payment) only in the year the mortgage actually starts,
      // not unconditionally in year 0
      if (mortgageOn && mortgageAnticipo > 0 && !anticipoApplied && mortgageNotYetStarted && year >= mortgageStartYear) {
        saldo -= mortgageAnticipo
        simSaldo -= mortgageAnticipo
        anticipoApplied = true
      }
      // Year 0: only count the fraction of the year that remains
      const yearFraction = y === 0 ? currentYearFraction : 1

      // Simulazione mensile del mutuo per QUESTO anno (rimborsi anticipati
      // automatici + manuale una tantum sull'anno) — vedi commento sopra sul
      // perché serve un sotto-loop mensile anche nella vista annuale.
      let yearExtra = 0
      const monthsThisYearAll = y === 0 ? monthsRemaining : 12
      if (mortgageActive) {
        const monthsThisYear = monthsThisYearAll
        const rMonthly = mortgageTaeg / 100 / 12
        const manualExtraThisYear = mortgageExtraYearly[String(year)] || 0
        let manualApplied = false
        for (let mm = 0; mm < monthsThisYear && mortBalance > 0; mm++) {
          const interest  = mortBalance * rMonthly
          const principal = Math.min(mortRata - interest, mortBalance)
          mortBalance = Math.max(0, mortBalance - principal)
          // Base = saldo stimato PRIMA dei flussi di questo mese. Impostata una
          // sola volta, al primo mese mai attivo del mutuo — il mese di
          // partenza del mutuo non genera quindi mai un rimborso extra.
          if (extraBaseSaldo === null) extraBaseSaldo = simSaldo
          // entrate/spese di quest'anno spalmate uniformemente sui mesi —
          // approssimazione accettabile a livello annuale, coerente con come
          // già lavora questo loop.
          simSaldo += (incThisYear - expThisYear - mortRata)
          let autoExtra = 0
          // mortMonthsElapsed === 0 → primo mese attivo del mutuo: nessuna
          // estinzione automatica può scattare qui, anche se il saldo di
          // QUESTO mese da solo supera già la soglia — vedi commento analogo
          // nel loop mensile sopra.
          if (extraRepayEnabled && extraRepayThreshold > 0 && mortMonthsElapsed > 0) {
            const surplus = simSaldo - extraBaseSaldo
            if (surplus >= extraRepayThreshold) {
              autoExtra = Math.floor(surplus / extraRepayThreshold) * extraRepayThreshold
            }
          }
          // Il rimborso manuale annuale viene versato una sola volta, nell'ultimo
          // mese processato di quell'anno (semplificazione: lump sum di fine anno).
          const manualExtra = (!manualApplied && mm === monthsThisYear - 1) ? manualExtraThisYear : 0
          if (manualExtra > 0) manualApplied = true
          const totalExtra = Math.min(autoExtra + manualExtra, mortBalance)
          // FIX 2026-07-23 — vedi commento analogo nel loop mensile: la base va
          // resettata al saldo VERO rimasto dopo l'estinzione (simSaldo dopo la
          // sottrazione), non spostata in avanti di "totalExtra" (avrebbe
          // ritardato il trigger successivo oltre il dovuto).
          if (totalExtra > 0) { simSaldo -= totalExtra; extraBaseSaldo = simSaldo }
          mortBalance = Math.max(0, mortBalance - totalExtra)
          yearExtra += totalExtra
          const remainingMonths = durationMonths - (mortMonthsElapsed + 1)
          if (totalExtra > 0 && mortBalance > 0 && remainingMonths > 0) {
            // 'rata' → ricalcola (stessa scadenza, rata più bassa da qui in poi);
            // 'durata' → rata invariata, il capitale minore si estingue da solo
            // prima (nessun ricalcolo necessario).
            if (extraRepayStrategy === 'rata') {
              mortRata = calcMortgagePayment(mortBalance, mortgageTaeg, remainingMonths)
            }
          } else if (mortBalance <= 0) {
            mortRata = 0
          }
          mortMonthsElapsed++
        }
      }

      saldo += (incThisYear - expThisYear - rataAtYearStart) * 12 * yearFraction - yearExtra

      const residual = mortgageOn && mortgage && year >= mortgageStartYear ? mortBalance : null

      // Residuo NOMINALE (piano di ammortamento originale, rata fissa, nessun
      // extra) allo stesso punto nel tempo — 2026-07-23, vedi commento su
      // nominalMonthsElapsed sopra.
      let residualNominal = null
      if (mortgageOn && mortgage && year >= mortgageStartYear) {
        nominalMonthsElapsed = Math.min(nominalMonthsElapsed + monthsThisYearAll, durationMonths)
        const idx = nominalMonthsElapsed - 1
        residualNominal = (idx >= 0 && idx < mortgage.monthlyResiduals.length) ? mortgage.monthlyResiduals[idx] : 0
      }

      pts.push({
        label:    String(year),
        forecast: Math.round(saldo),
        residual: residual !== null ? Math.round(residual) : undefined,
        residualNominal: residualNominal !== null ? Math.round(residualNominal) : undefined,
        // Entrate/Spese effettive di QUESTO anno (con eventuale override già
        // applicato) — usate dalla tabella "Proiezione Annuale" invece di
        // ricalcolare con una formula approssimata separata.
        income:  Math.round(incThisYear),
        expense: Math.round(expThisYear),
        hasOverride: !!ovY,
        hasIncomeOverride: !!ovYE,
        // Rata/estinzione anticipata di QUESTO anno (2026-07-23) — usate dalla
        // tabella "Proiezione Annuale" invece della rata statica mortgage.rata.
        mortgageRata:  mortgageActive ? Math.round(rataAtYearStart * 12) : 0,
        mortgageExtra: Math.round(yearExtra),
        hasMortgageExtra: !!(mortgageExtraYearly[String(year)]),
      })

      if (ovYE) {
        // Cascata separata per Fra/Sofi (base) e per "Altro" — vedi commento
        // sopra su overridesEntrateYearly.
        inc = ((incParts.cascade ? incParts.base : preOverrideInc) + (incParts.altroCascade ? incParts.altro : 0)) * (1 + growth / 100)
      } else {
        inc *= (1 + growth / 100)
      }
      if (ovY && overrideTotal(ovY) != null) {
        // Cascata → il valore di questo anno diventa la nuova base che continua
        // a inflazionarsi; puntuale → si riparte da dove si sarebbe comunque
        // arrivati (l'anno "blip" non lascia traccia sul futuro).
        exp = (ovY.cascade ? expThisYear : preOverrideExp) * (1 + inflation / 100)
      } else {
        exp *= (1 + inflation / 100)
      }
    }
    return pts
  }, [avgIncomeEffective, effectiveExpense, growth, inflation, years, currentSaldo, mortgage, mortgageOn, mortgageStartYear, mortgageNotYetStarted, mortgageAmt, mortgageYears, mortgageTaeg, mortgageAnticipo, extraRepayEnabled, extraRepayThreshold, extraRepayStrategy, mortgageExtraYearly, overridesYearly, overridesEntrateYearly, teoricheFraVal, teoricheSofiVal, catStats, forecastBasis, teoricheSpese, teoricheSpeseL2, excludedCats])

  // ── Forecast data, granularità MENSILE (richiesta utente 2026-07-19: poter
  // scegliere fra proiezione annuale o mensile nella tabella "Proiezione") —
  // stessa logica di forecastData ma un punto per mese invece che per anno.
  // Crescita/inflazione composte mensilmente (tasso annuo elevato a 1/12) così
  // il valore di fine anno resta coerente con quello della vista annuale.
  const forecastDataMonthly = useMemo(() => {
    const now = new Date()
    const totalMonths = years * 12
    const pts = []
    let saldo = currentSaldo
    let inc   = avgIncomeEffective
    let exp   = effectiveExpense
    const gMonthly = Math.pow(1 + growth / 100, 1 / 12)
    const iMonthly = Math.pow(1 + inflation / 100, 1 / 12)
    const mortgageStartYM = mortgageStart || null
    let anticipoApplied = false

    // Stato dinamico del mutuo (2026-07-23) — vedi commento analogo nel loop
    // annuale sopra: rimborsi anticipati automatici "ogni X risparmiati" +
    // estinzioni manuali puntuali, rata ricalcolata mantenendo la scadenza.
    const durationMonths = mortgage ? Math.min(mortgageYears, years + 30) * 12 : 0
    let mortBalance = (mortgageOn && mortgage) ? mortgageAmt : 0
    let mortRata     = (mortgageOn && mortgage) ? mortgage.rata : 0
    // Rimborso anticipato automatico — riscritto 2026-07-23 su correzione
    // esplicita dell'utente: NON si accumula un contatore di "risparmi mensili"
    // separato (bug: poteva scattare cifre enormi al primo mese per un motivo
    // di scala/unità mai isolato con certezza). Si traccia invece il SALDO
    // vero e proprio: `extraBaseSaldo` è il saldo previsto nel mese in cui il
    // mutuo diventa attivo (es. 199), e il rimborso scatta solo su quanto il
    // saldo cresce OLTRE quella base — quando supera la soglia (es. +20), si
    // preleva esattamente la soglia e si rimette la base al nuovo livello,
    // così il saldo "torna" al livello precedente e il ciclo ricomincia.
    // Nessun rimborso può quindi scattare nel mese stesso in cui parte il
    // mutuo (la base è presa PRIMA dei flussi di quel mese, quindi il surplus
    // parte da 0).
    let extraBaseSaldo = null
    let mortMonthsElapsed  = 0
    // Mesi trascorsi sul piano di ammortamento NOMINALE (rata fissa, nessun
    // extra) — vedi commento gemello in forecastData sopra: serve per la
    // linea "mutuo originale" nel chart e per le quote capitale/interessi
    // "originali" mostrate nei KPI.
    let nominalMonthsElapsedM = 0
    // DEBUG TEMPORANEO (2026-07-23) — rimborso anticipato automatico segnalato
    // come "non funziona": log dei primi mesi per capire se il flag è letto,
    // se i risparmi si accumulano, e quando/se scatta la soglia. Da rimuovere
    // quando confermato risolto.
    const __mortDebugRows = []

    for (let m = 0; m <= totalMonths; m++) {
      const d  = new Date(now.getFullYear(), now.getMonth() + m, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      // Override puntuale su questo mese (solo Spese) — vedi overrideTotal/
      // overridesMonthly sopra. preOverrideExp serve a "far ripartire" la
      // traiettoria normale il mese dopo se l'override NON è a cascata.
      const ovM = overridesMonthly[ym]
      const preOverrideExp = exp
      let expThisMonth = exp
      if (ovM) {
        const total = overrideTotal(ovM)
        if (total != null) expThisMonth = total
      }
      // Override puntuale ENTRATE su questo mese (2026-07-23) — vedi
      // overrideIncomeParts/overridesEntrateMonthly sopra.
      const ovME = overridesEntrateMonthly[ym]
      const preOverrideInc = inc
      let incThisMonth = inc
      let incParts = null
      if (ovME) {
        incParts = overrideIncomeParts(ovME, teoricheFraVal, teoricheSofiVal)
        incThisMonth = incParts.total
      }

      if (mortgageOn && mortgageAnticipo > 0 && !anticipoApplied && mortgageNotYetStarted && mortgageStartYM && ym >= mortgageStartYM) {
        saldo -= mortgageAnticipo
        anticipoApplied = true
      }
      // 13ma/14ma (solo in modalità Teoriche) — richiesta utente 2026-07-20: nei mesi in
      // cui una persona ha la 14esima o la 13esima, il suo stipendio in quel mese
      // raddoppia. Mese configurabile via bonusMonths (1-based); d.getMonth() è 0-based.
      let bonusExtra = 0
      if (forecastBasis === 'teoriche') {
        const mon = d.getMonth() + 1
        ;['Fra','Sofi'].forEach(person => {
          const flags = teoricheBonus[person] || {}
          const val   = person === 'Fra' ? teoricheFraVal : teoricheSofiVal
          if (mon === bonusMonths.m14 && flags.has14) bonusExtra += val
          if (mon === bonusMonths.m13 && flags.has13) bonusExtra += val
        })
      }

      // Simulazione mensile del mutuo (rimborso anticipato automatico +
      // manuale) — vedi extraRepayEnabled/mortgageExtraMonthly sopra.
      const mortgageActive = mortgageOn && mortgage && mortgageStartYM && ym >= mortgageStartYM && mortBalance > 0
      let mortgageMonthly = 0
      let mortgageExtra   = 0
      // Quota capitale/interessi EFFETTIVE di questa rata (2026-07-23,
      // richiesta utente: nuovi KPI "Quota capitale"/"Quota interessi") —
      // catturate fuori dal blocco perché servono anche se mortgageActive
      // diventa false in futuro (mutuo già estinto).
      let mortgageInterestActual  = null
      let mortgagePrincipalActual = null
      if (mortgageActive) {
        // Base = saldo previsto PRIMA dei flussi di questo mese. Impostata una
        // sola volta, al primo mese in cui il mutuo è attivo — quindi il mese
        // di partenza del mutuo non può mai generare un rimborso extra.
        if (extraBaseSaldo === null) extraBaseSaldo = saldo
        mortgageMonthly = mortRata
        const rMonthly  = mortgageTaeg / 100 / 12
        const interest  = mortBalance * rMonthly
        const principal = Math.min(mortgageMonthly - interest, mortBalance)
        mortgageInterestActual  = interest
        mortgagePrincipalActual = principal
        let newBalance  = Math.max(0, mortBalance - principal)
        // Saldo proiettato a fine di QUESTO mese (flussi normali), usato SOLO
        // per capire di quanto ha superato la base — mai scritto nel vero
        // saldo prima del tempo.
        const saldoAfterMonth = saldo + (incThisMonth - expThisMonth - mortgageMonthly + bonusExtra)
        let autoExtra = 0
        let surplus   = 0
        // mortMonthsElapsed === 0 → questo È il primo mese attivo del mutuo:
        // nessuna estinzione automatica può scattare qui, anche se il saldo di
        // QUESTO mese da solo (es. un'entrata una tantum molto alta) supera già
        // la soglia — richiesta esplicita dell'utente 2026-07-23. Il surplus
        // resta comunque "in banca" nel saldo reale e verrà catturato al primo
        // mese successivo idoneo, perché la base non si sposta finché non
        // scatta davvero un'estinzione.
        if (extraRepayEnabled && extraRepayThreshold > 0 && mortMonthsElapsed > 0) {
          surplus = saldoAfterMonth - extraBaseSaldo
          if (surplus >= extraRepayThreshold) {
            autoExtra = Math.floor(surplus / extraRepayThreshold) * extraRepayThreshold
          }
        }
        const manualExtra = mortgageExtraMonthly[ym] || 0
        const totalExtra  = Math.min(autoExtra + manualExtra, newBalance)
        // FIX 2026-07-23 (segnalato dall'utente con esempio numerico reale):
        // la base NON deve avanzare di "totalExtra" (avrebbe saltato in avanti
        // oltre il vero saldo, ritardando il prossimo scatto) — deve resettarsi
        // al saldo VERO rimasto dopo l'estinzione, esattamente come dice
        // l'utente ("il saldo torna al livello base"). saldoAfterMonth-totalExtra
        // è per costruzione il saldo reale di fine mese dopo l'estinzione.
        if (totalExtra > 0) extraBaseSaldo = saldoAfterMonth - totalExtra
        newBalance = Math.max(0, newBalance - totalExtra)
        mortgageExtra = totalExtra
        const remainingMonths = durationMonths - (mortMonthsElapsed + 1)
        if (totalExtra > 0 && newBalance > 0 && remainingMonths > 0 && extraRepayStrategy === 'rata') {
          mortRata = calcMortgagePayment(newBalance, mortgageTaeg, remainingMonths)
        } else if (newBalance <= 0) {
          mortRata = 0
        }
        mortBalance = newBalance
        mortMonthsElapsed++
        if (m < 36) {
          __mortDebugRows.push({
            ym, extraRepayEnabled, extraRepayThreshold,
            incThisMonth: Math.round(incThisMonth), expThisMonth: Math.round(expThisMonth),
            mortgageMonthly: Math.round(mortgageMonthly),
            saldoAfterMonth: Math.round(saldoAfterMonth), extraBaseSaldo: Math.round(extraBaseSaldo), surplus: Math.round(surplus),
            autoExtra, manualExtra, totalExtra, newRata: Math.round(mortRata), newBalance: Math.round(mortBalance),
          })
        }
      }
      saldo += (incThisMonth - expThisMonth - mortgageMonthly - mortgageExtra + bonusExtra)

      const residual = mortgageOn && mortgage && mortgageStartYM && ym >= mortgageStartYM ? mortBalance : null

      // Piano NOMINALE (originale, rata fissa, nessun extra) allo stesso mese
      // — 2026-07-23, per la linea di confronto nel chart e per i KPI "quota
      // capitale/interessi originali". Avanza sempre, indipendentemente da
      // mortgageActive/mortBalance reale (vedi commento su nominalMonthsElapsedM).
      let residualNominal = null
      let mortgageInterestNominal  = null
      let mortgagePrincipalNominal = null
      if (mortgageOn && mortgage && mortgageStartYM && ym >= mortgageStartYM) {
        const idx = nominalMonthsElapsedM
        const balanceBeforeNominal = idx === 0 ? mortgageAmt : (mortgage.monthlyResiduals[idx - 1] ?? 0)
        const rMonthlyNominal = mortgageTaeg / 100 / 12
        if (balanceBeforeNominal > 0) {
          mortgageInterestNominal  = balanceBeforeNominal * rMonthlyNominal
          mortgagePrincipalNominal = Math.min(mortgage.rata - mortgageInterestNominal, balanceBeforeNominal)
        } else {
          mortgageInterestNominal  = 0
          mortgagePrincipalNominal = 0
        }
        residualNominal = idx < mortgage.monthlyResiduals.length ? mortgage.monthlyResiduals[idx] : 0
        nominalMonthsElapsedM++
      }

      pts.push({
        label:    ymToLabel(ym),
        ym,
        forecast: Math.round(saldo),
        residual: residual !== null ? Math.round(residual) : undefined,
        residualNominal: residualNominal !== null ? Math.round(residualNominal) : undefined,
        // Entrate/Spese effettive DI QUESTO mese (con crescita/inflazione già composte
        // e, in modalità Teoriche, la 13ª/14ª già sommata) — usate dalla tabella
        // "Proiezione Mensile" al posto di ricalcolare da avgIncomeEffective piatto
        income:  Math.round(incThisMonth + bonusExtra),
        expense: Math.round(expThisMonth),
        bonusExtra: Math.round(bonusExtra),
        hasOverride: !!ovM,
        hasIncomeOverride: !!ovME,
        // Rata/estinzione anticipata di QUESTO mese (2026-07-23) — usate dalla
        // tabella "Proiezione Mensile" invece della rata statica mortgage.rata.
        mortgageRata:  Math.round(mortgageMonthly),
        mortgageExtra: Math.round(mortgageExtra),
        hasMortgageExtra: !!(mortgageExtraMonthly[ym]),
        // Quota capitale/interessi (2026-07-23, nuovi KPI) — effettive (con
        // eventuale strategia 'rata' già applicata) e nominali (piano originale).
        mortgageInterestActual:   mortgageInterestActual  !== null ? Math.round(mortgageInterestActual)  : undefined,
        mortgagePrincipalActual:  mortgagePrincipalActual !== null ? Math.round(mortgagePrincipalActual) : undefined,
        mortgageInterestNominal:  mortgageInterestNominal !== null ? Math.round(mortgageInterestNominal) : undefined,
        mortgagePrincipalNominal: mortgagePrincipalNominal !== null ? Math.round(mortgagePrincipalNominal) : undefined,
      })

      if (ovME) {
        // Cascata separata per Fra/Sofi (base) e per "Altro" — vedi commento
        // su overridesEntrateMonthly sopra.
        inc = ((incParts.cascade ? incParts.base : preOverrideInc) + (incParts.altroCascade ? incParts.altro : 0)) * gMonthly
      } else {
        inc *= gMonthly
      }
      if (ovM && overrideTotal(ovM) != null) {
        // Cascata → il valore di questo mese diventa la nuova base che continua
        // a inflazionarsi; puntuale → si riparte da dove si sarebbe comunque
        // arrivati (il mese "blip" non lascia traccia sul futuro).
        exp = (ovM.cascade ? expThisMonth : preOverrideExp) * iMonthly
      } else {
        exp *= iMonthly
      }
    }
    if (typeof window !== 'undefined' && mortgageOn && mortgage) {
      window.__fmtMortgageDebug = __mortDebugRows
      console.log('[mortgageAuto] primi 36 mesi (o fino a estinzione):', __mortDebugRows)
      console.log('[mortgageAuto] dettaglio completo in window.__fmtMortgageDebug')
    }
    return pts
  }, [avgIncomeEffective, effectiveExpense, growth, inflation, years, currentSaldo, mortgage, mortgageOn, mortgageStart, mortgageNotYetStarted, mortgageAmt, mortgageYears, mortgageTaeg, mortgageAnticipo, extraRepayEnabled, extraRepayThreshold, extraRepayStrategy, mortgageExtraMonthly, forecastBasis, teoricheBonus, teoricheFraVal, teoricheSofiVal, bonusMonths, overridesMonthly, overridesEntrateMonthly, catStats, teoricheSpese, teoricheSpeseL2, excludedCats])

  // ── Combined chart data ───────────────────────────────────
  const chartData = useMemo(() => {
    // Use yearly historical when forecast horizon > 1 year (for label coherence)
    const srcHist = years > 1 ? historicalYearPoints : historicalPoints
    const histPts = srcHist.map(p => ({
      label:      p.label,
      historical: p.saldo,
      forecast:   null,
      residual:   null,
      residualNominal: null,
      _ym:        p.ym,
    }))
    if (histPts.length > 0) {
      histPts[histPts.length - 1].forecast = histPts[histPts.length - 1].historical
    }
    const fcPts = forecastData.map(d => ({
      label:      d.label,
      historical: null,
      forecast:   d.forecast,
      residual:   d.residual ?? null,
      // Linea di confronto "mutuo originale" (2026-07-23) — mostrata in chart
      // SOLO quando il rimborso anticipato automatico è attivo (altrimenti
      // coinciderebbe con "residual" ed è ridondante); il campo è comunque
      // sempre disponibile qui, la UI decide se disegnarlo.
      residualNominal: d.residualNominal ?? null,
    }))
    return [...histPts, ...fcPts]
  }, [historicalPoints, historicalYearPoints, forecastData, years])

  const finalPoint    = forecastData[forecastData.length - 1]
  const finalSaldo    = finalPoint?.forecast || 0
  const finalResidual = finalPoint?.residual || 0

  const breakeven = mortgage
    ? forecastData.findIndex(d => (d.residual ?? Infinity) <= d.forecast)
    : -1

  // ── KPI dedicati al mutuo (2026-07-23, richiesta utente: quando il mutuo è
  // attivo, la riga KPI sotto il grafico deve mostrare SOLO metriche sul
  // mutuo — rata attuale, quanto rimborsato quest'anno, rimborsi anticipati
  // previsti nell'orizzonte, anno di estinzione — al posto di "Saldo {anno}".
  // Usa sempre forecastDataMonthly (granularità fine) indipendentemente dalla
  // vista selezionata in tabella, per avere numeri precisi.
  const mortgageKpis = useMemo(() => {
    if (!mortgageOn || !mortgage) return null
    const firstActive = forecastDataMonthly.find(d => d.mortgageRata > 0)
    const rataAttuale = firstActive ? firstActive.mortgageRata : mortgage.rata
    const thisYear = new Date().getFullYear()
    const monthsThisYear = forecastDataMonthly.filter(d => d.ym.startsWith(String(thisYear)))
    // Somma di rata+estinzioni versate da qui a fine anno (non "tutto l'anno
    // solare": la proiezione parte dal mese corrente, i mesi già passati
    // dell'anno non sono nell'array) — evita di dover ricostruire un saldo
    // "a inizio anno" che non è disponibile per mutui già in corso da prima.
    const repaidThisYear = monthsThisYear.reduce((s, d) => s + (d.mortgageRata || 0) + (d.mortgageExtra || 0), 0)
    const totalExtraForecast = forecastDataMonthly.reduce((s, d) => s + (d.mortgageExtra || 0), 0)
    const payoffPoint = forecastData.find(d => d.residual === 0)
    // Anno di estinzione sul piano ORIGINALE (nominale, nessun extra) — per
    // confronto quando il rimborso anticipato automatico è attivo (2026-07-23).
    const payoffPointNominal = forecastData.find(d => d.residualNominal === 0)
    const payoffYearFallback = mortgageStart ? String(parseInt(mortgageStart.split('-')[0],10) + mortgageYears) : '—'
    // Quota capitale/interessi (2026-07-23, nuovi KPI): valore ORIGINALE
    // (piano nominale, rata fissa) come principale, valore EFFETTIVO (con
    // l'eventuale rimborso anticipato automatico già applicato) come dato
    // secondario — mostrato dalla UI solo se extraRepayEnabled.
    const quotaCapitale         = firstActive ? (firstActive.mortgagePrincipalNominal ?? 0) : 0
    const quotaInteressi        = firstActive ? (firstActive.mortgageInterestNominal  ?? 0) : 0
    const quotaCapitaleActual   = firstActive ? (firstActive.mortgagePrincipalActual  ?? quotaCapitale)  : quotaCapitale
    const quotaInteressiActual  = firstActive ? (firstActive.mortgageInterestActual   ?? quotaInteressi) : quotaInteressi
    return {
      rataAttuale,
      repaidThisYear: Math.round(repaidThisYear),
      totalExtraForecast: Math.round(totalExtraForecast),
      payoffYear: payoffPoint ? payoffPoint.label : payoffYearFallback,
      payoffYearNominal: payoffPointNominal ? payoffPointNominal.label : payoffYearFallback,
      quotaCapitale: Math.round(quotaCapitale),
      quotaInteressi: Math.round(quotaInteressi),
      quotaCapitaleActual: Math.round(quotaCapitaleActual),
      quotaInteressiActual: Math.round(quotaInteressiActual),
    }
  }, [mortgageOn, mortgage, forecastDataMonthly, forecastData, mortgageAmt, mortgageStart, mortgageYears])

  // ── Fondo Cecilia: andamento saldo (versamenti cumulati nel tempo) ──
  const ceciliaFund = (ceciliaGoals || []).find(g => (g.name || '').toLowerCase().includes('cecilia'))
  const ceciliaChartData = useMemo(() => {
    if (!ceciliaFund) return []
    const hist = [...(ceciliaFund.history || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    let running = 0
    const pts = hist.map(h => {
      running += (h.amount || 0)
      return { label: fmtDate(h.date), saldo: Math.round(running) }
    })
    // Allinea l'ultimo punto al saldo attuale reale (nel caso di rettifiche manuali)
    if (pts.length && ceciliaFund.current != null) pts[pts.length - 1].saldo = Math.round(ceciliaFund.current)
    return pts
  }, [ceciliaFund])

  const now = new Date()
  const sourceLabel = transactions.some(t =>
    !t.excluded && t.amount > 0 && t.cat1 === 'Entrate' &&
    (t.cat2 === 'Fra' || t.cat2 === 'Sofi')
  ) ? 'stipendi Fra+Sofi' : 'tutte le entrate'

  return (
    <div className="fc-page">
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,gap:16,flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:600}}>📊 Forecast Finanziario</h1>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:3}}>
            Proiezione basata su dati reali · {sourceLabel} ·{' '}
            {last6.length >= 6 && (
              <span style={{fontFamily:'var(--font-mono)',fontSize:12}}>
                {ymToLabel(last6[0])} → {ymToLabel(last6[last6.length - 1])}
              </span>
            )}
          </div>
        </div>
        {/* Horizon quick selector */}
        <div style={{display:'flex',gap:4,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:9,padding:3}}>
          {[{v:1,l:'1A'},{v:3,l:'3A'},{v:5,l:'5A'},{v:10,l:'10A'},{v:20,l:'20A'},{v:35,l:'35A'}].map(opt=>(
            <button key={opt.v} onClick={()=>setYears(opt.v)}
              style={{padding:'5px 12px',borderRadius:7,border:'none',
                background:years===opt.v?'var(--surface)':'none',
                color:years===opt.v?'var(--text)':'var(--text3)',
                fontWeight:years===opt.v?700:500,cursor:'pointer',fontSize:12,
                fontFamily:'var(--font-sans)',
                boxShadow:years===opt.v?'0 1px 4px rgba(0,0,0,.08)':'none',transition:'all .15s'}}>
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      <div className="fc-layout">
        {/* ── Left: controls ── */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Real data summary */}
          <div className="card fc-controls" style={{position:'relative'}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700}}>📈 Dati Base Previsione</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                {forecastBasis === 'storico' ? 'somma ultimi 12 mesi ÷ 12' : 'valori teorici modificabili manualmente'}
              </div>
            </div>

            {/* Tab Storico / Teoriche */}
            <div style={{display:'flex',gap:4,background:'var(--surface2)',borderRadius:8,padding:3,marginBottom:14}}>
              {[['storico','📊 Storico'],['teoriche','✏️ Teoriche']].map(([v,l]) => (
                <button key={v} onClick={()=>setForecastBasis(v)}
                  style={{flex:1,padding:'6px 10px',borderRadius:6,border:'none',cursor:'pointer',
                    fontFamily:'var(--font-sans)',fontSize:12,fontWeight:700,
                    background:forecastBasis===v?'var(--surface)':'none',
                    color:forecastBasis===v?'var(--text)':'var(--text3)',
                    boxShadow:forecastBasis===v?'0 1px 4px rgba(0,0,0,.08)':'none',transition:'all .15s'}}>
                  {l}
                </button>
              ))}
            </div>

            {forecastBasis === 'storico' && (<>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              {/* Entrate — clickable */}
              <div onClick={()=>setDetailPopup(detailPopup==='income'?null:'income')}
                style={{padding:'10px 12px',background: detailPopup==='income'?'rgba(50,180,100,.08)':'var(--surface2)',
                  borderRadius:8,border:`1px solid ${detailPopup==='income'?'var(--green)':'var(--border)'}`,
                  cursor:'pointer',userSelect:'none'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:3,display:'flex',justifyContent:'space-between'}}>
                  <span>Entrate<br/>(totale / 12)</span><span style={{opacity:.5}}>▼</span>
                </div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--green)',fontFamily:'var(--font-mono)'}}>{fmtFull(avgIncome)}</div>
              </div>
              {/* Spese — clickable */}
              <div onClick={()=>setDetailPopup(detailPopup==='expense'?null:'expense')}
                style={{padding:'10px 12px',background: detailPopup==='expense'?'rgba(220,50,50,.08)':'var(--surface2)',
                  borderRadius:8,border:`1px solid ${detailPopup==='expense'?'var(--red)':'var(--border)'}`,
                  cursor:'pointer',userSelect:'none'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:3,display:'flex',justifyContent:'space-between'}}>
                  <span>Spese<br/>(totale / 12)</span><span style={{opacity:.5}}>▼</span>
                </div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--red)',fontFamily:'var(--font-mono)'}}>{fmtFull(avgExpense)}</div>
              </div>
              {[
                ['Saldo attuale',    fmtFull(currentSaldo),  currentSaldo >= 0 ? 'var(--blue)' : 'var(--red)'],
                ['Risparmio netto',  fmtFull(avgIncome - avgExpense), (avgIncome - avgExpense) >= 0 ? 'var(--green)' : 'var(--red)'],
              ].map(([l, v, c]) => (
                <div key={l} style={{padding:'10px 12px',background:'var(--surface2)',borderRadius:8,border:'1px solid var(--border)'}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',marginBottom:3}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:c,fontFamily:'var(--font-mono)'}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Monthly detail popup */}
            {detailPopup && (()=>{
              const isInc = detailPopup === 'income'
              const rows = isInc
                ? incomeByMonth.map(m=>({ label: m.label, val: m.fra+m.sofi+m.other }))
                : expenseByMonth.map(m=>({ label: m.label, val: m.total }))
              const total = rows.reduce((s,r)=>s+r.val,0)
              const avg   = Math.round(total/12)
              const color = isInc ? 'var(--green)' : 'var(--red)'
              return (
                <div style={{position:'absolute',top:0,left:0,right:0,zIndex:50,
                  background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:12,padding:'14px 16px',
                  boxShadow:'0 8px 32px rgba(0,0,0,.18)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div style={{fontSize:13,fontWeight:700,color}}>
                      {isInc ? '📥 Entrate' : '📤 Spese'} — ultimi 12 mesi
                    </div>
                    <button onClick={()=>setDetailPopup(null)}
                      style={{border:'none',background:'none',cursor:'pointer',fontSize:16,color:'var(--text3)',lineHeight:1}}>✕</button>
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <tbody>
                      {rows.map(r=>(
                        <tr key={r.label} style={{borderBottom:'1px solid var(--border)'}}>
                          <td style={{padding:'4px 0',color:'var(--text2)'}}>{r.label}</td>
                          <td style={{padding:'4px 0',textAlign:'right',fontFamily:'var(--font-mono)',color,fontWeight:600}}>
                            {fmtFull(Math.round(r.val))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'2px solid var(--border)'}}>
                        <td style={{padding:'6px 0',fontWeight:700,fontSize:11,color:'var(--text3)'}}>Totale</td>
                        <td style={{padding:'6px 0',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color}}>{fmtFull(Math.round(total))}</td>
                      </tr>
                      <tr>
                        <td style={{padding:'2px 0',fontWeight:700,fontSize:11,color:'var(--text3)'}}>Totale / 12</td>
                        <td style={{padding:'2px 0',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color}}>{fmtFull(avg)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })()}

            {/* What If toggle button */}
            <button className={`fc-whatif-btn ${whatIfOpen ? 'open' : ''}`}
              onClick={() => setWhatIfOpen(v => !v)}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span>🤔</span>
                <div style={{textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:700}}>What if…</div>
                  <div style={{fontSize:10,color: whatIfOpen ? 'rgba(255,255,255,.7)' : 'var(--text3)'}}>
                    {excludedCats.size > 0
                      ? `+${fmtFull(savedPerMonth)}/mese risparmiati`
                      : 'E se eliminassi alcune spese?'}
                  </div>
                </div>
              </div>
              <span style={{fontSize:12,opacity:.7}}>{whatIfOpen ? '▲' : '▼'}</span>
            </button>

            {/* What If panel */}
            {whatIfOpen && Object.keys(catStats).length > 0 && (
              <>
                {savedPerMonth > 0 && (
                  <div className="fc-whatif-savings">
                    <div style={{fontSize:11,color:'var(--text3)'}}>Risparmio aggiuntivo</div>
                    <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                      <span style={{fontSize:18,fontWeight:800,color:'var(--green)',fontFamily:'var(--font-mono)'}}>
                        +{fmtFull(savedPerMonth)}/mese
                      </span>
                      <span style={{fontSize:11,color:'var(--text3)'}}>
                        → +{fmtK(savedPerMonth * 12 * years)} in {years} anni
                      </span>
                    </div>
                    <button onClick={() => setExcludedCats(new Set())}
                      style={{marginTop:4,fontSize:10,padding:'2px 8px',borderRadius:5,
                        border:'1px solid var(--border)',background:'var(--surface)',
                        cursor:'pointer',fontFamily:'var(--font-sans)',color:'var(--text3)'}}>
                      Azzera selezione
                    </button>
                  </div>
                )}
                <WhatIfPanel
                  catStats={catStats}
                  excludedCats={excludedCats}
                  onToggle={toggleExcludedCat}
                />
              </>
            )}
            </>)}

            {forecastBasis === 'teoriche' && (
              <div>
                {/* Sub-tab Entrate / Spese */}
                <div style={{display:'flex',gap:6,marginBottom:12,alignItems:'center'}}>
                  {[['entrate','📥 Entrate'],['spese','📤 Spese']].map(([v,l]) => (
                    <button key={v} onClick={()=>setTeoricheTab(v)}
                      style={{padding:'5px 12px',borderRadius:6,cursor:'pointer',fontFamily:'var(--font-sans)',
                        fontSize:11,fontWeight:700,
                        border:`1px solid ${teoricheTab===v?'var(--border)':'transparent'}`,
                        background:teoricheTab===v?'var(--surface2)':'none',
                        color:teoricheTab===v?'var(--text)':'var(--text3)'}}>
                      {l}
                    </button>
                  ))}
                  {teoricheTab === 'spese' && (
                    <button onClick={()=>setMonthPickerOpen(true)}
                      title={teoricheSpeseMonths ? `Mesi storici personalizzati (${teoricheSpeseMonths.length}) — clicca per cambiare` : 'Ultimi 12 mesi (default) — clicca per scegliere i mesi'}
                      style={{marginLeft:'auto',width:20,height:20,borderRadius:'50%',flexShrink:0,
                        border:`1px solid ${teoricheSpeseMonths ? 'var(--accent)' : 'var(--border)'}`,
                        background: teoricheSpeseMonths ? 'var(--accent)' : 'var(--surface2)',
                        cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                        color: teoricheSpeseMonths ? '#fff' : 'var(--text3)',fontSize:10,padding:0}}>
                      📅
                    </button>
                  )}
                </div>

                {monthPickerOpen && (
                  <MonthPickerModal
                    months={catMonthlyRaw.months}
                    initialSelected={effectiveSpeseMonths}
                    onSave={(arr)=>{ setTeoricheSpeseMonths(arr); setMonthPickerOpen(false) }}
                    onClose={()=>setMonthPickerOpen(false)}
                  />
                )}

                {teoricheTab === 'entrate' && (
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {/* Mese di pagamento 13ª/14ª — condiviso fra Fra e Sofi */}
                    <div style={{padding:'8px 12px',background:'var(--surface2)',borderRadius:8,border:'1px solid var(--border)',
                      display:'flex',gap:16}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:11,color:'var(--text2)'}}>13ª pagata a:</span>
                        <select value={bonusMonths.m13} onChange={e=>setBonusMonth('m13', Number(e.target.value))}
                          style={{padding:'3px 6px',borderRadius:5,border:'1px solid var(--border)',
                            background:'var(--surface)',color:'var(--text)',fontFamily:'var(--font-sans)',fontSize:11}}>
                          {MON.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
                        </select>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:11,color:'var(--text2)'}}>14ª pagata a:</span>
                        <select value={bonusMonths.m14} onChange={e=>setBonusMonth('m14', Number(e.target.value))}
                          style={{padding:'3px 6px',borderRadius:5,border:'1px solid var(--border)',
                            background:'var(--surface)',color:'var(--text)',fontFamily:'var(--font-sans)',fontSize:11}}>
                          {MON.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    {['Fra','Sofi'].map(person => {
                      const val   = person === 'Fra' ? teoricheFraVal : teoricheSofiVal
                      const flags = teoricheBonus[person] || {}
                      const isOpen = teoricheDetailPerson === person
                      return (
                        <div key={person} style={{padding:'10px 12px',background:'var(--surface2)',borderRadius:8,border:'1px solid var(--border)'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                            <div onClick={()=>setTeoricheDetailPerson(isOpen?null:person)}
                              style={{fontSize:12,fontWeight:700,cursor:'pointer',userSelect:'none',display:'flex',alignItems:'center',gap:5}}>
                              {person==='Fra' ? '👨 Fra' : '👩 Sofi'}
                              <span style={{fontSize:9,opacity:.5}}>{isOpen?'▲':'▼'}</span>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:4}}>
                              <span style={{fontSize:11,color:'var(--text3)'}}>€</span>
                              <input type="number" value={val}
                                onChange={e=>setTeoricheEntrata(person, Number(e.target.value)||0)}
                                style={{width:90,padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',
                                  background:'var(--surface)',color:'var(--green)',fontWeight:700,
                                  fontFamily:'var(--font-mono)',fontSize:13,textAlign:'right'}}/>
                              <span style={{fontSize:11,color:'var(--text3)'}}>/mese</span>
                            </div>
                          </div>
                          {isOpen && (
                            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,marginBottom:8}}>
                              <tbody>
                                {incomeByMonth.map(m => {
                                  const v = person==='Fra' ? m.fra : m.sofi
                                  return (
                                    <tr key={m.ym} style={{borderBottom:'1px solid var(--border)'}}>
                                      <td style={{padding:'3px 0',color:'var(--text2)'}}>{m.label}</td>
                                      <td style={{padding:'3px 0',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--green)'}}>
                                        {fmtFull(Math.round(v))}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{borderTop:'2px solid var(--border)'}}>
                                  <td style={{padding:'4px 0',fontWeight:700,fontSize:10,color:'var(--text3)'}}>Media /12</td>
                                  <td style={{padding:'4px 0',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color:'var(--green)'}}>
                                    {fmtFull(Math.round(incomeByMonth.reduce((s,m)=>s+(person==='Fra'?m.fra:m.sofi),0)/12))}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          )}
                          <div style={{display:'flex',gap:14}}>
                            <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text2)',cursor:'pointer'}}>
                              <input type="checkbox" checked={!!flags.has13}
                                onChange={e=>setTeoricheBonusFlag(person,'has13',e.target.checked)}/>
                              13ª ({MON[bonusMonths.m13-1]})
                            </label>
                            <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text2)',cursor:'pointer'}}>
                              <input type="checkbox" checked={!!flags.has14}
                                onChange={e=>setTeoricheBonusFlag(person,'has14',e.target.checked)}/>
                              14ª ({MON[bonusMonths.m14-1]})
                            </label>
                          </div>
                        </div>
                      )
                    })}
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:2,lineHeight:1.4}}>
                      Default: ultimo mese registrato. Clicca sul nome per vedere lo storico ultimi 12 mesi. Con 13ª/14ª attiva, lo stipendio raddoppia nel mese indicato nella "📋 Proiezione Mensile".
                    </div>
                  </div>
                )}

                {teoricheTab === 'spese' && (
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    <div className="fc-whatif-panel" style={{marginTop:0}}>
                      {Object.entries(catStatsTeoriche).sort((a,b)=>b[1].avg-a[1].avg).map(([c1,data]) => {
                        const val    = teoricheL1Value(c1)
                        const isOpen = expandedTeoricheL1.has(c1)
                        const l2overrides = teoricheSpeseL2[c1] || {}
                        const hasL2 = Object.keys(l2overrides).length > 0
                        const subs  = Object.entries(data.subs || {}).sort((a,b)=>b[1]-a[1])
                        return (
                          <div key={c1} className="fc-whatif-cat">
                            <div className="fc-whatif-l1">
                              <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:600,
                                  minWidth:0,flex:1,cursor:subs.length>0?'pointer':'default'}}
                                onClick={()=>subs.length>0 && toggleTeoricheL1Expand(c1)}>
                                {subs.length > 0 && (
                                  <span style={{fontSize:10,color:'var(--text3)',width:10,flexShrink:0,display:'inline-block'}}>{isOpen?'▾':'▸'}</span>
                                )}
                                <span style={{width:8,height:8,borderRadius:'50%',background:data.color,flexShrink:0,display:'inline-block'}}/>
                                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={c1}>{c1}</span>
                              </div>
                              <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <span style={{fontSize:10,color:'var(--text3)'}}>€</span>
                                <input type="number" value={val} disabled={hasL2}
                                  title={hasL2 ? 'Calcolato come somma delle sotto-categorie — modifica quelle' : undefined}
                                  onChange={e=>setTeoricheSpesa(c1, Number(e.target.value)||0)}
                                  style={{width:58,padding:'3px 4px',borderRadius:5,border:'1px solid var(--border)',
                                    background:'var(--surface)',
                                    color:'var(--red)',fontWeight:700,opacity:hasL2?0.7:1,
                                    fontFamily:'var(--font-mono)',fontSize:12,textAlign:'right'}}/>
                                <span style={{fontSize:10,color:'var(--text3)'}}>/m</span>
                              </div>
                            </div>
                            {isOpen && subs.length > 0 && (
                              <div className="fc-whatif-subs">
                                {subs.map(([c2, avgC2]) => {
                                  const valC2 = l2overrides[c2] ?? avgC2
                                  return (
                                    <div key={c2} className="fc-whatif-l2">
                                      <span style={{fontSize:12,color:'var(--text2)',minWidth:0,flex:1,
                                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={c2}>{c2}</span>
                                      <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
                                        <span style={{fontSize:10,color:'var(--text3)'}}>€</span>
                                        <input type="number" value={valC2}
                                          onChange={e=>setTeoricheSpesaL2(c1, c2, Number(e.target.value)||0)}
                                          style={{width:52,padding:'2px 4px',borderRadius:5,border:'1px solid var(--border)',
                                            background:'var(--surface)',color:'var(--red)',fontWeight:600,
                                            fontFamily:'var(--font-mono)',fontSize:11,textAlign:'right'}}/>
                                        <span style={{fontSize:10,color:'var(--text3)'}}>/m</span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:2,lineHeight:1.4}}>
                      Clicca sul nome per espandere e modificare le singole sotto-categorie — in quel caso il totale L1 diventa la somma delle sue sotto-categorie.
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 10px',marginTop:2,
                      borderTop:'2px solid var(--border)',fontSize:12,fontWeight:800}}>
                      <span>Totale</span>
                      <span style={{fontFamily:'var(--font-mono)',color:'var(--red)'}}>{fmtFull(teoricheExpenseTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sliders */}
          <div className="card fc-controls">
            <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>⚙️ Parametri</div>
            <Slider
              label="Crescita stipendi / anno" value={growth} onChange={setGrowth}
              min={0} max={10} step={0.5} format={v=>`${v}%`}
              hint={`+${fmtFull(Math.round(avgIncome * growth / 100))} / mese ogni anno`}
            />
            <Slider
              label="Inflazione spese / anno" value={inflation} onChange={setInflation}
              min={0} max={8} step={0.5} format={v=>`${v}%`}
              hint={`+${fmtFull(Math.round(effectiveExpense * inflation / 100))} / mese ogni anno`}
            />
            <Slider
              label="Orizzonte (anni)" value={years} onChange={setYears}
              min={1} max={35} step={1} format={v=>`${v} anni`}
            />
          </div>

          {/* Mortgage */}
          <div className="card fc-mortgage">
            <button className="fc-mortgage-header" onClick={()=>setShowMortgage(v=>!v)}>
              <span style={{fontSize:14,fontWeight:700}}>🏦 Mutuo / Finanziamento</span>
              <span style={{fontSize:12,color:'var(--text3)'}}>{showMortgage?'▲':'▼'}</span>
            </button>

            {showMortgage && (
              <div className="fc-mortgage-body">
                <label className="fc-mortgage-toggle">
                  <input type="checkbox" checked={mortgageOn} onChange={e=>setMortgageOn(e.target.checked)}/>
                  <span className={`ob-toggle ${mortgageOn?'on':''}`}/>
                  <span style={{fontSize:13,fontWeight:600,color:mortgageOn?'var(--text)':'var(--text3)'}}>
                    {mortgageOn ? 'Attivo — incluso nel forecast' : 'Disattivato'}
                  </span>
                </label>

                <div className="fc-mortgage-fields">
                  <MoneyField label="Importo (€)" value={mortgageAmt} onChange={setMortgageAmt} placeholder="200.000"/>
                  <div className="fc-mortgage-field">
                    <label className="form-lbl-sm">TAEG (%)</label>
                    <input className="fc-input" type="number" value={mortgageTaeg}
                      onChange={e=>setMortgageTaeg(Number(e.target.value))} step="0.1" placeholder="3.5"/>
                  </div>
                  <MoneyField label="Anticipo (€)" value={mortgageAnticipo} onChange={setMortgageAnticipo}
                    placeholder="0" hint="Dedotto dal saldo il giorno prima dell'inizio del mutuo"/>
                  <div className="fc-mortgage-field">
                    <label className="form-lbl-sm">Durata (anni)</label>
                    <input className="fc-input" type="number" value={mortgageYears}
                      onChange={e=>setMortgageYears(Number(e.target.value))} min="1" max="35" placeholder="20"/>
                  </div>
                  <div className="fc-mortgage-field">
                    <label className="form-lbl-sm">Inizio</label>
                    <input className="fc-input" type="month" value={mortgageStart}
                      onChange={e=>setMortgageStart(e.target.value)}/>
                    <div className="fc-input-hint">{mortgageStart ? ymToLabel(mortgageStart) : 'Mese di inizio'}</div>
                  </div>
                </div>

                {/* Rimborso anticipato automatico "ogni X risparmiati" (2026-07-23,
                    richiesta utente) — quando i risparmi cumulati superano la soglia,
                    il surplus viene versato come rimborso anticipato di capitale e la
                    rata si abbassa da quel momento (stessa scadenza). Si somma agli
                    eventuali rimborsi manuali una tantum (click sulla colonna "Rata
                    mutuo" in tabella Proiezione). */}
                <label className="fc-mortgage-toggle" style={{marginTop:14}}>
                  <input type="checkbox" checked={extraRepayEnabled} onChange={e=>setExtraRepayEnabled(e.target.checked)}/>
                  <span className={`ob-toggle ${extraRepayEnabled?'on':''}`}/>
                  <span style={{fontSize:13,fontWeight:600,color:extraRepayEnabled?'var(--text)':'var(--text3)'}}>
                    Rimborso anticipato automatico ogni X risparmiati
                  </span>
                </label>
                {extraRepayEnabled && (
                  <div className="fc-mortgage-fields" style={{marginTop:8}}>
                    <MoneyField label="Soglia risparmio (€)" value={extraRepayThreshold} onChange={setExtraRepayThreshold}
                      placeholder="20.000" hint="Ogni volta che i risparmi cumulati raggiungono questa cifra, vengono versati come rimborso anticipato"/>
                    <div>
                      <span className="form-lbl-sm">Cosa fare col rimborso</span>
                      <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:2}}>
                        <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12.5, color:extraRepayStrategy==='rata'?'var(--text)':'var(--text3)'}}>
                          <input type="radio" name="extraRepayStrategy" checked={extraRepayStrategy==='rata'} onChange={()=>setExtraRepayStrategy('rata')}/>
                          Riduci la rata (stessa scadenza)
                        </label>
                        <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12.5, color:extraRepayStrategy==='durata'?'var(--text)':'var(--text3)'}}>
                          <input type="radio" name="extraRepayStrategy" checked={extraRepayStrategy==='durata'} onChange={()=>setExtraRepayStrategy('durata')}/>
                          Riduci la durata (stessa rata)
                        </label>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>

        {/* ── Right: chart + table ── */}
        <div style={{display:'flex',flexDirection:'column',gap:16,flex:1}}>

          {/* Main chart */}
          <div className="card" style={{padding:'18px 20px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontSize:14,fontWeight:700}}>Andamento Saldo Conto</div>
                {savedPerMonth > 0 && (
                  <div style={{fontSize:11,color:'var(--green)',marginTop:2}}>
                    🤔 What if attivo · +{fmtFull(savedPerMonth)}/mese
                  </div>
                )}
              </div>
              <div style={{display:'flex',gap:16,fontSize:11,flexWrap:'wrap'}}>
                <span style={{display:'flex',alignItems:'center',gap:5}}>
                  <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#c8622a" strokeWidth="2.5"/></svg>
                  Storico (reale)
                </span>
                <span style={{display:'flex',alignItems:'center',gap:5}}>
                  <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#c8622a" strokeWidth="2.5" strokeDasharray="5 3"/></svg>
                  Forecast
                </span>
                {mortgageOn && (
                  <span style={{display:'flex',alignItems:'center',gap:5}}>
                    <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#2a5c8a" strokeWidth="2.5"/></svg>
                    Mutuo residuo
                  </span>
                )}
                {mortgageOn && extraRepayEnabled && (
                  <span style={{display:'flex',alignItems:'center',gap:5}} title="Piano di ammortamento originale, senza rimborso anticipato automatico">
                    <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#9a9a9a" strokeWidth="2" strokeDasharray="3 3"/></svg>
                    Mutuo originale
                  </span>
                )}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 10))}/>
                <YAxis
                  tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={64}
                  tickFormatter={v => {
                    const a = Math.abs(v)
                    return a >= 1_000_000 ? `€${(v/1_000_000).toFixed(1)}M`
                         : a >= 1_000    ? `€${(v/1_000).toFixed(0)}K`
                         : `€${v}`
                  }}
                />
                <Tooltip content={<CustomTooltip/>}/>
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4"/>
                <Line type="monotone" dataKey="historical" name="Storico (reale)"
                  stroke="#c8622a" strokeWidth={2.5} dot={false} connectNulls={false} strokeDasharray="0"/>
                <Line type="monotone" dataKey="forecast" name="Forecast"
                  stroke="#c8622a" strokeWidth={2} dot={false} connectNulls={false}
                  strokeDasharray="7 4" strokeOpacity={0.75}/>
                {mortgageOn && (
                  <Line type="monotone" dataKey="residual" name="Mutuo residuo"
                    stroke="#2a5c8a" strokeWidth={2.5} dot={false} connectNulls={false}/>
                )}
                {mortgageOn && extraRepayEnabled && (
                  <Line type="monotone" dataKey="residualNominal" name="Mutuo originale"
                    stroke="#9a9a9a" strokeWidth={1.75} strokeDasharray="3 3" dot={false} connectNulls={false}/>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Fondo Cecilia: andamento saldo */}
          {ceciliaFund && ceciliaChartData.length > 0 && (
            <div className="card" style={{padding:'18px 20px'}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>
                {ceciliaFund.icon || '⭐'} Fondo {ceciliaFund.name} — Andamento Saldo
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={ceciliaChartData} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
                  <YAxis
                    tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={64}
                    tickFormatter={v => {
                      const a = Math.abs(v)
                      return a >= 1_000 ? `€${(v/1_000).toFixed(0)}K` : `€${v}`
                    }}
                  />
                  <Tooltip content={<CustomTooltip/>}/>
                  <Line type="monotone" dataKey="saldo" name="Saldo Fondo Cecilia"
                    stroke="var(--gold)" strokeWidth={2.5} dot={{r:3}} connectNulls/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* KPI row — quando il mutuo è attivo mostra SOLO KPI sul mutuo
              (richiesta utente 2026-07-23), altrimenti i KPI generali sul saldo.
              Aggiornamento 2026-07-23: aggiunte Quota Capitale/Quota Interessi;
              per queste due + Mutuo Estinto il valore principale resta quello
              ORIGINALE (piano nominale, senza rimborso anticipato automatico),
              con il valore EFFETTIVO (con l'auto-rimborso applicato) mostrato
              in piccolo nell'angolo in basso a destra della stessa cella — ma
              SOLO se il flag "Rimborso anticipato automatico" è attivo
              (altrimenti i due valori coinciderebbero ed è ridondante). */}
          <div style={{display:'grid',gridTemplateColumns: (mortgageOn && mortgage && mortgageKpis) ? 'repeat(3,1fr)' : 'repeat(4,1fr)',gap:10}}>
            {(mortgageOn && mortgage && mortgageKpis ? [
              ['Rata attuale', fmtFull(mortgageKpis.rataAttuale), 'var(--accent)'],
              ['Quota capitale', fmtFull(mortgageKpis.quotaCapitale), 'var(--green)',
                extraRepayEnabled ? fmtFull(mortgageKpis.quotaCapitaleActual) : null],
              ['Quota interessi', fmtFull(mortgageKpis.quotaInteressi), 'var(--red)',
                extraRepayEnabled ? fmtFull(mortgageKpis.quotaInteressiActual) : null],
              ['Verso mutuo entro fine anno', fmtFull(mortgageKpis.repaidThisYear), 'var(--green)'],
              ['Rimborsi anticipati previsti', fmtFull(mortgageKpis.totalExtraForecast), 'var(--green)'],
              ['Mutuo estinto', mortgageKpis.payoffYearNominal, 'var(--blue)',
                (extraRepayEnabled && mortgageKpis.payoffYear !== mortgageKpis.payoffYearNominal) ? mortgageKpis.payoffYear : null],
            ] : [
              ['Saldo ' + (now.getFullYear() + years), fmtK(finalSaldo), 'var(--accent)'],
              ['Risparmio / mese', (monthlySavings>=0?'+':'')+fmtFull(Math.round(monthlySavings)), monthlySavings>=0?'var(--green)':'var(--red)'],
              ['Tasso risparmio', savingsRate+'%', savingsRate>=20?'var(--green)':savingsRate>=10?'var(--gold)':'var(--red)'],
              ['Orizzonte', years+' anni', 'var(--text2)'],
            ]).map(([l,v,color,sub])=>(
              <div key={l} className="card" style={{padding:'12px 16px', position:'relative'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:5}}>{l}</div>
                <div style={{fontSize:17,fontWeight:800,color,fontFamily:'var(--font-serif)'}}>{v}</div>
                {sub && (
                  <div
                    title="Valore effettivo con rimborso anticipato automatico attivo (originale sopra)"
                    style={{position:'absolute',right:10,bottom:8,fontSize:10.5,fontWeight:700,color:'var(--text3)',fontFamily:'var(--font-mono)'}}
                  >
                    {sub}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Projection table */}
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',fontSize:14,fontWeight:700,background:'var(--surface2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              📋 Proiezione {projectionView === 'annuale' ? 'Annuale' : 'Mensile'} €
              {savedPerMonth > 0 && (
                <span style={{fontSize:11,fontWeight:500,color:'var(--green)',padding:'2px 8px',background:'rgba(50,180,100,.1)',borderRadius:5}}>
                  🤔 what if incluso
                </span>
              )}
              {/* Toggle Annuale/Mensile — richiesta utente 2026-07-19 */}
              <div style={{marginLeft:'auto',display:'flex',gap:4,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:2}}>
                {[{v:'annuale',l:'Annuale'},{v:'mensile',l:'Mensile'}].map(opt=>(
                  <button key={opt.v} onClick={()=>setProjectionView(opt.v)}
                    style={{padding:'4px 12px',borderRadius:6,border:'none',
                      background:projectionView===opt.v?'var(--accent)':'none',
                      color:projectionView===opt.v?'#fff':'var(--text3)',
                      fontWeight:projectionView===opt.v?700:500,cursor:'pointer',fontSize:11,
                      fontFamily:'var(--font-sans)'}}>
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  {[
                    projectionView === 'annuale' ? 'Anno' : 'Mese',
                    projectionView === 'annuale' ? 'Entrate annue' : 'Entrate mensili',
                    projectionView === 'annuale' ? 'Spese annue' : 'Spese mensili',
                    mortgageOn ? (projectionView === 'annuale' ? 'Rata mutuo annua' : 'Rata mutuo') : null,
                    mortgageOn && mortgageAnticipo > 0 ? 'Anticipo' : null,
                    'Cash flow','Saldo previsto',
                    mortgageOn ? 'Debito residuo' : null,
                  ].filter(Boolean).map(h=>(
                    <th key={h} style={{padding:'8px 12px',fontSize:10,fontWeight:700,
                      letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',
                      background:'var(--surface2)',borderBottom:'1px solid var(--border)',
                      textAlign: (h==='Anno'||h==='Mese') ? 'left' : 'right', whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Storico reale — solo nella vista Annuale (i dati storici mensili
                    non sono calcolati in questa pagina) */}
                {projectionView === 'annuale' && historicalTableData.map(d => {
                  const cf = d.inc - d.exp
                  return (
                    <tr key={d.label} style={{borderBottom:'1px solid var(--border)',background:'var(--surface2)',opacity:.85}}>
                      <td style={{padding:'8px 12px',fontWeight:700,color:'var(--text3)'}}>
                        {d.label} <span style={{fontSize:9,fontWeight:500,background:'var(--border)',padding:'1px 5px',borderRadius:4,marginLeft:4}}>storico</span>
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--green)',fontSize:12}}>
                        {fmtIT(d.inc, 0)}
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--red)',fontSize:12}}>
                        {fmtIT(d.exp, 0)}
                      </td>
                      {mortgageOn && <td style={{padding:'8px 12px',textAlign:'right',color:'var(--text3)',fontSize:12}}>—</td>}
                      {mortgageOn && mortgageAnticipo > 0 && <td style={{padding:'8px 12px',textAlign:'right',color:'var(--text3)',fontSize:12}}>—</td>}
                      <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                        color:cf>=0?'var(--green)':'var(--red)',fontWeight:700,fontSize:12}}>
                        {cf>=0?'+':''}{fmtIT(Math.abs(cf), 0)}
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                        fontWeight:700,color:'var(--text2)',fontSize:12}}>
                        {fmtIT(d.saldo, 0)}
                      </td>
                      {mortgageOn && <td style={{padding:'8px 12px',textAlign:'right',color:'var(--text3)',fontSize:12}}>—</td>}
                    </tr>
                  )
                })}
                {/* Forecast rows — vista Annuale: una riga per ogni anno, nessun anno saltato.
                    Cliccabile per aprire il popup di override spese di quell'anno — richiesta
                    utente 2026-07-23 */}
                {projectionView === 'annuale' && forecastData
                  .map((d) => {
                    const year = parseInt(d.label)
                    const inc = d.income
                    const exp = d.expense
                    const rataAnnua = d.mortgageRata || 0
                    const extraAnnua = d.mortgageExtra || 0
                    const cf = (inc - exp) * 12 - rataAnnua - extraAnnua
                    return (
                      <tr key={d.label} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'8px 12px',fontWeight:700}}>
                          {d.label}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--green)',fontSize:12,cursor:'pointer',
                          background: d.hasIncomeOverride ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined}}
                          title={d.hasIncomeOverride ? 'Modificato manualmente — clicca per rivedere/cambiare' : 'Clicca per modificare le entrate di questo anno'}
                          onClick={()=>setOverrideIncomePopup({ granularity:'annuale', key:String(year), label:d.label })}>
                          {fmtIT(Math.round(inc * 12), 0)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--red)',fontSize:12,cursor:'pointer',
                          background: d.hasOverride ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined}}
                          title={d.hasOverride ? 'Modificato manualmente — clicca per rivedere/cambiare' : 'Clicca per modificare le spese di questo anno'}
                          onClick={()=>setOverridePopup({ granularity:'annuale', key:String(year), label:d.label })}>
                          {fmtIT(Math.round(exp * 12), 0)}
                        </td>
                        {mortgageOn && (
                          <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:extraAnnua > 0 ? 'var(--red)' : 'var(--accent)',fontSize:12,cursor:'pointer',
                            background: extraAnnua > 0 ? 'color-mix(in srgb, var(--red) 12%, transparent)' : undefined}}
                            title={extraAnnua > 0 ? `Rata + estinzione anticipata: ${fmtFull(extraAnnua)} — clicca per rivedere/cambiare` : 'Clicca per estinguere una cifra sul mutuo in questo anno'}
                            onClick={()=>setMortgageExtraPopup({ granularity:'annuale', key:String(year), label:d.label })}>
                            {rataAnnua > 0 || extraAnnua > 0 ? `${fmtIT(Math.round(rataAnnua + extraAnnua), 0)}` : '—'}
                          </td>
                        )}
                        {mortgageOn && mortgageAnticipo > 0 && (
                          <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--red)',fontSize:12}}>
                            {year === mortgageStartYear ? `−${fmtIT(mortgageAnticipo, 0)}` : '—'}
                          </td>
                        )}
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                          color:cf>=0?'var(--green)':'var(--red)',fontWeight:700,fontSize:12}}>
                          {cf>=0?'+':''}{fmtIT(Math.abs(Math.round(cf)), 0)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                          fontWeight:700,color:'var(--accent)',fontSize:12}}>
                          {fmtIT(d.forecast, 0)}
                        </td>
                        {mortgageOn && (
                          <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                            color:'var(--blue)',fontSize:12}}>
                            {d.residual != null ? `${fmtIT(d.residual, 0)}` : '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                {/* Forecast rows — vista Mensile: una riga per ogni mese proiettato.
                    Cliccabile per aprire il popup di override spese di quel mese —
                    richiesta utente 2026-07-23 */}
                {projectionView === 'mensile' && forecastDataMonthly
                  .map((d) => {
                    const rataMese = d.mortgageRata || 0
                    const extraMese = d.mortgageExtra || 0
                    const inc = d.income
                    const exp = d.expense
                    const cf = (inc - exp) - rataMese - extraMese
                    return (
                      <tr key={d.ym} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'8px 12px',fontWeight:700}}>
                          {d.label}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--green)',fontSize:12,cursor:'pointer',
                          background: d.hasIncomeOverride ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined}}
                          title={d.hasIncomeOverride ? 'Modificato manualmente — clicca per rivedere/cambiare' : 'Clicca per modificare le entrate di questo mese'}
                          onClick={()=>setOverrideIncomePopup({ granularity:'mensile', key:d.ym, label:d.label })}>
                          {fmtIT(Math.round(inc), 0)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--red)',fontSize:12,cursor:'pointer',
                          background: d.hasOverride ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined}}
                          title={d.hasOverride ? 'Modificato manualmente — clicca per rivedere/cambiare' : 'Clicca per modificare le spese di questo mese'}
                          onClick={()=>setOverridePopup({ granularity:'mensile', key:d.ym, label:d.label })}>
                          {fmtIT(Math.round(exp), 0)}
                        </td>
                        {mortgageOn && (
                          <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:extraMese > 0 ? 'var(--red)' : 'var(--accent)',fontSize:12,cursor:'pointer',
                            background: extraMese > 0 ? 'color-mix(in srgb, var(--red) 12%, transparent)' : undefined}}
                            title={extraMese > 0 ? `Rata + estinzione anticipata: ${fmtFull(extraMese)} — clicca per rivedere/cambiare` : 'Clicca per estinguere una cifra sul mutuo in questo mese'}
                            onClick={()=>setMortgageExtraPopup({ granularity:'mensile', key:d.ym, label:d.label })}>
                            {rataMese > 0 || extraMese > 0 ? `${fmtIT(Math.round(rataMese + extraMese), 0)}` : '—'}
                          </td>
                        )}
                        {mortgageOn && mortgageAnticipo > 0 && (
                          <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--red)',fontSize:12}}>
                            {mortgageStart && d.ym === mortgageStart ? `−${fmtIT(mortgageAnticipo, 0)}` : '—'}
                          </td>
                        )}
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                          color:cf>=0?'var(--green)':'var(--red)',fontWeight:700,fontSize:12}}>
                          {cf>=0?'+':''}{fmtIT(Math.abs(Math.round(cf)), 0)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                          fontWeight:700,color:'var(--accent)',fontSize:12}}>
                          {fmtIT(d.forecast, 0)}
                        </td>
                        {mortgageOn && (
                          <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'var(--font-mono)',
                            color:'var(--blue)',fontSize:12}}>
                            {d.residual != null ? `${fmtIT(d.residual, 0)}` : '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {overridePopup && (() => {
        const isMonthly = overridePopup.granularity === 'mensile'
        const existing = isMonthly ? overridesMonthly[overridePopup.key] : overridesYearly[overridePopup.key]
        return (
          <ExpenseOverrideModal
            title={`Modifica spese — ${overridePopup.label}`}
            catStats={catStats}
            defaultsByCat={defaultsByCat}
            initialSpese={existing?.spese}
            initialSpeseL2={existing?.speseL2}
            initialCascade={existing?.cascade}
            hasExisting={!!existing}
            onClose={()=>setOverridePopup(null)}
            onRemove={()=>{
              if (isMonthly) removeOverrideMonthly(overridePopup.key)
              else removeOverrideYearly(overridePopup.key)
              setOverridePopup(null)
            }}
            onSave={(values, valuesL2, cascade)=>{
              const entry = { spese: values, speseL2: valuesL2, cascade }
              if (isMonthly) saveOverrideMonthly(overridePopup.key, entry)
              else saveOverrideYearly(overridePopup.key, entry)
              setOverridePopup(null)
            }}
          />
        )
      })()}

      {mortgageExtraPopup && (() => {
        const isMonthly = mortgageExtraPopup.granularity === 'mensile'
        const existing = isMonthly ? mortgageExtraMonthly[mortgageExtraPopup.key] : mortgageExtraYearly[mortgageExtraPopup.key]
        return (
          <MortgageExtraPaymentModal
            title={`Estingui mutuo — ${mortgageExtraPopup.label}`}
            initialAmount={existing}
            hasExisting={!!existing}
            onClose={()=>setMortgageExtraPopup(null)}
            onRemove={()=>{
              if (isMonthly) removeMortgageExtraMonthly(mortgageExtraPopup.key)
              else removeMortgageExtraYearly(mortgageExtraPopup.key)
              setMortgageExtraPopup(null)
            }}
            onSave={(amount)=>{
              if (isMonthly) saveMortgageExtraMonthly(mortgageExtraPopup.key, amount)
              else saveMortgageExtraYearly(mortgageExtraPopup.key, amount)
              setMortgageExtraPopup(null)
            }}
          />
        )
      })()}

      {overrideIncomePopup && (() => {
        const isMonthly = overrideIncomePopup.granularity === 'mensile'
        const existing = isMonthly ? overridesEntrateMonthly[overrideIncomePopup.key] : overridesEntrateYearly[overrideIncomePopup.key]
        return (
          <IncomeOverrideModal
            title={`Modifica entrate — ${overrideIncomePopup.label}`}
            initialEntrate={existing?.entrate}
            initialCascade={existing?.cascade}
            initialAltro={existing?.altro}
            initialAltroCascade={existing?.altroCascade}
            defaultFra={teoricheFraVal}
            defaultSofi={teoricheSofiVal}
            hasExisting={!!existing}
            onClose={()=>setOverrideIncomePopup(null)}
            onRemove={()=>{
              if (isMonthly) removeOverrideEntrateMonthly(overrideIncomePopup.key)
              else removeOverrideEntrateYearly(overrideIncomePopup.key)
              setOverrideIncomePopup(null)
            }}
            onSave={(entrate, cascade, altro, altroCascade)=>{
              const entry = { entrate, cascade, altro, altroCascade }
              if (isMonthly) saveOverrideEntrateMonthly(overrideIncomePopup.key, entry)
              else saveOverrideEntrateYearly(overrideIncomePopup.key, entry)
              setOverrideIncomePopup(null)
            }}
          />
        )
      })()}
    </div>
  )
}
