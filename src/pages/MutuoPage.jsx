import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fmtIT } from '../utils/format'
import { getMergedCats } from '../data/categories'

// Formula rata mutuo (PMT)
function calcRata(importo, anni, tasso) {
  const r = tasso / 100 / 12
  const n = anni * 12
  if (r === 0) return importo / n
  return importo * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1)
}

function fmtEur(n) {
  return '€ ' + fmtIT(Math.round(n), 0)
}


function WhatIfModal({ excluded, onApply, onClose, customCats }) {
  const mergedCats = getMergedCats(customCats)
  const [draft, setDraft] = useState(new Set(excluded))
  const [expanded, setExpanded] = useState(new Set())

  function toggle(key) {
    setDraft(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function toggleExpand(cat) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.45)',display:'flex',
      alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'28px 32px',maxWidth:500,width:'92%',
        maxHeight:'82vh',display:'flex',flexDirection:'column',boxShadow:'0 16px 48px rgba(0,0,0,.2)'}}>

        <div style={{fontSize:17,fontWeight:800,marginBottom:4}}>🔮 Simulazione What-If</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:18}}>
          Escludi categorie di spesa per simulare un risparmio medio diverso.
        </div>

        <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:4}}>
          {Object.entries(mergedCats).map(([cat, data])=>{
            const color = data.color || '#888'
            const subs  = data.sub || []
            const onL1  = draft.has(cat)
            const exp   = expanded.has(cat)
            const someSub = subs.some(s => draft.has(`${cat} > ${s}`))

            return (
              <div key={cat}>
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                  borderRadius:8,border:'1px solid var(--border)',
                  background:onL1?'var(--accent-l)':someSub?'var(--surface2)':'var(--surface)'}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:color,flexShrink:0}}/>
                  <label style={{display:'flex',alignItems:'center',gap:8,flex:1,cursor:'pointer'}}>
                    <input type="checkbox" checked={onL1} onChange={()=>toggle(cat)}
                      style={{width:14,height:14,accentColor:'var(--accent)'}}/>
                    <span style={{fontSize:13,fontWeight:600}}>{cat}</span>
                    {someSub && !onL1 && <span style={{fontSize:10,color:'var(--accent)',fontWeight:700}}>(parziale)</span>}
                  </label>
                  {subs.length > 0 && (
                    <button onClick={()=>toggleExpand(cat)}
                      style={{border:'none',background:'transparent',cursor:'pointer',
                        color:'var(--text3)',fontSize:12,padding:'0 4px',
                        fontFamily:'var(--font-sans)'}}>
                      {exp ? '▲' : '▼'} L2
                    </button>
                  )}
                </div>
                {exp && subs.length > 0 && (
                  <div style={{marginLeft:20,marginTop:3,display:'flex',flexDirection:'column',gap:3}}>
                    {subs.map(sub=>{
                      const key = `${cat} > ${sub}`
                      const on  = draft.has(key) || onL1
                      return (
                        <label key={sub} style={{display:'flex',alignItems:'center',gap:8,
                          padding:'5px 10px',borderRadius:6,cursor:onL1?'not-allowed':'pointer',
                          border:'1px solid var(--border)',
                          background:on?'var(--accent-l)':'var(--surface)',opacity:onL1?.6:1}}>
                          <input type="checkbox" checked={on} disabled={onL1}
                            onChange={()=>toggle(key)}
                            style={{width:13,height:13,accentColor:'var(--accent)'}}/>
                          <div style={{width:6,height:6,borderRadius:'50%',background:color,flexShrink:0}}/>
                          <span style={{fontSize:12}}>{sub}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
          <button className="btn btn-ghost" style={{fontSize:13}} onClick={()=>{setDraft(new Set());onApply(new Set())}}>
            Azzera
          </button>
          <button className="btn btn-ghost" style={{fontSize:13}} onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" style={{fontSize:13}}
            onClick={()=>{onApply(draft);onClose()}}>
            ✓ Applica simulazione
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MutuoPage() {
  const { transactions, customCats } = useStore()

  const [importo, setImporto] = useState(350000)
  const [anni, setAnni] = useState(25)
  const [tasso, setTasso] = useState(3.5)
  const [excludedCats, setExcludedCats] = useState(new Set())
  const [showWhatIf, setShowWhatIf] = useState(false)

  // Calcolo entrate e uscite mensili medie (ultimi 6 mesi)
  const { entrateMedie, usciteMedie, risparmioMedio } = useMemo(() => {
    const now = new Date()
    const months = []
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    }

    const byMonth = {}
    months.forEach(m => { byMonth[m] = { in: 0, out: 0 } })

    transactions.forEach(t => {
      if (t.excluded) return
      const ym = (t._effDate||(t._effDate||t.date||'')).slice(0,7)
      if (!byMonth[ym]) return
      if (t.amount > 0) byMonth[ym].in += t.amount
      else {
        // Exclude selected categories from uscite
        if (excludedCats.has(t.cat1)) return
        if (t.cat2 && excludedCats.has(`${t.cat1} > ${t.cat2}`)) return
        byMonth[ym].out += Math.abs(t.amount)
      }
    })

    const ms = Object.values(byMonth)
    const n = ms.length || 1
    const entrateMedie = ms.reduce((s,m)=>s+m.in,0) / n
    const usciteMedie = ms.reduce((s,m)=>s+m.out,0) / n
    const risparmioMedio = entrateMedie - usciteMedie
    return { entrateMedie, usciteMedie, risparmioMedio }
  }, [transactions, excludedCats])

  const rata = calcRata(importo, anni, tasso)
  const totInteressi = rata * anni * 12 - importo
  const totPagato = rata * anni * 12
  const pctReddito = entrateMedie > 0 ? (rata / entrateMedie * 100) : 0
  const sostenibile = pctReddito < 30 ? 'ok' : pctReddito < 40 ? 'warning' : 'danger'
  const risparmioConMutuo = risparmioMedio - rata

  const statusColor = sostenibile === 'ok' ? 'var(--green)' : sostenibile === 'warning' ? '#b8942a' : 'var(--red)'
  const statusLabel = sostenibile === 'ok' ? '✅ Sostenibile' : sostenibile === 'warning' ? '⚠️ Attenzione' : '🔴 Critico'
  const statusDesc = sostenibile === 'ok'
    ? 'La rata è inferiore al 30% delle entrate. Ottima sostenibilità.'
    : sostenibile === 'warning'
    ? 'La rata è tra 30% e 40% delle entrate. Valuta attentamente.'
    : 'La rata supera il 40% delle entrate. Rischio elevato.'

  const chartData = [
    {
      name: 'Risparmi',
      'Senza mutuo': Math.max(0, risparmioMedio),
      'Con mutuo': Math.max(0, risparmioConMutuo),
    },
    {
      name: 'Spese totali',
      'Senza mutuo': usciteMedie,
      'Con mutuo': usciteMedie + rata,
    },
    {
      name: 'Rata',
      'Senza mutuo': 0,
      'Con mutuo': rata,
    },
  ]

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 15,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.07em',
    textTransform: 'uppercase',
    color: 'var(--text3)',
    marginBottom: 6,
    display: 'block',
  }

  const kpiCardStyle = {
    padding: '16px 18px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 48 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, margin: 0 }}>🏠 Simulatore Mutuo</h1>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
          Calcola la rata e valuta la sostenibilità rispetto al tuo reddito familiare
        </div>
      </div>

      {/* Situazione attuale */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text2)' }}>
            📊 Situazione Attuale (media 6 mesi)
            {excludedCats.size > 0 && (
              <span style={{fontSize:11,color:'var(--accent)',fontWeight:700,marginLeft:8}}>
                ({excludedCats.size} cat. escluse)
              </span>
            )}
          </div>
          <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => setShowWhatIf(true)}>
            🔮 What-If
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            ['Entrate medie/mese', entrateMedie, 'var(--green)'],
            ['Uscite medie/mese', usciteMedie, 'var(--red)'],
            ['Risparmio medio/mese', risparmioMedio, risparmioMedio >= 0 ? 'var(--green)' : 'var(--red)'],
          ].map(([label, val, color]) => (
            <div key={label}>
              <div style={labelStyle}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>
                {fmtEur(val)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Simulatore */}
      <div className="card" style={{ padding: '20px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text2)' }}>🔧 Parametri Mutuo</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Importo (€)</label>
            <input
              type="number"
              value={importo}
              onChange={e => setImporto(Number(e.target.value))}
              style={inputStyle}
              min={10000}
              max={2000000}
              step={5000}
            />
          </div>
          <div>
            <label style={labelStyle}>Durata (anni)</label>
            <input
              type="number"
              value={anni}
              onChange={e => setAnni(Number(e.target.value))}
              style={inputStyle}
              min={5}
              max={40}
            />
          </div>
          <div>
            <label style={labelStyle}>Tasso annuo (%)</label>
            <input
              type="number"
              value={tasso}
              onChange={e => setTasso(Number(e.target.value))}
              style={inputStyle}
              min={0}
              max={20}
              step={0.1}
            />
          </div>
        </div>

        {/* Range sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <input type="range" min={10000} max={2000000} step={5000} value={importo}
            onChange={e => setImporto(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }}/>
          <input type="range" min={5} max={40} step={1} value={anni}
            onChange={e => setAnni(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }}/>
          <input type="range" min={0} max={15} step={0.1} value={tasso}
            onChange={e => setTasso(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }}/>
        </div>
      </div>

      {/* KPI results */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          ['Rata mensile', fmtEur(rata), 'var(--accent)'],
          ['Totale interessi', fmtEur(totInteressi), '#b8942a'],
          ['Totale pagato', fmtEur(totPagato), 'var(--text)'],
          ['% del reddito', pctReddito.toFixed(1) + '%', statusColor],
        ].map(([label, val, color]) => (
          <div key={label} style={kpiCardStyle}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Sostenibilità + Impatto side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Sostenibilità */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text2)' }}>💡 Sostenibilità</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            padding: '10px 14px', borderRadius: 8,
            background: `${statusColor}18`, border: `1px solid ${statusColor}44`
          }}>
            <span style={{ fontSize: 22 }}>{statusLabel.split(' ')[0]}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: statusColor }}>{statusLabel.split(' ').slice(1).join(' ')}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{statusDesc}</div>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
            Rata / Entrate: {pctReddito.toFixed(1)}%
          </div>
          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, pctReddito)}%`,
              background: statusColor,
              borderRadius: 4,
              transition: 'width .3s'
            }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
            <span>0%</span><span>30%</span><span>40%</span><span>100%</span>
          </div>
        </div>

        {/* Impatto sul risparmio */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text2)' }}>📉 Impatto sul Risparmio</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Risparmio attuale (senza mutuo)</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
              {fmtEur(risparmioMedio)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}> /mese</span>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Risparmio con mutuo</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: risparmioConMutuo >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {fmtEur(risparmioConMutuo)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}> /mese</span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            background: 'var(--surface2)', borderRadius: 8, fontSize: 12
          }}>
            <span>{risparmioConMutuo >= 0 ? '✅' : '⚠️'}</span>
            <span style={{ color: 'var(--text2)' }}>
              Differenza: <strong style={{ fontFamily: 'var(--font-mono)', color: risparmioConMutuo >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {rata >= 0 ? '-' : '+'}{fmtEur(rata)}
              </strong> al mese dalla rata
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--text2)' }}>📊 Confronto Mensile</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Senza mutuo vs. Con mutuo — valori medi mensili</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text3)' }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false}
              tickFormatter={v => `€${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}`}/>
            <Tooltip
              formatter={(v, name) => [`€ ${fmtIT(Math.round(v), 0)}`, name]}
              contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8 }}/>
            <Bar dataKey="Senza mutuo" fill="#2a9aa0" radius={[4,4,0,0]}/>
            <Bar dataKey="Con mutuo" fill="var(--accent)" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#2a9aa0' }}/>
            <span style={{ color: 'var(--text2)' }}>Senza mutuo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--accent)' }}/>
            <span style={{ color: 'var(--text2)' }}>Con mutuo</span>
          </div>
        </div>
      </div>
      {showWhatIf && (
        <WhatIfModal
          excluded={excludedCats}
          customCats={customCats}
          onApply={setExcludedCats}
          onClose={() => setShowWhatIf(false)}
        />
      )}
    </div>
  )
}
