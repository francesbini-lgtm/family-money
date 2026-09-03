import { useMemo, useState } from 'react'
import { EXPORT_COLUMNS, exportRowsCSV } from '../services/export'

// ── Wizard di export CSV (2 step) ─────────────────────────────────────────────
// Step 1: intervallo date (inizio/fine). Step 2: anteprima tabellare a piena pagina,
// righe selezionabili (di default tutte) e colonne attivabili/disattivabili per evitare
// lo scroll orizzontale. Annulla in basso a sinistra, Esporta in basso a destra.
export default function ExportWizard({ transactions, onClose }) {
  // Universo esportabile: righe non escluse (come il vecchio export).
  const base = useMemo(
    () => transactions.filter(t => !t.excluded),
    [transactions]
  )
  // Range di date disponibile (sul campo Data = t.date, coerente con la colonna mostrata)
  const [minD, maxD] = useMemo(() => {
    let lo = null, hi = null
    for (const t of base) {
      const d = t.date
      if (!d) continue
      if (lo == null || d < lo) lo = d
      if (hi == null || d > hi) hi = d
    }
    return [lo || '', hi || '']
  }, [base])

  const [step, setStep]         = useState(1)
  const [from, setFrom]         = useState(minD)
  const [to, setTo]             = useState(maxD)
  const [visibleCols, setVisibleCols] = useState(() => new Set(EXPORT_COLUMNS.map(c => c.key)))
  const [deselected, setDeselected]   = useState(() => new Set())

  // Righe nel range (filtro sul campo Data), ordinate dalla più recente
  const rows = useMemo(() => {
    return base
      .filter(t => {
        const d = t.date || ''
        if (from && d < from) return false
        if (to && d > to) return false
        return true
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [base, from, to])

  const cols = useMemo(() => EXPORT_COLUMNS.filter(c => visibleCols.has(c.key)), [visibleCols])
  const selectedRows = useMemo(() => rows.filter(t => !deselected.has(t.txId)), [rows, deselected])
  const selCount = selectedRows.length

  function toggleCol(key) {
    setVisibleCols(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }
  function toggleRow(txId) {
    setDeselected(prev => {
      const n = new Set(prev)
      n.has(txId) ? n.delete(txId) : n.add(txId)
      return n
    })
  }
  const allSelected = rows.length > 0 && deselected.size === 0
  function toggleAll() {
    setDeselected(allSelected ? new Set(rows.map(t => t.txId)) : new Set())
  }

  function doExport() {
    if (!selCount || cols.length === 0) return
    const keys = EXPORT_COLUMNS.filter(c => visibleCols.has(c.key)).map(c => c.key)
    const fn = `family-money_${from || 'inizio'}_${to || 'fine'}.csv`
    exportRowsCSV(selectedRows, keys, fn)
    onClose()
  }

  const btn = { fontSize: 14, padding: '11px 26px', fontWeight: 700, borderRadius: 10, cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        width: step === 1 ? 560 : '100%', height: step === 1 ? 'auto' : '100%',
        maxWidth: step === 1 ? '96vw' : '100%', maxHeight: step === 1 ? '92vh' : '100%',
        display: 'flex', flexDirection: 'column', padding: step === 1 ? '26px 30px' : '20px 24px', position: 'relative' }}>

        <button onClick={onClose} title="Chiudi"
          style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)' }}>✕</button>

        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2, flexShrink: 0 }}>📤 Esporta transazioni</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, flexShrink: 0 }}>
          {step === 1
            ? 'Scegli l’intervallo di date da esportare.'
            : 'Controlla l’anteprima: deseleziona righe o togli colonne, poi esporta.'}
        </div>

        {/* ── Step 1: date ── */}
        {step === 1 && (
          <>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
              <label style={{ flex: 1, minWidth: 180 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Data inizio</span>
                <input type="date" value={from} min={minD} max={maxD} onChange={e => setFrom(e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }} />
              </label>
              <label style={{ flex: 1, minWidth: 180 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Data fine</span>
                <input type="date" value={to} min={minD} max={maxD} onChange={e => setTo(e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                ['Tutte', () => { setFrom(minD); setTo(maxD) }],
                ['Quest’anno', () => { const y = new Date().getFullYear(); setFrom(`${y}-01-01`); setTo(`${y}-12-31`) }],
                ['Ultimi 12 mesi', () => { const d = new Date(); const to2 = d.toISOString().slice(0,10); d.setFullYear(d.getFullYear()-1); setFrom(d.toISOString().slice(0,10)); setTo(to2) }],
              ].map(([lbl, fn]) => (
                <button key={lbl} onClick={fn}
                  style={{ fontSize: 12, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', fontWeight: 600 }}>{lbl}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
              {rows.length} transazioni nell’intervallo selezionato.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
              <button onClick={onClose} className="btn btn-secondary" style={btn}>Annulla</button>
              <button onClick={() => setStep(2)} disabled={rows.length === 0}
                className="btn btn-primary" style={{ ...btn, opacity: rows.length === 0 ? .5 : 1 }}>Continua →</button>
            </div>
          </>
        )}

        {/* ── Step 2: anteprima ── */}
        {step === 2 && (
          <>
            {/* Toggle colonne */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', alignSelf: 'center', marginRight: 4 }}>Colonne:</span>
              {EXPORT_COLUMNS.map(c => {
                const on = visibleCols.has(c.key)
                return (
                  <button key={c.key} onClick={() => toggleCol(c.key)}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontWeight: 600,
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'var(--accent-l)' : 'var(--surface2)',
                      color: on ? 'var(--accent)' : 'var(--text3)',
                      textDecoration: on ? 'none' : 'line-through' }}>
                    {c.label}
                  </button>
                )
              })}
            </div>

            {/* Tabella anteprima */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 10px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2, width: 34 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Seleziona/deseleziona tutte" />
                    </th>
                    {cols.map(c => (
                      <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase',
                        color: 'var(--text3)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', textAlign: c.quote === false && c.key === 'importo' ? 'right' : 'left',
                        whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => {
                    const on = !deselected.has(t.txId)
                    return (
                      <tr key={t.txId} onClick={() => toggleRow(t.txId)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', opacity: on ? 1 : .4, background: on ? 'transparent' : 'var(--surface2)' }}>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          <input type="checkbox" checked={on} onChange={() => toggleRow(t.txId)} onClick={e => e.stopPropagation()} />
                        </td>
                        {cols.map(c => {
                          const v = c.get(t)
                          const isAmt = c.key === 'importo'
                          return (
                            <td key={c.key} style={{ padding: '5px 10px', whiteSpace: 'nowrap',
                              maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
                              textAlign: isAmt ? 'right' : 'left',
                              fontFamily: (isAmt || c.key === 'data' || c.key === 'dataImport' || c.key === 'txId') ? 'var(--font-mono)' : 'inherit',
                              color: isAmt ? ((t.amount ?? 0) >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text)',
                              fontWeight: isAmt ? 700 : 400 }} title={typeof v === 'string' ? v : ''}>{v}</td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexShrink: 0, gap: 12 }}>
              <button onClick={onClose} className="btn btn-secondary" style={btn}>Annulla</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                  <b style={{ color: 'var(--text)' }}>{selCount}</b>/{rows.length} righe · <b style={{ color: 'var(--text)' }}>{cols.length}</b> colonne
                </span>
                <button onClick={() => setStep(1)} className="btn btn-secondary" style={{ ...btn, padding: '11px 18px' }}>← Date</button>
                <button onClick={doExport} disabled={!selCount || cols.length === 0}
                  className="btn btn-primary" style={{ ...btn, opacity: (!selCount || cols.length === 0) ? .5 : 1 }}>
                  Esporta CSV ↓
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
