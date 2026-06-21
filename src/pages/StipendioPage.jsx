import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'
import { Trash2, Plus } from 'lucide-react'

const PERSONS = ['Francesco', 'Sofia']
const COLORS = { Francesco: '#e07b54', Sofia: '#5b8dd9' }

function fmtK(v) {
  if (!v && v !== 0) return ''
  if (v >= 1000) return `€${(v/1000).toFixed(0)}k`
  return `€${v}`
}

function fmtFull(v) {
  if (!v && v !== 0) return ''
  return `€${Number(v).toLocaleString('it-IT')}`
}

export default function StipendioPage() {
  const { salaries, addSalary, updateSalary, deleteSalary } = useStore()
  const [view, setView] = useState('ral') // 'ral' | 'netto'
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ year: new Date().getFullYear(), person: 'Francesco', ral: '', netto: '' })

  // Build chart data: one row per year, with person names as keys
  const chartData = useMemo(() => {
    const years = [...new Set(salaries.map(s => s.year))].sort()
    return years.map(year => {
      const row = { year }
      PERSONS.forEach(p => {
        const entry = salaries.find(s => s.year === year && s.person === p)
        if (entry) row[p] = view === 'ral' ? entry.ral : entry.netto
      })
      return row
    })
  }, [salaries, view])

  function handleAdd() {
    if (!form.year || !form.person) return
    addSalary({
      year: Number(form.year),
      person: form.person,
      ral: parseFloat(form.ral) || 0,
      netto: parseFloat(form.netto) || 0,
    })
    setShowForm(false)
    setForm({ year: new Date().getFullYear(), person: 'Francesco', ral: '', netto: '' })
  }

  // Group salaries by person for the table
  const byPerson = useMemo(() => {
    const all = [...salaries].sort((a,b) => a.year - b.year)
    return PERSONS.map(p => ({
      person: p,
      entries: all.filter(s => s.person === p)
    }))
  }, [salaries])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>💼 Stipendi</h1>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Storico RAL e netto per anno</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* RAL / Netto toggle */}
          <div style={{
            display: 'flex', background: 'var(--surface2)',
            borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden'
          }}>
            {[['ral','RAL'],['netto','Netto']].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '6px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: view === v ? 'var(--accent)' : 'transparent',
                color: view === v ? '#fff' : 'var(--text2)',
                transition: 'all 0.15s'
              }}>{l}</button>
            ))}
          </div>
          <button
            onClick={() => setShowForm(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <Plus size={14}/> Aggiungi
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Anno</div>
            <input type="number" value={form.year}
              onChange={e => setForm(f => ({...f, year: e.target.value}))}
              style={{ width: 80, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text1)', fontSize: 13 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Persona</div>
            <select value={form.person} onChange={e => setForm(f => ({...f, person: e.target.value}))}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text1)', fontSize: 13 }}>
              {PERSONS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>RAL (€)</div>
            <input type="number" value={form.ral} placeholder="0"
              onChange={e => setForm(f => ({...f, ral: e.target.value}))}
              style={{ width: 110, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text1)', fontSize: 13 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Netto (€)</div>
            <input type="number" value={form.netto} placeholder="0"
              onChange={e => setForm(f => ({...f, netto: e.target.value}))}
              style={{ width: 110, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text1)', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd}
              style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              Salva
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding: '7px 12px', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card" style={{ padding: '20px 16px 12px', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, paddingLeft: 8 }}>
            Trend {view === 'ral' ? 'RAL' : 'Netto'} — Annuale
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 0, left: 10 }}>
              <defs>
                {PERSONS.map(p => (
                  <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[p]} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={COLORS[p]} stopOpacity={0.02}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--text3)' }} axisLine={false} tickLine={false}/>
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text3)' }}
                axisLine={false} tickLine={false}
                tickFormatter={fmtK}
                width={45}
              />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                formatter={(val, name) => [fmtFull(val), name]}
                labelStyle={{ fontWeight: 700, color: 'var(--text1)' }}
              />
              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }}/>
              {PERSONS.map(p => (
                <Area
                  key={p}
                  type="monotone"
                  dataKey={p}
                  stroke={COLORS[p]}
                  strokeWidth={2.5}
                  fill={`url(#grad-${p})`}
                  dot={{ r: 4, fill: COLORS[p], strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tables per person */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {byPerson.map(({ person, entries }) => (
          <div key={person} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '14px 18px', fontWeight: 700, fontSize: 14,
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[person], display: 'inline-block' }}/>
              {person}
            </div>
            {entries.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Nessun dato — clicca + Aggiungi
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    {['Anno','RAL','Netto',''].map(h => (
                      <th key={h} style={{
                        padding: '8px 14px', fontSize: 11, fontWeight: 700,
                        color: 'var(--text3)', textAlign: h===''?'center':'left',
                        letterSpacing: '.04em'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id} style={{ borderTop: i>0?'1px solid var(--border)':undefined }}>
                      <td style={{ padding: '8px 14px', fontWeight: 700, fontSize: 13 }}>{e.year}</td>
                      <td style={{ padding: '8px 14px', fontSize: 13 }}>
                        <EditableCell value={e.ral} onSave={v => updateSalary(e.id, { ral: v })}/>
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: 13 }}>
                        <EditableCell value={e.netto} onSave={v => updateSalary(e.id, { netto: v })}/>
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                        <button onClick={() => deleteSalary(e.id)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text3)', padding: 2, display: 'flex', alignItems: 'center'
                        }}>
                          <Trash2 size={13}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Inline editable cell: click to edit
function EditableCell({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value || 0))

  function commit() {
    setEditing(false)
    const n = parseFloat(val)
    if (!isNaN(n)) onSave(n)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{
          width: 100, padding: '3px 6px',
          border: '1px solid var(--accent)', borderRadius: 4,
          background: 'var(--surface)', color: 'var(--text1)', fontSize: 13
        }}
      />
    )
  }

  return (
    <span
      onClick={() => { setEditing(true); setVal(String(value || 0)) }}
      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--border)', paddingBottom: 1 }}
      title="Clicca per modificare"
    >
      {value ? `€${Number(value).toLocaleString('it-IT')}` : <span style={{color:'var(--text3)'}}>—</span>}
    </span>
  )
}
