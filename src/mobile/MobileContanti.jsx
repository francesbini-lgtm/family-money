import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { CATS, CAT_NAMES } from '../data/categories'
import { fmtIT } from '../utils/format'

const fmt = n => '€ ' + fmtIT(Math.abs(n), 2)

function isAtmTx(t) {
  const d = (t.description || '').toUpperCase()
  return t.amount < 0 && (
    d.includes('PRELIEVO') || d.includes('ATM') || d.includes('BANCOMAT') || d.includes('CASH WITHDRAWAL')
  )
}

function dateLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Ieri'
  if (diff < 7)  return `${diff} giorni fa`
  return d.toLocaleDateString('it-IT', { day:'numeric', month:'short' })
}

function QuickAddModal({ onClose, atmOptions, addCashEntry }) {
  const now = new Date()
  const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const localTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

  const [amount,  setAmount]  = useState('')
  const [cat1,    setCat1]    = useState('Spesa e Alimentari')
  const [cat2,    setCat2]    = useState('')
  const [desc,    setDesc]    = useState('')
  const [date,    setDate]    = useState(localDate)
  const [time,    setTime]    = useState(localTime)
  const [atmLink, setAtmLink] = useState(atmOptions[0]?.txId || '')
  const [saving,  setSaving]  = useState(false)

  const cats = CAT_NAMES.filter(c => c !== 'Entrate' && c !== 'Non Categorizzato')
  const subs = CATS[cat1]?.sub || []

  function handleSave() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    setSaving(true)
    const entry = {
      amount: amt,
      cat1,
      cat2: cat2 || null,
      description: desc || cat1,
      date,
      time,
      linkedAtmTxId: atmLink || null,
    }
    addCashEntry(entry)
    onClose()
  }

  return (
    <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-modal">
        <div className="m-modal-handle" />
        <div className="m-modal-title">💵 Nuova Spesa Contanti</div>

        <div className="m-field">
          <label className="m-label">Importo (€)</label>
          <input className="m-input" type="number" inputMode="decimal" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', letterSpacing: '-.03em' }}
            autoFocus />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="m-field" style={{ marginBottom: 0 }}>
            <label className="m-label">Categoria</label>
            <select className="m-select" value={cat1} onChange={e => { setCat1(e.target.value); setCat2('') }}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="m-field" style={{ marginBottom: 0 }}>
            <label className="m-label">Sottocategoria</label>
            <select className="m-select" value={cat2} onChange={e => setCat2(e.target.value)}>
              <option value="">— Nessuna —</option>
              {subs.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">Descrizione</label>
          <input className="m-input" type="text" placeholder="Es: Verdura al mercato"
            value={desc} onChange={e => setDesc(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="m-field" style={{ marginBottom: 0 }}>
            <label className="m-label">Data</label>
            <input className="m-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="m-field" style={{ marginBottom: 0 }}>
            <label className="m-label">Ora</label>
            <input className="m-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        {atmOptions.length > 0 && (
          <div className="m-field">
            <label className="m-label">Associa a Prelievo</label>
            <select className="m-select" value={atmLink} onChange={e => setAtmLink(e.target.value)}>
              <option value="">— Non associare —</option>
              {atmOptions.map(tx => (
                <option key={tx.txId} value={tx.txId}>
                  {dateLabel(tx._effDate||tx.date)} · {fmt(tx.amount)} · {tx.descAI || 'Prelievo'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
          <button className="m-btn m-btn-ghost" onClick={onClose}>Annulla</button>
          <button className="m-btn m-btn-primary" onClick={handleSave} disabled={saving || !amount}>
            {saving ? '...' : '✓ Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MobileContanti({ showAdd, onCloseAdd }) {
  const cashEntries  = useStore(s => s.cashEntries)
  const transactions = useStore(s => s.transactions)
  const addCashEntry = useStore(s => s.addCashEntry)
  const deleteCashEntry = useStore(s => s.deleteCashEntry)

  // ATM prelievi from transactions
  const atmTxs = useMemo(() =>
    transactions.filter(t => !t.excluded && isAtmTx(t))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  , [transactions])

  // Linked ATM ids from cash entries
  const linkedAtmIds = useMemo(() =>
    new Set(cashEntries.map(e => e.linkedAtmTxId).filter(Boolean))
  , [cashEntries])

  // KPIs
  const totalOps = cashEntries.length
  const totalAtm = atmTxs.slice(0, 90).reduce((s, t) => s + Math.abs(t.amount), 0)
  const nonRiconciliate = atmTxs.filter(t => {
    const atm3m = new Date(); atm3m.setMonth(atm3m.getMonth() - 3)
    return !linkedAtmIds.has(t.txId) && new Date(t.date) >= atm3m
  }).length

  // Recent entries sorted
  const sorted = useMemo(() =>
    [...cashEntries].sort((a, b) => {
      const da = `${a.date || ''} ${a.time || ''}`
      const db = `${b.date || ''} ${b.time || ''}`
      return db.localeCompare(da)
    })
  , [cashEntries])

  const catColor = cat1 => CATS[cat1]?.color || '#888'

  // Closest ATM suggestions (last 60 days)
  const recentAtm = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60)
    return atmTxs.filter(t => new Date(t.date) >= cutoff).slice(0, 5)
  }, [atmTxs])

  return (
    <div className="m-content" style={{ paddingBottom: 80 }}>
      {/* KPI row */}
      <div className="m-kpi-grid">
        <div className="m-kpi">
          <div className="m-kpi-label">Spese registrate</div>
          <div className="m-kpi-value blue">{totalOps}</div>
          <div className="m-kpi-delta" style={{ color: 'var(--text3)', fontSize: 10 }}>operazioni totali</div>
        </div>
        <div className="m-kpi">
          <div className="m-kpi-label">Non riconciliate</div>
          <div className={'m-kpi-value ' + (nonRiconciliate > 0 ? 'red' : 'green')}>
            {nonRiconciliate}
          </div>
          <div className="m-kpi-delta" style={{ color: 'var(--text3)', fontSize: 10 }}>prelievi 3 mesi</div>
        </div>
      </div>

      {/* Cash entries list */}
      <div className="m-card">
        <div className="m-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Spese Contanti</span>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
            {sorted.length} voci
          </span>
        </div>

        {sorted.length === 0 ? (
          <div className="m-empty" style={{ padding: 32 }}>
            <div className="m-empty-icon">💵</div>
            <div className="m-empty-title">Nessuna spesa</div>
            <div className="m-empty-sub">Premi "+" per registrare una spesa in contanti.</div>
          </div>
        ) : (
          sorted.slice(0, 40).map(e => {
            const color = catColor(e.cat1)
            const hasLink = e.linkedAtmTxId
            return (
              <div key={e.id} className="m-list-item">
                <div className="m-list-icon" style={{ background: color + '20' }}>
                  <span style={{ fontSize: 16 }}>{CATS[e.cat1]?.icon || '💵'}</span>
                </div>
                <div className="m-list-main">
                  <div className="m-list-title">{e.description || e.cat1}</div>
                  <div className="m-list-sub">
                    {dateLabel(e.date)} · {e.cat1}{e.cat2 ? ` › ${e.cat2}` : ''}
                    {hasLink && <span style={{ marginLeft: 6, color: 'var(--green)' }}>🔗</span>}
                  </div>
                </div>
                <div className="m-list-amount" style={{ color }}>
                  −{fmt(e.amount)}
                </div>
                <button
                  onClick={() => deleteCashEntry && deleteCashEntry(e.id)}
                  style={{ marginLeft: 6, border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--text3)', fontSize: 16, padding: '4px', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Recent ATM prelievi */}
      {atmTxs.length > 0 && (
        <div className="m-card">
          <div className="m-card-header">Prelievi Recenti</div>
          {atmTxs.slice(0, 6).map(t => {
            const isLinked = linkedAtmIds.has(t.txId)
            return (
              <div key={t.txId} className="m-list-item">
                <div className="m-list-icon" style={{ background: isLinked ? 'rgba(40,180,80,.12)' : 'rgba(200,100,100,.1)' }}>
                  🏧
                </div>
                <div className="m-list-main">
                  <div className="m-list-title">{t.descAI || 'Prelievo ATM'}</div>
                  <div className="m-list-sub">{dateLabel(t._effDate||t.date)} · {t.account || ''}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <div className="m-list-amount" style={{ color: 'var(--text1)' }}>
                    {fmt(t.amount)}
                  </div>
                  {isLinked
                    ? <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700 }}>RICONCILIATO</span>
                    : <span style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700 }}>DA TRACCIARE</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <QuickAddModal
          onClose={onCloseAdd}
          atmOptions={recentAtm}
          addCashEntry={addCashEntry}
        />
      )}
    </div>
  )
}
