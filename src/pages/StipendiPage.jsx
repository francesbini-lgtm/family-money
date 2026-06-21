import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { getLast6Months, ymLabel, getYM } from '../hooks/useFinancials'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import { Plus, Trash2 } from 'lucide-react'
import './StipendiPage.css'
import { fmtIT } from '../utils/format'

const fmt  = n => '€ ' + fmtIT(n, 0)
const COLORS = ['var(--accent)', 'var(--blue)', 'var(--green)', 'var(--gold)']

// Salary records (stored in Firestore via appPrefs)
function useSalaryData() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const data = appPrefs.salaryData || {}
  function setMemberData(memberId, memberData) {
    const next = { ...data, [memberId]: memberData }
    setAppPref('salaryData', next)
  }
  return { data, setMemberData }
}

// ── Member detail tab ────────────────────────────────────
function MemberTab({ member, transactions, salaryData, onUpdateSalary }) {
  const [showModal,  setShowModal]  = useState(false)
  const [showBonus,  setShowBonus]  = useState(false)
  const [editData,   setEditData]   = useState(null)
  const [bonusForm,  setBonusForm]  = useState({ anno: new Date().getFullYear(), base:'', performance:'', ral:'' })

  const memberData = salaryData[member.id] || { base: 0, bonus: [], lordo: 0 }
  const now        = new Date()
  const thisYM     = getYM(now)
  const last12     = Array.from({length:12}, (_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  }).reverse()

  // Income transactions for this member (matched by card or all income if single member)
  const memberCards = (member.cards || [])
  const incomeTxs = useMemo(() => {
    return transactions.filter(t => t.amount > 0 && !t.excluded)
  }, [transactions])

  // Monthly chart data
  const chartData = last12.map(ym => ({
    label: ymLabel(ym),
    entrate: incomeTxs.filter(t => (t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t) => s+t.amount, 0),
  }))

  const totalYTD    = incomeTxs.filter(t=>(t._effDate||(t._effDate||t.date||'')).startsWith(now.getFullYear().toString())).reduce((s,t)=>s+t.amount,0)
  const avgMonthly  = chartData.reduce((s,d)=>s+d.entrate,0) / 12
  const thisMonth   = chartData[11]?.entrate || 0

  function saveBonus() {
    const bonuses = [...(memberData.bonus||[]), {
      ...bonusForm,
      totale: (parseFloat(bonusForm.base)||0) + (parseFloat(bonusForm.performance)||0)
    }].sort((a,b) => b.anno - a.anno)
    onUpdateSalary(member.id, { ...memberData, bonus: bonuses })
    setBonusForm({ anno: new Date().getFullYear(), base:'', performance:'', ral:'' })
    setShowBonus(false)
  }

  function deleteBonus(i) {
    const bonuses = memberData.bonus.filter((_,idx) => idx !== i)
    onUpdateSalary(member.id, { ...memberData, bonus: bonuses })
  }

  function saveSalaryBase() {
    onUpdateSalary(member.id, { ...memberData, ...editData })
    setShowModal(false)
  }

  return (
    <div>
      {/* KPI row */}
      <div className="stip-kpi-row">
        <div className="card">
          <div className="stip-kpi-label">Media Mensile</div>
          <div className="stip-kpi-val">{fmt(avgMonthly)}</div>
          <div className="stip-kpi-sub">ultimi 12 mesi</div>
        </div>
        <div className="card">
          <div className="stip-kpi-label">Questo Mese</div>
          <div className="stip-kpi-val" style={{color:'var(--green)'}}>{fmt(thisMonth)}</div>
        </div>
        <div className="card">
          <div className="stip-kpi-label">YTD {now.getFullYear()}</div>
          <div className="stip-kpi-val">{fmt(totalYTD)}</div>
        </div>
        <div className="card" style={{cursor:'pointer'}} onClick={()=>{setEditData({base:memberData.base||0,lordo:memberData.lordo||0});setShowModal(true)}}>
          <div className="stip-kpi-label">Stipendio Base</div>
          <div className="stip-kpi-val">{memberData.base ? fmt(memberData.base) : <span style={{color:'var(--text3)',fontSize:14}}>Imposta ✏️</span>}</div>
          <div className="stip-kpi-sub">mensile netto</div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Entrate mensili — ultimi 12 mesi</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={55}
              tickFormatter={v => v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
            <Tooltip formatter={v=>[fmt(v),'Entrate']}
              contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
            <Bar dataKey="entrate" fill="var(--green)" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bonus table */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:15}}>📈 Storico Bonus / RAL</div>
        <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>setShowBonus(true)}>
          <Plus size={12}/> Aggiungi Anno
        </button>
      </div>
      {memberData.bonus?.length > 0 ? (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'var(--surface2)'}}>
                {['Anno','Stipendio Base','Bonus Performance','Totale Bonus','RAL',''].map(h=>(
                  <th key={h} style={{padding:'9px 14px',fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',borderBottom:'1px solid var(--border)',textAlign:h===''?'center':'left'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberData.bonus.map((b,i)=>(
                <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'9px 14px',fontWeight:700}}>{b.anno}</td>
                  <td style={{padding:'9px 14px'}}>{b.base ? fmt(b.base) : '—'}</td>
                  <td style={{padding:'9px 14px'}}>{b.performance ? fmt(b.performance) : '—'}</td>
                  <td style={{padding:'9px 14px',fontWeight:700,color:'var(--green)'}}>{fmt(b.totale||0)}</td>
                  <td style={{padding:'9px 14px'}}>{b.ral ? fmt(b.ral) : '—'}</td>
                  <td style={{padding:'6px 10px',textAlign:'center'}}>
                    <button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={()=>deleteBonus(i)}><Trash2 size={12}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{textAlign:'center',padding:'24px',color:'var(--text3)',fontSize:13}}>
          Nessun bonus registrato. Clicca "+ Aggiungi Anno" per inserire lo storico.
        </div>
      )}

      {/* Salary modal */}
      {showModal && editData && (
        <Modal title={`💼 Stipendio — ${member.name}`} onClose={()=>setShowModal(false)} width={400}>
          <FormRow label="Stipendio base mensile (netto €)">
            <Input type="number" value={editData.base} onChange={e=>setEditData(d=>({...d,base:Number(e.target.value)}))} placeholder="0"/>
          </FormRow>
          <FormRow label="RAL (lordo annuo €)">
            <Input type="number" value={editData.lordo} onChange={e=>setEditData(d=>({...d,lordo:Number(e.target.value)}))} placeholder="0"/>
          </FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={saveSalaryBase}>Salva</button>
            <button className="btn btn-secondary" onClick={()=>setShowModal(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Bonus modal */}
      {showBonus && (
        <Modal title="📈 Aggiungi Bonus / RAL" onClose={()=>setShowBonus(false)} width={460}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <FormRow label="Anno">
              <Input type="number" value={bonusForm.anno} onChange={e=>setBonusForm(f=>({...f,anno:Number(e.target.value)}))}/>
            </FormRow>
            <FormRow label="RAL (lordo annuo €)">
              <Input type="number" value={bonusForm.ral} onChange={e=>setBonusForm(f=>({...f,ral:e.target.value}))} placeholder="0"/>
            </FormRow>
            <FormRow label="Bonus Base €">
              <Input type="number" value={bonusForm.base} onChange={e=>setBonusForm(f=>({...f,base:e.target.value}))} placeholder="0"/>
            </FormRow>
            <FormRow label="Bonus Performance €">
              <Input type="number" value={bonusForm.performance} onChange={e=>setBonusForm(f=>({...f,performance:e.target.value}))} placeholder="0"/>
            </FormRow>
          </div>
          <ModalFooter>
            <button className="btn btn-primary" onClick={saveBonus}>Salva</button>
            <button className="btn btn-secondary" onClick={()=>setShowBonus(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function StipendiPage() {
  const { transactions } = useStore()
  const appPrefs = useStore(s => s.appPrefs)
  const { data: salaryData, setMemberData } = useSalaryData()
  const now = new Date()

  // Get family members
  const members = useMemo(() => {
    const owner = { id:'owner', name: appPrefs.ownerNickname || 'Francesco' }
    const fam   = appPrefs.family || []
    return [owner, ...fam]
  }, [appPrefs])

  const [selMember, setSelMember] = useState(members[0]?.id || 'owner')

  const last6 = getLast6Months()

  // Family total income chart
  const familyChart = last6.map(ym => {
    const txs = transactions.filter(t => t.amount > 0 && !t.excluded && (t._effDate||(t._effDate||t.date||'')).startsWith(ym))
    return { label: ymLabel(ym), totale: txs.reduce((s,t)=>s+t.amount,0) }
  })

  const avgFamily  = familyChart.reduce((s,d)=>s+d.totale,0) / 6
  const thisMonth  = familyChart[5]?.totale || 0
  const ytd        = transactions.filter(t=>t.amount>0&&!t.excluded&&(t._effDate||(t._effDate||t.date||'')).startsWith(now.getFullYear().toString())).reduce((s,t)=>s+t.amount,0)

  // Pie: member breakdown (based on salary base if set, else equal split)
  const pieData = members.map((m, i) => ({
    name: m.name,
    value: salaryData[m.id]?.base || (avgFamily / members.length),
    color: COLORS[i % COLORS.length],
  }))

  const activeMember = members.find(m => m.id === selMember)

  return (
    <div className="stip-page">
      <div className="stip-header">
        <h1 className="stip-title">💼 Stipendi & Bonus</h1>
      </div>

      {/* Family KPIs */}
      <div className="stip-kpi-row" style={{marginBottom:20}}>
        <div className="card">
          <div className="stip-kpi-label">Entrata Media Mensile</div>
          <div className="stip-kpi-val">{fmt(avgFamily)}</div>
          <div className="stip-kpi-sub">Famiglia (totale)</div>
        </div>
        <div className="card">
          <div className="stip-kpi-label">Questo Mese</div>
          <div className="stip-kpi-val" style={{color:'var(--green)'}}>{fmt(thisMonth)}</div>
        </div>
        <div className="card">
          <div className="stip-kpi-label">YTD {now.getFullYear()}</div>
          <div className="stip-kpi-val">{fmt(ytd)}</div>
        </div>
        {members.map((m, i) => (
          <div key={m.id} className="card">
            <div className="stip-kpi-label">👤 {m.name}</div>
            <div className="stip-kpi-val" style={{color:COLORS[i%COLORS.length]}}>
              {salaryData[m.id]?.base ? fmt(salaryData[m.id].base) : '—'}
            </div>
            <div className="stip-kpi-sub">base mensile</div>
          </div>
        ))}
      </div>

      {/* Family charts */}
      <div className="stip-charts-row">
        <div className="card">
          <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Entrate Familiari — ultimi 6 mesi</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={familyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={55}
                tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
              <Tooltip formatter={v=>[fmt(v),'Entrate']}
                contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
              <Bar dataKey="totale" fill="var(--green)" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Ripartizione Stipendi</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
              </Pie>
              <Tooltip formatter={v=>[fmt(v)]}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Member tabs */}
      <div style={{marginTop:24,marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:12}}>Dettaglio per Componente</div>
        <div className="stip-member-tabs">
          {members.map((m,i)=>(
            <button key={m.id}
              className={'stip-member-btn'+(selMember===m.id?' active':'')}
              style={selMember===m.id?{'--member-color':COLORS[i%COLORS.length]}:{}}
              onClick={()=>setSelMember(m.id)}>
              👤 {m.name}
            </button>
          ))}
        </div>
      </div>

      {activeMember && (
        <MemberTab
          member={activeMember}
          transactions={transactions}
          salaryData={salaryData}
          onUpdateSalary={setMemberData}
        />
      )}
    </div>
  )
}
