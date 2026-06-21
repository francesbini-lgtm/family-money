import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { Plus, Trash2 } from 'lucide-react'
import { fmtIT } from '../utils/format'

const SUBTYPES = ['Mare', 'Montagna', 'Città', 'Lago', 'Altro']

const SEED_VACATIONS = [
  { year:2024, type:'Weekend', subtype:'Mare',     dest:'Cannes',    dateFrom:'',           dateTo:'',           budgetCibo:0,  budgetAlloggio:0,  budgetAltro:0  },
  { year:2024, type:'Weekend', subtype:'Città',    dest:'Roma',      dateFrom:'',           dateTo:'',           budgetCibo:0,  budgetAlloggio:0,  budgetAltro:0  },
  { year:2024, type:'Vacanze', subtype:'Mare',     dest:'Portogallo',dateFrom:'',           dateTo:'',           budgetCibo:0,  budgetAlloggio:0,  budgetAltro:0  },
  { year:2024, type:'Weekend', subtype:'Mare',     dest:'Varigotti', dateFrom:'2024-07-05', dateTo:'2024-07-08', budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Vacanze', subtype:'Montagna', dest:'Svezia',    dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Weekend', subtype:'Montagna', dest:'Aprica',    dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Weekend', subtype:'Montagna', dest:'Trentino',  dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Weekend', subtype:'Mare',     dest:'Sori',      dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Weekend', subtype:'Mare',     dest:'Varigotti', dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Vacanze', subtype:'Mare',     dest:'Silvi',     dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Vacanze', subtype:'Mare',     dest:'Santa',     dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Vacanze', subtype:'Mare',     dest:'Grecia',    dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2025, type:'Weekend', subtype:'Montagna', dest:'Aprica',    dateFrom:'',           dateTo:'',           budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2026, type:'Weekend', subtype:'Montagna', dest:'Alagna',    dateFrom:'2026-01-30', dateTo:'2026-02-01', budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2026, type:'Weekend', subtype:'Montagna', dest:'Macugnaga', dateFrom:'2026-02-13', dateTo:'2026-02-15', budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2026, type:'Weekend', subtype:'Montagna', dest:'Baceno',    dateFrom:'2026-02-27', dateTo:'2026-03-03', budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2026, type:'Vacanze', subtype:'Montagna', dest:'Svezia',    dateFrom:'2026-03-17', dateTo:'2026-03-25', budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2026, type:'Weekend', subtype:'Città',    dest:'Madrid',    dateFrom:'2026-04-30', dateTo:'2026-05-02', budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
  { year:2026, type:'Weekend', subtype:'Mare',     dest:'Levante',   dateFrom:'2026-05-16', dateTo:'2026-05-17', budgetCibo:10, budgetAlloggio:10, budgetAltro:10 },
]

function nightsBetween(from, to) {
  if (!from || !to) return 0
  return Math.max(0, Math.round((new Date(to) - new Date(from)) / 86400000))
}

function getYear(v) {
  if (v.dateFrom) return parseInt(v.dateFrom.slice(0, 4))
  if (v.year) return parseInt(v.year)
  return null
}

// ── Editable cell: text/number — click to edit ──────────────
function EditCell({ value, onSave, type='text', width=100, placeholder='—', align='left' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value ?? ''))

  function commit() {
    setEditing(false)
    const v = type === 'number' ? (parseFloat(val) || 0) : val.trim()
    onSave(v)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
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

  const display = type === 'number'
    ? (parseFloat(value) > 0 ? `€ ${fmtIT(parseFloat(value), 0)}` : '—')
    : type === 'date'
    ? (value ? value.split('-').reverse().join('/') : '—')
    : (value || '—')

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

// ── Editable select cell ─────────────────────────────────────
function EditSelect({ value, options, onSave, renderValue }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <select
        autoFocus
        value={value}
        onChange={e => { onSave(e.target.value); setEditing(false) }}
        onBlur={() => setEditing(false)}
        style={{
          padding: '2px 4px', border: '1px solid var(--accent)',
          borderRadius: 4, background: 'var(--surface)',
          color: 'var(--text1)', fontSize: 12, cursor: 'pointer'
        }}
      >
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Clicca per modificare"
      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--border)', paddingBottom: 1 }}
    >
      {renderValue ? renderValue(value) : value}
    </span>
  )
}

export default function WeekendVacanzePage() {
  const { vacations, addVacation, updateVacation, deleteVacation, transactions } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    type: 'Weekend', subtype: 'Mare', dest: '',
    dateFrom: '', dateTo: '', year: new Date().getFullYear(),
    budgetCibo: 0, budgetAlloggio: 0, budgetAltro: 0, note: ''
  })

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function vacationSpend(v) {
    if (!v.dateFrom || !v.dateTo) return 0
    return Math.abs(
      transactions
        .filter(t => !t.excluded && t.amount < 0 && (t._effDate||t.date) >= v.dateFrom && (t._effDate||t.date) <= v.dateTo)
        .reduce((s, t) => s + t.amount, 0)
    )
  }

  function save() {
    if (!form.dest) return
    const yr = form.dateFrom ? parseInt(form.dateFrom.slice(0, 4)) : (parseInt(form.year) || new Date().getFullYear())
    addVacation({
      ...form, year: yr,
      budgetCibo: parseFloat(form.budgetCibo) || 0,
      budgetAlloggio: parseFloat(form.budgetAlloggio) || 0,
      budgetAltro: parseFloat(form.budgetAltro) || 0,
    })
    setShowAdd(false)
    setForm({ type:'Weekend', subtype:'Mare', dest:'', dateFrom:'', dateTo:'', year: new Date().getFullYear(), budgetCibo:0, budgetAlloggio:0, budgetAltro:0, note:'' })
  }

  function importSeed() {
    SEED_VACATIONS.forEach(v => addVacation(v))
  }

  function upd(id, field, value) {
    updateVacation(id, { [field]: value })
  }

  // Sort: within each year, by dateFrom desc (dated first), then undated alphabetically
  const sorted = useMemo(() => {
    return [...vacations].sort((a, b) => {
      const ya = getYear(a) || 0
      const yb = getYear(b) || 0
      if (ya !== yb) return yb - ya
      if (a.dateFrom && b.dateFrom) return b.dateFrom.localeCompare(a.dateFrom)
      if (a.dateFrom) return -1
      if (b.dateFrom) return 1
      return (a.dest || '').localeCompare(b.dest || '')
    })
  }, [vacations])

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

  const subtypeEmoji = s => s==='Mare'?'🏖':s==='Montagna'?'⛷':s==='Città'?'🏙':s==='Lago'?'🌊':'✈️'

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>✈️ Weekend e Vacanze</h1>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Clicca su qualsiasi cella per modificarla</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => {
            if (vacations.length > 0 && !window.confirm('Importa le vacanze 2024-2026? Verranno aggiunte a quelle esistenti.')) return
            importSeed()
          }} style={{ padding:'7px 14px', background:'var(--surface2)', color:'var(--text1)', border:'1px solid var(--border)', borderRadius:8, fontWeight:600, cursor:'pointer', fontSize:13 }}>
            📋 Importa 2024-2026
          </button>
          <button onClick={() => setShowAdd(s => !s)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer', fontSize:13 }}>
            <Plus size={14}/> Aggiungi
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card" style={{ padding:16, marginBottom:20, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
          {[
            ['Anno','year','number',80],
            ['Destinazione','dest','text',140],
          ].map(([lbl,field,tp,w])=>(
            <div key={field}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:3,fontWeight:600}}>{lbl}</div>
              <input type={tp} value={form[field]} onChange={e=>setField(field,e.target.value)} style={{...inp,width:w}} placeholder={lbl}/>
            </div>
          ))}
          <div>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:3,fontWeight:600}}>Tipo</div>
            <select value={form.type} onChange={e=>setField('type',e.target.value)} style={inp}>
              <option>Weekend</option><option>Vacanze</option>
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:3,fontWeight:600}}>Sottotipo</div>
            <select value={form.subtype} onChange={e=>setField('subtype',e.target.value)} style={inp}>
              {SUBTYPES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          {[['Da','dateFrom','date',130],['A','dateTo','date',130]].map(([lbl,field,tp,w])=>(
            <div key={field}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:3,fontWeight:600}}>{lbl}</div>
              <input type={tp} value={form[field]} onChange={e=>setField(field,e.target.value)} style={{...inp,width:w}}/>
            </div>
          ))}
          {[['€ Cibo','budgetCibo'],['€ Alloggio','budgetAlloggio'],['€ Altro','budgetAltro']].map(([lbl,field])=>(
            <div key={field}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:3,fontWeight:600}}>{lbl}</div>
              <input type="number" value={form[field]} onChange={e=>setField(field,e.target.value)} style={{...inp,width:80}} placeholder="0"/>
            </div>
          ))}
          <div style={{display:'flex',gap:6}}>
            <button onClick={save} style={{padding:'7px 14px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:6,fontWeight:600,cursor:'pointer',fontSize:13}}>Salva</button>
            <button onClick={()=>setShowAdd(false)} style={{padding:'7px 10px',background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)',borderRadius:6,cursor:'pointer',fontSize:13}}>✕</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {vacations.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 24px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,color:'var(--text3)'}}>
          <div style={{fontSize:40,marginBottom:12}}>✈️</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8,color:'var(--text1)'}}>Nessun viaggio registrato</div>
          <div style={{fontSize:13,marginBottom:16}}>Clicca "Importa 2024-2026" per caricare i tuoi viaggi o "Aggiungi" per inserire manualmente.</div>
        </div>
      ) : (
        byYear.map(([year, vacs]) => {
          const yearBudget = vacs.reduce((s,v) => s + (parseFloat(v.budgetCibo)||0) + (parseFloat(v.budgetAlloggio)||0) + (parseFloat(v.budgetAltro)||0), 0)
          const yearSpend  = vacs.reduce((s,v) => s + vacationSpend(v), 0)

          return (
            <div key={year} style={{ marginBottom: 28 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:18, fontWeight:700 }}>{year === '—' ? 'Senza data' : year}</div>
                <div style={{ fontSize:13, color:'var(--text3)' }}>
                  Budget: <strong>€ {fmtIT(yearBudget, 0)}</strong>
                  {yearSpend > 0 && <> · Spese TX: <strong style={{color: yearSpend > yearBudget ? 'var(--red)' : 'var(--green)'}}>€ {fmtIT(yearSpend, 0)}</strong></>}
                </div>
              </div>

              <div className="card" style={{ overflow:'auto', padding:0 }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Dove</th>
                      <th style={thStyle}>Da</th>
                      <th style={thStyle}>A</th>
                      <th style={{...thStyle, textAlign:'right'}}>Notti</th>
                      <th style={{...thStyle, textAlign:'right'}}>Cibo €</th>
                      <th style={{...thStyle, textAlign:'right'}}>Alloggio €</th>
                      <th style={{...thStyle, textAlign:'right'}}>Altro €</th>
                      <th style={{...thStyle, textAlign:'right'}}>Budget</th>
                      <th style={{...thStyle, textAlign:'right'}}>Spese TX</th>
                      <th style={{...thStyle, textAlign:'right'}}>Delta</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacs.map(v => {
                      const nights = nightsBetween(v.dateFrom, v.dateTo)
                      const budgetCibo      = parseFloat(v.budgetCibo) || 0
                      const budgetAlloggio  = parseFloat(v.budgetAlloggio) || 0
                      const budgetAltro     = parseFloat(v.budgetAltro) || 0
                      const budgetTot = budgetCibo + budgetAlloggio + budgetAltro
                      const spend = vacationSpend(v)
                      const delta = budgetTot - spend

                      return (
                        <tr key={v.id} style={{transition:'background .1s'}} onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                          {/* Tipo + Sottotipo */}
                          <td style={tdStyle}>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <EditSelect
                                value={v.type}
                                options={['Weekend','Vacanze']}
                                onSave={val => upd(v.id,'type',val)}
                                renderValue={val => (
                                  <span style={{
                                    fontSize:10,padding:'2px 7px',borderRadius:10,fontWeight:700,
                                    background:val==='Vacanze'?'var(--blue-l,#e8f0fe)':'var(--gold-l,#fef9e7)',
                                    color:val==='Vacanze'?'var(--blue,#2563eb)':'var(--gold,#b45309)'
                                  }}>{val}</span>
                                )}
                              />
                              <EditSelect
                                value={v.subtype||'Altro'}
                                options={SUBTYPES}
                                onSave={val => upd(v.id,'subtype',val)}
                                renderValue={val => <span title={val}>{subtypeEmoji(val)}</span>}
                              />
                            </div>
                          </td>
                          {/* Destinazione */}
                          <td style={{...tdStyle, fontWeight:700}}>
                            <EditCell value={v.dest} onSave={val => upd(v.id,'dest',val)} width={110}/>
                          </td>
                          {/* Date */}
                          <td style={tdStyle}>
                            <EditCell value={v.dateFrom||''} type="date" onSave={val => {
                              const yr = val ? parseInt(val.slice(0,4)) : (getYear(v) || new Date().getFullYear())
                              upd(v.id,'dateFrom',val)
                              updateVacation(v.id, { dateFrom: val, year: yr })
                            }} width={110}/>
                          </td>
                          <td style={tdStyle}>
                            <EditCell value={v.dateTo||''} type="date" onSave={val => upd(v.id,'dateTo',val)} width={110}/>
                          </td>
                          {/* Notti */}
                          <td style={numTd}>{nights > 0 ? nights : '—'}</td>
                          {/* Budget cells */}
                          <td style={numTd}>
                            <EditCell value={budgetCibo} type="number" onSave={val => upd(v.id,'budgetCibo',val)} width={70} align="right"/>
                          </td>
                          <td style={numTd}>
                            <EditCell value={budgetAlloggio} type="number" onSave={val => upd(v.id,'budgetAlloggio',val)} width={70} align="right"/>
                          </td>
                          <td style={numTd}>
                            <EditCell value={budgetAltro} type="number" onSave={val => upd(v.id,'budgetAltro',val)} width={70} align="right"/>
                          </td>
                          {/* Totals (read-only) */}
                          <td style={{...numTd, fontWeight:700}}>{budgetTot > 0 ? `€ ${fmtIT(budgetTot,0)}` : '—'}</td>
                          <td style={{...numTd, color: spend>0?'var(--text1)':'var(--text3)'}}>
                            {spend > 0 ? `€ ${fmtIT(spend,0)}` : '—'}
                          </td>
                          <td style={{...numTd, fontWeight:700, color: spend===0?'var(--text3)':delta>=0?'var(--green)':'var(--red)'}}>
                            {spend > 0 ? `${delta>=0?'+':''}€ ${fmtIT(delta,0)}` : '—'}
                          </td>
                          <td style={{...tdStyle, textAlign:'center'}}>
                            <button onClick={()=>deleteVacation(v.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',padding:2,display:'flex',alignItems:'center'}}>
                              <Trash2 size={12}/>
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
