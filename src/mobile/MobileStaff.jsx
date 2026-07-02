/**
 * MobileStaff — generic timesheet tab for Nanny / Colf
 * Props:
 *   role        'nanny' | 'colf'
 *   name        display name (from appPrefs.nannyName / colfName)
 *   entries     nannyTS | colfTS
 *   addMonth    addNannyMonth | addColfMonth
 *   deleteMonth deleteNannyMonth | deleteColfMonth
 *   onAdd       callback to open the FAB form (managed by MobileApp)
 */
import { useState, useMemo } from 'react'
import { fmtIT } from '../utils/format'

const fmt = n => '€ ' + fmtIT(Math.abs(n || 0), 2)
const MON = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function monthLabel(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return `${MON[parseInt(m) - 1]} ${y}`
}

function AddModal({ onClose, addMonth, defaultRate }) {
  const now = new Date()
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [mese,   setMese]   = useState(ym)
  const [ore,    setOre]    = useState('')
  const [rate,   setRate]   = useState(String(defaultRate || ''))
  const [bonus,  setBonus]  = useState('0')
  const [pagato, setPagato] = useState(false)

  const base   = (parseFloat(ore) || 0) * (parseFloat(rate) || 0)
  const totale = base + (parseFloat(bonus) || 0)

  function save() {
    if (!mese || !ore || !rate) return
    addMonth({ mese, ore: parseFloat(ore), rate: parseFloat(rate), base: Math.round(base * 100) / 100, bonus: parseFloat(bonus) || 0, totale: Math.round(totale * 100) / 100, pagato })
    onClose()
  }

  return (
    <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-modal">
        <div className="m-modal-handle" />
        <div className="m-modal-title">📋 Nuovo Mese</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="m-field" style={{ marginBottom: 0 }}>
            <label className="m-label">Mese</label>
            <input className="m-input" type="month" value={mese} onChange={e => setMese(e.target.value)} />
          </div>
          <div className="m-field" style={{ marginBottom: 0 }}>
            <label className="m-label">Ore lavorate</label>
            <input className="m-input" type="number" inputMode="decimal" placeholder="88"
              value={ore} onChange={e => setOre(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="m-field" style={{ marginBottom: 0 }}>
            <label className="m-label">Tariffa oraria (€)</label>
            <input className="m-input" type="number" inputMode="decimal" placeholder="12"
              value={rate} onChange={e => setRate(e.target.value)} />
          </div>
          <div className="m-field" style={{ marginBottom: 0 }}>
            <label className="m-label">Bonus / Extra (€)</label>
            <input className="m-input" type="number" inputMode="decimal" placeholder="0"
              value={bonus} onChange={e => setBonus(e.target.value)} />
          </div>
        </div>

        {/* Preview */}
        <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10,
          marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Totale</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text1)', letterSpacing: '-.03em' }}>
              {fmt(totale)}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {ore || 0}h × €{rate || 0} + €{bonus || 0}
          </div>
        </div>

        <div className="m-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={pagato} onChange={e => setPagato(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--green)' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>Già pagato</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
          <button className="m-btn m-btn-ghost" onClick={onClose}>Annulla</button>
          <button className="m-btn m-btn-primary" onClick={save}
            disabled={!mese || !ore || !rate}>✓ Salva</button>
        </div>
      </div>
    </div>
  )
}

export default function MobileStaff({ role, name, entries, addMonth, deleteMonth, showAdd, onCloseAdd }) {
  const label = name || (role === 'nanny' ? 'Nanny' : 'Colf')
  const icon  = role === 'nanny' ? '👩' : '🧹'

  const sorted = useMemo(() =>
    [...(entries || [])].sort((a, b) => (b.mese || '').localeCompare(a.mese || ''))
  , [entries])

  // KPIs
  const last3months = useMemo(() => {
    const now = new Date()
    // Current month + 2 previous — Date handles year rollover (e.g. Jan → Nov of prev year)
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const cutoff = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return sorted.filter(e => (e.mese || '') >= cutoff)
  }, [sorted])

  const totOre    = last3months.reduce((s, e) => s + (e.ore || 0), 0)
  const totPaga   = last3months.reduce((s, e) => s + (e.totale || 0), 0)
  const nonPagati = sorted.filter(e => !e.pagato).length
  const defaultRate = sorted[0]?.rate || 12

  const totAllTime = sorted.reduce((s, e) => s + (e.totale || 0), 0)

  return (
    <div className="m-content" style={{ paddingBottom: 80 }}>
      {/* KPIs */}
      <div className="m-kpi-grid">
        <div className="m-kpi">
          <div className="m-kpi-label">Ore (3 mesi)</div>
          <div className="m-kpi-value blue">{totOre}h</div>
        </div>
        <div className="m-kpi">
          <div className="m-kpi-label">Pagato (3 mesi)</div>
          <div className="m-kpi-value green">{fmt(totPaga)}</div>
        </div>
        {nonPagati > 0 && (
          <div className="m-kpi full">
            <div className="m-kpi-label">Da pagare</div>
            <div className="m-kpi-value red">{nonPagati} {nonPagati === 1 ? 'mese' : 'mesi'}</div>
            <div className="m-kpi-delta" style={{ color: 'var(--text3)', fontSize: 10 }}>
              {fmt(sorted.filter(e => !e.pagato).reduce((s, e) => s + (e.totale || 0), 0))} totale
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="m-card">
        <div className="m-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{icon} {label} — Timesheet</span>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
            {fmt(totAllTime)} totale
          </span>
        </div>

        {sorted.length === 0 ? (
          <div className="m-empty" style={{ padding: 32 }}>
            <div className="m-empty-icon">{icon}</div>
            <div className="m-empty-title">Nessun mese registrato</div>
            <div className="m-empty-sub">Premi "+" per aggiungere un mese lavorato.</div>
          </div>
        ) : (
          sorted.map(e => {
            const isPaid = e.pagato
            return (
              <div key={e.id} className="m-list-item">
                <div className="m-list-icon"
                  style={{ background: isPaid ? 'rgba(40,180,80,.12)' : 'rgba(230,150,0,.12)', fontSize: 18 }}>
                  {isPaid ? '✅' : '⏳'}
                </div>
                <div className="m-list-main">
                  <div className="m-list-title">{monthLabel(e.mese)}</div>
                  <div className="m-list-sub">
                    {e.ore}h × €{e.rate} {e.bonus > 0 ? `+ €${e.bonus} bonus` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div className="m-list-amount" style={{ color: isPaid ? 'var(--green)' : 'var(--gold)' }}>
                    {fmt(e.totale)}
                  </div>
                  <button onClick={() => deleteMonth && deleteMonth(e.id)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer',
                      color: 'var(--text3)', fontSize: 14, padding: 0 }}>
                    ×
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {showAdd && (
        <AddModal onClose={onCloseAdd} addMonth={addMonth} defaultRate={defaultRate} />
      )}
    </div>
  )
}
