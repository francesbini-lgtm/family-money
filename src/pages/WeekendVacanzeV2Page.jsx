import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useStore } from '../store/useStore'
import { Plus, Trash2, Search, Check, X as XIcon, ChevronDown, ChevronRight, Settings } from 'lucide-react'
import { fmtIT } from '../utils/format'
import Modal from '../components/Modal'
import { getMergedCats } from '../data/categories'
import { useVacations, useNotVacationDates } from '../hooks/useCalendarVacations'
import {
  vacationTotalCost, allDatesBetween, vacationType,
  destCategoryEmoji, destCategoryLabel, computeCandidateVacations,
  DEST_TYPES, labelToEmoji, findVacationForDate,
} from '../data/vacationRules'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts'

function nightsBetween(from, to) {
  if (!from || !to) return 0
  return Math.max(0, Math.round((new Date(to) - new Date(from)) / 86400000))
}

function getYear(v) {
  if (v.from) return parseInt(v.from.slice(0, 4))
  return null
}

function fmtDate(d) {
  return d ? d.split('-').reverse().join('/') : '—'
}

// Data di competenza "fresca": sempre ricalcolata da competenza/date, mai dalla
// cache _effDate (che updateTransaction NON ricalcola — vedi useStore.js) — è la
// chiave corretta per capire se una spesa cade dentro/fuori un periodo vacanza.
function effDate(t) {
  return t.competenza || t.date
}

// Una spesa con location = città di riferimento (Impostazioni → 📍 Zona di Casa,
// appPrefs.homeCity) non è una spesa di vacanza anche se avvenuta durante un
// periodo dichiarato — è semplicemente successa "a casa" nel frattempo (es.
// idraulico, bollette...). Confronto case-insensitive e "contains" in entrambe
// le direzioni per tollerare varianti tipo "Como" vs "Como, Italia" (Places).
export function isHomeCityTx(t, homeCity) {
  if (!t.city || !homeCity) return false
  const a = t.city.trim().toLowerCase()
  const b = homeCity.trim().toLowerCase()
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

// Normalizza una descrizione AI per il confronto nella lista "escludi sempre"
// (appPrefs.wv2NeverAiDescs) — case-insensitive, spazi ai bordi ignorati.
export function normDesc(s) {
  return (s || '').trim().toLowerCase()
}

const PIE_COLORS = { Mare: '#0ea5e9', Montagna: '#16a34a', Città: '#b45309', Altro: '#94a3b8' }
const TYPE_COLORS = { Vacanze: '#2563eb', Weekend: '#b45309' }

// ── Editable cell: text/date — click to edit ──────────────
function EditCell({ value, onSave, type = 'text', width = 100, placeholder = '—', align = 'left', title = 'Clicca per modificare' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value ?? ''))

  function commit() {
    setEditing(false)
    onSave(val.trim())
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type === 'date' ? 'date' : 'text'}
        value={val}
        onClick={e => e.stopPropagation()}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{
          width, padding: '2px 6px', border: '1px solid var(--accent)',
          borderRadius: 4, background: 'var(--surface)', color: 'var(--text1)',
          fontSize: 12, fontFamily: 'var(--font-sans)', textAlign: align
        }}
      />
    )
  }

  const display = type === 'date'
    ? (value ? value.split('-').reverse().join('/') : '—')
    : (value || placeholder)

  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true); setVal(String(value ?? '')) }}
      title={title}
      style={{
        cursor: 'pointer', display: 'inline-block',
        borderBottom: '1px dashed var(--border)',
        paddingBottom: 1, textAlign: align, minWidth: 20
      }}
    >
      {display}
    </span>
  )
}

// ── Selettore Mare / Montagna / Città / Altro — solo emoji, niente testo, niente header ──
function DestTypeSelect({ value, onSave }) {
  return (
    <select
      value={value}
      onClick={e => e.stopPropagation()}
      onChange={e => onSave(e.target.value)}
      title={`Destinazione: ${value} — clicca per cambiare`}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        fontSize: 14, appearance: 'none', WebkitAppearance: 'none',
        padding: 0, marginRight: 2, color: 'inherit'
      }}
    >
      {DEST_TYPES.map(t => (
        <option key={t} value={t} title={t}>{labelToEmoji(t)}</option>
      ))}
    </select>
  )
}

// ── Riga spesa nel drill-down di una vacanza ──────────────
function VacationTxRow({ t, onDeleteRequest }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text3)', width: 60, flexShrink: 0 }}>{fmtDate(t._effDate || t.date)}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.descAI || t.description}</span>
      <span style={{ fontWeight: 600, color: 'var(--text1)', flexShrink: 0 }}>€ {fmtIT(Math.abs(t.amount), 2)}</span>
      <button onClick={() => onDeleteRequest(t)} title="Togli dalla vacanza (richiede una nuova categoria)"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ── Riga costo manuale (Carburante / Autostrada) — sempre presente, editabile ──
function ManualCostRow({ icon, label, value, onSave }) {
  const [val, setVal] = useState(String(value || ''))
  useEffect(() => { setVal(String(value || '')) }, [value])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 12 }}>
      <span style={{ width: 110, flexShrink: 0 }}>{icon} {label}</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>€</span>
      <input
        type="number" value={val} placeholder="0"
        onChange={e => setVal(e.target.value)}
        onBlur={() => onSave(parseFloat(val) || 0)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ width: 80, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text1)', fontSize: 12, textAlign: 'right', fontFamily: 'var(--font-sans)' }}
      />
    </div>
  )
}

// ── Modale: chiede la nuova categoria prima di togliere una spesa dalla vacanza ──
function RecategorizeModal({ tx, onConfirm, onClose }) {
  const customCats = useStore(s => s.customCats)
  const allCats = useMemo(() => getMergedCats(customCats), [customCats])
  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const cat2Options = cat1 && allCats[cat1]?.sub ? allCats[cat1].sub : []
  const selStyle = { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text1)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }
  return (
    <Modal title="Ricategorizza spesa" onClose={onClose} width={380}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
        Prima di togliere &quot;{tx.descAI || tx.description || 'questa spesa'}&quot; dalla vacanza, scegli la nuova categoria — non può restare senza categoria.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Categoria L1</div>
          <select value={cat1} onChange={e => { setCat1(e.target.value); setCat2('') }} style={selStyle}>
            <option value="">—</option>
            {Object.keys(allCats).filter(n => n !== 'Weekend e Vacanze').map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Categoria L2</div>
          <select value={cat2} onChange={e => setCat2(e.target.value)} disabled={!cat2Options.length} style={{ ...selStyle, opacity: cat2Options.length ? 1 : 0.4 }}>
            <option value="">—</option>
            {cat2Options.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} style={{ padding: '7px 12px', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Annulla</button>
        <button onClick={() => onConfirm(cat1, cat2)} disabled={!cat1}
          style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: cat1 ? 1 : 0.5 }}>
          Conferma
        </button>
      </div>
    </Modal>
  )
}

// ── Merchant "vacanza" di default (Impostazioni ⚙️ in questa pagina; usati anche
// dal wizard di importazione per chiedere competenza/vacanza sulle prenotazioni) ──
export const DEFAULT_VAC_MERCHANTS = ['booking', 'airbnb', 'bravonext', 'lastminute']
export function getVacationMerchants(appPrefs) {
  const list = appPrefs?.vacationMerchants
  return Array.isArray(list) && list.length ? list : DEFAULT_VAC_MERCHANTS
}

// Puntino descrizione originale: clicca per aprire un popover con il testo completo
// (l'hover via title non bastava — richiesta utente: "non si riesce a cliccare").
// Posizionato con position:fixed (coordinate del click) invece che absolute perché il
// puntino vive dentro un contenitore overflow:auto (tabella scrollabile del modale) —
// con absolute il popover verrebbe tagliato dallo scroll invece di restare visibile.
function OrigDot({ description }) {
  const [pos, setPos] = useState(null) // { top, left } oppure null = chiuso
  const popRef = useRef(null)
  useEffect(() => {
    if (!pos) return
    function onDocClick(e) { if (popRef.current && !popRef.current.contains(e.target)) setPos(null) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pos])
  if (!description) return null
  function toggle(e) {
    e.stopPropagation()
    if (pos) { setPos(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    const POP_W = 260
    setPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.left - POP_W / 2, window.innerWidth - POP_W - 8)),
    })
  }
  return (
    <>
      <span
        onClick={toggle}
        title="Clicca per vedere la descrizione originale"
        style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
          background: pos ? 'var(--accent)' : 'var(--text3)', opacity: pos ? 1 : .55,
          cursor: 'pointer', flexShrink: 0 }} />
      {pos && (
        <div ref={popRef} onClick={e => e.stopPropagation()} style={{
          position: 'fixed', top: pos.top, left: pos.left,
          zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.18)', padding: '8px 10px',
          fontSize: 11, fontWeight: 400, color: 'var(--text2)', whiteSpace: 'pre-wrap',
          textAlign: 'left', minWidth: 160, maxWidth: 260,
        }}>
          {description}
        </div>
      )}
    </>
  )
}

// ── Riga transazione editabile per gli overlay (Fuori periodo / To review) ──
// Colonne: Data contabile, Data valuta, Competenza, AI descrizione, • descr. originale,
// Location, L1, L2, Importo — tutti i campi modificabili (l'importo no: tocca il saldo).
// La Competenza è la data usata per stabilire se la spesa cade dentro/fuori un periodo
// vacanza (vedi effDate() sopra) — editabile qui come in Transazioni.
function TxEditRow({ t, allCats, updateTransaction, children, leading }) {
  // Cambio categoria L1/L2: se la nuova L1 ha sottocategorie, NON si scrive subito
  // nello store — altrimenti la riga sparisce IMMEDIATAMENTE da questa tabella
  // (filtrata su cat1 === / !== 'Weekend e Vacanze') prima che l'utente possa
  // scegliere anche la L2 (segnalato dall'utente 2026-07-13: "seleziono la L1... la
  // transazione scompare... deve darmi tempo di selezionare anche la L2"). La
  // scelta resta "in sospeso" localmente finché l'utente sceglie una L2 (commit
  // automatico), conferma comunque senza L2 (✓), o annulla (✕). Se la L1 scelta
  // non ha sottocategorie, si scrive subito come prima (nulla da aspettare).
  const [pending, setPending] = useState(null) // { cat1, cat2 } oppure null
  const cat1Val = pending ? pending.cat1 : (t.cat1 || '')
  const cat2Val = pending ? pending.cat2 : (t.cat2 || '')
  const cat2Options = allCats[cat1Val]?.sub || []

  function chooseCat1(newCat1) {
    const hasSub = (allCats[newCat1]?.sub || []).length > 0
    if (!hasSub) {
      setPending(null)
      updateTransaction(t.txId, { cat1: newCat1, cat2: '', userEditedCat: true })
    } else {
      setPending({ cat1: newCat1, cat2: '' })
    }
  }
  function chooseCat2(newCat2) {
    if (pending) {
      updateTransaction(t.txId, { cat1: pending.cat1, cat2: newCat2, userEditedCat: true })
      setPending(null)
    } else {
      updateTransaction(t.txId, { cat2: newCat2, userEditedCat: true })
    }
  }
  function confirmPending() {
    if (!pending) return
    updateTransaction(t.txId, { cat1: pending.cat1, cat2: pending.cat2, userEditedCat: true })
    setPending(null)
  }
  function cancelPending() { setPending(null) }

  const selStyle = { padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 5,
    background: 'var(--surface)', color: 'var(--text1)', fontSize: 11, fontFamily: 'var(--font-sans)', maxWidth: 130 }
  const td = { padding: '6px 8px', fontSize: 12, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  return (
    <tr style={pending ? { background: 'var(--gold-l,#fef9e7)' } : undefined}>
      {leading !== undefined && (
        <td style={{ ...td, textAlign: 'center' }}>{leading}</td>
      )}
      <td style={td}>
        <EditCell type="date" value={t.date_reg || t.date} width={105}
          onSave={v => v && updateTransaction(t.txId, { date_reg: v })} />
      </td>
      <td style={td}>
        <EditCell type="date" value={t.date} width={105}
          onSave={v => v && updateTransaction(t.txId, { date: v, _effDate: t.competenza || v })} />
      </td>
      <td style={{ ...td, background: t.competenza ? 'var(--gold-l,#fef9e7)' : undefined }}>
        <EditCell type="date" value={t.competenza || t.date} width={105}
          title="Data competenza — usata per capire se la spesa cade dentro o fuori il periodo vacanza"
          onSave={v => v && updateTransaction(t.txId, { competenza: v === t.date ? null : v, _effDate: v })} />
      </td>
      <td style={{ ...td, fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <EditCell value={t.descAI || ''} width={130}
          onSave={v => updateTransaction(t.txId, { descAI: v || null, userEditedDesc: true })} />
      </td>
      <td style={{ ...td, textAlign: 'center' }}><OrigDot description={t.description} /></td>
      <td style={td}>
        <EditCell value={t.city || ''} width={90}
          onSave={v => updateTransaction(t.txId, { city: v || null, cityUserEdited: true })} />
      </td>
      <td style={td}>
        <select value={cat1Val} style={selStyle}
          onChange={e => chooseCat1(e.target.value)}>
          <option value="">—</option>
          {Object.keys(allCats).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select value={cat2Val} disabled={!cat2Options.length} style={{ ...selStyle, opacity: cat2Options.length ? 1 : .4 }}
            onChange={e => chooseCat2(e.target.value)}>
            <option value="">—</option>
            {cat2Options.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {pending && (
            <>
              <button onClick={confirmPending} title="Conferma categoria (anche senza L2)"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green,#16a34a)', padding: 2, display: 'flex', flexShrink: 0 }}>
                <Check size={13} />
              </button>
              <button onClick={cancelPending} title="Annulla cambio categoria"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, display: 'flex', flexShrink: 0 }}>
                <XIcon size={13} />
              </button>
            </>
          )}
        </div>
      </td>
      <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)',
        color: t.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>
        {t.amount >= 0 ? '+' : '−'}€ {fmtIT(Math.abs(t.amount), 2)}
      </td>
      {children}
    </tr>
  )
}

const OVERLAY_TH = { padding: '7px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.05em',
  textTransform: 'uppercase', color: 'var(--text3)', background: 'var(--surface2)',
  borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 1 }

// ── Overlay "Fuori periodo": spese Weekend e Vacanze non coperte da nessuna
// vacanza dichiarata — modificabili, assegnabili a una vacanza esistente (la
// competenza della spesa si sposta al primo giorno di quel periodo) o a una
// vacanza creata al volo (usa la competenza della spesa come date iniziali) ──
function FuoriPeriodoModal({ txs, vacations, allCats, transactions, updateTransaction, addVacation, updateVacation, setUndo, onClose }) {
  const [newVacFor, setNewVacFor] = useState(null) // txId per cui si sta creando una vacanza
  const [nv, setNv] = useState({ name: '', from: '', to: '' })

  function assignTo(t, vacId) {
    const d = effDate(t)
    if (vacId === '__new__') {
      setNewVacFor(t.txId)
      setNv({ name: '', from: d, to: d })
      return
    }
    // BUG TROVATO 2026-07-13 (segnalato dall'utente: "clicco assegna ma non succede
    // niente"): le vacanze create con useVacations().add() hanno id NUMERICO
    // (Date.now(), vedi useCalendarVacations.js) ma <option value={v.id}> nel DOM
    // diventa sempre una STRINGA — x.id === vacId (numero !== stringa) falliva SEMPRE
    // silenziosamente, per OGNI vacanza esistente, senza errori in console. Stesso
    // identico bug già risolto altrove (ImportWizard.jsx:356, String(v.id) === vacId)
    // ma rimasto qui. Fix: confronto sempre come stringa.
    const v = vacations.find(x => String(x.id) === String(vacId))
    if (!v) {
      console.warn('[assignTo] vacanza non trovata per id', vacId, '— nessuna modifica applicata')
      return
    }
    // Valori PRIMA della modifica — servono per il bottone "Annulla" dello snackbar
    const prevCompetenza = t.competenza ?? null
    const prevEffDate    = t._effDate ?? t.date
    const prevCat2       = t.cat2 ?? null
    // Allinea la spesa al periodo esistente spostandone la competenza al primo giorno
    // della vacanza (richiesta utente 2026-07-12) — non si estendono più le date della
    // vacanza per coprire la spesa: è la spesa che si sposta nel periodo, non viceversa
    const newCompetenza = v.from === t.date ? null : v.from
    // Allinea anche la L2 (Weekend/Vacanze) al tipo REALE del periodo scelto — richiesta
    // utente 2026-07-13: "se io qui seleziono di assegnare a una vacanza ma L2 è su
    // 'weekend' sistema deve anche cambiare la L2, viceversa..." — prima si limitava a
    // spostare la competenza lasciando la L2 con qualunque valore avesse già, che poteva
    // non corrispondere più al periodo appena assegnato (es. tx con L2 "Weekend" assegnata
    // a una vacanza di 10 giorni). vacationType() è la stessa funzione condivisa usata
    // ovunque nell'app per stabilire il tipo di un periodo (rispetta anche typeOverride).
    const newCat2 = vacationType(v, transactions)
    const patch = { competenza: newCompetenza, _effDate: v.from }
    if (newCat2 !== t.cat2) patch.cat2 = newCat2
    updateTransaction(t.txId, patch)
    console.log(`[assignTo] ${t.txId}: competenza ${prevCompetenza ?? '(default)'} → ${newCompetenza ?? '(default = ' + t.date + ')'}, L2 ${prevCat2 ?? '(nessuna)'} → ${newCat2}, vacanza "${v.city || v.name}" (${v.from}–${v.to})`)
    // Conferma visibile (richiesta utente 2026-07-13: "clicco assegna ma non succede
    // niente, nessun pop up, nessuna comunicazione") — prima l'unico segnale era la
    // riga che spariva dalla tabella, facile da non notare in una lista lunga.
    // Riusa lo stesso snackbar "Annulla" già presente nella pagina (elimina/ignora).
    setUndo?.({
      label: `Spesa assegnata a "${v.city || v.name || 'vacanza'}" (${fmtDate(v.from)}–${fmtDate(v.to)})${newCat2 !== prevCat2 ? ` — L2 → ${newCat2}` : ''}`,
      onUndo: () => {
        updateTransaction(t.txId, { competenza: prevCompetenza, _effDate: prevEffDate, cat2: prevCat2 })
        setUndo?.(null)
      },
    })
  }

  function saveNewVac(t) {
    if (!nv.name.trim() || !nv.from || !nv.to) return
    addVacation({ name: nv.name.trim(), city: nv.name.trim(), from: nv.from, to: nv.to })
    setNewVacFor(null)
  }

  return (
    <Modal title={`📆 Spese Weekend e Vacanze fuori periodo (${txs.length})`} onClose={onClose} width={1170}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Spese categorizzate "Weekend e Vacanze" la cui data non cade in nessuna vacanza/weekend dichiarata.
        Modifica i campi direttamente, oppure assegna la spesa a una vacanza (la competenza si sposta al
        primo giorno di quel periodo) o creane una nuova.
      </div>
      {txs.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>✅ Tutto coperto</div>
      ) : (
        <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1010 }}>
            <thead><tr>
              {['Data cont.', 'Data valuta', 'Competenza', '✨ AI Descrizione', '•', 'Location', 'L1', 'L2', 'Importo', 'Assegna a vacanza'].map((h, i) => (
                <th key={i} style={{ ...OVERLAY_TH, textAlign: h === 'Importo' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {txs.map(t => (
                <Fragment key={t.txId}>
                  <TxEditRow t={t} allCats={allCats} updateTransaction={updateTransaction}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      <select defaultValue="" onChange={e => { assignTo(t, e.target.value); e.target.value = '' }}
                        style={{ padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 5,
                          background: 'var(--surface)', color: 'var(--text1)', fontSize: 11, maxWidth: 170, fontFamily: 'var(--font-sans)' }}>
                        <option value="">Assegna a…</option>
                        {vacations.map(v => (
                          <option key={v.id} value={v.id}>{v.city || v.name || '—'} ({fmtDate(v.from)}–{fmtDate(v.to)})</option>
                        ))}
                        <option value="__new__">➕ Nuova vacanza…</option>
                      </select>
                    </td>
                  </TxEditRow>
                  {newVacFor === t.txId && (
                    <tr>
                      <td colSpan={10} style={{ padding: '8px 10px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                          <strong>➕ Nuova vacanza:</strong>
                          <input value={nv.name} onChange={e => setNv(f => ({ ...f, name: e.target.value }))} placeholder="Nome / località"
                            style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, width: 150, fontFamily: 'var(--font-sans)' }} />
                          <input type="date" value={nv.from} onChange={e => setNv(f => ({ ...f, from: e.target.value }))}
                            style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-sans)' }} />
                          <input type="date" value={nv.to} onChange={e => setNv(f => ({ ...f, to: e.target.value }))}
                            style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-sans)' }} />
                          <button onClick={() => saveNewVac(t)} disabled={!nv.name.trim() || !nv.from || !nv.to}
                            style={{ padding: '5px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!nv.name.trim() || !nv.from || !nv.to) ? .5 : 1 }}>
                            Crea
                          </button>
                          <button onClick={() => setNewVacFor(null)}
                            style={{ padding: '5px 10px', background: 'none', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

// ── Overlay "To review": spese avvenute DURANTE una vacanza dichiarata ma NON
// categorizzate Weekend e Vacanze — mostra quale vacanza era attiva; con ✅ la
// spesa passa a Weekend e Vacanze › Weekend/Vacanze (per tipo periodo). Selezione
// multipla (checkbox a sinistra) per accettare/ignorare in blocco invece di
// dover cliccare riga per riga (richiesta utente 2026-07-13: "possibilità di
// selezionare sulla sinistra multipla e cliccare su accetta, ignora una sola
// volta e semplificare") — le azioni riga-per-riga restano comunque disponibili ──
function ToReviewModal({ rows, allCats, updateTransaction, onDismiss, onBulkDismiss, setUndo,
  neverAiDescs, onAddNever, onRemoveNever, onClose }) {
  const [selected, setSelected] = useState(new Set())
  const [showNeverPanel, setShowNeverPanel] = useState(false)
  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggleOne(txId) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(txId)) next.delete(txId); else next.add(txId)
      return next
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map(r => r.t.txId)))
  }

  function acceptSelected() {
    const targets = rows.filter(r => selected.has(r.t.txId))
    if (!targets.length) return
    const prevById = {}
    targets.forEach(({ t }) => {
      prevById[t.txId] = { cat1: t.cat1 ?? null, cat2: t.cat2 ?? null, userEditedCat: t.userEditedCat ?? false }
    })
    targets.forEach(({ t, vacType }) =>
      updateTransaction(t.txId, { cat1: 'Weekend e Vacanze', cat2: vacType, userEditedCat: true }))
    setUndo?.({
      label: `${targets.length} sp${targets.length === 1 ? 'esa spostata' : 'ese spostate'} in Weekend e Vacanze`,
      onUndo: () => {
        Object.entries(prevById).forEach(([txId, prev]) => updateTransaction(txId, prev))
        setUndo?.(null)
      },
    })
    setSelected(new Set())
  }

  function ignoreSelected() {
    const ids = [...selected]
    if (!ids.length) return
    onBulkDismiss?.(ids)
    setSelected(new Set())
  }

  return (
    <Modal title={`🚩 Spese in giorni di vacanza non allocate (${rows.length})`} onClose={onClose} width={1480}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>
          Spese avvenute mentre era in corso una vacanza/weekend dichiarata ma categorizzate altrove.
          Seleziona una o più righe a sinistra e usa i bottoni per accettarle o ignorarle tutte insieme,
          oppure agisci su una singola riga con ✅/✕. Con &quot;MAI&quot; una spesa non verrà mai più
          proposta qui in futuro, indipendentemente dalla transazione — in base alla sua descrizione AI.
        </div>
        <button onClick={() => setShowNeverPanel(true)} title='Descrizioni AI da escludere sempre da questa tabella'
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text2)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <Settings size={13} /> Escluse sempre{neverAiDescs?.length > 0 ? ` (${neverAiDescs.length})` : ''}
        </button>
      </div>
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
          <strong>{selected.size} selezionate</strong>
          <button onClick={acceptSelected}
            style={{ padding: '5px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ✅ Accetta selezionate
          </button>
          <button onClick={ignoreSelected}
            style={{ padding: '5px 12px', background: 'var(--surface)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            ✕ Ignora selezionate
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
            Deseleziona
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>✅ Niente da rivedere</div>
      ) : (
        <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1410 }}>
            <thead><tr>
              <th style={{ ...OVERLAY_TH, textAlign: 'center', width: 30 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
              </th>
              {['Data cont.', 'Data valuta', 'Competenza', '✨ AI Descrizione', '•', 'Location', 'L1', 'L2', 'Importo', 'Vacanza attiva', ''].map((h, i) => (
                <th key={i} style={{ ...OVERLAY_TH, textAlign: h === 'Importo' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(({ t, vac, vacType }) => (
                <TxEditRow key={t.txId} t={t} allCats={allCats} updateTransaction={updateTransaction}
                  leading={<input type="checkbox" checked={selected.has(t.txId)} onChange={() => toggleOne(t.txId)} style={{ cursor: 'pointer' }} />}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                      background: vacType === 'Vacanze' ? 'var(--blue-l,#e8f0fe)' : 'var(--gold-l,#fef9e7)',
                      color: vacType === 'Vacanze' ? 'var(--blue,#2563eb)' : 'var(--gold,#b45309)' }}>
                      {vac.city || vac.name || '—'}
                    </span>
                    <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{fmtDate(vac.from)}–{fmtDate(vac.to)}</span>
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    <button title={`È una spesa della vacanza → Weekend e Vacanze › ${vacType}`}
                      onClick={() => {
                        const prevCat1 = t.cat1 ?? null
                        const prevCat2 = t.cat2 ?? null
                        const prevUserEditedCat = t.userEditedCat ?? false
                        updateTransaction(t.txId, { cat1: 'Weekend e Vacanze', cat2: vacType, userEditedCat: true })
                        setUndo?.({
                          label: `Spesa spostata in Weekend e Vacanze › ${vacType}`,
                          onUndo: () => {
                            updateTransaction(t.txId, { cat1: prevCat1, cat2: prevCat2, userEditedCat: prevUserEditedCat })
                            setUndo?.(null)
                          },
                        })
                      }}
                      style={{ padding: '3px 9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', marginRight: 4 }}>
                      ✅
                    </button>
                    <button title="Non fa parte della vacanza — non riproporre"
                      onClick={() => onDismiss(t.txId)}
                      style={{ padding: '3px 9px', background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, cursor: 'pointer', marginRight: 4 }}>
                      ✕
                    </button>
                    <button title={`Escludi SEMPRE le spese con descrizione AI "${t.descAI || t.description || ''}" — non verranno mai più proposte qui`}
                      onClick={() => onAddNever?.(t.descAI || t.description)}
                      style={{ padding: '3px 8px', background: 'var(--surface2)', color: 'var(--red,#dc2626)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      MAI
                    </button>
                  </td>
                </TxEditRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showNeverPanel && (
        <NeverAiDescsModal list={neverAiDescs || []} onAdd={onAddNever} onRemove={onRemoveNever}
          onClose={() => setShowNeverPanel(false)} />
      )}
    </Modal>
  )
}

// ── Pannello "Escluse sempre": descrizioni AI (appPrefs.wv2NeverAiDescs) che non
// devono mai comparire in "Spese non allocate", indipendentemente dalla singola
// transazione — richiesta utente 2026-07-13: pannello di controllo con rotella
// impostazioni + tasto "MAI" su ogni riga per popolarlo in un click ──
function NeverAiDescsModal({ list, onAdd, onRemove, onClose }) {
  const [draft, setDraft] = useState('')
  function addDraft() {
    if (draft.trim()) { onAdd?.(draft.trim()); setDraft('') }
  }
  return (
    <Modal title="⚙️ Escludi sempre da Spese non allocate" onClose={onClose} width={440}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Le spese la cui descrizione AI corrisponde a una di queste voci non compariranno mai in
        &quot;Spese in giorni di vacanza non allocate&quot;, qualunque transazione le generi (es. Amazon,
        Affitto mese, ricariche Satispay…).
      </div>
      {list.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 12 }}>
          Nessuna esclusione permanente — usa il tasto &quot;MAI&quot; su una riga della tabella, oppure aggiungila qui.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {list.map(m => (
            <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
              borderRadius: 14, fontSize: 12, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              {m}
              <button onClick={() => onRemove?.(m)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="es. Amazon"
          onKeyDown={e => { if (e.key === 'Enter') addDraft() }}
          style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)' }} />
        <button onClick={addDraft}
          style={{ padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Aggiungi
        </button>
      </div>
    </Modal>
  )
}

// ── Impostazioni merchant vacanze (usati anche dal wizard di importazione) ──
function VacMerchantsModal({ appPrefs, setAppPref, onClose }) {
  const list = getVacationMerchants(appPrefs)
  const [draft, setDraft] = useState('')
  function save(next) { setAppPref('vacationMerchants', next) }
  return (
    <Modal title="⚙️ Merchant prenotazioni vacanze" onClose={onClose} width={440}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Quando l'import trova una spesa di uno di questi merchant (Booking, Airbnb, …), il wizard
        chiede la competenza vera e a quale vacanza collegarla.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {list.map(m => (
          <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
            borderRadius: 14, fontSize: 12, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {m}
            <button onClick={() => save(list.filter(x => x !== m))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="es. edreams"
          onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { save([...list, draft.trim().toLowerCase()]); setDraft('') } }}
          style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)' }} />
        <button onClick={() => { if (draft.trim()) { save([...list, draft.trim().toLowerCase()]); setDraft('') } }}
          style={{ padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Aggiungi
        </button>
      </div>
    </Modal>
  )
}

export default function WeekendVacanzeV2Page() {
  const transactions = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const appPrefs = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const customCats = useStore(s => s.customCats)
  const allCats = useMemo(() => getMergedCats(customCats), [customCats])
  const { vacations, add, update, remove } = useVacations()
  const { notVacationDates, mark, unmark } = useNotVacationDates()

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ dest: '', dateFrom: '', dateTo: '' })
  const [showCandidates, setShowCandidates] = useState(false)
  const [showFuori, setShowFuori] = useState(false)     // overlay spese W&V fuori periodo
  const [showReview, setShowReview] = useState(false)   // overlay spese in vacanza non allocate
  const [showMerch, setShowMerch] = useState(false)     // impostazioni merchant vacanze
  // Menu "Revisione" — i 3 bottoni Da confermare/Fuori periodo/Non allocate erano
  // separati in alto; consolidati in un unico tab a tendina (richiesta utente
  // 2026-07-13: "aggregali tutti sotto un tab dedicato, sempre lì in alto a destra")
  const [showRevisionMenu, setShowRevisionMenu] = useState(false)
  const [candCityOverride, setCandCityOverride] = useState({})
  const [candDateOverride, setCandDateOverride] = useState({}) // { candId: { from, to } }

  // Soprannomi famiglia per la colonna Utente
  const nicknames = useMemo(() => {
    const n = []
    if (appPrefs?.ownerNickname) n.push(appPrefs.ownerNickname)
    ;(appPrefs?.family || []).forEach(m => { if (m.nickname) n.push(m.nickname) })
    return n
  }, [appPrefs])

  // KPI "Fuori periodo": spese Weekend e Vacanze non coperte da NESSUNA vacanza dichiarata
  const fuoriTxs = useMemo(() =>
    transactions
      .filter(t => !t.excluded && t.amount < 0 && t.cat1 === 'Weekend e Vacanze' &&
        !findVacationForDate(effDate(t), vacations))
      .sort((a, b) => (effDate(b) || '').localeCompare(effDate(a) || ''))
  , [transactions, vacations])

  // "To review": spese avvenute DENTRO una vacanza dichiarata ma NON in Weekend e Vacanze
  // (esclusi i txId già liquidati con ✕ — persistiti in appPrefs.wv2ReviewDismissed, e
  // le spese fatte nella città di riferimento di casa — vedi isHomeCityTx sopra: sono
  // successe "a casa" durante il periodo, non sono spese della vacanza stessa)
  const reviewDismissed = appPrefs?.wv2ReviewDismissed || {}
  const homeCity = appPrefs?.homeCity
  // Descrizioni AI da escludere SEMPRE da questa tabella (pannello ⚙️ "Escluse
  // sempre" / tasto "MAI" su una riga) — a differenza di reviewDismissed (per
  // singolo txId), questa è una regola permanente su tutte le transazioni
  // future/passate con quella descAI, richiesta utente 2026-07-13.
  const neverAiDescs = appPrefs?.wv2NeverAiDescs || []
  const neverAiDescsSet = useMemo(() => new Set(neverAiDescs.map(normDesc)), [neverAiDescs])
  const reviewRows = useMemo(() =>
    transactions
      .filter(t => !t.excluded && t.amount < 0 && t.cat1 !== 'Weekend e Vacanze' &&
        !reviewDismissed[t.txId] && !isHomeCityTx(t, homeCity) &&
        !neverAiDescsSet.has(normDesc(t.descAI || t.description)))
      .map(t => {
        const vac = findVacationForDate(effDate(t), vacations)
        if (!vac) return null
        const vacType = vacationType(vac, transactions)
        return { t, vac, vacType }
      })
      .filter(Boolean)
      .sort((a, b) => (effDate(b.t) || '').localeCompare(effDate(a.t) || ''))
  , [transactions, vacations, reviewDismissed, homeCity, neverAiDescsSet])

  // Escludi una riga da "Spese non allocate" (✕) — reversibile per 8s con la
  // snackbar Annulla; l'undo rilegge appPrefs fresco da useStore.getState()
  // invece di fidarsi della chiusura di reviewDismissed, per non rischiare di
  // annullare anche eventuali altri dismiss avvenuti nel frattempo.
  function dismissReview(txId) {
    setAppPref('wv2ReviewDismissed', { ...reviewDismissed, [txId]: true })
    setUndo({
      label: 'Spesa esclusa da "Spese non allocate"',
      onUndo: () => {
        const cur = useStore.getState().appPrefs?.wv2ReviewDismissed || {}
        const { [txId]: _drop, ...rest } = cur
        setAppPref('wv2ReviewDismissed', rest)
        setUndo(null)
      },
    })
  }

  // Ignora in blocco (selezione multipla in "Spese non allocate") — un'unica
  // scrittura su appPrefs invece di N chiamate dismissReview() in sequenza (che
  // sovrascriverebbero ognuna lo stesso setUndo, lasciando visibile solo l'ultima
  // e rendendo l'Annulla inutile per le altre righe).
  function dismissReviewBulk(txIds) {
    if (!txIds.length) return
    const next = { ...reviewDismissed }
    txIds.forEach(id => { next[id] = true })
    setAppPref('wv2ReviewDismissed', next)
    setUndo({
      label: `${txIds.length} sp${txIds.length === 1 ? 'esa esclusa' : 'ese escluse'} da "Spese non allocate"`,
      onUndo: () => {
        const cur = useStore.getState().appPrefs?.wv2ReviewDismissed || {}
        const rest = { ...cur }
        txIds.forEach(id => { delete rest[id] })
        setAppPref('wv2ReviewDismissed', rest)
        setUndo(null)
      },
    })
  }

  // Pannello "Escluse sempre" (⚙️) + tasto "MAI" su una riga di "Spese non
  // allocate": aggiunge/rimuove una descrizione AI dalla lista permanente
  // appPrefs.wv2NeverAiDescs. Confronto/duplicati verificati con normDesc
  // (case-insensitive) per non accumulare varianti identiche della stessa voce.
  function addNeverAiDesc(desc) {
    const d = (desc || '').trim()
    if (!d) return
    const key = normDesc(d)
    if (neverAiDescsSet.has(key)) return // già presente, nulla da fare
    setAppPref('wv2NeverAiDescs', [...neverAiDescs, d])
    setUndo({
      label: `"${d}" esclusa sempre da "Spese non allocate"`,
      onUndo: () => {
        const cur = useStore.getState().appPrefs?.wv2NeverAiDescs || []
        setAppPref('wv2NeverAiDescs', cur.filter(x => normDesc(x) !== key))
        setUndo(null)
      },
    })
  }
  function removeNeverAiDesc(desc) {
    const key = normDesc(desc)
    setAppPref('wv2NeverAiDescs', neverAiDescs.filter(x => normDesc(x) !== key))
  }
  const [selectedCand, setSelectedCand] = useState(new Set())
  const [mergeName, setMergeName] = useState('')
  const [undo, setUndo] = useState(null) // { label, onUndo }
  const [expandedId, setExpandedId] = useState(null) // id vacanza espansa (drill-down spese)
  const [recatTx, setRecatTx] = useState(null) // { tx } — spesa in attesa di nuova categoria prima di essere tolta dalla vacanza
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Conferma la ricategorizzazione: la spesa esce da "Weekend e Vacanze" verso la
  // nuova categoria scelta dall'utente, marcata userEditedCat perché non venga
  // ri-agganciata automaticamente dalle regole di categorizzazione
  function confirmRecategorize(cat1, cat2) {
    if (!recatTx || !cat1) return
    updateTransaction(recatTx.txId, { cat1, cat2: cat2 || null, userEditedCat: true })
    setRecatTx(null)
  }

  // Snackbar "Annulla" — resta visibile 8s dopo un'eliminazione/ignora, poi scompare
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 8000)
    return () => clearTimeout(t)
  }, [undo])

  function toggleCand(id) {
    setSelectedCand(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function closeCandidatesPanel() {
    setShowCandidates(false)
    setSelectedCand(new Set())
    setMergeName('')
  }

  // Solo le vacanze/weekend CONFERMATE dall'utente (appPrefs.calendarVacations) — le
  // candidate auto-rilevate ma non confermate NON compaiono più qui, vanno prima
  // confermate dal pannello "🔍 Da confermare" (computeCandidateVacations)
  const confirmed = useMemo(
    () => vacations.map(v => ({ ...v, declared: true })),
    [vacations]
  )

  // Candidate: giorni con spesa "Weekend e Vacanze" non ancora coperti da un periodo
  // dichiarato né esclusi — raggruppati per vicinanza di date E stessa località
  const allCandidates = useMemo(
    () => computeCandidateVacations(transactions, vacations, notVacationDates),
    [transactions, vacations, notVacationDates]
  )
  // Solo candidate CON una località (richiesta utente 2026-07-12: niente vacanze
  // proposte senza nome — quelle senza location non vengono presentate)
  const candidates = useMemo(
    () => allCandidates.filter(c => ((c.city || '')).trim()),
    [allCandidates]
  )
  // Conteggio totale per il badge del tab "Revisione" consolidato
  const revisionTotal = candidates.length + fuoriTxs.length + reviewRows.length

  function upd(v, field, value) {
    update(v.id, { [field]: value })
  }

  // "Elimina" = segna tutti i giorni del periodo come "non vacanza" (flagga le eventuali
  // transazioni Weekend e Vacanze per la revisione competenza) + rimuove il record dichiarato.
  // Reversibile per 8s tramite la snackbar "Annulla" (setUndo)
  function removeRow(v) {
    const dates = allDatesBetween(v.from, v.to)
    mark(dates)
    remove(v.id)
    setUndo({
      label: `Vacanza "${v.city || v.name || 'senza nome'}" eliminata`,
      onUndo: () => {
        unmark(dates)
        add({ name: v.name || 'Weekend e Vacanze', from: v.from, to: v.to, city: v.city, destType: v.destType })
        setUndo(null)
      }
    })
  }

  // Rimuove TUTTE le esclusioni "non vacanza" — utile se una vacanza confermata è stata
  // eliminata per sbaglio più di 8s fa e non è più recuperabile con "Annulla": i giorni
  // tornano candidati (se hanno ancora spese "Weekend e Vacanze" non coperte da un periodo dichiarato)
  function restoreAllExcluded() {
    if (!notVacationDates.length) return
    const ok = window.confirm(`Ripristinare ${notVacationDates.length} giorni esclusi? Torneranno a comparire come candidate da confermare (se hanno ancora spese "Weekend e Vacanze").`)
    if (!ok) return
    unmark(notVacationDates)
  }

  function save() {
    if (!form.dateFrom || !form.dateTo) return
    add({ name: 'Weekend e Vacanze', from: form.dateFrom, to: form.dateTo, city: form.dest })
    setShowAdd(false)
    setForm({ dest: '', dateFrom: '', dateTo: '' })
  }

  function confirmCandidate(cand) {
    const city = candCityOverride[cand.id] ?? cand.city ?? ''
    // Date modificabili nel pannello (richiesta utente 2026-07-12)
    const from = candDateOverride[cand.id]?.from || cand.from
    const to   = candDateOverride[cand.id]?.to   || cand.to
    add({ name: 'Weekend e Vacanze', from, to, city })
    setCandCityOverride(o => { const n = { ...o }; delete n[cand.id]; return n })
    setCandDateOverride(o => { const n = { ...o }; delete n[cand.id]; return n })
  }

  function ignoreCandidate(cand) {
    mark(cand.dates)
    setUndo({
      label: `Candidata "${cand.city || cand.type}" ignorata`,
      onUndo: () => { unmark(cand.dates); setUndo(null) }
    })
  }

  // Unisce 2+ candidate selezionate (es. Ammarnas + Sorsele + Stockholm-Arl) in
  // un'unica vacanza confermata con un nome comune (es. "Svezia") — utile quando
  // lo stesso viaggio tocca più località/aeroporti diversi giorno per giorno
  function mergeSelected() {
    const sel = candidates.filter(c => selectedCand.has(c.id))
    if (sel.length < 2 || !mergeName.trim()) return
    const from = sel.reduce((m, c) => (!m || c.from < m) ? c.from : m, null)
    const to = sel.reduce((m, c) => (!m || c.to > m) ? c.to : m, null)
    add({ name: mergeName.trim(), from, to, city: mergeName.trim() })
    setSelectedCand(new Set())
    setMergeName('')
  }

  // Sort: within each year, by from desc
  const sorted = useMemo(() => {
    return [...confirmed].sort((a, b) => {
      const ya = getYear(a) || 0
      const yb = getYear(b) || 0
      if (ya !== yb) return yb - ya
      return (b.from || '').localeCompare(a.from || '')
    })
  }, [confirmed])

  const byYear = useMemo(() => {
    const groups = {}
    sorted.forEach(v => {
      const yr = getYear(v)
      const key = yr ? String(yr) : '—'
      if (!groups[key]) groups[key] = []
      groups[key].push(v)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [sorted])

  // ── Statistiche ultimi 5 anni (solo vacanze confermate) ──────────────────
  const years5 = useMemo(() => {
    const y = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => String(y - 4 + i))
  }, [])

  const last5 = useMemo(
    () => confirmed.filter(v => years5.includes(String(getYear(v)))),
    [confirmed, years5]
  )

  const barData = useMemo(() => {
    const byY = {}
    years5.forEach(y => { byY[y] = { year: y, Weekend: 0, Vacanze: 0 } })
    last5.forEach(v => {
      const yr = String(getYear(v))
      const type = vacationType(v, transactions)
      byY[yr][type] += vacationTotalCost(transactions, v)
    })
    return years5.map(y => byY[y])
  }, [last5, transactions, years5])

  // Giorni totali (Weekend/Vacanze) per anno — da/a inclusi, quindi notti+1
  const barDaysData = useMemo(() => {
    const byY = {}
    years5.forEach(y => { byY[y] = { year: y, Weekend: 0, Vacanze: 0 } })
    last5.forEach(v => {
      const yr = String(getYear(v))
      const type = vacationType(v, transactions)
      byY[yr][type] += nightsBetween(v.from, v.to) + 1
    })
    return years5.map(y => byY[y])
  }, [last5, transactions, years5])

  const pieData = useMemo(() => {
    const counts = {}
    last5.forEach(v => {
      const label = v.destType || destCategoryLabel(v.city)
      counts[label] = (counts[label] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [last5])

  const avgCost = useMemo(() => {
    if (!last5.length) return 0
    const tot = last5.reduce((s, v) => s + vacationTotalCost(transactions, v), 0)
    return tot / last5.length
  }, [last5, transactions])

  const weekendCount = last5.filter(v => vacationType(v, transactions) === 'Weekend').length
  const vacanzeCount = last5.length - weekendCount

  // Etichette totale in cima alle barre impilate (Weekend+Vacanze) — usate come LabelList content
  function SpendTotalLabel({ x, y, width, index }) {
    const total = (barData[index]?.Weekend || 0) + (barData[index]?.Vacanze || 0)
    if (!total) return null
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text2)" style={{ pointerEvents: 'none' }}>
        {`€ ${fmtIT(Math.round(total))}`}
      </text>
    )
  }
  function DaysTotalLabel({ x, y, width, index }) {
    const total = (barDaysData[index]?.Weekend || 0) + (barDaysData[index]?.Vacanze || 0)
    if (!total) return null
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text2)" style={{ pointerEvents: 'none' }}>
        {`${total} gg`}
      </text>
    )
  }

  const thStyle = {
    padding: '8px 10px', fontSize: 11, fontWeight: 700,
    color: 'var(--text3)', textAlign: 'left',
    letterSpacing: '.04em', whiteSpace: 'nowrap',
    borderBottom: '2px solid var(--border)'
  }
  const tdStyle = {
    padding: '7px 10px', fontSize: 13,
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
  }
  const numTd = { ...tdStyle, textAlign: 'right' }
  const inp = { padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text1)', fontSize: 13 }

  // Voci del menu a tendina "Revisione"
  const revisionMenuItemStyle = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
    background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, color: 'var(--text1)', textAlign: 'left', fontFamily: 'var(--font-sans)',
  }
  const revisionBadgeStyle = (color, bg) => ({
    flexShrink: 0, fontSize: 11, fontWeight: 700, color, background: bg,
    padding: '1px 7px', borderRadius: 10,
  })

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>✈️ Weekend e Vacanze v2</h1>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
            Solo vacanze confermate — sincronizzato con Calendario &gt; Vacanze
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Revisione — consolida i 3 pannelli "Da confermare" / "Fuori periodo" /
              "Non allocate" (ex "To review", rinominato per coerenza col titolo del
              modale stesso) sotto un unico tab a tendina in alto a destra (richiesta
              utente 2026-07-13: "aggregali tutti sotto un tab dedicato"). */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowRevisionMenu(s => !s)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                background: revisionTotal ? 'rgba(220,50,50,.08)' : 'var(--surface2)',
                color: revisionTotal ? 'var(--red)' : 'var(--text3)',
                border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              🔎 Revisione {revisionTotal > 0 && `(${revisionTotal})`} <ChevronDown size={13} style={{ transform: showRevisionMenu ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }} />
            </button>
            {showRevisionMenu && (
              <>
                <div onClick={() => setShowRevisionMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
                <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 999, background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                  minWidth: 280, padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button onClick={() => { setShowCandidates(true); setShowRevisionMenu(false) }} style={revisionMenuItemStyle}>
                    <Search size={14} style={{ color: 'var(--gold,#b45309)', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>Vacanze e weekend da confermare</span>
                    {candidates.length > 0 && <span style={revisionBadgeStyle('var(--gold,#b45309)', 'var(--gold-l,#fef9e7)')}>{candidates.length}</span>}
                  </button>
                  <button onClick={() => { setShowFuori(true); setShowRevisionMenu(false) }} style={revisionMenuItemStyle}>
                    <span style={{ flexShrink: 0 }}>📆</span>
                    <span style={{ flex: 1 }}>Spese fuori periodo</span>
                    {fuoriTxs.length > 0 && <span style={revisionBadgeStyle('var(--blue,#2563eb)', 'var(--blue-l,#e8f0fe)')}>{fuoriTxs.length}</span>}
                  </button>
                  <button onClick={() => { setShowReview(true); setShowRevisionMenu(false) }} style={revisionMenuItemStyle}>
                    <span style={{ flexShrink: 0 }}>🚩</span>
                    <span style={{ flex: 1 }}>Spese non allocate</span>
                    {reviewRows.length > 0 && <span style={revisionBadgeStyle('var(--red)', 'rgba(220,50,50,.08)')}>{reviewRows.length}</span>}
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setShowAdd(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            <Plus size={14} /> Aggiungi
          </button>
          <button onClick={() => setShowMerch(true)} title="Merchant prenotazioni vacanze (Booking, Airbnb, …) — usati dal wizard di importazione"
            style={{ padding: '7px 10px', background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            ⚙️
          </button>
        </div>
      </div>

      {/* Statistiche ultimi 5 anni */}
      {confirmed.length > 0 && (
        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', padding: 16, marginBottom: 20 }}>
          {/* Legenda colori — Tipo (Weekend/Vacanze) + Mare/Montagna/Città/Altro */}
          <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 11, color: 'var(--text3)', paddingBottom: 4, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            {Object.entries(TYPE_COLORS).map(([label, color]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} />
                {label}
              </span>
            ))}
            <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
            {Object.entries(PIE_COLORS).map(([label, color]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {label}
              </span>
            ))}
          </div>
          <div style={{ minWidth: 180 }}>
            <div className="uscite-chart-title" style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>Spesa Weekend vs Vacanze ({years5[0]}–{years5[4]})</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} margin={{ top: 22, right: 6, left: 0, bottom: 0 }} barCategoryGap="28%">
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={{ stroke: '#e0dcd8' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={32}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip formatter={(value, name) => [`€ ${fmtIT(Math.round(value))}`, name]} />
                <Bar dataKey="Weekend" stackId="a" fill={TYPE_COLORS.Weekend} radius={[0, 0, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Vacanze" stackId="a" fill={TYPE_COLORS.Vacanze} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList content={<SpendTotalLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ minWidth: 180 }}>
            <div className="uscite-chart-title" style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>Giorni di vacanza per anno ({years5[0]}–{years5[4]})</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barDaysData} margin={{ top: 22, right: 6, left: 0, bottom: 0 }} barCategoryGap="28%">
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={{ stroke: '#e0dcd8' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip formatter={(value, name) => [`${value} giorni`, name]} />
                <Bar dataKey="Weekend" stackId="a" fill={TYPE_COLORS.Weekend} radius={[0, 0, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Vacanze" stackId="a" fill={TYPE_COLORS.Vacanze} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList content={<DaysTotalLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {pieData.length > 0 && (
            <div style={{ minWidth: 150 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>Mare / Montagna / Città</div>
              <PieChart width={150} height={140}>
                <Pie data={pieData} dataKey="value" nameKey="name" cx={70} cy={68} innerRadius={30} outerRadius={58} isAnimationActive={false}>
                  {pieData.map(entry => <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#94a3b8'} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} viaggi`, name]} />
              </PieChart>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 'auto' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '.04em' }}>COSTO MEDIO</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>€ {fmtIT(Math.round(avgCost))}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              <span style={{ color: TYPE_COLORS.Weekend, fontWeight: 700 }}>{weekendCount}</span> weekend · <span style={{ color: TYPE_COLORS.Vacanze, fontWeight: 700 }}>{vacanzeCount}</span> vacanze
            </div>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3, fontWeight: 600 }}>Dove</div>
            <input value={form.dest} onChange={e => setField('dest', e.target.value)} style={{ ...inp, width: 160 }} placeholder="es. Sestri Levante" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3, fontWeight: 600 }}>Da</div>
            <input type="date" value={form.dateFrom} onChange={e => setField('dateFrom', e.target.value)} style={{ ...inp, width: 130 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3, fontWeight: 600 }}>A</div>
            <input type="date" value={form.dateTo} onChange={e => setField('dateTo', e.target.value)} style={{ ...inp, width: 130 }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save} disabled={!form.dateFrom || !form.dateTo} style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: (!form.dateFrom || !form.dateTo) ? 0.5 : 1 }}>Salva</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '7px 10px', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {confirmed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✈️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text1)' }}>Nessuna vacanza confermata</div>
          <div style={{ fontSize: 13 }}>
            Dichiara una vacanza dal Calendario (modalità 🌴 Vacanze), clicca "Aggiungi" qui,
            {candidates.length > 0 ? ` oppure conferma una delle ${candidates.length} candidate rilevate.` : ' oppure attendi che l\'AI ne rilevi qualcuna dalle spese.'}
          </div>
        </div>
      ) : (
        byYear.map(([year, vacs]) => {
          const yearSpend = vacs.reduce((s, v) => s + vacationTotalCost(transactions, v), 0)

          return (
            <div key={year} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{year === '—' ? 'Senza data' : year}</div>
                {yearSpend > 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>Spese TX: <strong style={{ color: 'var(--text1)' }}>€ {fmtIT(yearSpend, 0)}</strong></div>}
              </div>

              <div className="card" style={{ overflow: 'auto', padding: 0 }}>
                {/* tableLayout fixed + colgroup identico per ogni anno: prima le tabelle
                    dei vari anni auto-dimensionavano le colonne in modo diverso e
                    risultavano disallineate tra loro (segnalazione utente, screenshot 2023) */}
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 980 }}>
                  <colgroup>
                    <col style={{ width: 90 }} />{/* Tipo */}
                    <col style={{ width: 40 }} />{/* emoji */}
                    <col />{/* DOVE — prende lo spazio rimanente */}
                    <col style={{ width: 112 }} />{/* Da */}
                    <col style={{ width: 112 }} />{/* A */}
                    <col style={{ width: 110 }} />{/* Utente */}
                    <col style={{ width: 64 }} />{/* Giorni */}
                    <col style={{ width: 64 }} />{/* Notti */}
                    <col style={{ width: 92 }} />{/* Spese TX */}
                    <col style={{ width: 104 }} />{/* Costo/giorno */}
                    <col style={{ width: 40 }} />{/* del */}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}></th>
                      <th style={thStyle}>DOVE</th>
                      <th style={thStyle}>Da</th>
                      <th style={thStyle}>A</th>
                      <th style={thStyle}>Utente</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Giorni</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Notti</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Spese TX</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Costo/giorno</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacs.map(v => {
                      const nights = nightsBetween(v.from, v.to)
                      const giorni = nights + 1
                      const type = vacationType(v, transactions)
                      const spend = vacationTotalCost(transactions, v)
                      const destType = v.destType || destCategoryLabel(v.city)
                      const costPerGiorno = spend > 0 ? spend / Math.max(giorni, 1) : 0
                      const isOpen = expandedId === v.id

                      // Spese "Weekend e Vacanze" nel periodo di questa vacanza — drill-down,
                      // calcolato come plain filter (no useMemo, siamo dentro una .map())
                      const vacTxs = isOpen
                        ? (transactions || [])
                            .filter(t => !t.excluded && t.cat1 === 'Weekend e Vacanze' && t.amount < 0)
                            .filter(t => { const d = t._effDate || t.date; return d && d >= v.from && d <= v.to })
                            .sort((a, b) => (a._effDate || a.date || '').localeCompare(b._effDate || b.date || ''))
                        : []

                      return (
                        <Fragment key={v.id}>
                          <tr onClick={() => setExpandedId(isOpen ? null : v.id)}
                            style={{ transition: 'background .1s', cursor: 'pointer', background: isOpen ? 'var(--surface2)' : undefined }}
                            onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--surface2)' }}
                            onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = '' }}>
                            {/* Tipo — derivato (cat2 dominante delle transazioni, o durata come fallback)
                                ma ora sovrascrivibile a mano: click sul badge per cambiare Weekend↔Vacanze
                                (richiesta utente 2026-07-13: "utente può cambiare da weekend a vacanza
                                cliccandoci sopra"). Scrive v.typeOverride, letto con priorità da
                                vacationType() — unico punto di calcolo del tipo in tutta l'app. */}
                            <td style={tdStyle}>
                              <span onClick={e => { e.stopPropagation(); upd(v, 'typeOverride', type === 'Vacanze' ? 'Weekend' : 'Vacanze') }}
                                title="Clicca per cambiare tipo (Weekend / Vacanze)"
                                style={{
                                  fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
                                  borderBottom: '1px dashed currentColor',
                                  background: type === 'Vacanze' ? 'var(--blue-l,#e8f0fe)' : 'var(--gold-l,#fef9e7)',
                                  color: type === 'Vacanze' ? 'var(--blue,#2563eb)' : 'var(--gold,#b45309)'
                                }}>{type}</span>
                            </td>
                            {/* Emoji destinazione — senza header, solo icona.
                                NOTA: niente stopPropagation sul td — la riga è tutta
                                cliccabile (richiesta utente), si ferma solo il click
                                sugli elementi editabili veri (EditCell/select) */}
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <DestTypeSelect value={destType} onSave={val => upd(v, 'destType', val)} />
                            </td>
                            {/* DOVE */}
                            <td style={{ ...tdStyle, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <EditCell value={v.city} onSave={val => upd(v, 'city', val)} width={110} />
                            </td>
                            {/* Date */}
                            <td style={tdStyle}>
                              <EditCell value={v.from || ''} type="date" onSave={val => upd(v, 'from', val)} width={106} />
                            </td>
                            <td style={tdStyle}>
                              <EditCell value={v.to || ''} type="date" onSave={val => upd(v, 'to', val)} width={106} />
                            </td>
                            {/* Utente: uno dei soprannomi, o entrambi */}
                            <td style={tdStyle}>
                              <select
                                value={(v.users?.length >= 2) ? '__both__' : (v.users?.[0] || '')}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                  const val = e.target.value
                                  upd(v, 'users', val === '__both__' ? nicknames : (val ? [val] : []))
                                }}
                                style={{ border: '1px solid transparent', background: 'transparent', cursor: 'pointer',
                                  fontSize: 12, fontFamily: 'var(--font-sans)', color: v.users?.length ? 'var(--accent)' : 'var(--text3)',
                                  fontWeight: v.users?.length ? 700 : 400, maxWidth: 100 }}>
                                <option value="">—</option>
                                {nicknames.map(n => <option key={n} value={n}>{n}</option>)}
                                {nicknames.length >= 2 && <option value="__both__">Entrambi</option>}
                              </select>
                            </td>
                            {/* Giorni */}
                            <td style={numTd}>{giorni}</td>
                            {/* Notti */}
                            <td style={numTd}>{nights}</td>
                            {/* Spese TX */}
                            <td style={{ ...numTd, color: spend > 0 ? 'var(--text1)' : 'var(--text3)' }}>
                              {spend > 0 ? `€ ${fmtIT(spend, 0)}` : '—'}
                            </td>
                            {/* Costo/giorno */}
                            <td style={{ ...numTd, color: costPerGiorno > 0 ? 'var(--text1)' : 'var(--text3)' }}>
                              {costPerGiorno > 0 ? `€ ${fmtIT(costPerGiorno, 0)}` : '—'}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <button onClick={e => { e.stopPropagation(); removeRow(v) }} title="Elimina / segna come non vacanza" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${v.id}-detail`}>
                              <td colSpan={11} style={{ padding: 0, background: 'var(--bg2, #f7f5f2)', borderBottom: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                                <div style={{ padding: '8px 16px 12px' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 2px' }}>
                                    Spese "Weekend e Vacanze" in questo periodo
                                  </div>
                                  {vacTxs.length === 0 && (
                                    <div style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 8px' }}>Nessuna spesa categorizzata in questo periodo.</div>
                                  )}
                                  {vacTxs.map(t => (
                                    <VacationTxRow key={t.txId} t={t} onDeleteRequest={tx => setRecatTx(tx)} />
                                  ))}
                                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '10px 0 2px' }}>
                                    Costi manuali (aggiunti al totale vacanza)
                                  </div>
                                  <ManualCostRow icon="⛽" label="Carburante" value={v.manualCarburante} onSave={val => upd(v, 'manualCarburante', val)} />
                                  <ManualCostRow icon="🛣️" label="Autostrada" value={v.manualAutostrada} onSave={val => upd(v, 'manualAutostrada', val)} />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {/* Modale ricategorizzazione: richiesta prima di togliere una spesa dalla vacanza */}
      {recatTx && (
        <RecategorizeModal tx={recatTx} onConfirm={confirmRecategorize} onClose={() => setRecatTx(null)} />
      )}

      {/* Overlay spese Weekend e Vacanze fuori da ogni periodo dichiarato */}
      {showFuori && (
        <FuoriPeriodoModal txs={fuoriTxs} vacations={sorted} allCats={allCats} transactions={transactions}
          updateTransaction={updateTransaction} addVacation={add} updateVacation={update}
          setUndo={setUndo} onClose={() => setShowFuori(false)} />
      )}

      {/* Overlay spese in giorni di vacanza non allocate in Weekend e Vacanze */}
      {showReview && (
        <ToReviewModal rows={reviewRows} allCats={allCats}
          updateTransaction={updateTransaction} onDismiss={dismissReview} onBulkDismiss={dismissReviewBulk}
          neverAiDescs={neverAiDescs} onAddNever={addNeverAiDesc} onRemoveNever={removeNeverAiDesc}
          setUndo={setUndo} onClose={() => setShowReview(false)} />
      )}

      {/* Impostazioni merchant vacanze (Booking, Airbnb, …) */}
      {showMerch && (
        <VacMerchantsModal appPrefs={appPrefs} setAppPref={setAppPref} onClose={() => setShowMerch(false)} />
      )}

      {/* Pannello "Vacanze da confermare" */}
      {showCandidates && (
        <Modal title="🔍 Vacanze e weekend da confermare" onClose={closeCandidatesPanel} width={960}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
            Rilevati dalle spese categorizzate "Weekend e Vacanze": giorni vicini nella stessa località sono già uniti in una riga.
            Conferma per farli comparire nella tabella, oppure ignora se non è una vacanza. Se lo stesso viaggio tocca più
            località (es. tappe diverse in Svezia), spunta le righe interessate e uniscile con un nome comune.
            {notVacationDates.length > 0 && (
              <>
                {' '}Hai eliminato o ignorato qualcosa per sbaglio?{' '}
                <span onClick={restoreAllExcluded} style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
                  🔄 Ripristina tutti i giorni esclusi ({notVacationDates.length})
                </span>
              </>
            )}
          </div>
          {selectedCand.size >= 2 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>🔗 {selectedCand.size} selezionate</span>
              <input
                value={mergeName}
                onChange={e => setMergeName(e.target.value)}
                placeholder="Nome vacanza, es. Svezia"
                style={{ ...inp, width: 180 }}
              />
              <button onClick={mergeSelected} disabled={!mergeName.trim()} style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: mergeName.trim() ? 1 : 0.5 }}>
                Unisci in una vacanza
              </button>
              <button onClick={() => setSelectedCand(new Set())} style={{ padding: '6px 10px', background: 'none', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                Annulla selezione
              </button>
            </div>
          )}
          <div style={{ maxHeight: '55vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {candidates.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 13 }}>Nessuna candidata al momento 🎉</div>
            )}
            {candidates.map(cand => {
              const emoji = destCategoryEmoji(candCityOverride[cand.id] ?? cand.city)
              return (
                <div key={cand.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: selectedCand.has(cand.id) ? '1px solid var(--accent)' : '1px solid var(--border)', background: selectedCand.has(cand.id) ? 'var(--surface2)' : 'transparent', borderRadius: 8, flexWrap: 'nowrap', minWidth: 'max-content' }}>
                  <input
                    type="checkbox"
                    checked={selectedCand.has(cand.id)}
                    onChange={() => toggleCand(cand.id)}
                    title="Seleziona per unire con altre candidate"
                    style={{ flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700, flexShrink: 0,
                    background: cand.type === 'Vacanze' ? 'var(--blue-l,#e8f0fe)' : 'var(--gold-l,#fef9e7)',
                    color: cand.type === 'Vacanze' ? 'var(--blue,#2563eb)' : 'var(--gold,#b45309)'
                  }}>{cand.type}</span>
                  <span>{emoji}</span>
                  <input
                    value={candCityOverride[cand.id] ?? cand.city ?? ''}
                    onChange={e => setCandCityOverride(o => ({ ...o, [cand.id]: e.target.value }))}
                    placeholder="Dove"
                    style={{ ...inp, width: 130, flexShrink: 0 }}
                  />
                  {/* Date modificabili prima della conferma */}
                  <input type="date" value={candDateOverride[cand.id]?.from || cand.from || ''}
                    onChange={e => setCandDateOverride(o => ({ ...o, [cand.id]: { ...(o[cand.id] || {}), from: e.target.value } }))}
                    style={{ ...inp, width: 125, flexShrink: 0, fontSize: 12, padding: '4px 6px' }} />
                  <span style={{ color: 'var(--text3)', flexShrink: 0 }}>→</span>
                  <input type="date" value={candDateOverride[cand.id]?.to || cand.to || ''}
                    onChange={e => setCandDateOverride(o => ({ ...o, [cand.id]: { ...(o[cand.id] || {}), to: e.target.value } }))}
                    style={{ ...inp, width: 125, flexShrink: 0, fontSize: 12, padding: '4px 6px' }} />
                  <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>€ {fmtIT(cand.spend, 0)}</span>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button onClick={() => confirmCandidate(cand)} title="Confermo, è una vacanza/weekend" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <Check size={12} /> Confermo
                    </button>
                    <button onClick={() => ignoreCandidate(cand)} title="Non è una vacanza" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                      <XIcon size={12} /> Ignora
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {/* Snackbar "Annulla" — dopo elimina riga o ignora candidata, per 8s */}
      {undo && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          background: 'var(--text1)', color: 'var(--surface)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 3000, fontSize: 13
        }}>
          <span>{undo.label}</span>
          <button onClick={undo.onUndo} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 13, padding: 0 }}>
            Annulla
          </button>
          <button onClick={() => setUndo(null)} title="Chiudi" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, padding: 0, display: 'flex' }}>
            <XIcon size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
