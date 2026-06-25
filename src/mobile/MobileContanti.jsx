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

// ── Scelta tipo aggiunta ──────────────────────────────────
function SceltaModal({ onChoose, onClose }) {
  return (
    <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-modal">
        <div className="m-modal-handle"/>
        <div className="m-modal-title">Cosa vuoi aggiungere?</div>
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:4 }}>
          <button className="m-btn m-btn-primary" onClick={() => onChoose('utilizzo')}
            style={{ fontSize:15, padding:16, justifyContent:'flex-start', gap:14 }}>
            <span style={{ fontSize:22 }}>💵</span>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontWeight:800 }}>Utilizzo Contanti</div>
              <div style={{ fontSize:11, fontWeight:400, opacity:.8 }}>Spesa pagata in contanti (nanny, colf, veicoli, altro…)</div>
            </div>
          </button>
          <button className="m-btn m-btn-ghost" onClick={() => onChoose('prelievo')}
            style={{ fontSize:15, padding:16, justifyContent:'flex-start', gap:14 }}>
            <span style={{ fontSize:22 }}>🏧</span>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontWeight:800 }}>Nota Prelievo</div>
              <div style={{ fontSize:11, fontWeight:400, opacity:.7, color:'var(--text3)' }}>Segna un prelievo ATM per abbinarlo dopo</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Utilizzo Contanti modal ───────────────────────────────
function UtilizzoModal({ onClose, atmOptions, addCashEntry }) {
  const now = new Date()
  const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const [amount,  setAmount]  = useState('')
  const [cat1,    setCat1]    = useState('Spesa e Alimentari')
  const [cat2,    setCat2]    = useState('')
  const [desc,    setDesc]    = useState('')
  const [date,    setDate]    = useState(localDate)
  const [atmLink, setAtmLink] = useState('')

  const cats = CAT_NAMES.filter(c => c !== 'Entrate' && c !== 'Non Categorizzato')
  const subs = CATS[cat1]?.sub || []

  function handleSave() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    addCashEntry({
      amount: amt, cat1, cat2: cat2 || null,
      note: desc || cat1,
      date, atmTxId: atmLink || null,
    })
    onClose()
  }

  return (
    <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-modal">
        <div className="m-modal-handle"/>
        <div className="m-modal-title">💵 Utilizzo Contanti</div>

        <div className="m-field">
          <label className="m-label">Importo (€)</label>
          <input className="m-input" type="number" inputMode="decimal" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            style={{ fontSize:24, fontWeight:800, textAlign:'center', letterSpacing:'-.03em' }}
            autoFocus/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <div className="m-field" style={{ marginBottom:0 }}>
            <label className="m-label">Categoria</label>
            <select className="m-select" value={cat1} onChange={e => { setCat1(e.target.value); setCat2('') }}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="m-field" style={{ marginBottom:0 }}>
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
            value={desc} onChange={e => setDesc(e.target.value)}/>
        </div>

        <div className="m-field">
          <label className="m-label">Data</label>
          <input className="m-input" type="date" value={date} onChange={e => setDate(e.target.value)}/>
        </div>

        {atmOptions.length > 0 && (
          <div className="m-field">
            <label className="m-label">Abbina a Prelievo ATM (opz.)</label>
            <select className="m-select" value={atmLink} onChange={e => setAtmLink(e.target.value)}>
              <option value="">— Non abbinare —</option>
              {atmOptions.map(tx => (
                <option key={tx.txId} value={tx.txId}>
                  {dateLabel(tx._effDate||tx.date)} · {fmt(tx.amount)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:4 }}>
          <button className="m-btn m-btn-ghost" onClick={onClose}>Annulla</button>
          <button className="m-btn m-btn-primary" onClick={handleSave} disabled={!amount}>✓ Salva</button>
        </div>
      </div>
    </div>
  )
}

// ── Nota Prelievo modal ───────────────────────────────────
function NotaPrelievoModal({ onClose, addNotaPrelievo }) {
  const now = new Date()
  const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const [date,  setDate]  = useState(localDate)
  const [note,  setNote]  = useState('')
  const [amount, setAmount] = useState('')

  function handleSave() {
    if (!date) return
    addNotaPrelievo({
      date, note: note.trim(),
      amount: amount ? parseFloat(amount) : null,
      ts: Date.now(),
    })
    onClose()
  }

  return (
    <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-modal">
        <div className="m-modal-handle"/>
        <div className="m-modal-title">🏧 Nota Prelievo</div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:14, lineHeight:1.5 }}>
          Segna la data e una nota del prelievo. Potrà essere abbinato alle operazioni in un secondo momento.
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <div className="m-field" style={{ marginBottom:0 }}>
            <label className="m-label">Data</label>
            <input className="m-input" type="date" value={date} onChange={e => setDate(e.target.value)} autoFocus/>
          </div>
          <div className="m-field" style={{ marginBottom:0 }}>
            <label className="m-label">Importo (€) opz.</label>
            <input className="m-input" type="number" inputMode="decimal" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)}/>
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">Nota / Luogo</label>
          <input className="m-input" type="text" placeholder="Es: Banca Centro, usato per nanny…"
            value={note} onChange={e => setNote(e.target.value)}/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:4 }}>
          <button className="m-btn m-btn-ghost" onClick={onClose}>Annulla</button>
          <button className="m-btn m-btn-primary" onClick={handleSave} disabled={!date}>✓ Salva</button>
        </div>
      </div>
    </div>
  )
}

export default function MobileContanti({ showAdd, onCloseAdd }) {
  const cashEntries     = useStore(s => s.cashEntries)
  const notePrelievi    = useStore(s => s.notePrelievi)
  const transactions    = useStore(s => s.transactions)
  const addCashEntry    = useStore(s => s.addCashEntry)
  const deleteCashEntry = useStore(s => s.deleteCashEntry)
  const addNotaPrelievo = useStore(s => s.addNotaPrelievo)
  const deleteNotaPrelievo = useStore(s => s.deleteNotaPrelievo)
  const nannyTS         = useStore(s => s.nannyTS)
  const colfTS          = useStore(s => s.colfTS)
  const vehExpenses     = useStore(s => s.vehExpenses)
  const vehicles        = useStore(s => s.vehicles)
  const appPrefs        = useStore(s => s.appPrefs)

  const [addMode, setAddMode] = useState(null) // null | 'scelta' | 'utilizzo' | 'prelievo'

  const nannyName  = appPrefs?.nannyName  || 'Nanny'
  const colfName   = appPrefs?.colfName   || 'Colf'
  const nannyRecon = appPrefs?.nannyRecon || {}
  const colfRecon  = appPrefs?.colfRecon  || {}

  // ATM prelievi from transactions (cat1=Contanti)
  const atmTxsAll = useMemo(() =>
    transactions.filter(t => !t.excluded && t.cat1 === 'Contanti' && t.amount < 0)
      .sort((a, b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [transactions])

  // Unified utilizzo rows (mirrors ContantiPage desktop)
  const utilizzoRows = useMemo(() => {
    const rows = []
    const fmtAtmDate = tx => tx ? (tx._effDate || tx.date || '').slice(0,10) : null

    ;(nannyTS || []).forEach(entry => {
      const recon = nannyRecon[entry.id]
      const atmTx = recon?.txId ? atmTxsAll.find(t => t.txId === recon.txId) : null
      rows.push({
        _id: 'nanny-' + entry.id, tipo: 'nanny', label: nannyName,
        date: (entry.mese || '') + '-01',
        amount: recon ? recon.nannyAmt : entry.totale,
        atmDate: fmtAtmDate(atmTx), readonly: true,
      })
    })

    ;(colfTS || []).forEach(entry => {
      const recon = colfRecon[entry.id]
      const atmTx = recon?.txId ? atmTxsAll.find(t => t.txId === recon.txId) : null
      rows.push({
        _id: 'colf-' + entry.id, tipo: 'colf', label: colfName,
        date: (entry.mese || '') + '-01',
        amount: recon ? recon.nannyAmt : entry.totale,
        atmDate: fmtAtmDate(atmTx), readonly: true,
      })
    })

    ;(vehExpenses || []).filter(e => e.payMethod === 'cash').forEach(e => {
      const veh = (vehicles || []).find(v => v.id === e.vehicleId)
      const vehName = veh ? (veh.nickname || veh.model || 'Veicolo') : 'Veicolo'
      const hasAtm = e.reconType === 'cash' && e.reconRef
      rows.push({
        _id: 'veh-' + e.id, tipo: 'veicoli',
        label: e.desc || '—', sublabel: vehName,
        date: e.date, amount: e.amount,
        atmDate: hasAtm ? ((e.reconRef.match(/\d{4}-\d{2}-\d{2}/)||[])[0]||null) : null,
        readonly: true,
      })
    })

    ;(cashEntries || []).forEach(e => {
      const atmTx = e.atmTxId ? atmTxsAll.find(t => t.txId === e.atmTxId) : null
      rows.push({
        _id: e.id, tipo: 'manual',
        label: e.note || e.cat1 || '—',
        date: e.date, amount: e.amount,
        atmDate: fmtAtmDate(atmTx), readonly: false,
      })
    })

    return rows.sort((a,b) => (b.date||'').localeCompare(a.date||''))
  }, [nannyTS, colfTS, vehExpenses, vehicles, cashEntries, atmTxsAll, nannyRecon, colfRecon, nannyName, colfName])

  const tipoBadgeStyle = {
    nanny:   { color:'#2a7a4a', bg:'#2a7a4a18', label: nannyName },
    colf:    { color:'#b8942a', bg:'#b8942a18', label: colfName  },
    veicoli: { color:'#6a3da8', bg:'#6a3da818', label: '🚗'      },
    manual:  { color:'#2a5c8a', bg:'#2a5c8a18', label: '💵'      },
  }

  // Recent ATM for picker
  const recentAtm = useMemo(() => atmTxsAll.slice(0, 20), [atmTxsAll])

  // Open chooser when showAdd triggers
  useMemo(() => {
    if (showAdd && !addMode) setAddMode('scelta')
  }, [showAdd])

  function handleClose() {
    setAddMode(null)
    onCloseAdd()
  }

  const sortedNotePrelievi = useMemo(() =>
    [...(notePrelievi||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
  , [notePrelievi])

  return (
    <div className="m-content" style={{ paddingBottom:20 }}>

      {/* KPI row */}
      <div className="m-kpi-grid">
        <div className="m-kpi">
          <div className="m-kpi-label">Utilizzi registrati</div>
          <div className="m-kpi-value blue">{utilizzoRows.length}</div>
        </div>
        <div className="m-kpi">
          <div className="m-kpi-label">Prelievi ATM</div>
          <div className="m-kpi-value">{atmTxsAll.length}</div>
        </div>
      </div>

      {/* Utilizzo Contanti unified list */}
      <div className="m-card">
        <div className="m-card-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span>📋 Utilizzo Contanti</span>
          <span style={{ fontSize:11, color:'var(--text3)', fontWeight:500, textTransform:'none', letterSpacing:0 }}>
            {utilizzoRows.length} voci
          </span>
        </div>

        {utilizzoRows.length === 0 ? (
          <div className="m-empty" style={{ padding:32 }}>
            <div className="m-empty-icon">💵</div>
            <div className="m-empty-title">Nessun utilizzo</div>
            <div className="m-empty-sub">Premi "+" per aggiungere un utilizzo contanti.</div>
          </div>
        ) : (
          utilizzoRows.slice(0, 50).map(row => {
            const badge = tipoBadgeStyle[row.tipo] || tipoBadgeStyle.manual
            const dateStr = row.date?.slice(0,7).split('-').reverse().join('/') || '—'
            return (
              <div key={row._id} className="m-list-item"
                style={{ background: row.readonly ? 'var(--surface2)' : undefined }}>
                <div className="m-list-icon"
                  style={{ background: badge.bg, fontSize:14, color:badge.color }}>
                  {badge.label.length <= 2 ? badge.label : badge.label[0]}
                </div>
                <div className="m-list-main">
                  <div className="m-list-title">
                    {row.tipo === 'nanny' ? nannyName
                    : row.tipo === 'colf'  ? colfName
                    : row.label}
                    {row.sublabel ? <span style={{ fontWeight:400, color:'var(--text3)', fontSize:11 }}> · {row.sublabel}</span> : null}
                  </div>
                  <div className="m-list-sub">
                    {dateStr}
                    {row.atmDate
                      ? <span style={{ color:'var(--green)', marginLeft:6 }}>🔗 ATM</span>
                      : <span style={{ color:'var(--text3)', marginLeft:6, opacity:.5 }}>non abbinato</span>}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                  <div className="m-list-amount" style={{ color:'var(--blue)' }}>
                    € {fmtIT(row.amount||0, 0)}
                  </div>
                  {!row.readonly && (
                    <button onClick={() => deleteCashEntry(row._id)}
                      style={{ border:'none', background:'transparent', cursor:'pointer',
                        color:'var(--text3)', fontSize:14, padding:'2px' }}>×</button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Note Prelievi */}
      {sortedNotePrelievi.length > 0 && (
        <div className="m-card">
          <div className="m-card-header">🏧 Note Prelievi</div>
          {sortedNotePrelievi.slice(0, 20).map(n => (
            <div key={n.id} className="m-list-item">
              <div className="m-list-icon" style={{ background:'rgba(60,120,220,.1)', fontSize:16 }}>🏧</div>
              <div className="m-list-main">
                <div className="m-list-title">{n.note || 'Prelievo ATM'}</div>
                <div className="m-list-sub">{n.date} {n.amount ? `· € ${fmtIT(n.amount,0)}` : ''}</div>
              </div>
              <button onClick={() => deleteNotaPrelievo(n.id)}
                style={{ border:'none', background:'transparent', cursor:'pointer',
                  color:'var(--text3)', fontSize:16, padding:'4px', flexShrink:0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {addMode === 'scelta' && (
        <SceltaModal
          onChoose={mode => setAddMode(mode)}
          onClose={handleClose}
        />
      )}
      {addMode === 'utilizzo' && (
        <UtilizzoModal
          onClose={handleClose}
          atmOptions={recentAtm}
          addCashEntry={addCashEntry}
        />
      )}
      {addMode === 'prelievo' && (
        <NotaPrelievoModal
          onClose={handleClose}
          addNotaPrelievo={addNotaPrelievo}
        />
      )}
    </div>
  )
}
