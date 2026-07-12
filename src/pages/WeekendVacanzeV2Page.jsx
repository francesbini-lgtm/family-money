import { useState, useMemo, useEffect, Fragment } from 'react'
import { useStore } from '../store/useStore'
import { Plus, Trash2, Search, Check, X as XIcon, ChevronDown, ChevronRight } from 'lucide-react'
import { fmtIT } from '../utils/format'
import Modal from '../components/Modal'
import { getMergedCats } from '../data/categories'
import { useVacations, useNotVacationDates } from '../hooks/useCalendarVacations'
import {
  vacationTotalCost, allDatesBetween, dominantVacationType,
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

const PIE_COLORS = { Mare: '#0ea5e9', Montagna: '#16a34a', Città: '#b45309', Altro: '#94a3b8' }
const TYPE_COLORS = { Vacanze: '#2563eb', Weekend: '#b45309' }

// ── Editable cell: text/date — click to edit ──────────────
function EditCell({ value, onSave, type = 'text', width = 100, placeholder = '—', align = 'left' }) {
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
      title="Clicca per modificare"
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

// Puntino descrizione originale (come in Transazioni): hover per vedere il testo
function OrigDot({ description }) {
  if (!description) return null
  return (
    <span title={description} onClick={e => e.stopPropagation()}
      style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: 'var(--text3)', opacity: .55, cursor: 'help', flexShrink: 0 }} />
  )
}

// ── Riga transazione editabile per gli overlay (Fuori periodo / To review) ──
// Colonne: Data contabile, Data valuta, AI descrizione, • descr. originale,
// Location, L1, L2, Importo — tutti i campi modificabili (l'importo no: tocca il saldo).
function TxEditRow({ t, allCats, updateTransaction, children }) {
  const cat2Options = allCats[t.cat1]?.sub || []
  const selStyle = { padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 5,
    background: 'var(--surface)', color: 'var(--text1)', fontSize: 11, fontFamily: 'var(--font-sans)', maxWidth: 130 }
  const td = { padding: '6px 8px', fontSize: 12, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  return (
    <tr>
      <td style={td}>
        <EditCell type="date" value={t.date_reg || t.date} width={105}
          onSave={v => v && updateTransaction(t.txId, { date_reg: v })} />
      </td>
      <td style={td}>
        <EditCell type="date" value={t.date} width={105}
          onSave={v => v && updateTransaction(t.txId, { date: v, _effDate: t.competenza || v })} />
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
        <select value={t.cat1 || ''} style={selStyle}
          onChange={e => updateTransaction(t.txId, { cat1: e.target.value, cat2: '', userEditedCat: true })}>
          <option value="">—</option>
          {Object.keys(allCats).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={td}>
        <select value={t.cat2 || ''} disabled={!cat2Options.length} style={{ ...selStyle, opacity: cat2Options.length ? 1 : .4 }}
          onChange={e => updateTransaction(t.txId, { cat2: e.target.value, userEditedCat: true })}>
          <option value="">—</option>
          {cat2Options.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
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
// vacanza dichiarata — modificabili, assegnabili a una vacanza (estendendone le
// date fino a coprire la spesa) o a una vacanza creata al volo ──
function FuoriPeriodoModal({ txs, vacations, allCats, updateTransaction, addVacation, updateVacation, onClose }) {
  const [newVacFor, setNewVacFor] = useState(null) // txId per cui si sta creando una vacanza
  const [nv, setNv] = useState({ name: '', from: '', to: '' })

  function assignTo(t, vacId) {
    const d = t._effDate || t.date
    if (vacId === '__new__') {
      setNewVacFor(t.txId)
      setNv({ name: '', from: d, to: d })
      return
    }
    const v = vacations.find(x => x.id === vacId)
    if (!v) return
    // Estende il periodo della vacanza per coprire la data della spesa
    const patch = {}
    if (d < v.from) patch.from = d
    if (d > v.to) patch.to = d
    if (Object.keys(patch).length) updateVacation(v.id, patch)
  }

  function saveNewVac(t) {
    if (!nv.name.trim() || !nv.from || !nv.to) return
    addVacation({ name: nv.name.trim(), city: nv.name.trim(), from: nv.from, to: nv.to })
    setNewVacFor(null)
  }

  return (
    <Modal title={`📆 Spese Weekend e Vacanze fuori periodo (${txs.length})`} onClose={onClose} width={1060}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Spese categorizzate "Weekend e Vacanze" la cui data non cade in nessuna vacanza/weekend dichiarata.
        Modifica i campi direttamente, oppure assegna la spesa a una vacanza (le date della vacanza si
        estendono per coprirla) o creane una nuova.
      </div>
      {txs.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>✅ Tutto coperto</div>
      ) : (
        <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>
              {['Data cont.', 'Data valuta', '✨ AI Descrizione', '•', 'Location', 'L1', 'L2', 'Importo', 'Assegna a vacanza'].map((h, i) => (
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
                      <td colSpan={9} style={{ padding: '8px 10px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
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
// spesa passa a Weekend e Vacanze › Weekend/Vacanze (per tipo periodo) ──
function ToReviewModal({ rows, allCats, updateTransaction, onDismiss, onClose }) {
  return (
    <Modal title={`🚩 Spese in giorni di vacanza non allocate (${rows.length})`} onClose={onClose} width={1120}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Spese avvenute mentre era in corso una vacanza/weekend dichiarata ma categorizzate altrove.
        Con ✅ la spesa passa in Weekend e Vacanze (L2 in base al tipo di periodo); con ✕ non verrà più proposta.
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>✅ Niente da rivedere</div>
      ) : (
        <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead><tr>
              {['Data cont.', 'Data valuta', '✨ AI Descrizione', '•', 'Location', 'L1', 'L2', 'Importo', 'Vacanza attiva', ''].map((h, i) => (
                <th key={i} style={{ ...OVERLAY_TH, textAlign: h === 'Importo' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(({ t, vac, vacType }) => (
                <TxEditRow key={t.txId} t={t} allCats={allCats} updateTransaction={updateTransaction}>
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
                      onClick={() => updateTransaction(t.txId, { cat1: 'Weekend e Vacanze', cat2: vacType, userEditedCat: true })}
                      style={{ padding: '3px 9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', marginRight: 4 }}>
                      ✅
                    </button>
                    <button title="Non fa parte della vacanza — non riproporre"
                      onClick={() => onDismiss(t.txId)}
                      style={{ padding: '3px 9px', background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                      ✕
                    </button>
                  </td>
                </TxEditRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
        !findVacationForDate(t._effDate || t.date, vacations))
      .sort((a, b) => (b._effDate || b.date || '').localeCompare(a._effDate || a.date || ''))
  , [transactions, vacations])

  // "To review": spese avvenute DENTRO una vacanza dichiarata ma NON in Weekend e Vacanze
  // (esclusi i txId già liquidati con ✕ — persistiti in appPrefs.wv2ReviewDismissed)
  const reviewDismissed = appPrefs?.wv2ReviewDismissed || {}
  const reviewRows = useMemo(() =>
    transactions
      .filter(t => !t.excluded && t.amount < 0 && t.cat1 !== 'Weekend e Vacanze' && !reviewDismissed[t.txId])
      .map(t => {
        const vac = findVacationForDate(t._effDate || t.date, vacations)
        if (!vac) return null
        const vacType = dominantVacationType(transactions, vac.from, vac.to)
          || (nightsBetween(vac.from, vac.to) >= 3 ? 'Vacanze' : 'Weekend')
        return { t, vac, vacType }
      })
      .filter(Boolean)
      .sort((a, b) => (b.t._effDate || b.t.date || '').localeCompare(a.t._effDate || a.t.date || ''))
  , [transactions, vacations, reviewDismissed])

  function dismissReview(txId) {
    setAppPref('wv2ReviewDismissed', { ...reviewDismissed, [txId]: true })
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
      const type = dominantVacationType(transactions, v.from, v.to) || 'Weekend'
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
      const type = dominantVacationType(transactions, v.from, v.to) || 'Weekend'
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

  const weekendCount = last5.filter(v => (dominantVacationType(transactions, v.from, v.to) || 'Weekend') === 'Weekend').length
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
          {/* To review: spese nei giorni di vacanza dichiarata NON allocate in Weekend e Vacanze */}
          <button onClick={() => setShowReview(true)} title="Spese avvenute durante una vacanza dichiarata ma categorizzate altrove"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: reviewRows.length ? 'rgba(220,50,50,.08)' : 'var(--surface2)', color: reviewRows.length ? 'var(--red)' : 'var(--text3)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            🚩 To review {reviewRows.length > 0 && `(${reviewRows.length})`}
          </button>
          {/* Fuori periodo: spese W&V non coperte da nessuna vacanza dichiarata */}
          <button onClick={() => setShowFuori(true)} title='Spese "Weekend e Vacanze" fuori da ogni periodo dichiarato'
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: fuoriTxs.length ? 'var(--blue-l,#e8f0fe)' : 'var(--surface2)', color: fuoriTxs.length ? 'var(--blue,#2563eb)' : 'var(--text3)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            📆 Fuori periodo {fuoriTxs.length > 0 && `(${fuoriTxs.length})`}
          </button>
          <button onClick={() => setShowCandidates(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: candidates.length ? 'var(--gold-l,#fef9e7)' : 'var(--surface2)', color: candidates.length ? 'var(--gold,#b45309)' : 'var(--text3)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            <Search size={14} /> Da confermare {candidates.length > 0 && `(${candidates.length})`}
          </button>
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
                      const type = dominantVacationType(transactions, v.from, v.to) || 'Weekend'
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
                            {/* Tipo (derivato dal cat2 dominante delle transazioni, non editabile) */}
                            <td style={tdStyle}>
                              <span style={{
                                fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
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
        <FuoriPeriodoModal txs={fuoriTxs} vacations={sorted} allCats={allCats}
          updateTransaction={updateTransaction} addVacation={add} updateVacation={update}
          onClose={() => setShowFuori(false)} />
      )}

      {/* Overlay spese in giorni di vacanza non allocate in Weekend e Vacanze */}
      {showReview && (
        <ToReviewModal rows={reviewRows} allCats={allCats}
          updateTransaction={updateTransaction} onDismiss={dismissReview}
          onClose={() => setShowReview(false)} />
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
