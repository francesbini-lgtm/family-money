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
  DEST_TYPES, labelToEmoji,
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
      onClick={() => { setEditing(true); setVal(String(value ?? '')) }}
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

export default function WeekendVacanzeV2Page() {
  const transactions = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const { vacations, add, update, remove } = useVacations()
  const { notVacationDates, mark, unmark } = useNotVacationDates()

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ dest: '', dateFrom: '', dateTo: '' })
  const [showCandidates, setShowCandidates] = useState(false)
  const [candCityOverride, setCandCityOverride] = useState({})
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
  const candidates = useMemo(
    () => computeCandidateVacations(transactions, vacations, notVacationDates),
    [transactions, vacations, notVacationDates]
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
    add({ name: 'Weekend e Vacanze', from: cand.from, to: cand.to, city })
    setCandCityOverride(o => { const n = { ...o }; delete n[cand.id]; return n })
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCandidates(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: candidates.length ? 'var(--gold-l,#fef9e7)' : 'var(--surface2)', color: candidates.length ? 'var(--gold,#b45309)' : 'var(--text3)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            <Search size={14} /> Da confermare {candidates.length > 0 && `(${candidates.length})`}
          </button>
          <button onClick={() => setShowAdd(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            <Plus size={14} /> Aggiungi
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
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}></th>
                      <th style={thStyle}>DOVE</th>
                      <th style={thStyle}>Da</th>
                      <th style={thStyle}>A</th>
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
                            {/* Emoji destinazione — senza header, solo icona */}
                            <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <DestTypeSelect value={destType} onSave={val => upd(v, 'destType', val)} />
                            </td>
                            {/* DOVE */}
                            <td style={{ ...tdStyle, fontWeight: 700 }} onClick={e => e.stopPropagation()}>
                              <EditCell value={v.city} onSave={val => upd(v, 'city', val)} width={110} />
                            </td>
                            {/* Date */}
                            <td style={tdStyle} onClick={e => e.stopPropagation()}>
                              <EditCell value={v.from || ''} type="date" onSave={val => upd(v, 'from', val)} width={110} />
                            </td>
                            <td style={tdStyle} onClick={e => e.stopPropagation()}>
                              <EditCell value={v.to || ''} type="date" onSave={val => upd(v, 'to', val)} width={110} />
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
                            <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => removeRow(v)} title="Elimina / segna come non vacanza" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${v.id}-detail`}>
                              <td colSpan={10} style={{ padding: 0, background: 'var(--bg2, #f7f5f2)', borderBottom: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
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

      {/* Pannello "Vacanze da confermare" */}
      {showCandidates && (
        <Modal title="🔍 Vacanze e weekend da confermare" onClose={closeCandidatesPanel} width={640}>
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
          <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {candidates.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 13 }}>Nessuna candidata al momento 🎉</div>
            )}
            {candidates.map(cand => {
              const emoji = destCategoryEmoji(candCityOverride[cand.id] ?? cand.city)
              return (
                <div key={cand.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: selectedCand.has(cand.id) ? '1px solid var(--accent)' : '1px solid var(--border)', background: selectedCand.has(cand.id) ? 'var(--surface2)' : 'transparent', borderRadius: 8, flexWrap: 'wrap' }}>
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
                  <span style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>{fmtDate(cand.from)} → {fmtDate(cand.to)}</span>
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
