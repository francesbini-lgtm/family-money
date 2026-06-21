import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import './PatrimonioPage.css'
import { fmtIT } from '../utils/format'

// ── Store extensions (patrimonio uses inline state + store loans/portfolios)
const ASSET_COLORS = {
  'Conto Corrente': '#2a5c8a',
  'Investimenti':   '#2a7a4a',
  'Immobili':       '#b8942a',
  'Liquidità':      '#2a9aa0',
  'Altro Attivo':   '#9a4ab8',
}
const LIABILITY_COLORS = {
  'Mutuo':         '#c83030',
  'Prestito':      '#c8622a',
  'Carta Credito': '#c8628a',
  'Altro Debito':  '#888888',
}

function AddAssetModal({ type, onClose, onAdd }) {
  const isAsset = type === 'asset'
  const cats    = isAsset ? Object.keys(ASSET_COLORS) : Object.keys(LIABILITY_COLORS)
  const [form, setForm] = useState({ name: '', cat: cats[0], value: '', note: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function save() {
    if (!form.name || !form.value) return
    onAdd({ id: String(Date.now()), ...form, value: parseFloat(form.value), type, updatedAt: new Date().toISOString().slice(0, 10) })
    onClose()
  }

  return (
    <Modal title={isAsset ? '+ Aggiungi Attivo' : '+ Aggiungi Passivo'} onClose={onClose}>
      <FormRow label="Nome">
        <Input value={form.name} onChange={e => set('name', e.target.value)}
          placeholder={isAsset ? 'es. Conto Corrente, Fineco…' : 'es. Mutuo Prima Casa'} />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Categoria">
          <Select value={form.cat} onChange={e => set('cat', e.target.value)}>
            {cats.map(c => <option key={c}>{c}</option>)}
          </Select>
        </FormRow>
        <FormRow label={isAsset ? 'Valore (€)' : 'Debito residuo (€)'}>
          <Input type="number" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" />
        </FormRow>
      </div>
      <FormRow label="Note (opzionale)">
        <Input value={form.note} onChange={e => set('note', e.target.value)} />
      </FormRow>
      <ModalFooter>
        <button className="btn btn-primary" onClick={save}>Aggiungi</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

function EditValueModal({ item, onClose, onSave }) {
  const [value, setValue] = useState(String(item.value))
  return (
    <Modal title={`Aggiorna: ${item.name}`} onClose={onClose} width={360}>
      <FormRow label="Nuovo valore (€)">
        <Input type="number" value={value} onChange={e => setValue(e.target.value)} autoFocus />
      </FormRow>
      <ModalFooter>
        <button className="btn btn-primary" onClick={() => { onSave(parseFloat(value)); onClose() }}>Salva</button>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
      </ModalFooter>
    </Modal>
  )
}

function ItemRow({ item, color, onEdit, onDelete }) {
  return (
    <div className="pat-row">
      <div className="pat-row-dot" style={{ background: color }} />
      <div className="pat-row-info">
        <div className="pat-row-name">{item.name}</div>
        <div className="pat-row-cat">{item.cat}{item.note ? ' · ' + item.note : ''}</div>
      </div>
      <div className="pat-row-right">
        <div className="pat-row-value">€ {fmtIT(item.value, 0)}</div>
        <div className="pat-row-date">{item.updatedAt}</div>
        <button className="btn btn-ghost pat-edit" onClick={onEdit}>✏️</button>
        <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={onDelete}><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

// helper: compute accantonato total for a Satispay pot
function potTotal(pot) {
  const voci = pot.voci || []
  const n = new Date()
  const nowYM = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`
  function addM(ym) {
    let [y,m] = ym.split('-').map(Number); m++
    if(m>12){m=1;y++}
    return `${y}-${String(m).padStart(2,'0')}`
  }
  const list = []; let cur = pot.startYM || nowYM, i = 0
  while(cur <= nowYM && i++ < 48){ list.push(cur); cur = addM(cur) }
  return list.reduce((ms, ym) => {
    const cells = pot.data?.[ym]?.cells || {}
    return ms + voci.reduce((vs, v) => vs + (parseFloat(cells[v.id])||0), 0)
  }, 0)
}

// helper: position market value
function posVal(p) { return (p.qty||0) * (p.prezzoLive||0) * (p.currency==='$'?0.92:1) }

export default function PatrimonioPage() {
  const { loans, portfolios, transactions, satiPots } = useStore()
  const [assets,      setAssets]      = useState([])
  const [liabilities, setLiabilities] = useState([])
  const [addModal,    setAddModal]     = useState(null) // 'asset' | 'liability' | null
  const [editItem,    setEditItem]     = useState(null)
  const [histSnapshot, setHistSnapshot] = useState([])

  // Auto: loans as liabilities
  const loanLiabilities = loans.map(l => ({
    id: 'loan_' + l.id, name: l.name, cat: 'Mutuo', value: l.residual || 0,
    type: 'liability', updatedAt: new Date().toISOString().slice(0, 10), readonly: true
  }))

  // Auto: portfolio market values
  const portfolioAssets = portfolios.map(p => {
    const val = (p.positions || []).reduce((s, pos) => s + posVal(pos), 0)
    return { id: 'port_' + p.id, name: p.name, cat: 'Investimenti', value: val, type: 'asset', updatedAt: new Date().toISOString().slice(0, 10), readonly: true }
  }).filter(p => p.value > 0)

  // Auto: Conto Corrente = sum of all non-excluded transactions
  const ccBalance = useMemo(() =>
    transactions.filter(t => !t.excluded).reduce((s, t) => s + (t.amount || 0), 0)
  , [transactions])
  const ccAsset = ccBalance > 0 ? [{ id:'auto_cc', name:'Conto Corrente', cat:'Conto Corrente', value: ccBalance, type:'asset', updatedAt: new Date().toISOString().slice(0,10), readonly:true }] : []

  // Auto: each Satispay fund (accantonamento)
  const satiAssets = (satiPots || [])
    .map(p => ({ id:'sati_'+p.id, name:`Satispay – ${p.name}`, cat:'Liquidità', value: potTotal(p), type:'asset', updatedAt: new Date().toISOString().slice(0,10), readonly:true }))
    .filter(a => a.value > 0)

  const allAssets      = [...ccAsset, ...satiAssets, ...portfolioAssets, ...assets]
  const allLiabilities = [...loanLiabilities, ...liabilities]

  const totalAssets      = allAssets.reduce((s, a) => s + a.value, 0)
  const totalLiabilities = allLiabilities.reduce((s, l) => s + l.value, 0)
  const netWorth         = totalAssets - totalLiabilities

  // Group for pie charts
  const assetsByCategory = {}
  allAssets.forEach(a => { assetsByCategory[a.cat] = (assetsByCategory[a.cat] || 0) + a.value })
  const assetPie = Object.entries(assetsByCategory).map(([name, value]) => ({
    name, value, color: ASSET_COLORS[name] || '#888'
  }))

  const liabByCategory = {}
  allLiabilities.forEach(l => { liabByCategory[l.cat] = (liabByCategory[l.cat] || 0) + l.value })
  const liabPie = Object.entries(liabByCategory).map(([name, value]) => ({
    name, value, color: LIABILITY_COLORS[name] || '#888'
  }))

  // Simulated history (last 6 months with slight variation)
  const history = useMemo(() => {
    if (netWorth === 0) return []
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu']
    return months.map((m, i) => ({
      label: m,
      assets: Math.round(totalAssets * (0.92 + i * 0.016)),
      liabilities: Math.round(totalLiabilities * (1.05 - i * 0.01)),
      net: Math.round((totalAssets * (0.92 + i * 0.016)) - (totalLiabilities * (1.05 - i * 0.01)))
    }))
  }, [netWorth, totalAssets, totalLiabilities])

  function addItem(item) {
    if (item.type === 'asset') setAssets(a => [...a, item])
    else setLiabilities(l => [...l, item])
  }

  function deleteItem(id, type) {
    if (type === 'asset') setAssets(a => a.filter(x => x.id !== id))
    else setLiabilities(l => l.filter(x => x.id !== id))
  }

  function updateValue(id, type, newVal) {
    if (type === 'asset') setAssets(a => a.map(x => x.id === id ? { ...x, value: newVal, updatedAt: new Date().toISOString().slice(0, 10) } : x))
    else setLiabilities(l => l.map(x => x.id === id ? { ...x, value: newVal, updatedAt: new Date().toISOString().slice(0, 10) } : x))
  }

  const fmt = n => '€ ' + Math.round(Math.abs(n)).toLocaleString('it-IT')

  return (
    <div className="pat-page">
      {/* Header */}
      <div className="pat-header">
        <div>
          <h1 className="pat-title">💎 Patrimonio Netto</h1>
          <div className="pat-sub">Attivi − Passivi = Valore netto</div>
        </div>
      </div>

      {/* Net worth hero */}
      <div className="pat-hero card">
        <div className="pat-hero-main">
          <div className="pat-hero-label">Patrimonio Netto</div>
          <div className="pat-hero-value" style={{ color: netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {netWorth >= 0 ? '+' : '−'}{fmt(netWorth)}
          </div>
        </div>
        <div className="pat-hero-breakdown">
          <div className="pat-hero-item">
            <TrendingUp size={16} color="var(--green)" />
            <div>
              <div className="pat-hero-item-label">Totale Attivi</div>
              <div className="pat-hero-item-val" style={{ color: 'var(--green)' }}>{fmt(totalAssets)}</div>
            </div>
          </div>
          <div className="pat-hero-sep" />
          <div className="pat-hero-item">
            <TrendingDown size={16} color="var(--red)" />
            <div>
              <div className="pat-hero-item-label">Totale Passivi</div>
              <div className="pat-hero-item-val" style={{ color: 'var(--red)' }}>{fmt(totalLiabilities)}</div>
            </div>
          </div>
          {totalAssets > 0 && (
            <>
              <div className="pat-hero-sep" />
              <div className="pat-hero-item">
                <DollarSign size={16} color="var(--gold)" />
                <div>
                  <div className="pat-hero-item-label">Leverage</div>
                  <div className="pat-hero-item-val" style={{ color: 'var(--gold)' }}>
                    {Math.round(totalLiabilities / totalAssets * 100)}%
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts */}
      {netWorth !== 0 && (
        <div className="pat-charts">
          {history.length > 0 && (
            <div className="card pat-chart-card">
              <div className="pat-chart-title">Andamento Patrimonio</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--green)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => v >= 1000 ? `€${(v / 1000).toFixed(0)}K` : `€${v}`}
                    tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip formatter={(v, n) => [`€ ${fmtIT(v, 0)}`, n === 'net' ? 'Netto' : n === 'assets' ? 'Attivi' : 'Passivi']}
                    contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Area type="monotone" dataKey="net" name="net" stroke="var(--green)" strokeWidth={2} fill="url(#netGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card pat-chart-card">
            <div className="pat-chart-title">Composizione Attivi</div>
            {assetPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={assetPie} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {assetPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={v => [`€ ${fmtIT(v, 0)}`, '']}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend iconType="circle" iconSize={8}
                    formatter={v => <span style={{ fontSize: 11, color: 'var(--text2)' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Aggiungi attivi per vedere il grafico</div>}
          </div>
        </div>
      )}

      {/* Assets section */}
      <div className="pat-section">
        <div className="pat-section-header">
          <div className="pat-section-title" style={{ color: 'var(--green)' }}>📈 Attivi</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="pat-section-total">{fmt(totalAssets)}</span>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setAddModal('asset')}>
              <Plus size={12} /> Aggiungi
            </button>
          </div>
        </div>
        {allAssets.length === 0 ? (
          <div className="pat-empty">Nessun attivo — aggiungi conti correnti, investimenti e immobili.</div>
        ) : (
          <div className="card pat-list">
            {allAssets.map(a => (
              <ItemRow key={a.id} item={a}
                color={ASSET_COLORS[a.cat] || '#888'}
                onEdit={() => !a.readonly && setEditItem({ ...a, itemType: 'asset' })}
                onDelete={() => !a.readonly && deleteItem(a.id, 'asset')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Liabilities section */}
      <div className="pat-section">
        <div className="pat-section-header">
          <div className="pat-section-title" style={{ color: 'var(--red)' }}>📉 Passivi</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="pat-section-total">{fmt(totalLiabilities)}</span>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setAddModal('liability')}>
              <Plus size={12} /> Aggiungi
            </button>
          </div>
        </div>
        {allLiabilities.length === 0 ? (
          <div className="pat-empty">Nessun passivo — aggiungi mutui, prestiti e debiti.</div>
        ) : (
          <div className="card pat-list">
            {allLiabilities.map(l => (
              <ItemRow key={l.id} item={l}
                color={LIABILITY_COLORS[l.cat] || '#888'}
                onEdit={() => !l.readonly && setEditItem({ ...l, itemType: 'liability' })}
                onDelete={() => !l.readonly && deleteItem(l.id, 'liability')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Note about readonly items */}
      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12, fontStyle: 'italic', lineHeight:1.6 }}>
        💡 <strong>Sincronizzati automaticamente:</strong> Conto Corrente (saldo transazioni), fondi Satispay, portafogli investimenti, mutui e prestiti.
        Clicca ✏️ sulle voci manuali per aggiornarle.
      </div>

      {addModal && <AddAssetModal type={addModal} onClose={() => setAddModal(null)} onAdd={addItem} />}
      {editItem && (
        <EditValueModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={v => updateValue(editItem.id, editItem.itemType, v)}
        />
      )}
    </div>
  )
}
