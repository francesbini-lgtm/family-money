import { fmtIT } from '../utils/format'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'

const fmt = (v) => v >= 1000 ? `€${(v/1000).toFixed(1)}K` : `€${Math.round(v)}`

// ── Shared tooltip ────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,.1)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text2)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8 }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>€ {fmtIT(p.value, 0)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Income vs Expense bar chart ───────────────────────────
export function IncomeExpenseChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barGap={2} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={45} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="income"  name="Entrate" fill="var(--green)" radius={[4,4,0,0]} />
        <Bar dataKey="expense" name="Uscite"  fill="var(--accent)" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Savings area chart ────────────────────────────────────
export function SavingsChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--blue)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={45} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone" dataKey="savings" name="Risparmio"
          stroke="var(--blue)" strokeWidth={2}
          fill="url(#savGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Category donut ────────────────────────────────────────
export function CategoryDonut({ data }) {
  if (!data.length) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
      Nessun dato
    </div>
  )
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data} dataKey="total" nameKey="name"
          cx="50%" cy="50%" innerRadius={45} outerRadius={72}
          paddingAngle={2}
        >
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip
          formatter={(v, name) => [`€ ${fmtIT(v, 0)}`, name]}
          contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8 }}
        />
        <Legend
          iconType="circle" iconSize={8}
          formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text2)' }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
