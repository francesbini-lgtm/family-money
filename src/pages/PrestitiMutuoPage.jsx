import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts'
import { Plus, Trash2, TrendingDown, Percent, Calendar, DollarSign } from 'lucide-react'
import './PrestitiMutuoPage.css'
import { fmtIT } from '../utils/format'

const LOAN_TYPES = ['Mutuo prima casa','Mutuo seconda casa','Prestito personale','Prestito auto','Cessione del quinto','Leasing','Altro']

// ── Amortization calculator ───────────────────────────────
function calcAmortization(capital, rateAnnual, months, startDate) {
  const r = rateAnnual / 100 / 12
  const rata = r === 0
    ? capital / months
    : capital * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1)

  const rows = []
  let residual = capital
  const start = new Date(startDate || new Date())

  for (let i = 0; i < months; i++) {
    const interest  = residual * r
    const principal = rata - interest
    residual       -= principal
    const date = new Date(start)
    date.setMonth(date.getMonth() + i)
    rows.push({
      month:     i + 1,
      date:      date.toISOString().slice(0, 7),
      rata:      Math.round(rata * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest:  Math.round(interest * 100) / 100,
      residual:  Math.max(0, Math.round(residual * 100) / 100),
    })
  }
  return { rata: Math.round(rata * 100) / 100, rows }
}

// ── Add loan modal ────────────────────────────────────────
function AddLoanModal({ onClose }) {
  const addLoan = useStore(s => s.addLoan)
  const [form, setForm] = useState({
    name: '', type: 'Mutuo prima casa',
    capital: '', residual: '', rate: '',
    months: '', monthsPaid: '0',
    startDate: new Date().toISOString().slice(0, 7),
    rata: '', bank: '', note: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const preview = useMemo(() => {
    const cap = parseFloat(form.capital)
    const r   = parseFloat(form.rate)
    const m   = parseInt(form.months)
    if (!cap || !m || isNaN(r)) return null
    return calcAmortization(cap, r, m, form.startDate + '-01')
  }, [form.capital, form.rate, form.months, form.startDate])

  function save() {
    if (!form.name || !form.capital) return
    const cap  = parseFloat(form.capital)
    const res  = parseFloat(form.residual) || cap
    const rata = preview?.rata || parseFloat(form.rata) || 0
    addLoan({
      ...form,
      capital:    cap,
      residual:   res,
      rate:       parseFloat(form.rate) || 0,
      months:     parseInt(form.months) || 0,
      monthsPaid: parseInt(form.monthsPaid) || 0,
      rata,
      totalInterest: preview ? preview.rows.reduce((s, r) => s + r.interest, 0) : 0,
    })
    onClose()
  }

  return (
    <Modal title="+ Nuovo Prestito / Mutuo" onClose={onClose} width={540}>
      <FormRow label="Nome"><Input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="es. Mutuo Prima Casa BNL"/></FormRow>
      <FormRow label="Tipo">
        <Select value={form.type} onChange={e=>set('type',e.target.value)}>
          {LOAN_TYPES.map(t=><option key={t}>{t}</option>)}
        </Select>
      </FormRow>
      <FormRow label="Banca"><Input value={form.bank} onChange={e=>set('bank',e.target.value)} placeholder="es. BNL"/></FormRow>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <FormRow label="Capitale iniziale (€)"><Input type="number" value={form.capital} onChange={e=>set('capital',e.target.value)} placeholder="200000"/></FormRow>
        <FormRow label="Residuo attuale (€)"><Input type="number" value={form.residual} onChange={e=>set('residual',e.target.value)} placeholder="180000"/></FormRow>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
        <FormRow label="Tasso annuo (%)"><Input type="number" step="0.01" value={form.rate} onChange={e=>set('rate',e.target.value)} placeholder="2.5"/></FormRow>
        <FormRow label="Durata (mesi)"><Input type="number" value={form.months} onChange={e=>set('months',e.target.value)} placeholder="240"/></FormRow>
        <FormRow label="Rate già pagate"><Input type="number" value={form.monthsPaid} onChange={e=>set('monthsPaid',e.target.value)} placeholder="0"/></FormRow>
      </div>
      <FormRow label="Data inizio"><Input type="month" value={form.startDate} onChange={e=>set('startDate',e.target.value)}/></FormRow>

      {preview && (
        <div className="loan-preview">
          <div className="loan-preview-item">
            <span>Rata mensile</span>
            <strong>€ {fmtIT(preview.rata, 2)}</strong>
          </div>
          <div className="loan-preview-item">
            <span>Totale interessi</span>
            <strong style={{color:'var(--red)'}}>€ {Math.round(preview.rows.reduce((s,r)=>s+r.interest,0)).toLocaleString('it-IT')}</strong>
          </div>
          <div className="loan-preview-item">
            <span>Costo totale</span>
            <strong>€ {Math.round(parseFloat(form.capital)+preview.rows.reduce((s,r)=>s+r.interest,0)).toLocaleString('it-IT')}</strong>
          </div>
        </div>
      )}

      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>Aggiungi</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Loan card ─────────────────────────────────────────────
function LoanCard({ loan }) {
  const { updateLoan, deleteLoan } = useStore()
  const [showPlan, setShowPlan] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)

  const progress   = loan.capital > 0 ? Math.round((1 - loan.residual / loan.capital) * 100) : 0
  const monthsLeft = loan.months - loan.monthsPaid
  const yearsLeft  = Math.floor(monthsLeft / 12)
  const moLeft     = monthsLeft % 12

  const amort = useMemo(() => {
    if (!loan.capital || !loan.months) return null
    return calcAmortization(loan.residual, loan.rate, monthsLeft, new Date().toISOString().slice(0,7) + '-01')
  }, [loan])

  // Chart: first 24 months principal vs interest
  const chartData = amort?.rows.slice(0, Math.min(36, amort.rows.length)).map(r => ({
    label: r.date.slice(2),
    capitale: r.principal,
    interessi: r.interest,
    residuo: r.residual,
  }))

  function markPaid() {
    updateLoan(loan.id, {
      monthsPaid: loan.monthsPaid + 1,
      residual: Math.max(0, loan.residual - (amort?.rows[0]?.principal || 0)),
    })
    setShowPayModal(false)
  }

  return (
    <div className="loan-card card">
      {/* Header */}
      <div className="loan-card-header">
        <div className="loan-card-left">
          <div className="loan-card-icon">🏦</div>
          <div>
            <div className="loan-name">{loan.name}</div>
            <div className="loan-meta">{loan.type}{loan.bank ? ` · ${loan.bank}` : ''}</div>
          </div>
        </div>
        <div className="loan-card-right">
          <div className="loan-kpi">
            <div className="loan-kpi-label">Residuo</div>
            <div className="loan-kpi-val" style={{color:'var(--red)'}}>€ {fmtIT(loan.residual, 0)}</div>
          </div>
          <div className="loan-kpi">
            <div className="loan-kpi-label">Rata mensile</div>
            <div className="loan-kpi-val">€ {loan.rata?.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) || '—'}</div>
          </div>
          <div className="loan-kpi">
            <div className="loan-kpi-label">Scadenza</div>
            <div className="loan-kpi-val">{yearsLeft > 0 ? `${yearsLeft}a` : ''}{moLeft > 0 ? ` ${moLeft}m` : ''}</div>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>setShowPayModal(true)}>✓ Paga rata</button>
            <button className="btn btn-ghost" onClick={()=>setShowPlan(p=>!p)}>{showPlan?'▲':'Piano'}</button>
            <button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={()=>{if(confirm('Eliminare?'))deleteLoan(loan.id)}}><Trash2 size={12}/></button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="loan-progress-wrap">
        <div className="loan-progress-bar">
          <div className="loan-progress-fill" style={{width: progress + '%'}}/>
        </div>
        <div className="loan-progress-labels">
          <span>{progress}% rimborsato</span>
          <span>€ {fmtIT(loan.capital, 0)} totale</span>
        </div>
      </div>

      {/* Rate info */}
      <div className="loan-stats">
        <div className="loan-stat">
          <Percent size={13} color="var(--text3)"/>
          <span>Tasso {loan.rate}%</span>
        </div>
        <div className="loan-stat">
          <Calendar size={13} color="var(--text3)"/>
          <span>{loan.months} rate totali · {loan.monthsPaid} pagate</span>
        </div>
        {amort && (
          <div className="loan-stat">
            <DollarSign size={13} color="var(--text3)"/>
            <span>Interessi residui: € {Math.round(amort.rows.reduce((s,r)=>s+r.interest,0)).toLocaleString('it-IT')}</span>
          </div>
        )}
      </div>

      {/* Amortization plan */}
      {showPlan && amort && (
        <div className="loan-plan">
          {chartData && chartData.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Composizione rate — prossimi {Math.min(36, amort.rows.length)} mesi</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barSize={8} barGap={1}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} interval={5}/>
                  <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={45}
                    tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
                  <Tooltip
                    formatter={(v,n)=>[`€ ${fmtIT(v, 2)}`,n==='capitale'?'Capitale':'Interessi']}
                    contentStyle={{fontSize:11,border:'1px solid var(--border)',borderRadius:8}}/>
                  <Legend iconType="circle" iconSize={8} formatter={v=><span style={{fontSize:11,color:'var(--text2)'}}>{v}</span>}/>
                  <Bar dataKey="capitale"  name="capitale"  fill="var(--blue)"  stackId="a" radius={[0,0,0,0]}/>
                  <Bar dataKey="interessi" name="interessi" fill="var(--accent)" stackId="a" radius={[2,2,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="loan-table-wrap">
            <table className="loan-table">
              <thead>
                <tr>
                  <th>#</th><th>Data</th><th>Rata</th>
                  <th>Capitale</th><th>Interessi</th><th>Residuo</th>
                </tr>
              </thead>
              <tbody>
                {amort.rows.slice(0, 24).map(r => (
                  <tr key={r.month}>
                    <td className="ln-num">{r.month}</td>
                    <td className="ln-date">{r.date}</td>
                    <td className="ln-amt">€ {fmtIT(r.rata, 2)}</td>
                    <td className="ln-prin" style={{color:'var(--blue)'}}>€ {fmtIT(r.principal, 2)}</td>
                    <td className="ln-int"  style={{color:'var(--accent)'}}>€ {fmtIT(r.interest, 2)}</td>
                    <td className="ln-res">€ {fmtIT(r.residual, 2)}</td>
                  </tr>
                ))}
                {amort.rows.length > 24 && (
                  <tr>
                    <td colSpan={6} style={{textAlign:'center',padding:'8px',fontSize:12,color:'var(--text3)'}}>
                      … altri {amort.rows.length - 24} mesi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPayModal && (
        <Modal title="✓ Conferma Pagamento Rata" onClose={()=>setShowPayModal(false)} width={380}>
          <div style={{fontSize:14,marginBottom:16}}>
            <div style={{marginBottom:8}}>Stai registrando il pagamento della rata <strong>#{loan.monthsPaid + 1}</strong>.</div>
            {amort?.rows[0] && (
              <div className="loan-preview">
                <div className="loan-preview-item"><span>Rata totale</span><strong>€ {fmtIT(amort.rows[0].rata, 2)}</strong></div>
                <div className="loan-preview-item"><span>di cui capitale</span><strong style={{color:'var(--blue)'}}>€ {fmtIT(amort.rows[0].principal, 2)}</strong></div>
                <div className="loan-preview-item"><span>di cui interessi</span><strong style={{color:'var(--accent)'}}>€ {fmtIT(amort.rows[0].interest, 2)}</strong></div>
                <div className="loan-preview-item"><span>Residuo dopo</span><strong style={{color:'var(--red)'}}>€ {fmtIT(Math.max(0,loan.residual-amort.rows[0].principal), 2)}</strong></div>
              </div>
            )}
          </div>
          <ModalFooter>
            <button className="btn btn-primary" onClick={markPaid}>✓ Conferma</button>
            <button className="btn btn-secondary" onClick={()=>setShowPayModal(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function PrestitiMutuoPage() {
  const { loans } = useStore()
  const [showAdd, setShowAdd] = useState(false)

  const totalResidual  = loans.reduce((s,l) => s + l.residual, 0)
  const totalRata      = loans.reduce((s,l) => s + (l.rata || 0), 0)
  const totalInterests = loans.reduce((s,l) => s + (l.totalInterest || 0), 0)

  return (
    <div className="lp-page">
      <div className="lp-header">
        <div>
          <h1 className="lp-title">🏦 Prestiti e Mutui</h1>
          <div className="lp-sub">Piano di ammortamento e tracking rate</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>
          <Plus size={14}/> Aggiungi
        </button>
      </div>

      {loans.length > 0 && (
        <div className="lp-kpis">
          {[
            [TrendingDown, 'Debito Totale',      `€ ${fmtIT(totalResidual, 0)}`, 'var(--red)'],
            [DollarSign,  'Rate Mensili Totali', `€ ${fmtIT(totalRata, 2)}`, 'var(--accent)'],
            [Calendar,    'N° Finanziamenti',    loans.length, 'var(--blue)'],
          ].map(([Icon, label, value, color]) => (
            <div key={label} className="card lp-kpi">
              <Icon size={16} color={color}/>
              <div>
                <div className="lp-kpi-label">{label}</div>
                <div className="lp-kpi-val" style={{color}}>{value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loans.length === 0 ? (
        <div className="lp-empty">
          <div style={{fontSize:48,marginBottom:16}}>🏦</div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Nessun finanziamento</div>
          <div style={{fontSize:13,color:'var(--text3)',marginBottom:20}}>
            Aggiungi mutui e prestiti per tenere traccia delle rate e del piano di ammortamento.
          </div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={14}/> Aggiungi</button>
        </div>
      ) : (
        <div className="lp-list">
          {loans.map(l => <LoanCard key={l.id} loan={l}/>)}
        </div>
      )}

      {showAdd && <AddLoanModal onClose={()=>setShowAdd(false)}/>}
    </div>
  )
}
