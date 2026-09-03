import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useStore } from '../store/useStore'
import { getMergedCats } from '../data/categories'
import { fmtIT } from '../utils/format'
import { showToast } from '../services/notifications'
import { isCompensated, compensateGroup, netAmt } from '../data/compensation'
import ImportModal from './ImportModal'
import CompDaConfermare, { findCompPairs } from './CompDaConfermare'
import { PaypalImportModal, applyPaypalImport, isPayPal } from '../pages/PaypalPage'
import { RuleApplyPopup, autoDetectMatch, txMatchesRule, parseRuleText, learnException, SALDO_PIN } from '../pages/TransactionsPage'
import { getVacationMerchants, isHomeCityTx, normDesc } from '../pages/WeekendVacanzeV2Page'
import { useVacations, useNotVacationDates } from '../hooks/useCalendarVacations'
import { computeCandidateVacations, findVacationForDate, allDatesBetween, vacationType } from '../data/vacationRules'
import { navigateRef } from '../utils/navigate'

// ═══════════════════════════════════════════════════════════════════════════
// Wizard di importazione unificata (richiesta utente 2026-07-11, punto 12).
// Obiettivo: un unico flusso mensile ("il 20 del mese apro e faccio tutto") che
// concatena import multipli (conto corrente, carte di credito, PayPal), le
// schermate di rifinitura post-import e le compensazioni, chiudendo con un
// riepilogo — invece di girare per l'app tra mille sheet.
//
// NESSUNA logica nuova di abbinamento: si riusano i motori esistenti —
// ImportModal (pipeline CSV→salva→[riconcilia carta]→AI Gemini→Regole, con la
// sua schermata di progresso), PaypalImportModal+applyPaypalImport (import
// screenshot/PDF/incolla + auto-match), compensateGroup/findCompPairs
// (compensazioni PayPal/Carte/Altre Entrate), RuleApplyPopup (creazione regole
// dalle tabelle di rifinitura, identica allo sheet Transazioni).
// ═══════════════════════════════════════════════════════════════════════════

const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function fmtDate(d) {
  const m = (d||'').match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${String(m[3]).padStart(2,'0')} ${MONTHS[parseInt(m[2])-1]} ${m[1].slice(2)}` : (d||'—')
}
const noDesc = t => { const d = (t.descAI||'').trim(); return !d || d === '-' || d === '—' }

const SEL_STYLE = {
  width:'100%', padding:'4px 6px', borderRadius:5, border:'1px solid var(--border)',
  fontSize:11, background:'var(--surface)', color:'var(--text)', outline:'none', cursor:'pointer',
  fontFamily:'var(--font-sans)',
}

// ── Riga editabile delle tabelle di rifinitura ─────────────────────────────
// Colonne = sheet Transazioni MENO Ora/Carta/Utente/Codice (richiesta esplicita).
// Comportamento allineato allo sheet Transazioni: modifica descAI → flag
// userEditedDesc + learnException + popup RuleApplyPopup per creare una regola;
// modifica categoria → flag userEditedCat.
function WizardRow({ t, allCats, updateTransaction, onOpenRulePopup }) {
  const [descVal, setDescVal] = useState(t.descAI || '')
  const [cityVal, setCityVal] = useState(t.city || '')
  useEffect(() => { setDescVal(t.descAI || '') }, [t.descAI])
  useEffect(() => { setCityVal(t.city || '') }, [t.city])

  function commitDesc() {
    const v = descVal.trim()
    if (v === (t.descAI || '')) return
    updateTransaction(t.txId, { descAI: v || null, userEditedDesc: true, aiEnriched: true })
    learnException(t, v)
    if (v) onOpenRulePopup({ tx: t, match: autoDetectMatch(t), newDesc: v })
  }
  function commitCity() {
    const v = cityVal.trim()
    if (v !== (t.city || '')) updateTransaction(t.txId, { city: v || null, cityUserEdited: true })
  }

  const cat2Options = allCats[t.cat1]?.sub || []
  const inputStyle = {
    width:'100%',padding:'4px 6px',borderRadius:5,border:'1px solid transparent',
    background:'transparent',fontSize:12,color:'var(--text)',outline:'none',
    fontFamily:'var(--font-sans)',boxSizing:'border-box',
  }

  return (
    <tr style={{borderBottom:'1px solid var(--border)', opacity: t._wizDone ? 0.55 : 1}}>
      <td style={{padding:'8px 10px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
        {t._wizDone && <span title="Già sistemata" style={{color:'var(--green)',marginRight:4}}>✓</span>}
        {fmtDate(t._effDate||t.date)}
      </td>
      <td style={{padding:'4px 8px',minWidth:150}}>
        <input value={descVal} onChange={e=>setDescVal(e.target.value)} onBlur={commitDesc}
          onKeyDown={e=>{ if (e.key==='Enter') e.target.blur() }} placeholder="✨ —"
          style={{...inputStyle,fontWeight:600}}
          onFocus={e=>{e.target.style.border='1px solid var(--accent)'; e.target.style.background='var(--surface)'}}
          onBlurCapture={e=>{e.target.style.border='1px solid transparent'; e.target.style.background='transparent'}}/>
      </td>
      <td style={{padding:'8px 10px',fontSize:11,color:'var(--text3)',maxWidth:220,overflow:'hidden',
        textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t.description||''}>
        {(t.description||'').slice(0,70)}
      </td>
      <td style={{padding:'4px 8px',minWidth:130}}>
        <select value={t.cat1||''} style={SEL_STYLE}
          onChange={e=>updateTransaction(t.txId,{cat1:e.target.value,cat2:'',userEditedCat:true})}>
          <option value="">—</option>
          {Object.keys(allCats).map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={{padding:'4px 8px',minWidth:120}}>
        <select value={t.cat2||''} disabled={!cat2Options.length} style={SEL_STYLE}
          onChange={e=>updateTransaction(t.txId,{cat2:e.target.value,userEditedCat:true})}>
          <option value="">—</option>
          {cat2Options.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{padding:'4px 8px',minWidth:90}}>
        <input value={cityVal} onChange={e=>setCityVal(e.target.value)} onBlur={commitCity}
          onKeyDown={e=>{ if (e.key==='Enter') e.target.blur() }} placeholder="—"
          style={inputStyle}
          onFocus={e=>{e.target.style.border='1px solid var(--accent)'; e.target.style.background='var(--surface)'}}
          onBlurCapture={e=>{e.target.style.border='1px solid transparent'; e.target.style.background='transparent'}}/>
      </td>
      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,
        fontWeight:700,color:t.amount>=0?'var(--green)':'var(--red)',whiteSpace:'nowrap'}}>
        {t.amount>=0?'+':'−'}€ {fmtIT(Math.abs(t.amount),2)}
      </td>
      <td style={{padding:'4px 8px',whiteSpace:'nowrap'}}>
        <button title="Crea una regola da questa transazione"
          onClick={()=>onOpenRulePopup({ tx: t, match: autoDetectMatch(t), newDesc: t.descAI || '' })}
          style={{border:'1px solid var(--border)',background:'var(--surface)',borderRadius:6,
            fontSize:11,padding:'3px 8px',cursor:'pointer',color:'var(--text3)',fontFamily:'var(--font-sans)',marginRight:4}}>
          ✚ Regola
        </button>
        <button title={t._flagged ? 'Rimuovi da To Review' : 'Segna To Review'}
          onClick={()=>updateTransaction(t.txId,{_flagged:!t._flagged})}
          style={{border:`1px solid ${t._flagged?'var(--gold)':'var(--border)'}`,
            background:t._flagged?'rgba(200,160,0,.1)':'var(--surface)',borderRadius:6,
            fontSize:11,padding:'3px 6px',cursor:'pointer',color:t._flagged?'var(--gold)':'var(--text3)',
            fontFamily:'var(--font-sans)'}}>
          🚩
        </button>
      </td>
    </tr>
  )
}

function RefineTable({ txs, allCats, updateTransaction, onOpenRulePopup, emptyMsg }) {
  if (!txs.length) return (
    <div style={{padding:'36px 20px',textAlign:'center',color:'var(--green)',fontSize:14,fontWeight:600}}>
      ✅ {emptyMsg}
    </div>
  )
  return (
    <div style={{overflow:'auto',maxHeight:'52vh',border:'1px solid var(--border)',borderRadius:10}}>
      <table style={{width:'100%',borderCollapse:'collapse',minWidth:860}}>
        <thead>
          <tr>
            {['Data','✨ AI Descrizione','Descrizione','Categoria','Sottocategoria','Città','Importo',''].map((h,i)=>(
              <th key={i} style={{padding:'8px 10px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left',
                whiteSpace:'nowrap',position:'sticky',top:0,zIndex:1}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {txs.map(t => (
            <WizardRow key={t.txId} t={t} allCats={allCats}
              updateTransaction={updateTransaction} onOpenRulePopup={onOpenRulePopup}/>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Pannello Altre Entrate (compensazioni, punto d2) ───────────────────────
// Elenca le Altre Entrate non ancora abbinate e, quando esiste una spesa con
// importo IDENTICO, propone l'abbinamento (conferma → compensateGroup, lo stesso
// motore condiviso). Gli altri abbinamenti restano manuali nello sheet Altre Entrate.
// limitTxIds: perimetro dell'import corrente (richiesta utente 2026-07-12) —
// si mostrano solo le Altre Entrate appena importate, e i suggerimenti solo se
// coinvolgono almeno una transazione di questo flusso.
function AltreEntratePanel({ limitTxIds = null }) {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const appPrefs          = useStore(s => s.appPrefs)

  const nicknames = useMemo(() => {
    const nicks = []
    if (appPrefs?.ownerNickname) nicks.push(appPrefs.ownerNickname)
    ;(appPrefs?.family || []).forEach(m => { if (m.nickname) nicks.push(m.nickname) })
    return nicks.map(n => n.toLowerCase())
  }, [appPrefs])

  // Stessi criteri della card "Altre Entrate non abbinate" di Accuracy
  const aeIncomes = useMemo(() => {
    const compLinks = appPrefs?.compLinks || {}
    const EXCL_L2 = ['satispay', 'stipendio', ...nicknames]
    return transactions.filter(t =>
      t.amount > 0 && !t.excluded && !t._forcedBalance &&
      (!limitTxIds || limitTxIds.has(t.txId)) &&
      (t.cat1 === 'Entrate' || t.cat2 === 'Prestiti') &&
      !EXCL_L2.includes((t.cat2 || '').toLowerCase()) &&
      !compLinks[t.txId] && !isCompensated(t)
    )
  }, [transactions, appPrefs, nicknames, limitTxIds])

  // Suggerimenti solo per importo IDENTICO (findCompPairs condiviso: al centesimo,
  // rimborso mai precedente alla spesa) contro tutte le spese non compensate —
  // limitati alle coppie che coinvolgono l'import corrente
  const suggestions = useMemo(() => {
    const expenses = transactions.filter(t => t.amount < 0 && !t.excluded && !isCompensated(t))
    return findCompPairs([...aeIncomes, ...expenses], {}, limitTxIds)
  }, [transactions, aeIncomes, limitTxIds])

  function confirmPair(p) {
    const result = compensateGroup([p.exp, p.inc], updateTransaction)
    if (result.ok) showToast('✅ Abbinata e compensata', 'success')
    else showToast('Impossibile compensare (residuo non disponibile?)', 'error')
  }

  const suggestedIncIds = new Set(suggestions.map(p => p.inc.txId))

  return (
    <div style={{border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>💸 Altre Entrate</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
        {aeIncomes.length === 0
          ? 'Nessuna entrata da abbinare in questo import. ✅'
          : `${aeIncomes.length} entrat${aeIncomes.length===1?'a':'e'} non abbinat${aeIncomes.length===1?'a':'e'} in questo import — ${suggestions.length} con una spesa di importo identico (suggerite qui sotto); le altre si abbinano dallo sheet Altre Entrate.`}
      </div>
      {suggestions.map(p => (
        <div key={`${p.exp.txId}|${p.inc.txId}`}
          style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,
            background:'var(--surface2)',marginBottom:6,flexWrap:'wrap'}}>
          <span style={{fontSize:12,flex:1,minWidth:220}}>
            <strong style={{color:'var(--green)'}}>+€ {fmtIT(p.inc.amount,2)}</strong> {p.inc.descAI||p.inc.description?.slice(0,30)} ({fmtDate(p.inc._effDate||p.inc.date)})
            {' '}↔ <strong style={{color:'var(--red)'}}>−€ {fmtIT(Math.abs(p.exp.amount),2)}</strong> {p.exp.descAI||p.exp.description?.slice(0,30)} ({fmtDate(p.exp._effDate||p.exp.date)})
          </span>
          <button onClick={()=>confirmPair(p)}
            style={{padding:'5px 12px',background:'#16a34a',color:'#fff',border:'none',borderRadius:7,
              fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
            ✅ Abbina
          </button>
        </div>
      ))}
      {aeIncomes.filter(t => !suggestedIncIds.has(t.txId)).slice(0,8).map(t => (
        <div key={t.txId} style={{display:'flex',gap:10,padding:'5px 10px',fontSize:12,color:'var(--text2)'}}>
          <span style={{fontFamily:'var(--font-mono)',color:'var(--text3)'}}>{fmtDate(t._effDate||t.date)}</span>
          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.descAI||t.description?.slice(0,50)}</span>
          <span style={{fontWeight:700,color:'var(--green)'}}>+€ {fmtIT(t.amount,2)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Pannello Satispay (compensazioni, punto d1) ─────────────────────────────
// Il motore Satispay (auto-abbinamento accantonamenti per fondo + modale "Da
// confermare" accrediti/spese) vive dentro lo sheet Satispay con la configurazione
// dei fondi: qui il wizard mostra lo stato (quanti abbinamenti in attesa) e porta
// direttamente là, senza duplicare quella logica.
function SatispayPanel({ onNavigate, limitTxIds = null }) {
  const transactions = useStore(s => s.transactions)
  const appPrefs     = useStore(s => s.appPrefs)
  const satiMatches  = appPrefs?.satiMatches || {}
  const txIds        = useMemo(() => new Set(transactions.map(t => t.txId)), [transactions])
  // Con limitTxIds si contano solo gli abbinamenti pendenti legati alle
  // transazioni di QUESTO import (richiesta utente 2026-07-12)
  const pendingCount = Object.entries(satiMatches)
    .filter(([txId, m]) => m.status === 'pending_approval' && txIds.has(txId) &&
      (!limitTxIds || limitTxIds.has(txId) || (m.pendingIncomeTxId && limitTxIds.has(m.pendingIncomeTxId)))).length

  return (
    <div style={{border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>💚 Satispay</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
        Auto-abbinamento accantonamenti e conferma accrediti/spese si gestiscono nello sheet Satispay
        (serve la configurazione dei fondi).
        {pendingCount > 0
          ? ` Ci sono ${pendingCount} abbinament${pendingCount===1?'o':'i'} in attesa di conferma legati a questo import.`
          : ' Nessun abbinamento in attesa legato a questo import. ✅'}
      </div>
      <button onClick={onNavigate}
        style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--accent)',background:'transparent',
          color:'var(--accent)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
        {pendingCount > 0 ? `⏳ Apri Satispay (${pendingCount} da confermare)` : 'Apri Satispay'}
      </button>
    </div>
  )
}

// ── Step "Vacanze" del wizard (richiesta utente 2026-07-12): per le spese
// importate riconducibili ai merchant vacanza (Booking, Airbnb, Bravonext… —
// configurabili con ⚙️ in Weekend e Vacanze v2), chiede la COMPETENZA vera
// (quando è davvero la vacanza, non quando è stata pagata la prenotazione) e a
// quale vacanza collegarla — con creazione della vacanza al volo se non esiste.
function VacanzaBookingRow({ t, vacations, onConfirm, onSkip }) {
  const effDate = t._effDate || t.date
  const [competenza, setCompetenza] = useState(effDate)
  const [vacId, setVacId] = useState('')
  const [nv, setNv] = useState({ name: '', from: '', to: '' })
  const isNew = vacId === '__new__'
  const inp = { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 12, fontFamily: 'var(--font-sans)', background: 'var(--surface)', color: 'var(--text)' }
  const canConfirm = competenza && (isNew ? (nv.name.trim() && nv.from && nv.to) : true)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>🏝️ {t.descAI || t.merchant || t.description?.slice(0, 40)}</span>
        <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{fmtDate(effDate)}</span>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
          −€ {fmtIT(Math.abs(t.amount), 2)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)', flexBasis: '100%' }} title={t.description}>{(t.description || '').slice(0, 90)}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>Competenza vera</div>
          <input type="date" value={competenza} onChange={e => setCompetenza(e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>Vacanza collegata</div>
          <select value={vacId} onChange={e => {
            const v = e.target.value
            setVacId(v)
            if (v === '__new__') setNv({ name: '', from: competenza, to: competenza })
          }} style={{ ...inp, maxWidth: 220 }}>
            <option value="">— nessuna (solo competenza) —</option>
            {vacations.map(v => (
              <option key={v.id} value={String(v.id)}>{v.city || v.name || '—'} ({fmtDate(v.from)}–{fmtDate(v.to)})</option>
            ))}
            <option value="__new__">➕ Crea nuova vacanza…</option>
          </select>
        </div>
        {isNew && (
          <>
            <input value={nv.name} onChange={e => setNv(f => ({ ...f, name: e.target.value }))} placeholder="Nome / località" style={{ ...inp, width: 140 }} />
            <input type="date" value={nv.from} onChange={e => setNv(f => ({ ...f, from: e.target.value }))} style={inp} />
            <input type="date" value={nv.to} onChange={e => setNv(f => ({ ...f, to: e.target.value }))} style={inp} />
          </>
        )}
        <button disabled={!canConfirm} onClick={() => onConfirm(t, { competenza, vacId, nv })}
          style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: canConfirm ? 1 : .5 }}>
          ✅ Conferma
        </button>
        <button onClick={() => onSkip(t)}
          style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text3)',
            border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
          Lascia così
        </button>
      </div>
    </div>
  )
}

function VacanzeStep({ importedIdSet, onNext, embedded, registerUndo }) {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const [handled, setHandled] = useState({})

  const merchants = getVacationMerchants(appPrefs)
  const vacations = appPrefs?.calendarVacations || []

  const rows = useMemo(() =>
    transactions.filter(t =>
      importedIdSet.has(t.txId) && !t.excluded && t.amount < 0 && !handled[t.txId] &&
      merchants.some(m => `${t.merchant || ''} ${t.description || ''} ${t.descAI || ''}`.toLowerCase().includes(m.toLowerCase()))
    )
  , [transactions, importedIdSet, handled, merchants])

  function confirm(t, { competenza, vacId, nv }) {
    const prev = { competenza: t.competenza ?? null, _effDate: t._effDate ?? null, cat1: t.cat1 ?? null, cat2: t.cat2 ?? null, flagCompetenza: t.flagCompetenza ?? false }
    let vac = vacations.find(v => String(v.id) === vacId) || null
    let createdId = null
    if (vacId === '__new__') {
      vac = { id: Date.now(), name: nv.name.trim(), city: nv.name.trim(), from: nv.from, to: nv.to }
      createdId = vac.id
      setAppPref('calendarVacations', [...vacations, vac])
    }
    const nights = vac ? Math.max(0, Math.round((new Date(vac.to) - new Date(vac.from)) / 86400000)) : 0
    const cat2 = vac ? (nights >= 3 ? 'Vacanze' : 'Weekend') : 'Vacanze'
    updateTransaction(t.txId, {
      competenza, _effDate: competenza,           // la spesa "cade" quando è la vacanza
      ...(vac ? { cat1: 'Weekend e Vacanze', cat2, userEditedCat: true } : {}),
      flagCompetenza: false,
    })
    setHandled(h => ({ ...h, [t.txId]: true }))
    showToast(vac ? `✅ Collegata a "${vac.city || vac.name}"` : '✅ Competenza aggiornata', 'success')
    registerUndo?.(vac ? `Collegata a "${vac.city || vac.name}"` : 'Competenza aggiornata', () => {
      updateTransaction(t.txId, prev)
      if (createdId) {
        const cur = useStore.getState().appPrefs?.calendarVacations || []
        setAppPref('calendarVacations', cur.filter(v => v.id !== createdId))
      }
      setHandled(h => { const n = { ...h }; delete n[t.txId]; return n })
    })
  }

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>🏝️ Prenotazioni vacanze trovate ({rows.length})</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Spese importate riconducibili ai merchant vacanza ({merchants.join(', ')}) — per ciascuna indica la
        competenza vera (quando è la vacanza, non quando hai pagato) e la vacanza collegata, creandola se serve.
        I merchant si configurano con ⚙️ in Weekend e Vacanze.
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
          ✅ Nessuna prenotazione vacanze in questo import
        </div>
      ) : (
        <div>
          {rows.map(t => (
            <VacanzaBookingRow key={t.txId} t={t} vacations={vacations}
              onConfirm={confirm} onSkip={tx => setHandled(h => ({ ...h, [tx.txId]: true }))} />
          ))}
        </div>
      )}
      {!embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 22px', fontWeight: 700 }} onClick={onNext}>
            Avanti →
          </button>
        </div>
      )}
    </>
  )
}

// ── 3 sezioni di revisione vacanze, tutte limitate ESCLUSIVAMENTE alle
// transazioni effettivamente importate in QUESTO flusso (importedIdSet, non un
// range di date — richiesta utente 2026-07-13 punto 2: "deve essere SOLO sulla
// base delle transazioni caricate", corretto un bug per cui un confronto sul
// range di date pescava anche transazioni non importate ora ma con la stessa
// data). Insieme a VacanzeStep (prenotazioni) sopra, sono le 4 sezioni del
// mega-step "🏖️ Vacanze" (richiesta utente 2026-07-13 punto 1), mostrate tutte
// nella stessa pagina invece che come 4 step separati — nessuna logica nuova,
// riusa le funzioni condivise già esistenti in data/vacationRules.js e gli
// stessi appPrefs di WeekendVacanzeV2Page, quindi tutto resta sincronizzato
// con quella pagina.

// ── 2a. Vacanze/weekend candidate rilevate SOLO tra le transazioni importate ──
function VacCandidatesStep({ importedIdSet, onNext, embedded, registerUndo }) {
  const transactions = useStore(s => s.transactions)
  const { vacations, add: addVacation, remove: removeVacation } = useVacations()
  const { notVacationDates, mark, unmark } = useNotVacationDates()
  const [resolved, setResolved] = useState({}) // { candId: true }

  const candidates = useMemo(() => {
    const importedTx = transactions.filter(t => importedIdSet.has(t.txId))
    const all = computeCandidateVacations(importedTx, vacations, notVacationDates)
    return all.filter(c => (c.city || '').trim() && !resolved[c.id])
  }, [transactions, vacations, notVacationDates, resolved, importedIdSet])

  function confirm(c) {
    const rec = addVacation({ name: c.city, city: c.city, from: c.from, to: c.to })
    setResolved(r => ({ ...r, [c.id]: true }))
    showToast(`✅ "${c.city}" confermata come vacanza`, 'success')
    registerUndo?.(`"${c.city}" confermata come vacanza`, () => {
      removeVacation(rec.id)
      setResolved(r => { const n = { ...r }; delete n[c.id]; return n })
    })
  }
  function ignore(c) {
    mark(c.dates)
    setResolved(r => ({ ...r, [c.id]: true }))
    registerUndo?.(`"${c.city}" ignorata`, () => {
      unmark(c.dates)
      setResolved(r => { const n = { ...r }; delete n[c.id]; return n })
    })
  }

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>🔍 Vacanze e weekend trovati in questo import ({candidates.length})</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Tra le spese appena importate il sistema ha rilevato questi possibili periodi di vacanza/weekend (spese
        categorizzate "Weekend e Vacanze" raggruppate per data e località). Conferma quelli che lo sono davvero,
        oppure ignora gli altri — stessa logica del pannello "Da confermare" in Weekend e Vacanze.
      </div>
      {candidates.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
          ✅ Nessuna vacanza/weekend da confermare in questo import
        </div>
      ) : (
        <div>
          {candidates.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 140 }}>{c.city}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{fmtDate(c.from)}–{fmtDate(c.to)}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                background: c.type === 'Vacanze' ? 'var(--blue-l,#e8f0fe)' : 'var(--gold-l,#fef9e7)',
                color: c.type === 'Vacanze' ? 'var(--blue,#2563eb)' : 'var(--gold,#b45309)' }}>{c.type}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>€ {fmtIT(c.spend, 2)}</span>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button onClick={() => confirm(c)}
                  style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ✅ È una vacanza
                </button>
                <button onClick={() => ignore(c)}
                  style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                  ✕ Non lo è
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 22px', fontWeight: 700 }} onClick={onNext}>
            Avanti →
          </button>
        </div>
      )}
    </>
  )
}

// ── 2b. Spese "Weekend e Vacanze" IMPORTATE ORA e fuori da ogni periodo dichiarato ──
function VacFuoriPeriodoStep({ importedIdSet, onNext, embedded, registerUndo }) {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const { vacations } = useVacations()
  const [handled, setHandled] = useState({})

  const rows = useMemo(() => transactions.filter(t => {
    if (!importedIdSet.has(t.txId)) return false
    if (t.excluded || t.amount >= 0 || t.cat1 !== 'Weekend e Vacanze' || handled[t.txId]) return false
    // Spesa interamente compensata (rimborsata, importo netto zero) — non è più
    // una spesa vacanza vera, stesso fix di WeekendVacanzeV2Page (richiesta utente 2026-07-13)
    if (Math.abs(netAmt(t)) < 0.005) return false
    const d = t.competenza || t.date
    if (!d) return false
    return !findVacationForDate(d, vacations)
  }), [transactions, vacations, handled, importedIdSet])

  // Stessa logica di assignTo() in WeekendVacanzeV2Page: la spesa si allinea al
  // periodo scelto (competenza = primo giorno se fuori dal range) e la L2 si
  // allinea al tipo reale del periodo (vacationType, rispetta un typeOverride manuale)
  function assignTo(t, vacId) {
    const v = vacations.find(x => String(x.id) === String(vacId))
    if (!v) return
    const prev = { competenza: t.competenza ?? null, _effDate: t._effDate ?? null, cat2: t.cat2 ?? null }
    const inRange = t.date >= v.from && t.date <= v.to
    updateTransaction(t.txId, {
      competenza: inRange ? (v.from === t.date ? null : t.competenza) : v.from,
      _effDate: inRange ? (t.competenza || t.date) : v.from,
      cat2: vacationType(v, transactions),
    })
    setHandled(h => ({ ...h, [t.txId]: true }))
    registerUndo?.(`Assegnata a "${v.city || v.name}"`, () => {
      updateTransaction(t.txId, prev)
      setHandled(h => { const n = { ...h }; delete n[t.txId]; return n })
    })
  }

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>📆 Spese fuori periodo in questo import ({rows.length})</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Tra le spese appena importate, quelle categorizzate "Weekend e Vacanze" la cui data non cade in nessuna
        vacanza dichiarata — assegnale a un periodo esistente (anche appena confermato) o lasciale così per
        sistemarle più avanti da Weekend e Vacanze.
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
          ✅ Nessuna spesa fuori periodo in questo import
        </div>
      ) : (
        <div>
          {rows.map(t => (
            <div key={t.txId} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{fmtDate(t.competenza || t.date)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 140 }}>{t.merchant || t.descAI || t.description?.slice(0, 40)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                −€ {fmtIT(Math.abs(t.amount), 2)}
              </span>
              <select defaultValue="" onChange={e => { if (e.target.value) assignTo(t, e.target.value); e.target.value = '' }}
                style={{ ...SEL_STYLE, width: 'auto', minWidth: 180, marginLeft: 'auto' }}>
                <option value="">Assegna a…</option>
                {vacations.map(v => (
                  <option key={v.id} value={v.id}>{v.city || v.name || '—'} ({fmtDate(v.from)}–{fmtDate(v.to)})</option>
                ))}
              </select>
              <button onClick={() => setHandled(h => ({ ...h, [t.txId]: true }))}
                style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                Lascia così
              </button>
            </div>
          ))}
        </div>
      )}
      {!embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 22px', fontWeight: 700 }} onClick={onNext}>
            Avanti →
          </button>
        </div>
      )}
    </>
  )
}

// ── 2c. Spese IMPORTATE ORA, avvenute dentro un periodo dichiarato ma NON
// allocate a "Weekend e Vacanze" — stesso identico criterio di ToReviewModal
// in WeekendVacanzeV2Page (rispetta wv2ReviewDismissed, homeCity, wv2NeverAiDescs
// così le decisioni prese qui restano coerenti con quella pagina) ──
function VacNonAllocateStep({ importedIdSet, onNext, embedded, registerUndo }) {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const { vacations } = useVacations()
  const reviewDismissed = appPrefs?.wv2ReviewDismissed || {}
  const homeCity        = appPrefs?.homeCity
  const neverAiDescsSet = useMemo(
    () => new Set((appPrefs?.wv2NeverAiDescs || []).map(normDesc)),
    [appPrefs?.wv2NeverAiDescs]
  )
  const [handled, setHandled] = useState({})

  const rows = useMemo(() => transactions.map(t => {
    if (!importedIdSet.has(t.txId)) return null
    if (t.excluded || t.amount >= 0 || t.cat1 === 'Weekend e Vacanze' || handled[t.txId]) return null
    if (Math.abs(netAmt(t)) < 0.005) return null
    if (reviewDismissed[t.txId] || isHomeCityTx(t, homeCity)) return null
    if (neverAiDescsSet.has(normDesc(t.descAI || t.description))) return null
    const d = t.competenza || t.date
    if (!d) return null
    const vac = findVacationForDate(d, vacations)
    if (!vac) return null
    return { t, vac, vacType: vacationType(vac, transactions) }
  }).filter(Boolean), [transactions, vacations, reviewDismissed, homeCity, neverAiDescsSet, handled, importedIdSet])

  function confirm(row) {
    const prev = { cat1: row.t.cat1 ?? null, cat2: row.t.cat2 ?? null, userEditedCat: row.t.userEditedCat ?? false }
    updateTransaction(row.t.txId, { cat1: 'Weekend e Vacanze', cat2: row.vacType, userEditedCat: true })
    setHandled(h => ({ ...h, [row.t.txId]: true }))
    registerUndo?.('Spesa assegnata alla vacanza', () => {
      updateTransaction(row.t.txId, prev)
      setHandled(h => { const n = { ...h }; delete n[row.t.txId]; return n })
    })
  }
  function dismiss(row) {
    setAppPref('wv2ReviewDismissed', { ...reviewDismissed, [row.t.txId]: true })
    setHandled(h => ({ ...h, [row.t.txId]: true }))
    registerUndo?.('Spesa esclusa dalla vacanza', () => {
      const cur = useStore.getState().appPrefs?.wv2ReviewDismissed || {}
      const n = { ...cur }; delete n[row.t.txId]
      setAppPref('wv2ReviewDismissed', n)
      setHandled(h => { const n2 = { ...h }; delete n2[row.t.txId]; return n2 })
    })
  }

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>🚩 Spese non allocate in questo import ({rows.length})</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Tra le spese appena importate, quelle avvenute durante una vacanza/weekend dichiarata ma categorizzate
        altrove — con ✅ passano a "Weekend e Vacanze", con ✕ non verranno più riproposte (né qui né nella pagina
        Weekend e Vacanze).
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
          ✅ Nessuna spesa non allocata in questo import
        </div>
      ) : (
        <div>
          {rows.map(({ t, vac, vacType }) => (
            <div key={t.txId} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{fmtDate(t.competenza || t.date)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 140 }}>{t.merchant || t.descAI || t.description?.slice(0, 40)}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                background: 'var(--gold-l,#fef9e7)', color: 'var(--gold,#b45309)' }}>✈️ {vac.city || vac.name}</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                −€ {fmtIT(Math.abs(t.amount), 2)}
              </span>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button onClick={() => confirm({ t, vac, vacType })}
                  title={`È una spesa della vacanza → Weekend e Vacanze › ${vacType}`}
                  style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ✅ È della vacanza "{vac.city || vac.name || '—'}"
                </button>
                <button onClick={() => dismiss({ t })}
                  style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                  ✕ Non fa parte
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 22px', fontWeight: 700 }} onClick={onNext}>
            Avanti →
          </button>
        </div>
      )}
    </>
  )
}

// ── Mega-step "🏖️ Vacanze" (richiesta utente 2026-07-13, punto 1): le 4
// sezioni sopra mostrate tutte insieme in UNA pagina, con un'unica barra di
// navigazione in fondo — posizionato dopo "Compensazioni" nella coda (prima
// era prima, subito dopo l'import) ──
function VacanzeMegaStep({ importedIdSet, vacMinDate, vacMaxDate, registerUndo }) {
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>🏖️ Vacanze</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
        Tutta la revisione vacanze relativa a QUESTO import in un'unica pagina: prenotazioni da collegare, nuove
        vacanze/weekend da confermare, spese fuori periodo e spese non ancora allocate.
      </div>
      {vacMinDate && vacMaxDate && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
          📅 Periodo di questo import: <strong>{fmtDate(vacMinDate)} – {fmtDate(vacMaxDate)}</strong>
          {' '}(range più ampio tra le sorgenti caricate)
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <VacanzeStep importedIdSet={importedIdSet} embedded registerUndo={registerUndo} />
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <VacCandidatesStep importedIdSet={importedIdSet} embedded registerUndo={registerUndo} />
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <VacFuoriPeriodoStep importedIdSet={importedIdSet} embedded registerUndo={registerUndo} />
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <VacNonAllocateStep importedIdSet={importedIdSet} embedded registerUndo={registerUndo} />
        </div>
      </div>
    </>
  )
}

// ── Step "Doppioni" (richiesta utente 2026-07-13, punto 4): dopo la rifinitura
// di ciascuna sorgente (conto/carta), verifica se le transazioni appena lette
// dal CSV duplicano qualcosa GIÀ nel DB della STESSA categoria (conto contro
// conto, carta contro carta — mai incrociate) con data e descrizione originale
// IDENTICHE (non simile/fuzzy) — un controllo più severo e visibile di quello
// automatico e silenzioso già fatto da addTransactions() in fase di salvataggio
// (che invece confronta data+importo+prime 60 char della descrizione, e scarta
// senza mostrare nulla). Qui l'utente vede ogni possibile doppione e decide.
function findDuplicatesForSource(src, srcTxs, allTransactions) {
  const isCarta = t => !!t.cardImportCard4
  const sameCategory = t => src === 'carta' ? isCarta(t) : !isCarta(t)
  const srcIds = new Set(srcTxs.map(t => t.txId))
  const dbPool = allTransactions.filter(t => !srcIds.has(t.txId) && !t.excluded && sameCategory(t))
  const results = []
  // Doppioni DENTRO lo stesso batch appena importato (bug segnalato 2026-07-14:
  // dbPool esclude sempre il batch corrente, quindi due righe identiche lette
  // dallo stesso CSV — o da più file con intervalli di date sovrapposti — non
  // venivano mai confrontate fra loro, solo contro il DB preesistente).
  const seenInBatch = new Map() // `${date}|${descrizione}` -> prima tx vista
  srcTxs.filter(t => !t.excluded).forEach(t => {
    const origDesc = (t.description || '').trim()
    if (!origDesc) return
    const dbMatch = dbPool.find(e => e.date === t.date && (e.description || '').trim() === origDesc)
    if (dbMatch) { results.push({ t, match: dbMatch }); return }
    const key = `${t.date}|${origDesc}`
    const prevInBatch = seenInBatch.get(key)
    if (prevInBatch) results.push({ t, match: prevInBatch, _sameBatch: true })
    else seenInBatch.set(key, t)
  })
  return results
}

// Etichetta colorata (chip) per un valore di saldo — terminologia unificata nello step
// Doppioni. Definita a livello di modulo (non dentro il componente) per non rimontare
// l'input "Nuovo saldo" ad ogni render e non perderne il focus mentre si digita.
function MetricChip({ label, fg, bg, value, strong, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px',
      borderRadius: 10, background: bg, border: `1px solid ${fg}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: fg }}>{label}</span>
      {children != null ? children : (
        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', fontWeight: strong ? 800 : 600 }}>
          € {value}
        </strong>
      )}
    </span>
  )
}

function DoppioniStep({ src, srcTxs, onNext, embedded, registerUndo, targetGapDoppioni, reconcileAccount, saldoBreakdown }) {
  const transactions      = useStore(s => s.transactions)
  const deleteTransaction = useStore(s => s.deleteTransaction)
  const addTransactions   = useStore(s => s.addTransactions)
  const [handled, setHandled] = useState({})

  const dupes = useMemo(
    () => findDuplicatesForSource(src, srcTxs, transactions).filter(d => !handled[d.t.txId]),
    [src, srcTxs, transactions, handled]
  )

  // ── Controllo saldo → target doppioni (richiesta utente 2026-07-15, solo conto,
  // solo se l'utente ha dichiarato il "nuovo saldo" durante l'import — vedi
  // ImportModal.jsx targetGapDoppioni). A differenza del comportamento "elimina
  // subito" di sotto, qui NULLA viene cancellato finché l'utente non conferma:
  // si selezionano/deselezionano le righe (quelle rilevate automaticamente sono
  // pre-selezionate, ma l'utente può marcarne altre non rilevate, o togliere
  // quelle rilevate se ritiene non siano doppioni veri) finché la somma di quelle
  // selezionate non coincide esattamente con lo scarto di saldo atteso.
  const reconciling = targetGapDoppioni != null
  const [selected, setSelected] = useState(() => new Set())
  const [showAll, setShowAll] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  // Nuovo saldo (da banca) modificabile anche in questo step (richiesta utente):
  // l'utente può ritoccare il valore inserito negli step precedenti e il gap /
  // doppioni attesi si ricalcolano in tempo reale.
  const [editedNuovoSaldo, setEditedNuovoSaldo] = useState(
    saldoBreakdown && saldoBreakdown.nuovoSaldo != null ? String(saldoBreakdown.nuovoSaldo) : ''
  )

  // Pre-seleziona i doppioni rilevati automaticamente al primo render di questo step
  const seededRef = useRef(false)
  if (reconciling && !seededRef.current) {
    seededRef.current = true
    setSelected(new Set(dupes.map(d => d.t.txId)))
  }

  const dupeIdsSet = useMemo(() => new Set(dupes.map(d => d.t.txId)), [dupes])
  const selectedSum = useMemo(() => {
    if (!reconciling) return 0
    return srcTxs.filter(t => selected.has(t.txId)).reduce((s, t) => s + t.amount, 0)
  }, [reconciling, srcTxs, selected])
  // Possibilità estrema (richiesta utente 2026-07-15): se l'utente non riesce a
  // trovare doppioni sufficienti a spiegare TUTTO lo scarto, può creare un "tappo"
  // (rettifica nascosta, stesso spirito del Saldo Forzato in Transazioni, stesso
  // PIN) per SOLO il residuo che non riesce a scovare — non l'intero gap, solo
  // quello che resta dopo aver selezionato tutti i doppioni reali che trova.
  const [tappoCovered, setTappoCovered] = useState(0) // quota di gap coperta dal tappo
  // Saldo nuovo effettivo (dall'input modificabile qui) e target ricalcolato:
  // gap = saldo sistema (vecchio saldo + operazioni caricate) − nuovo saldo da banca.
  const nuovoSaldoNum = (() => {
    const n = parseFloat(String(editedNuovoSaldo).replace(',', '.'))
    return Number.isFinite(n) ? n : (saldoBreakdown?.nuovoSaldo ?? 0)
  })()
  const effectiveTarget = reconciling
    ? (saldoBreakdown
        ? Math.round((saldoBreakdown.saldoSistema - nuovoSaldoNum) * 100) / 100
        : targetGapDoppioni)
    : null
  const remaining = Math.round((effectiveTarget - selectedSum - tappoCovered) * 100) / 100
  const resolved = reconciling && Math.abs(remaining) < 0.01
  const hasTappo = Math.abs(tappoCovered) > 0.005

  function toggleSelected(txId) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(txId) ? next.delete(txId) : next.add(txId)
      return next
    })
  }

  function createTappo() {
    const gapNow = Math.round((effectiveTarget - selectedSum - tappoCovered) * 100) / 100
    if (Math.abs(gapNow) < 0.01) return
    if (!window.confirm(
      `Stai per creare una rettifica nascosta di € ${fmtIT(Math.abs(gapNow), 2)} per il residuo che non riesci a spiegare come doppione. ` +
      `Verrà creata SOLO quando confermi "Avanti" — puoi ancora annullarla prima. Continuare?`
    )) return
    const pin = window.prompt('Inserisci il codice per confermare la rettifica di saldo:')
    if (pin == null) return
    if (pin !== SALDO_PIN) { window.alert('Codice errato — rettifica non creata.'); return }
    setTappoCovered(c => Math.round((c + gapNow) * 100) / 100)
  }

  function removeTappo() {
    setTappoCovered(0)
  }

  function confirmReconcile() {
    if (!resolved || committed) return
    setCommitted(true)
    selected.forEach(txId => deleteTransaction(txId))
    if (hasTappo && reconcileAccount) {
      const tappoTxId = '0000-' + Date.now().toString(36).toUpperCase()
      addTransactions([{
        txId: tappoTxId,
        date: srcTxs.reduce((m, t) => (!m || (t.date||'') < m) ? (t.date||m) : m, null) || new Date().toISOString().slice(0,10),
        amount: Math.round(-tappoCovered * 100) / 100,
        description: `Rettifica doppioni non trovati — import del ${fmtDate(new Date().toISOString().slice(0,10))}`,
        descAI: 'Rettifica doppioni non trovati',
        cat1: 'Altro', cat2: 'Altro',
        account: reconcileAccount, conf: 100, aiEnriched: true,
        excluded: true,
        excludedAt: new Date().toISOString(),
        excludedType: 'manual',
        excludedReason: 'Rettifica saldo — doppioni non trovati durante import (protetta da PIN)',
        _doppioniTappo: true,
      }])
    }
    if (selected.size > 0) {
      registerUndo?.(`${selected.size} doppioni eliminati`, () => {
        for (let i = 0; i < selected.size; i++) useStore.getState().undoLastTx?.()
      })
    }
    onNext?.()
  }

  // Skip (richiesta utente 2026-07-26): a volte il gap non è spiegabile con doppioni
  // reali (o il numero mostrato è palesemente sbagliato) — permette di proseguire
  // SENZA creare la rettifica/tappo del residuo. Elimina comunque gli eventuali
  // doppioni che l'utente ha già selezionato manualmente (quelli sono veri doppioni
  // trovati, indipendenti dal fatto che il gap totale torni o meno).
  function skipReconcile() {
    if (committed) return
    if (!window.confirm(
      selected.size > 0
        ? `Proseguire senza chiudere il gap di saldo (differenza € ${fmtIT(Math.abs(remaining), 2)})? Verranno comunque eliminati i ${selected.size} doppioni già selezionati, ma NESSUNA rettifica verrà creata per il residuo.`
        : `Proseguire senza cercare altri doppioni? NESSUNA rettifica verrà creata per il residuo di € ${fmtIT(Math.abs(remaining), 2)}.`
    )) return
    setCommitted(true)
    selected.forEach(txId => deleteTransaction(txId))
    if (selected.size > 0) {
      registerUndo?.(`${selected.size} doppioni eliminati`, () => {
        for (let i = 0; i < selected.size; i++) useStore.getState().undoLastTx?.()
      })
    }
    onNext?.()
  }

  function removeDupe(d) {
    deleteTransaction(d.t.txId)
    setHandled(h => ({ ...h, [d.t.txId]: true }))
    registerUndo?.('Doppione eliminato', () => useStore.getState().undoLastTx?.())
  }
  function keepBoth(d) {
    setHandled(h => ({ ...h, [d.t.txId]: true }))
  }

  // Segno del gap (punto 3, richiesta utente): saldo sistema calcolato − saldo banca.
  //  gap > 0 → il sistema calcola PIÙ della banca: lo scarto va colmato togliendo doppioni.
  //  gap < 0 → il sistema calcola MENO della banca: NON possono esserci doppioni (toglierli
  //            peggiorerebbe), l'unica è una rettifica "tappo"; l'utente decide se crearla.
  const gapPositive = reconciling && effectiveTarget > 0.01
  const gapNegative = reconciling && effectiveTarget < -0.01

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
        🔁 Possibili doppioni — {SRC_LABEL_MAP[src]} ({dupes.length})
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Transazioni appena lette dal CSV con la STESSA data e la STESSA descrizione originale (esatta, non simile)
        di una transazione già presente nel database, nella stessa categoria ({src === 'carta' ? 'carte contro carte' : 'conto contro conto'}).
        Controllo più severo di quello automatico in import (che confronta anche l'importo e scarta senza chiedere).
      </div>

      {reconciling && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: resolved ? 'var(--green-l)' : 'rgba(245,158,11,.08)',
          border: `1px solid ${resolved ? 'var(--green)' : '#f59e0b'}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            {resolved
              ? '✅ Il saldo torna — puoi proseguire'
              : gapNegative
                ? '⚠️ Saldo di sistema INFERIORE al saldo banca — non ci possono essere doppioni'
                : '⚖️ Controllo saldo: seleziona i doppioni finché non torna a zero'}
          </div>
          {saldoBreakdown && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '2px 0 10px', alignItems: 'center' }}>
              <MetricChip label="Saldo pre import" fg="var(--blue)" bg="var(--blue-l)" value={fmtIT(saldoBreakdown.saldoAttuale, 2)} />
              <MetricChip label="Somma operazioni caricate" fg="var(--gold)" bg="var(--gold-l)" value={fmtIT(saldoBreakdown.rawParsedTotal, 2)} />
              <MetricChip label="Saldo sistema calcolato" fg="var(--blue)" bg="var(--blue-l)" value={fmtIT(saldoBreakdown.saldoSistema, 2)} />
              <MetricChip label="Nuovo saldo (da banca)" fg="var(--green)" bg="var(--green-l)">
                <input type="number" step="0.01" value={editedNuovoSaldo} onChange={e => setEditedNuovoSaldo(e.target.value)}
                  style={{ width: 108, padding: '2px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12,
                    border: '1px solid var(--green)', borderRadius: 6, background: 'var(--surface, #fff)', color: 'var(--text)' }} />
              </MetricChip>
              <MetricChip label="Gap" strong value={fmtIT(effectiveTarget, 2)}
                fg={resolved ? 'var(--green)' : 'var(--red)'} bg={resolved ? 'var(--green-l)' : 'var(--red-l)'} />
            </div>
          )}
          {gapPositive && (
            <div style={{ fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Doppioni attesi: <strong style={{ fontFamily: 'var(--font-mono)' }}>€ {fmtIT(Math.abs(effectiveTarget), 2)}</strong></span>
              <span>Selezionati: <strong style={{ fontFamily: 'var(--font-mono)' }}>€ {fmtIT(Math.abs(selectedSum), 2)}</strong></span>
              {hasTappo && (
                <span>Rettifica: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>€ {fmtIT(Math.abs(tappoCovered), 2)}</strong></span>
              )}
              <span style={{ fontWeight: 800, color: resolved ? 'var(--green)' : '#b45309' }}>
                Differenza: € {fmtIT(Math.abs(remaining), 2)}
              </span>
            </div>
          )}
          {gapNegative && !resolved && (
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
              Il sistema calcola <strong>€ {fmtIT(Math.abs(effectiveTarget), 2)}</strong> in <strong>meno</strong> del saldo
              che hai dichiarato dalla banca. Togliere doppioni abbasserebbe ancora il saldo, quindi qui non è possibile:
              puoi creare una rettifica (tappo) di <strong>€ {fmtIT(Math.abs(effectiveTarget), 2)}</strong> per allineare al
              saldo banca, oppure lasciare così e proseguire (Salta).
            </div>
          )}
          {saldoBreakdown && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowBreakdown(v => !v)}
                style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                {showBreakdown ? '▾' : '▸'} Il numero sembra sbagliato? Vedi il dettaglio del calcolo
              </button>
              {showBreakdown && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>Conto usato: {saldoBreakdown.account}</span>
                  <span>Saldo pre import: € {fmtIT(saldoBreakdown.saldoAttuale, 2)}</span>
                  <span>+ Somma operazioni caricate: € {fmtIT(saldoBreakdown.rawParsedTotal, 2)}</span>
                  <span>= Saldo sistema calcolato: € {fmtIT(saldoBreakdown.saldoSistema, 2)}</span>
                  <span>− Nuovo saldo (da banca): € {fmtIT(nuovoSaldoNum, 2)}</span>
                  <span style={{ fontWeight: 700 }}>= Gap: € {fmtIT(effectiveTarget, 2)}</span>
                  {Math.abs(saldoBreakdown.saldoAttuale) < 0.01 && (
                    <span style={{ color: '#b45309', fontFamily: 'var(--font-sans, inherit)', marginTop: 2 }}>
                      ⚠️ Saldo pre import risulta 0 — se hai già transazioni registrate, qualcosa non torna nel calcolo del saldo.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {!resolved && reconcileAccount && (
            <div style={{ marginTop: 8 }}>
              <button onClick={createTappo}
                style={{ fontSize: 11, background: 'none', border: '1px solid #f59e0b', color: '#92400e',
                  borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                {gapNegative
                  ? `🧾 Crea rettifica di € ${fmtIT(Math.abs(effectiveTarget), 2)} per allineare al saldo banca (protetta da PIN)`
                  : '⚠️ Non trovo altri doppioni — crea rettifica per il residuo (protetta da PIN)'}
              </button>
            </div>
          )}
          {hasTappo && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 8 }}>
              🧾 Rettifica di € {fmtIT(Math.abs(tappoCovered), 2)} pronta (verrà creata solo confermando "Avanti")
              <button onClick={removeTappo} style={{ border: 'none', background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Annulla rettifica</button>
            </div>
          )}
        </div>
      )}

      {dupes.length === 0 && !reconciling ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
          ✅ Nessun doppione trovato in questo import
        </div>
      ) : !reconciling ? (
        <div style={{ maxHeight: '56vh', overflow: 'auto' }}>
          {dupes.map(d => (
            <div key={d.t.txId} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>
                {d._sameBatch ? '⚠️ Doppione dentro questo stesso import (non contro il DB)' : 'Nuova (dal CSV) vs già presente nel DB'}
              </div>
              {[[d._sameBatch ? 'Riga 1' : 'Importata ora', d.t], [d._sameBatch ? 'Riga 2 (duplicata)' : 'Già nel DB', d.match]].map(([label, tx]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginBottom: 3 }}>
                  <span style={{ minWidth: 90, color: 'var(--text3)' }}>{label}:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{fmtDate(tx.date)}</span>
                  <span style={{ fontWeight: 700 }}>{tx.descAI || tx.description?.slice(0, 50)}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>−€ {fmtIT(Math.abs(tx.amount), 2)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => removeDupe(d)}
                  style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  🗑️ Elimina doppione
                </button>
                <button onClick={() => keepBoth(d)}
                  style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                  Non è un doppione, tieni entrambe
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Rilevati automaticamente ({dupes.length})</div>
          {dupes.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Nessun doppione rilevato automaticamente — se il saldo non torna, cercalo qui sotto fra tutte le transazioni.</div>
          )}
          <div style={{ maxHeight: '28vh', overflow: 'auto', marginBottom: 12 }}>
            {dupes.map(d => (
              <label key={d.t.txId} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', marginBottom: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(d.t.txId)} onChange={() => toggleSelected(d.t.txId)}/>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{fmtDate(d.t.date)}</span>
                <span style={{ flex: 1, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.t.descAI || d.t.description?.slice(0, 50)}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>−€ {fmtIT(Math.abs(d.t.amount), 2)}</span>
              </label>
            ))}
          </div>
          <button onClick={() => setShowAll(v => !v)}
            style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, marginBottom: 8 }}>
            {showAll ? '▾' : '▸'} Non hai trovato il doppione che cerchi? Sfoglia tutte le transazioni di questo import ({srcTxs.length})
          </button>
          {showAll && (
            <div style={{ maxHeight: '32vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {srcTxs.map(t => (
                <label key={t.txId} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '5px 6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(t.txId)} onChange={() => toggleSelected(t.txId)}/>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{fmtDate(t.date)}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.descAI || t.description?.slice(0, 50)}
                  </span>
                  {dupeIdsSet.has(t.txId) && <span style={{ fontSize: 10, color: 'var(--gold)' }}>🔁 rilevato</span>}
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: t.amount < 0 ? 'var(--red)' : 'var(--green)' }}>
                    {t.amount < 0 ? '−' : '+'}€ {fmtIT(Math.abs(t.amount), 2)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </>
      )}

      {!embedded && !reconciling && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 22px', fontWeight: 700 }} onClick={onNext}>
            Avanti →
          </button>
        </div>
      )}
      {reconciling && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {selected.size} transazion{selected.size===1?'e':'i'} selezionat{selected.size===1?'a':'e'} verrann{selected.size===1?'o':'o'} eliminate al click su "Avanti"
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {!resolved && (
              <button onClick={skipReconcile} disabled={committed}
                style={{ fontSize: 12, padding: '8px 14px', fontWeight: 600, background: 'transparent',
                  color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer' }}
                title="Prosegui senza chiudere il gap e senza creare rettifica del residuo">
                ⏭️ Salta
              </button>
            )}
            <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 22px', fontWeight: 700 }}
              disabled={!resolved || committed} onClick={confirmReconcile}
              title={resolved ? 'Conferma ed elimina i doppioni selezionati' : `Il saldo non torna ancora (differenza € ${fmtIT(Math.abs(remaining),2)})`}>
              Avanti →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
const SRC_LABEL_MAP = { conto: '🏦 Conto corrente', carta: '💳 Carte di credito' }

// Giorni tra oggi e una data 'YYYY-MM-DD' (per il KPI "ultima operazione") — null se assente.
function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr); d.setHours(0,0,0,0)
  const now = new Date(); now.setHours(0,0,0,0)
  return Math.max(0, Math.round((now - d) / 86400000))
}

// ═══════════════════════════════ WIZARD ═════════════════════════════════════
export default function ImportWizard({ onClose }) {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const customCats        = useStore(s => s.customCats)
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const userAccounts      = useStore(s => s.userAccounts)
  const pendingReceipts      = useStore(s => s.pendingReceipts)
  const deletePendingReceipt = useStore(s => s.deletePendingReceipt)
  const allCats           = useMemo(() => getMergedCats(customCats), [customCats])
  const apiKey            = appPrefs?.geminiKey || localStorage.getItem('fm-gemini-key') || ''

  // Ultime transazioni registrate per ciascuna delle 3 sorgenti (richiesta
  // utente 2026-07-14, poi estesa 2026-07-26 da "sola data" a "ultime 2
  // transazioni" — l'utente aveva cancellato l'ultima transazione mostrata e
  // la data non cambiava: NON è un bug di dati residui, è che `transactions`
  // qui è la lista già filtrata da eliminazioni (deleteTransaction rimuove
  // davvero il documento, vedi useStore.js) — mostrando le righe intere
  // invece della sola data si vede subito se la data "ferma" è dovuta a
  // un'ALTRA transazione della stessa giornata (caso normale) oppure no.
  // Sola lettura, nessun impatto sull'import vero e proprio.
  const lastTxInfo = useMemo(() => {
    const cardNames = new Set((userAccounts||[]).filter(a=>a.type==='carta_credito').map(a=>a.name))
    const contoNames = new Set((userAccounts||[]).filter(a=>a.type!=='carta_credito').map(a=>a.name))
    const contoTxs = []
    const byCard = {}
    const paypalTxs = []
    transactions.forEach(t => {
      // Data valuta (t.date), non competenza/_effDate: qui interessa sapere
      // fino a quando arrivano davvero i dati bancari, non la vista contabile
      // (richiesta utente 2026-07-14, stessa correzione fatta in PaypalPage).
      const d = t.date
      if (!d) return
      if (t.account && cardNames.has(t.account)) {
        (byCard[t.account] ||= []).push(t)
      } else if (t.account && (contoNames.size ? contoNames.has(t.account) : true)) {
        contoTxs.push(t)
      }
      if (isPayPal(t)) paypalTxs.push(t)
    })
    const topN = arr => [...arr].sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,15)
    const cardCode = {}
    ;(userAccounts||[]).filter(a=>a.type==='carta_credito').forEach(a=>{ cardCode[a.name] = a.card4 })
    const cards = Object.entries(byCard).map(([name,arr]) => ({ name, card4: cardCode[name], txs: topN(arr), count: arr.length }))
      .sort((a,b) => (b.txs[0]?.date||'').localeCompare(a.txs[0]?.date||''))
    // PayPal: SOLO le operazioni realmente importate da PayPal (registro paypalImports),
    // non un filtro testuale su "paypal" (che prendeva "Paypal Europe"/commissioni del conto).
    const ppAll = [...(appPrefs?.paypalImports || [])].filter(p => p.date)
      .sort((a,b) => (b.date||'').localeCompare(a.date||''))
    return { conto: topN(contoTxs), contoCount: contoTxs.length, cards, paypal: ppAll.slice(0,15), paypalCount: ppAll.length }
  }, [transactions, userAccounts, appPrefs?.paypalImports])

  // Riga singola "data · descrizione · importo" per una transazione, usata nei
  // 3 blocchi qui sotto.
  function LastTxRow({ t }) {
    const desc = (t.descAI || t.description || t.merchant || '—').toString().slice(0, 34)
    return (
      <span style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:2}}>
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          <strong style={{color:'var(--text2)'}}>{fmtDate(t.date)}</strong> — {desc}
        </span>
        <span style={{flexShrink:0,fontFamily:'var(--font-mono)',color:t.amount<0?'var(--red)':'var(--green)'}}>
          {t.amount<0?'−':'+'}€{fmtIT(Math.abs(t.amount||0), 2)}
        </span>
      </span>
    )
  }

  const [sources, setSources] = useState({ conto: true, carta: false, paypal: false })
  const [queue,   setQueue]   = useState(null)   // null = schermata di selezione
  const [stepIdx, setStepIdx] = useState(0)
  const [results, setResults] = useState({})     // { conto: {...}, carta: {...}, paypal: {...} }
  const [rulePopup, setRulePopup] = useState(null) // { tx, match, newDesc }
  // Fix reale (2026-07-26, richiesta utente): prima, chiudere il wizard a metà con la X
  // NON annullava nulla — il conto (e la carta) vengono scritti su Firestore subito nello
  // step 'import' stesso, ben prima del Riepilogo finale. Ora si tiene traccia di quante
  // voci Undo esistevano all'apertura del wizard (txUndoStack.length), e se l'utente esce
  // a metà si chiede conferma e si "riavvolge" lo stack con undoLastTx() fino a tornare a
  // quella baseline — annullando per intero import/doppioni/regole fatti in QUESTA sessione.
  // Funziona perché ogni import (conto E carta) ora è raggruppato in UN'UNICA voce sullo
  // stack (vedi beginTxUndoBatch/commitTxUndoBatch in ImportModal.jsx), quindi anche
  // centinaia di transazioni categorizzate dall'AI non rischiano di far uscire quella voce
  // dal cap di 20 dello stack prima che l'utente riesca a chiudere.
  const wizardStartStackLen = useRef(useStore.getState().txUndoStack.length)
  const [wizClosing, setWizClosing] = useState(false)
  async function handleWizardClose() {
    if (wizClosing) return
    if (!queue) { onClose(); return }
    const pending = useStore.getState().txUndoStack.length - wizardStartStackLen.current
    if (pending <= 0) { onClose(); return }
    if (!window.confirm(
      'Uscire ora annullerà questo import: verranno eliminate le transazioni importate in questa sessione ' +
      '(compresi eventuali doppioni eliminati, categorie assegnate e rettifiche create). Continuare?'
    )) return
    setWizClosing(true)
    for (let i = 0; i < pending; i++) {
      await useStore.getState().undoLastTx()
    }
    setWizClosing(false)
    onClose()
  }
  // setResults è asincrono: quando PaypalImportModal chiama onImport e SUBITO DOPO
  // onClose (doImport), lo state non è ancora aggiornato — il ref sì.
  const ppImportedRef = useRef(false)

  // ── Undo condiviso (richiesta utente 2026-07-13, punto 5): una singola barra
  // in fondo alla pagina, valida per l'ultima azione fatta in QUALSIASI step —
  // stesso pattern snackbar "Annulla" già usato in WeekendVacanzeV2Page, qui
  // centralizzato invece di duplicato in ogni componente ──
  const [wizUndo, setWizUndo] = useState(null) // { label, onUndo }
  // Step 'ricevute' — override manuale delle proposte di abbinamento automatico
  // (receiptId -> txId scelto, o null se l'utente ha deselezionato la proposta)
  const [ricevuteSelected, setRicevuteSelected] = useState({})
  const undoTimerRef = useRef(null)
  function registerUndo(label, onUndo) {
    clearTimeout(undoTimerRef.current)
    setWizUndo({ label, onUndo })
    undoTimerRef.current = setTimeout(() => setWizUndo(null), 8000)
  }
  function doUndo() {
    clearTimeout(undoTimerRef.current)
    wizUndo?.onUndo?.()
    setWizUndo(null)
  }

  // ── Abbinamento PayPal↔conto (richiesta utente 2026-07-15): questa conferma
  // esisteva già ma SOLO come modale a sé nella pagina PayPal (PendingApprovalModal
  // / handleApprovePending / handleRejectPending in PaypalPage.jsx), mai raggiungibile
  // dal wizard — l'utente doveva ricordarsi di andare ad aprirla a mano dopo l'import.
  // Stessa identica logica replicata qui per farla comparire subito nello step
  // 'paypal-result' (che segue l'import PayPal), sui SOLI import non-doppione
  // già distinti dallo status 'pending_approval' (i doppioni certi sono già
  // 'matched' automaticamente da autoMatch, quelli impossibili da abbinare sono
  // 'unmatched' — qui restano solo i casi dubbi che richiedono conferma umana).
  function paypalOrigPatchWiz(txId) {
    const tx = transactions.find(t => t.txId === txId)
    if (!tx || tx._paypalOrig) return {}
    return { _paypalOrig: {
      merchant: tx.merchant ?? null, descAI: tx.descAI ?? null,
      cat1: tx.cat1 ?? null, cat2: tx.cat2 ?? null, conf: tx.conf ?? null,
    } }
  }
  function approvePendingPaypal(importId) {
    const list = appPrefs?.paypalImports || []
    const imp = list.find(i => i.id === importId)
    if (!imp || !imp.pendingTxId) return
    const patch = {
      ...paypalOrigPatchWiz(imp.pendingTxId),
      merchant: imp.merchant, descAI: imp.merchant, _paypalOverride: true, conf: 100,
    }
    if (imp.cat1_suggestion) patch.cat1 = imp.cat1_suggestion
    if (imp.cat2_suggestion) patch.cat2 = imp.cat2_suggestion
    updateTransaction(imp.pendingTxId, patch)
    setAppPref('paypalImports', list.map(i =>
      i.id === importId ? { ...i, status: 'matched', matchedTxId: imp.pendingTxId, pendingTxId: null } : i
    ))
    showToast('Abbinamento approvato ✅', 'success')
  }
  function rejectPendingPaypal(importId) {
    const list = appPrefs?.paypalImports || []
    setAppPref('paypalImports', list.map(i =>
      i.id === importId ? { ...i, status: 'unmatched', pendingTxId: null } : i
    ))
    showToast('Abbinamento rifiutato', 'info')
  }

  function buildQueue() {
    const q = []
    // 'doppioni' spostato SUBITO dopo l'import, PRIMA della rifinitura (richiesta
    // utente 2026-07-14: i doppioni vanno eliminati prima di spendere tempo a
    // rifinire righe che verranno comunque scartate — prima stava dopo i 3 step
    // di rifinitura). NOTA: la chiamata AI Gemini di enrichment avviene comunque
    // dentro lo step 'import' stesso (ImportModal.jsx, sincrona subito dopo il
    // salvataggio) — spostare questo step non evita quella chiamata, evita solo
    // il lavoro di rifinitura manuale su righe poi eliminate come doppioni.
    // Ordine: CONTO → CARTE → PayPal (richiesta utente 2026-09). Prima PayPal era il
    // primo; ora si importano prima i dati bancari (conto, poi carte) e per ultimo PayPal.
    if (sources.conto) q.push({ id:'import', src:'conto' },
      { id:'doppioni', src:'conto' },
      { id:'refine', src:'conto', kind:'l2' }, { id:'refine', src:'conto', kind:'desc' }, { id:'refine', src:'conto', kind:'ai' })
    if (sources.carta) q.push({ id:'import', src:'carta' },
      { id:'doppioni', src:'carta' },
      { id:'refine', src:'carta', kind:'l2' }, { id:'refine', src:'carta', kind:'desc' }, { id:'refine', src:'carta', kind:'ai' })
    if (sources.paypal) q.push({ id:'import', src:'paypal' }, { id:'paypal-result' })
    // 'compensazioni' PRIMA di 'vacanze' (richiesta utente 2026-07-13, punto 1:
    // spostare il mega-step Vacanze dopo Compensazioni)
    // 'vacanze': mega-step con le 4 sezioni (prenotazioni, candidate, fuori
    // periodo, non allocate), tutte limitate SOLO alle transazioni di questo import
    // 'review' (richiesta utente 2026-07-12): ultima pagina PRIMA dei KPI con
    // l'elenco completo delle transazioni importate in questo flusso
    q.push({ id:'compensazioni' }, { id:'vacanze' })
    // 'ricevute' — richiesta utente 2026-07-27: se ci sono documenti in sospeso
    // (foto ricevuta caricate da mobile PRIMA che la transazione fosse importata,
    // vedi PendingReceiptsTab in Impostazioni), tenta l'abbinamento automatico
    // con le transazioni appena importate (match per importo+data) e chiede
    // conferma. Incluso in coda solo se ce n'è almeno uno da provare ad abbinare.
    if ((useStore.getState().pendingReceipts||[]).length > 0) q.push({ id:'ricevute' })
    q.push({ id:'review' }, { id:'summary' })
    return q
  }

  const step = queue ? queue[stepIdx] : null
  function next() { setWizUndo(null); setStepIdx(i => Math.min(i + 1, (queue?.length || 1) - 1)) }
  // Torna allo step nativo precedente, saltando eventuali step 'import' (che non
  // vanno mai riattraversati all'indietro — richiederebbero un nuovo import CSV,
  // non hanno senso come "pagina precedente") — richiesta utente 2026-07-13, punto 5
  function back() {
    setWizUndo(null)
    setStepIdx(i => {
      for (let j = i - 1; j >= 0; j--) if (queue[j].id !== 'import') return j
      return i
    })
  }
  function canGoBack() {
    if (!queue) return false
    for (let j = stepIdx - 1; j >= 0; j--) if (queue[j].id !== 'import') return true
    return false
  }

  // Salta le schermate di rifinitura di una sorgente il cui import è stato
  // annullato/chiuso senza salvare nulla
  function skipSource(src) {
    setStepIdx(i => {
      let j = i + 1
      while (queue[j] && ((queue[j].src === src) || (src === 'paypal' && queue[j].id === 'paypal-result'))) j++
      return j
    })
  }

  // Transazioni importate di una sorgente, fresche dallo store
  function importedTxs(src) {
    const ids = new Set(results[src]?.savedTxIds || [])
    return transactions.filter(t => ids.has(t.txId) && !t.excluded)
  }

  // Tutti i txId importati in QUESTO flusso (conto + carte) — usati per limitare
  // gli abbinamenti/compensazioni/vacanze alle sole operazioni che c'entrano con
  // questo import (richiesta utente 2026-07-12), non a tutto il pending storico
  const importedIdSet = useMemo(() => new Set([
    ...(results.conto?.savedTxIds || []),
    ...(results.carta?.savedTxIds || []),
  ]), [results])

  // Intervallo di date coperto da QUESTO import — SOLO informativo (mostrato nel
  // mega-step Vacanze), il range più ampio tra le sorgenti caricate, es. conto
  // 6/05–8/08 + carta 15/05–15/08 → periodo mostrato 6/05–15/08 (richiesta utente
  // 2026-07-13, punto 3). Il filtro EFFETTIVO delle 4 sezioni vacanze usa
  // importedIdSet (appartenenza reale alla transazione, non il range di date —
  // punto 2, fix di un bug per cui comparivano transazioni non importate ora)
  const { vacMinDate, vacMaxDate } = useMemo(() => {
    const dates = transactions
      .filter(t => importedIdSet.has(t.txId))
      .map(t => t.competenza || t.date)
      .filter(Boolean)
    if (!dates.length) return { vacMinDate: null, vacMaxDate: null }
    return { vacMinDate: dates.reduce((m, d) => d < m ? d : m), vacMaxDate: dates.reduce((m, d) => d > m ? d : m) }
  }, [transactions, importedIdSet])
  // Elenco "congelato" per ogni schermata di rifinitura (bug segnalato 2026-07-14:
  // appena l'utente sceglieva una L1/L2, la riga spariva SUBITO dalla tabella,
  // perché il filtro veniva ricalcolato dal vivo sullo store a ogni render e la
  // riga non soddisfaceva più il criterio — sia in questa schermata che in quella
  // precedente). Ora l'elenco di transazioni mostrate in una schermata si fissa
  // alla prima visita e non si restringe più: le righe già sistemate restano
  // visibili con un segno ✓ invece di sparire, così l'utente vede sempre lo stato
  // reale invece di perdere il riferimento a cosa ha appena modificato.
  const frozenRefineIdsRef = useRef({})
  function refineMatchFn(src, kind) {
    if (kind === 'l2')   return t => (!t.cat1 || t.cat1 === 'Non Categorizzato' || !t.cat2) && t.cat1 !== 'Entrate'
    if (kind === 'desc') return noDesc
    const ruleIds = new Set(results[src]?.ruleAppliedIds || [])
    return t => t.cat1 && t.cat1 !== 'Non Categorizzato' && t.aiCategorized && !ruleIds.has(t.txId)
  }
  function refineRows(src, kind) {
    const key = `${src}|${kind}`
    const txs = importedTxs(src)
    const matchFn = refineMatchFn(src, kind)
    if (!frozenRefineIdsRef.current[key]) {
      frozenRefineIdsRef.current[key] = txs.filter(matchFn).map(t => t.txId)
    }
    const frozenIds = new Set(frozenRefineIdsRef.current[key])
    return txs.filter(t => frozenIds.has(t.txId)).map(t => ({ ...t, _wizDone: !matchFn(t) }))
  }

  // Gestione regola dal popup (stessa semantica di handleApplyRule dello sheet Transazioni)
  function handleApplyRule(mode, ruleText, cat1, cat2, updateDescAI = true, parsedMatch = null) {
    if (mode === 'none' || !rulePopup) { setRulePopup(null); return }
    const { tx, match, newDesc } = rulePopup
    const effectiveMatch = parsedMatch || parseRuleText(ruleText, match)
    const existingRules = useStore.getState()?.appPrefs?.aiNamingRules || []
    setAppPref('aiNamingRules', [...existingRules, {
      id: `nr-${Date.now()}`,
      matchField: effectiveMatch.field,
      matchValue: effectiveMatch.value,
      matchLabel: ruleText || `${effectiveMatch.label} includes "${effectiveMatch.value}"`,
      description: newDesc,
      enabled: true,
      createdAt: new Date().toISOString(),
    }])
    const targets = transactions.filter(t => {
      if (t.txId === tx.txId || t.excluded) return false
      if (!txMatchesRule(t, effectiveMatch)) return false
      if (mode === 'future') return (t._effDate||t.date||'') >= (tx._effDate||tx.date||'')
      return true
    })
    useStore.getState()?.beginTxUndoBatch?.()
    targets.forEach(t => {
      const patch = {}
      if (updateDescAI && newDesc) { patch.descAI = newDesc; patch.userEditedDesc = true }
      if (cat1) { patch.cat1 = cat1; if (cat2) patch.cat2 = cat2 }
      if (Object.keys(patch).length) updateTransaction(t.txId, patch)
    })
    useStore.getState()?.commitTxUndoBatch?.(`Regola "${newDesc}" su ${targets.length + 1} tx`)
    setRulePopup(null)
  }

  // ── Riepilogo finale ──────────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!queue || queue[stepIdx]?.id !== 'summary') return null
    const allIds = [...(results.conto?.savedTxIds||[]), ...(results.carta?.savedTxIds||[])]
    const idSet  = new Set(allIds)
    const imported = transactions.filter(t => idSet.has(t.txId))
    const pp = results.paypal || null
    const paypalTxs = transactions.filter(isPayPal)
    const cardTxs   = transactions.filter(t => !t.excluded && t.cardImportCard4)
    const rejected  = appPrefs?.compRejectedPairs || {}
    return {
      imported: allIds.length,
      rulesApplied: (results.conto?.rulesAppliedCount||0) + (results.carta?.rulesAppliedCount||0),
      dupes: (results.conto?.dupes||0) + (results.carta?.dupes||0),
      noCat: imported.filter(t => !t.cat1 || t.cat1 === 'Non Categorizzato').length,
      noL2: imported.filter(t => !t.cat2 && t.cat1 !== 'Entrate').length,
      noDesc: imported.filter(noDesc).length,
      ppAdded: pp?.added || 0, ppMatched: pp?.matchedNew || 0,
      ppPending: pp?.pendingNew || 0, ppUnmatched: pp?.unmatchedNew || 0,
      compPaypal: findCompPairs(paypalTxs, rejected.paypal || {}, idSet).length,
      compCarte:  findCompPairs(cardTxs,   rejected.carte  || {}, idSet).length,
    }
  }, [queue, stepIdx, results, transactions, appPrefs])

  // ── UI ────────────────────────────────────────────────────────────────────
  const SRC_LABEL = { conto: '🏦 Conto corrente', carta: '💳 Carte di credito', paypal: '🅿️ PayPal' }
  const KIND_LABEL = {
    l2:   { title: 'Transazioni senza categoria L2', empty: 'Tutte le transazioni importate hanno la categoria completa.' },
    desc: { title: 'Transazioni senza AI Description', empty: 'Tutte le transazioni importate hanno una descrizione.' },
    ai:   { title: 'Categorizzate dall’AI (nessuna regola applicata) — verifica', empty: 'Nessuna transazione categorizzata solo dall’AI da verificare.' },
  }

  // Stepper numerato sempre visibile in alto (richiesta utente 2026-07-13, punto 3:
  // "fin da subito si vede in alto il processo step by step per ogni pagina che si
  // procede") — sostituisce i vecchi chip testuali con un indicatore 1/2/3.../N con
  // stato fatto/corrente/da fare, sempre alla stessa posizione qualunque sia lo step.
  function StepProgress() {
    if (!queue) return null
    const labels = []
    const seen = new Set()
    queue.forEach(s => {
      const key = s.id === 'refine' ? `rifinisci-${s.src}` : s.id === 'import' ? `import-${s.src}` : s.id === 'doppioni' ? `doppioni-${s.src}` : s.id
      if (seen.has(key)) return
      seen.add(key)
      labels.push({ key, label:
        s.id === 'import' ? SRC_LABEL[s.src]
        : s.id === 'refine' ? `Rifinisci ${s.src}`
        : s.id === 'doppioni' ? `Doppioni ${s.src}`
        : s.id === 'paypal-result' ? 'Esito PayPal'
        : s.id === 'vacanze' ? 'Vacanze'
        : s.id === 'compensazioni' ? 'Compensazioni'
        : s.id === 'ricevute' ? 'Documenti'
        : s.id === 'review' ? 'Transazioni'
        : 'Riepilogo' })
    })
    const curKey = step.id === 'refine' ? `rifinisci-${step.src}` : step.id === 'import' ? `import-${step.src}` : step.id === 'doppioni' ? `doppioni-${step.src}` : step.id
    const curIdx = labels.findIndex(l => l.key === curKey)
    // Raggruppa in due macro-fasi (richiesta utente 2026-09): IMPORT base dati
    // (PayPal / Conto / Carte, ciascuno coi suoi sotto-step come pallini) e RIFINITURA
    // (Compensazioni / Vacanze / Documenti / Transazioni / Riepilogo). Compatto, a
    // icone, con divisore netto — niente più scroll orizzontale.
    const groupOf = k => (k.startsWith('import-paypal') || k === 'paypal-result') ? 'paypal'
      : k.endsWith('-conto') ? 'conto' : k.endsWith('-carta') ? 'carte' : null
    const GMETA = { paypal:{icon:'💙',label:'PayPal'}, conto:{icon:'🏦',label:'Conto'}, carte:{icon:'💳',label:'Carte'} }
    const RMETA = { compensazioni:{icon:'🔗',label:'Comp.'}, vacanze:{icon:'🏖️',label:'Vacanze'}, ricevute:{icon:'📄',label:'Doc.'}, review:{icon:'✅',label:'Transaz.'}, summary:{icon:'🎯',label:'Riepilogo'} }
    const withState = labels.map((l,i)=>({ ...l, done:i<curIdx, current:i===curIdx }))
    const importGroups = ['conto','carte','paypal']
      .map(g => ({ g, ...GMETA[g], subs: withState.filter(l => groupOf(l.key)===g) }))
      .filter(x => x.subs.length)
    const refineSteps = withState.filter(l => groupOf(l.key)===null)
    const secLabel = { fontSize:9, fontWeight:800, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--text3)' }
    return (
      <div style={{display:'flex',alignItems:'stretch',gap:16,rowGap:12,marginBottom:18,flexShrink:0,flexWrap:'wrap'}}>
        {/* ── Import base dati ── */}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={secLabel}>📥 Import dati</div>
          <div style={{display:'flex',gap:12}}>
            {importGroups.map(grp => {
              const active = grp.subs.some(s=>s.current)
              const allDone = grp.subs.every(s=>s.done)
              return (
                <div key={grp.g} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,minWidth:50}}>
                  <div style={{width:34,height:34,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,
                    background: active?'var(--accent)':allDone?'var(--green-l)':'var(--surface2)',
                    border: active?'2px solid var(--accent)':allDone?'1px solid var(--green)':'1px solid var(--border)'}}>
                    {grp.icon}
                  </div>
                  <div style={{fontSize:10,fontWeight:active?700:600,color:active?'var(--accent)':allDone?'var(--green)':'var(--text2)'}}>{grp.label}</div>
                  <div style={{display:'flex',gap:3}}>
                    {grp.subs.map(s=>(
                      <span key={s.key} title={s.label} style={{width:6,height:6,borderRadius:'50%',
                        background: s.done?'var(--green)':s.current?'var(--accent)':'var(--border)'}}/>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {refineSteps.length>0 && <div style={{width:1,background:'var(--border)',alignSelf:'stretch',margin:'0 2px'}}/>}
        {/* ── Fine tuning ── */}
        {refineSteps.length>0 && (
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <div style={secLabel}>✨ Rifinitura</div>
            <div style={{display:'flex',gap:10}}>
              {refineSteps.map(s=>{
                const meta = RMETA[s.key] || {icon:'•',label:s.label}
                return (
                  <div key={s.key} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,minWidth:44}}>
                    <div style={{width:30,height:30,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,
                      background: s.current?'var(--accent)':s.done?'var(--green-l)':'var(--surface2)',
                      border: s.current?'2px solid var(--accent)':s.done?'1px solid var(--green)':'1px solid var(--border)'}}>
                      {s.done?'✓':meta.icon}
                    </div>
                    <div style={{fontSize:10,fontWeight:s.current?700:500,color:s.current?'var(--accent)':s.done?'var(--green)':'var(--text3)'}}>{meta.label}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Barra di navigazione condivisa: "← Indietro" (richiesta utente 2026-07-13,
  // punto 5 — disabilitato quando non c'è un precedente step "nativo" a cui
  // tornare, es. subito dopo un import CSV) + "Avanti →"/label custom
  function StepNav({ nextLabel = 'Avanti →', onNextClick = next }) {
    const canBack = canGoBack()
    return (
      <div style={{display:'flex',justifyContent:'space-between',marginTop:14}}>
        <button onClick={back} disabled={!canBack}
          style={{fontSize:13,padding:'8px 18px',fontWeight:700,borderRadius:8,cursor:canBack?'pointer':'default',
            background:'transparent',border:'1px solid var(--border)',color:canBack?'var(--text)':'var(--text3)',
            opacity:canBack?1:.5}}>
          ← Indietro
        </button>
        <button className="btn btn-primary" style={{fontSize:13,padding:'8px 22px',fontWeight:700}} onClick={onNextClick}>
          {nextLabel}
        </button>
      </div>
    )
  }

  // Import conto/carta/PayPal: ora renderizzati EMBEDDED dentro la cornice del wizard
  // (vedi blocco step.id === 'import' più sotto, nell'area contenuto), così hanno la
  // stessa barra step + header degli altri step — richiesta utente 2026-09 "più
  // uniforme". Prima erano un modale a sé (backdrop+box) sovrapposto, per evitare due
  // modali impilati di misure diverse; ora ImportModal/PaypalImportModal hanno una
  // prop `embedded` che rende solo il contenuto (niente backdrop/box proprio).

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.55)',backdropFilter:'blur(3px)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={e => e.target === e.currentTarget && handleWizardClose()}>
      {/* Frame uniforme — dimensione FISSA per tutti gli step "nativi" del wizard
          (richiesta utente 2026-07-13, punto 3: "fai un grande e uniforme...
          facendo next scambia pagina, ma non grandezza o UI"): solo il contenuto
          scorre (area interna flex:1 con overflow), l'header e lo stepper restano
          sempre nella stessa posizione. */}
      <div style={{background:'var(--surface)',borderRadius:16,padding:'24px 28px',
        width:1040,height:'82vh',maxWidth:'96vw',maxHeight:'92vh',
        display:'flex',flexDirection:'column',position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
        <button onClick={handleWizardClose} disabled={wizClosing} title="Chiudi il wizard"
          style={{position:'absolute',top:14,right:16,background:'none',border:'none',
            cursor:wizClosing?'default':'pointer',fontSize:18,color:'var(--text3)',opacity:wizClosing?0.5:1}}>
          {wizClosing ? '…' : '✕'}
        </button>

        <div style={{fontSize:18,fontWeight:800,marginBottom:2,flexShrink:0}}>📥 Importa</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:16,flexShrink:0}}>
          Import unificato: conto, carte e PayPal in un unico flusso guidato, con rifinitura e compensazioni.
        </div>

        {queue && step && <StepProgress/>}

        <div style={{flex:1,overflowY:'auto',minHeight:0}}>

        {/* ── Selezione sorgenti ── */}
        {!queue && (
          <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,flex:1,minHeight:0}}>
              {[
                ['conto',  '🏦 Conto corrente', 'File CSV/Excel del conto (UniCredit, Fineco, …)'],
                ['carta',  '💳 Carte di credito', 'CSV/Excel della carta, con riconciliazione mensile estratti'],
                ['paypal', '🅿️ PayPal', 'Screenshot, PDF o incolla (⌘V) — abbinamento automatico'],
              ].map(([key,label,sub]) => {
                const on = !!sources[key]
                const lastDate = key === 'conto' ? lastTxInfo.conto[0]?.date
                  : key === 'paypal' ? lastTxInfo.paypal[0]?.date
                  : lastTxInfo.cards[0]?.txs[0]?.date
                const count = key === 'conto' ? lastTxInfo.contoCount
                  : key === 'paypal' ? lastTxInfo.paypalCount
                  : lastTxInfo.cards.reduce((s,c)=>s+(c.count||0),0)
                const dd = daysSince(lastDate)
                const ddCol = dd == null ? 'var(--text3)' : dd <= 3 ? 'var(--green)' : dd <= 21 ? 'var(--gold)' : 'var(--red)'
                const kpiBox = { flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'7px 10px' }
                const kpiLbl = { fontSize:8.5, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--text3)', fontWeight:800 }
                const kpiVal = { fontSize:16, fontWeight:800, fontFamily:'var(--font-mono)', lineHeight:1.25 }
                return (
                  <label key={key} style={{display:'flex',flexDirection:'column',minHeight:0,padding:'15px 16px',
                    borderRadius:14,cursor:'pointer',transition:'border-color .15s',
                    border:`2px solid ${on?'var(--accent)':'var(--border)'}`,
                    background:on?'var(--accent-l)':'var(--surface2)'}}>
                    <span style={{display:'flex',gap:10,alignItems:'flex-start',flexShrink:0}}>
                      <input type="checkbox" checked={on}
                        onChange={()=>setSources(s=>({...s,[key]:!s[key]}))} style={{marginTop:3,cursor:'pointer'}}/>
                      <span style={{minWidth:0}}>
                        <span style={{fontSize:15,fontWeight:800,display:'block'}}>{label}</span>
                        <span style={{fontSize:11,color:'var(--text3)',display:'block',lineHeight:1.4}}>{sub}</span>
                      </span>
                    </span>

                    {/* KPI: giorni dall'ultima operazione + numero registrate */}
                    <div style={{display:'flex',gap:8,margin:'12px 0 10px',flexShrink:0}}>
                      <div style={kpiBox}>
                        <div style={kpiLbl}>🕐 Ultima op.</div>
                        <div style={{...kpiVal,color:ddCol}}>{dd == null ? '—' : dd === 0 ? 'oggi' : `${dd} g fa`}</div>
                      </div>
                      <div style={kpiBox}>
                        <div style={kpiLbl}>🧾 Registrate</div>
                        <div style={{...kpiVal,color:'var(--text)'}}>{count || 0}</div>
                      </div>
                    </div>

                    <div style={{fontSize:10,fontWeight:800,letterSpacing:'.04em',textTransform:'uppercase',color:'var(--text3)',marginBottom:4,flexShrink:0}}>
                      Ultime operazioni
                    </div>
                    <div style={{fontSize:10.5,color:'var(--text3)',lineHeight:1.6,flex:1,minHeight:0,overflowY:'auto',
                      borderTop:'1px solid var(--border)',paddingTop:6}}>
                      {key === 'conto' && (
                        lastTxInfo.conto.length
                          ? lastTxInfo.conto.map(t => <LastTxRow key={t.txId} t={t}/>)
                          : 'Nessuna transazione registrata finora'
                      )}
                      {key === 'carta' && (
                        lastTxInfo.cards.length
                          ? lastTxInfo.cards.map(c => (
                              <span key={c.name} style={{display:'block',marginTop:4}}>
                                <span style={{fontWeight:700,color:'var(--text2)'}}>{c.name}{c.card4 ? <span style={{fontFamily:'var(--font-mono)'}}> · *{c.card4}</span> : null}</span>
                                {c.txs.map(t => <LastTxRow key={t.txId} t={t}/>)}
                              </span>
                            ))
                          : 'Nessuna transazione registrata finora'
                      )}
                      {key === 'paypal' && (
                        lastTxInfo.paypal.length
                          ? lastTxInfo.paypal.map(t => <LastTxRow key={t.id||t.txId} t={t}/>)
                          : 'Nessuna operazione importata da PayPal finora'
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',paddingTop:14,flexShrink:0}}>
              <button disabled={!sources.conto && !sources.carta && !sources.paypal}
                className="btn btn-primary" style={{fontSize:14,padding:'11px 32px',fontWeight:700}}
                onClick={()=>{ setQueue(buildQueue()); setStepIdx(0) }}>
                Avvia importazione →
              </button>
            </div>
          </div>
        )}

        {/* ── Import conto/carta/PayPal — EMBEDDED nella cornice (uniforme con gli altri step) ── */}
        {step && step.id === 'import' && (
          step.src !== 'paypal'
            ? <ImportModal
                embedded
                accountFilter={step.src}
                onClose={()=>skipSource(step.src)}
                onFlowDone={res => { setResults(r => ({ ...r, [step.src]: res })); next() }}
              />
            : <PaypalImportModal
                embedded
                onClose={()=>{ setStepIdx(i => ppImportedRef.current ? i + 1 : i + 2) }}
                onImport={(items)=>{
                  const res = applyPaypalImport(items, { paypalImports: appPrefs?.paypalImports || [], transactions, updateTransaction, setAppPref })
                  setResults(r => ({ ...r, paypal: res }))
                  ppImportedRef.current = true
                }}
                transactions={transactions}
                apiKey={apiKey}
                paypalImports={appPrefs?.paypalImports || []}
              />
        )}

        {/* ── Rifinitura (a/b): 3 schermate per sorgente ── */}
        {step && step.id === 'refine' && (
          <>
            <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>
              {SRC_LABEL[step.src]} — {KIND_LABEL[step.kind].title}
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
              Modifica direttamente i campi (come nello sheet Transazioni): la descrizione AI apre il popup per
              creare una regola, le categorie si cambiano dalle tendine, ✚ Regola crea una regola dalla riga.
            </div>
            <RefineTable
              txs={refineRows(step.src, step.kind)}
              allCats={allCats}
              updateTransaction={updateTransaction}
              onOpenRulePopup={setRulePopup}
              emptyMsg={KIND_LABEL[step.kind].empty}
            />
            <StepNav/>
          </>
        )}

        {/* ── Doppioni (richiesta utente 2026-07-13, punto 4): subito dopo la
            rifinitura della sorgente, verifica contro il DB della stessa categoria ── */}
        {step && step.id === 'doppioni' && (() => {
          const targetGapDoppioni = step.src === 'conto' ? (results.conto?.targetGapDoppioni ?? null) : null
          const reconcileAccount = step.src === 'conto' ? results.conto?.account : null
          const saldoBreakdown = step.src === 'conto' ? (results.conto?.saldoDoppioniBreakdown ?? null) : null
          return (
            <>
              <DoppioniStep src={step.src} srcTxs={importedTxs(step.src)} embedded registerUndo={registerUndo}
                targetGapDoppioni={targetGapDoppioni} reconcileAccount={reconcileAccount}
                saldoBreakdown={saldoBreakdown} onNext={next} />
              {targetGapDoppioni == null && <StepNav/>}
            </>
          )
        })()}

        {/* ── Esito PayPal (c) ── */}
        {step && step.id === 'paypal-result' && (() => {
          const pp = results.paypal
          const pending = (appPrefs?.paypalImports || []).filter(i => i.status === 'pending_approval')
          const unmatched = (appPrefs?.paypalImports || []).filter(i => i.status === 'unmatched')
          const dayDiff = (d1, d2) => {
            if (!d1 || !d2) return '?'
            return Math.round(Math.abs(new Date(d1) - new Date(d2)) / 86400000)
          }
          return (
            <>
              <div style={{fontSize:15,fontWeight:700,marginBottom:10}}>💙 Esito import PayPal</div>
              {pp ? (
                <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:14}}>
                  {[['Importate', pp.added, 'var(--accent)'],
                    ['Abbinate automaticamente', pp.matchedNew, 'var(--green)'],
                    ['Da approvare', pp.pendingNew, 'var(--gold)'],
                    ['Non abbinate', pp.unmatchedNew, 'var(--red)']].map(([l,v,c]) => (
                    <div key={l} style={{padding:'10px 16px',border:'1px solid var(--border)',borderRadius:10,minWidth:120}}>
                      <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)'}}>{l}</div>
                      <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : <div style={{fontSize:13,color:'var(--text3)',marginBottom:12}}>Nessun import PayPal effettuato.</div>}
              {/* Abbinamenti PayPal↔conto da confermare (richiesta utente 2026-07-15:
                  prima raggiungibili SOLO dalla pagina PayPal, mai dal wizard — questi
                  sono i SOLI casi dubbi: i doppioni certi sono già 'matched' in automatico
                  da autoMatch, qui restano solo le coppie "stesso importo, pochi giorni
                  di distanza" che vanno confermate a mano). */}
              {pending.length > 0 && (
                <>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>🔗 Abbinamenti PayPal ↔ conto da confermare ({pending.length})</div>
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                    {pending.map(imp => {
                      const tx = transactions.find(t => t.txId === imp.pendingTxId)
                      return (
                        <div key={imp.id} style={{border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px'}}>
                          <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:8,fontSize:12}}>
                            <div style={{flex:1,minWidth:200}}>
                              <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:2}}>📱 Da PayPal</div>
                              <div style={{fontWeight:700}}>{imp.merchant || '—'}</div>
                              <div style={{color:'var(--text3)'}}>{fmtDate(imp.date)} · €{fmtIT(Math.abs(imp.amount),2)}</div>
                            </div>
                            <div style={{flex:1,minWidth:200}}>
                              <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:2}}>🏦 Dal conto</div>
                              {tx ? (
                                <>
                                  <div style={{fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tx.merchant || tx.descAI || (tx.description||'').slice(0,40)}</div>
                                  <div style={{color:'var(--text3)'}}>{fmtDate(tx._effDate||tx.date)} · €{fmtIT(Math.abs(tx.amount),2)} · {dayDiff(imp.date, tx._effDate||tx.date)}g di distanza</div>
                                </>
                              ) : <div style={{color:'var(--text3)'}}>Transazione non trovata</div>}
                            </div>
                          </div>
                          <div style={{display:'flex',gap:8}}>
                            <button className="btn btn-primary" style={{fontSize:12,padding:'5px 12px'}}
                              onClick={()=>approvePendingPaypal(imp.id)}>✅ Approva</button>
                            <button className="btn btn-ghost" style={{fontSize:12,padding:'5px 12px',color:'var(--red)'}}
                              onClick={()=>rejectPendingPaypal(imp.id)}>❌ Rifiuta</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              {unmatched.length > 0 && (
                <>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>Operazioni PayPal non abbinate ({unmatched.length})</div>
                  <div style={{maxHeight:'34vh',overflow:'auto',border:'1px solid var(--border)',borderRadius:10,marginBottom:12}}>
                    {unmatched.map(i => (
                      <div key={i.id} style={{display:'flex',gap:10,padding:'7px 12px',fontSize:12,borderBottom:'1px solid var(--border)'}}>
                        <span style={{fontFamily:'var(--font-mono)',color:'var(--text3)',flexShrink:0}}>{fmtDate(i.date)}</span>
                        <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.merchant}</span>
                        <span style={{fontWeight:700,fontFamily:'var(--font-mono)'}}>€ {fmtIT(Math.abs(i.amount),2)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>
                    Si abbinano manualmente dallo sheet PayPal (bottone "Non abbinate").
                  </div>
                </>
              )}
              <StepNav/>
            </>
          )
        })()}

        {/* ── Compensazioni (d) ── */}
        {step && step.id === 'compensazioni' && (
          <>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>🔗 Compensazioni</div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
              Solo abbinamenti che coinvolgono le transazioni importate in QUESTO flusso —
              il pending storico resta gestibile dai rispettivi sheet.
            </div>
            <SatispayPanel limitTxIds={importedIdSet} onNavigate={()=>{ navigateRef.current?.('satispay'); onClose() }}/>
            <AltreEntratePanel limitTxIds={importedIdSet}/>
            <div style={{border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>💙 PayPal &nbsp;·&nbsp; 💳 Carte</div>
              <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
                Coppie spesa/rimborso con lo stesso importo che coinvolgono l'import corrente,
                da confermare una alla volta (identico alla modalità "Da confermare" di Satispay).
                Se non compare nessun bottone, non c'è niente da abbinare. ✅
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                <CompDaConfermare txs={transactions.filter(isPayPal)} scope="paypal" incomeLabel="📥 Rimborso PayPal" limitTxIds={importedIdSet}/>
                <CompDaConfermare txs={transactions.filter(t => !t.excluded && t.cardImportCard4)} scope="carte" incomeLabel="📥 Rimborso carta" limitTxIds={importedIdSet}/>
              </div>
            </div>
            <StepNav/>
          </>
        )}

        {/* ── Vacanze: mega-step con le 4 sezioni (prenotazioni, candidate, fuori
            periodo, non allocate), DOPO Compensazioni (richiesta utente
            2026-07-13, punto 1), tutte limitate SOLO alle transazioni di questo
            import (punto 2) ── */}
        {step && step.id === 'vacanze' && (
          <>
            <VacanzeMegaStep importedIdSet={importedIdSet} vacMinDate={vacMinDate} vacMaxDate={vacMaxDate} registerUndo={registerUndo} />
            <StepNav/>
          </>
        )}

        {/* ── Documenti in sospeso (foto ricevuta da mobile per transazioni non
            ancora importate, vedi pendingReceipts) — richiesta utente 2026-07-27:
            tenta l'abbinamento automatico per importo+data con le transazioni
            appena importate in QUESTO flusso, chiede conferma con Avanti. ── */}
        {step && step.id === 'ricevute' && (() => {
          const importedTxs = transactions.filter(t => importedIdSet.has(t.txId))
          const proposals = pendingReceipts.map(r => {
            const candidates = importedTxs.filter(t =>
              (t._effDate||t.date||'').slice(0,10) === (r.date||'').slice(0,10) &&
              Math.abs(Math.abs(t.amount) - Math.abs(r.amount||0)) < 0.01
            )
            return { receipt:r, candidates }
          })
          const withMatch = proposals.filter(p => p.candidates.length > 0)
          const withoutMatch = proposals.filter(p => p.candidates.length === 0)
          return (
            <>
              <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>📎 Documenti in sospeso</div>
              <div style={{fontSize:12,color:'var(--text3)',marginBottom:14}}>
                Foto ricevuta caricate da mobile prima che la transazione fosse importata. Confermando, la foto verrà allegata alla transazione trovata.
              </div>
              {withMatch.length === 0 ? (
                <div style={{padding:'24px 20px',textAlign:'center',color:'var(--text3)',fontSize:13}}>
                  Nessun documento in sospeso corrisponde alle transazioni appena importate.
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:14}}>
                  {withMatch.map(({receipt,candidates}) => {
                    const chosen = ricevuteSelected[receipt.id] !== undefined ? ricevuteSelected[receipt.id] : candidates[0].txId
                    return (
                      <div key={receipt.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',border:'1px solid var(--border)',borderRadius:10}}>
                        <input type="checkbox" checked={!!chosen} onChange={e=>setRicevuteSelected(s=>({...s,[receipt.id]: e.target.checked ? (candidates[0].txId) : null}))}/>
                        {receipt.attachment?.url && <img src={receipt.attachment.url} alt="" style={{width:40,height:40,objectFit:'cover',borderRadius:6,flexShrink:0}}/>}
                        <div style={{flex:1,minWidth:0,fontSize:12}}>
                          <div style={{fontWeight:700}}>{receipt.description}</div>
                          <div style={{color:'var(--text3)'}}>{fmtDate(receipt.date)} · € {fmtIT(Math.abs(receipt.amount||0),2)}</div>
                        </div>
                        <div style={{fontSize:11,color:'var(--text3)'}}>→</div>
                        <div style={{flex:1,minWidth:0,fontSize:12,textAlign:'right'}}>
                          {candidates.length === 1 ? (
                            <>
                              <div style={{fontWeight:700}}>{candidates[0].descAI||candidates[0].description||'—'}</div>
                              <div style={{color:'var(--text3)'}}>{fmtDate(candidates[0]._effDate||candidates[0].date)}</div>
                            </>
                          ) : (
                            <select value={chosen||''} onChange={e=>setRicevuteSelected(s=>({...s,[receipt.id]:e.target.value||null}))}
                              style={{fontSize:11,padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)'}}>
                              {candidates.map(c=>(
                                <option key={c.txId} value={c.txId}>{fmtDate(c._effDate||c.date)} — {(c.descAI||c.description||'').slice(0,30)}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {withoutMatch.length > 0 && (
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:14}}>
                  {withoutMatch.length} documento/i senza corrispondenza in questo import — resteranno in sospeso (visibili in Impostazioni → Documenti).
                </div>
              )}
              <StepNav onNextClick={() => {
                withMatch.forEach(({receipt,candidates}) => {
                  const chosenId = ricevuteSelected[receipt.id] !== undefined ? ricevuteSelected[receipt.id] : candidates[0].txId
                  if (!chosenId) return // utente ha deselezionato questo abbinamento
                  const tx = transactions.find(t=>t.txId===chosenId)
                  if (!tx || !receipt.attachment) return
                  updateTransaction(tx.txId, { attachments:[...(tx.attachments||[]), receipt.attachment] })
                  deletePendingReceipt(receipt.id)
                })
                next()
              }}/>
            </>
          )
        })()}

        {/* ── Riepilogo transazioni importate (richiesta utente 2026-07-12):
            ultima pagina PRIMA dei KPI — dentro al riquadro tutte le transazioni
            che risultano importate a fine procedura, fresche dallo store ── */}
        {step && step.id === 'review' && (() => {
          const rows = transactions
            .filter(t => importedIdSet.has(t.txId))
            .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
          return (
            <>
              <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>
                📄 Transazioni importate in questo flusso ({rows.length})
              </div>
              <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
                Controllo finale prima del riepilogo — così vedi esattamente cosa è entrato nel database.
              </div>
              {rows.length === 0 ? (
                <div style={{padding:'32px 20px',textAlign:'center',color:'var(--text3)',fontSize:13}}>
                  Nessuna transazione bancaria importata in questo flusso
                  {results.paypal ? ' (le operazioni PayPal vivono nel registro PayPal, vedi pagina precedente)' : ''}.
                </div>
              ) : (
                <div style={{overflow:'auto',maxHeight:'56vh',border:'1px solid var(--border)',borderRadius:10}}>
                  <table style={{width:'100%',borderCollapse:'collapse',minWidth:820}}>
                    <thead>
                      <tr>
                        {['Data','Fonte','✨ AI Descrizione','Descrizione','Categoria','Importo'].map((h,i)=>(
                          <th key={i} style={{padding:'8px 10px',fontSize:10,fontWeight:700,letterSpacing:'.06em',
                            textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',
                            borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left',
                            whiteSpace:'nowrap',position:'sticky',top:0,zIndex:1}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(t => (
                        <tr key={t.txId} style={{borderBottom:'1px solid var(--border)'}}>
                          <td style={{padding:'7px 10px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                            {fmtDate(t._effDate||t.date)}
                          </td>
                          <td style={{padding:'7px 10px',whiteSpace:'nowrap',fontSize:11,fontWeight:700}}>
                            {t.cardImportCard4 ? `💳 *${t.cardImportCard4}` : '🏦 Conto'}
                          </td>
                          <td style={{padding:'7px 10px',fontSize:12,fontWeight:600,maxWidth:170,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t.descAI||''}>
                            {t.descAI || <span style={{opacity:.4}}>—</span>}
                          </td>
                          <td style={{padding:'7px 10px',fontSize:11,color:'var(--text3)',maxWidth:230,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t.description||''}>
                            {(t.description||'').slice(0,70)}
                          </td>
                          <td style={{padding:'7px 10px',fontSize:12,whiteSpace:'nowrap'}}>
                            {t.cat1 ? `${t.cat1}${t.cat2 ? ' › '+t.cat2 : ''}` : <span style={{color:'var(--red)',fontWeight:700}}>—</span>}
                          </td>
                          <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,
                            fontWeight:700,color:t.amount>=0?'var(--green)':'var(--red)',whiteSpace:'nowrap'}}>
                            {t.amount>=0?'+':'−'}€ {fmtIT(Math.abs(t.amount),2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <StepNav/>
            </>
          )
        })()}

        {/* ── Riepilogo finale (e) ── */}
        {step && step.id === 'summary' && summary && (
          <>
            <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>🏁 Riepilogo importazione</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:16}}>
              {[
                ['📄 Transazioni importate', summary.imported, 'var(--accent)'],
                ['🧩 Regole applicate', summary.rulesApplied, 'var(--accent)'],
                ['🔁 Doppioni scartati', summary.dupes, 'var(--text2)'],
                ['🏷️ Ancora senza categoria', summary.noCat, summary.noCat>0?'var(--red)':'var(--green)'],
                ['🏷️ Senza sottocategoria L2', summary.noL2, summary.noL2>0?'var(--gold)':'var(--green)'],
                ['✍️ Senza AI Description', summary.noDesc, summary.noDesc>0?'var(--gold)':'var(--green)'],
                ...(results.paypal ? [
                  ['💙 PayPal importate', summary.ppAdded, 'var(--accent)'],
                  ['💙 Abbinate auto', summary.ppMatched, 'var(--green)'],
                  ['💙 Da approvare', summary.ppPending, summary.ppPending>0?'var(--gold)':'var(--green)'],
                  ['💙 Non abbinate', summary.ppUnmatched, summary.ppUnmatched>0?'var(--red)':'var(--green)'],
                ] : []),
                ['🔗 Compensazioni PayPal in sospeso', summary.compPaypal, summary.compPaypal>0?'var(--gold)':'var(--green)'],
                ['🔗 Compensazioni Carte in sospeso', summary.compCarte, summary.compCarte>0?'var(--gold)':'var(--green)'],
              ].map(([l,v,c]) => (
                <div key={l} style={{padding:'12px 14px',border:'1px solid var(--border)',borderRadius:10}}>
                  <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',marginBottom:4}}>{l}</div>
                  <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:16}}>
              Ciò che richiede ancora un intervento si ritrova in: Accuracy (KPI qualità), Transazioni
              (filtro Non Categorizzato), PayPal/Carte (⏳ Da confermare), Satispay e Altre Entrate.
            </div>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <button onClick={back} disabled={!canGoBack()}
                style={{fontSize:13,padding:'8px 18px',fontWeight:700,borderRadius:8,cursor:canGoBack()?'pointer':'default',
                  background:'transparent',border:'1px solid var(--border)',color:canGoBack()?'var(--text)':'var(--text3)',
                  opacity:canGoBack()?1:.5}}>
                ← Indietro
              </button>
              <button className="btn btn-primary" style={{fontSize:14,padding:'9px 26px',fontWeight:700}} onClick={onClose}>
                ✅ Fine
              </button>
            </div>
          </>
        )}
        </div>

        {/* ── Barra "↩️ Annulla" condivisa (richiesta utente 2026-07-13, punto 5) —
            fuori dall'area scrollabile, sempre visibile in fondo al frame quando
            c'è un'azione recente da poter annullare ── */}
        {wizUndo && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
            padding:'8px 14px',marginTop:10,borderRadius:10,background:'var(--surface2)',
            border:'1px solid var(--border)',flexShrink:0}}>
            <span style={{fontSize:12,color:'var(--text3)'}}>↩️ {wizUndo.label}</span>
            <button onClick={doUndo}
              style={{fontSize:12,fontWeight:700,padding:'5px 14px',borderRadius:7,cursor:'pointer',
                background:'var(--accent)',color:'#fff',border:'none'}}>
              Annulla
            </button>
          </div>
        )}

        {/* Popup regola (identico allo sheet Transazioni) */}
        {rulePopup && (
          <RuleApplyPopup
            tx={rulePopup.tx}
            match={rulePopup.match}
            newDesc={rulePopup.newDesc}
            txId={rulePopup.tx.txId}
            txDate={rulePopup.tx._effDate || rulePopup.tx.date}
            onApply={handleApplyRule}
            onClose={()=>setRulePopup(null)}
          />
        )}
      </div>
    </div>
  )
}
