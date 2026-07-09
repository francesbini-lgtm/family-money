import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { Plus, Trash2 } from 'lucide-react'
import { fmtIT } from '../utils/format'
import { useVacations, useNotVacationDates } from '../hooks/useCalendarVacations'
import { computeVacationPeriods, vacationSpendInRange, allDatesBetween } from '../data/vacationRules'

function nightsBetween(from, to) {
  if (!from || !to) return 0
  return Math.max(0, Math.round((new Date(to) - new Date(from)) / 86400000))
}

function getYear(v) {
  if (v.from) return parseInt(v.from.slice(0, 4))
  return null
}

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

export default function WeekendVacanzeV2Page() {
  const transactions = useStore(s => s.transactions)
  const { vacations, add, update, remove } = useVacations()
  const { notVacationDates, mark } = useNotVacationDates()

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ dest: '', dateFrom: '', dateTo: '' })
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Elenco unificato: periodi dichiarati in Calendario + periodi rilevati automaticamente
  // dalle transazioni "Weekend e Vacanze" non ancora dichiarati né esclusi — vedi
  // computeVacationPeriods() in src/data/vacationRules.js. Perfettamente sincronizzato
  // con Calendario > Vacanze: stessa fonte dati (appPrefs.calendarVacations / .calendarNotVacationDates)
  const periods = useMemo(
    () => computeVacationPeriods(transactions, vacations, notVacationDates),
    [transactions, vacations, notVacationDates]
  )

  // Aggiorna un campo: se il periodo è già dichiarato, aggiorna il record; se è solo
  // "rilevato" (virtuale, non ancora in appPrefs.calendarVacations), lo crea al primo edit
  function upd(v, field, value) {
    if (v.declared) update(v.id, { [field]: value })
    else add({ name: v.name || 'Weekend e Vacanze', from: v.from, to: v.to, city: v.city, [field]: value })
  }

  // "Elimina" = segna tutti i giorni del periodo come "non vacanza" (flagga le eventuali
  // transazioni Weekend e Vacanze per la revisione competenza) + rimuove il record dichiarato se presente
  function removeRow(v) {
    mark(allDatesBetween(v.from, v.to))
    if (v.declared) remove(v.id)
  }

  function save() {
    if (!form.dateFrom || !form.dateTo) return
    add({ name: 'Weekend e Vacanze', from: form.dateFrom, to: form.dateTo, city: form.dest })
    setShowAdd(false)
    setForm({ dest: '', dateFrom: '', dateTo: '' })
  }

  // Sort: within each year, by from desc
  const sorted = useMemo(() => {
    return [...periods].sort((a, b) => {
      const ya = getYear(a) || 0
      const yb = getYear(b) || 0
      if (ya !== yb) return yb - ya
      return (b.from || '').localeCompare(a.from || '')
    })
  }, [periods])

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>✈️ Weekend e Vacanze v2</h1>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
            Sincronizzato con Calendario &gt; Vacanze — clicca su qualsiasi cella per modificarla
          </div>
        </div>
        <button onClick={() => setShowAdd(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          <Plus size={14} /> Aggiungi
        </button>
      </div>

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
      {periods.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✈️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text1)' }}>Nessuna vacanza rilevata</div>
          <div style={{ fontSize: 13 }}>Dichiara una vacanza dal Calendario (modalità 🌴 Vacanze) o clicca "Aggiungi" qui.</div>
        </div>
      ) : (
        byYear.map(([year, vacs]) => {
          const yearSpend = vacs.reduce((s, v) => s + vacationSpendInRange(transactions, v.from, v.to), 0)

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
                      <th style={thStyle}>Dove</th>
                      <th style={thStyle}>Da</th>
                      <th style={thStyle}>A</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Notti</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Spese TX</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacs.map(v => {
                      const nights = nightsBetween(v.from, v.to)
                      const type = nights >= 3 ? 'Vacanze' : 'Weekend'
                      const spend = vacationSpendInRange(transactions, v.from, v.to)

                      return (
                        <tr key={v.id} style={{ transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                          {/* Tipo (derivato dalla durata, non editabile) */}
                          <td style={tdStyle}>
                            <span style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
                              background: type === 'Vacanze' ? 'var(--blue-l,#e8f0fe)' : 'var(--gold-l,#fef9e7)',
                              color: type === 'Vacanze' ? 'var(--blue,#2563eb)' : 'var(--gold,#b45309)'
                            }}>{type}</span>
                            {!v.declared && <span title="Rilevata automaticamente dalle transazioni, non ancora dichiarata" style={{ marginLeft: 5, fontSize: 9, color: 'var(--text3)' }}>🔍 auto</span>}
                          </td>
                          {/* Dove */}
                          <td style={{ ...tdStyle, fontWeight: 700 }}>
                            <EditCell value={v.city} onSave={val => upd(v, 'city', val)} width={110} />
                          </td>
                          {/* Date */}
                          <td style={tdStyle}>
                            <EditCell value={v.from || ''} type="date" onSave={val => upd(v, 'from', val)} width={110} />
                          </td>
                          <td style={tdStyle}>
                            <EditCell value={v.to || ''} type="date" onSave={val => upd(v, 'to', val)} width={110} />
                          </td>
                          {/* Notti */}
                          <td style={numTd}>{nights > 0 ? nights : '—'}</td>
                          {/* Spese TX */}
                          <td style={{ ...numTd, color: spend > 0 ? 'var(--text1)' : 'var(--text3)' }}>
                            {spend > 0 ? `€ ${fmtIT(spend, 0)}` : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button onClick={() => removeRow(v)} title="Elimina / segna come non vacanza" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, display: 'flex', alignItems: 'center' }}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
