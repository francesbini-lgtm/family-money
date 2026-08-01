import { useState } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { fmtIT, fmtDate } from '../utils/format'

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot della tabella Proiezione (Forecast). Tre pezzi:
//  - SaveSnapshotModal : scegli colonne + fino a quale periodo + titolo → salva
//  - SnapshotsListModal: elenco dei salvataggi (data/ora + nome) → apri / elimina
//  - SnapshotOverlay    : pagina ampia col confronto forecast salvato vs REALE
//                         (2 colonne nuove Risparmio/Saldo reali + chart)
// I valori "reali" (quanto effettivamente risparmiato e saldo effettivo) sono
// calcolati live dalle transazioni nel componente padre (ForecastPage) e passati
// qui via computeActual(key) → { risparmio, saldo } | null (null = periodo futuro).
// ─────────────────────────────────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '4vh 3vw', overflow: 'auto',
}
function cardStyle(maxW) {
  return {
    background: 'var(--surface, #fff)', color: 'var(--text)', borderRadius: 14,
    padding: 20, width: '100%', maxWidth: maxW, boxShadow: '0 12px 40px rgba(0,0,0,.25)',
  }
}
const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }

function fmtSigned(v) {
  if (v == null || isNaN(v)) return '—'
  const n = Math.round(v)
  return `${n < 0 ? '−' : ''}€ ${fmtIT(Math.abs(n), 0)}`
}

// ── Modale: salva vista ──────────────────────────────────────────────────────
export function SaveSnapshotModal({ view, selectableCols, periods, onSave, onClose }) {
  const [title, setTitle] = useState('')
  const [cols, setCols] = useState(() => new Set(selectableCols))
  const [upToKey, setUpToKey] = useState(periods.length ? periods[periods.length - 1].key : '')

  function toggleCol(c) {
    setCols(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })
  }
  function save() {
    onSave({
      title: title.trim(),
      columns: selectableCols.filter(c => cols.has(c)),
      upToKey,
    })
  }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={cardStyle(460)} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>💾 Salva vista proiezione</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
        </div>

        <div style={{ ...labelStyle, marginBottom: 6 }}>Titolo (opzionale)</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`Proiezione ${view} — ${fmtDate(new Date().toISOString().slice(0, 10))}`}
          style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, #fff)', color: 'var(--text)', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }} />

        <div style={{ ...labelStyle, marginBottom: 6 }}>Quali colonne salvare</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {selectableCols.map(c => (
            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={cols.has(c)} onChange={() => toggleCol(c)} />
              {c}
            </label>
          ))}
        </div>

        <div style={{ ...labelStyle, marginBottom: 6 }}>Fino a quale periodo</div>
        <select value={upToKey} onChange={e => setUpToKey(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, #fff)', color: 'var(--text)', fontSize: 13, marginBottom: 18, boxSizing: 'border-box' }}>
          {periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>Annulla</button>
          <button onClick={save} disabled={cols.size === 0}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: cols.size === 0 ? 'var(--border)' : 'var(--accent, #2563eb)', color: '#fff', cursor: cols.size === 0 ? 'default' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modale: elenco salvataggi ────────────────────────────────────────────────
export function SnapshotsListModal({ snapshots, onOpen, onDelete, onClose }) {
  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={cardStyle(520)} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📂 Viste salvate</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
        </div>
        {snapshots.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Nessuna vista salvata finora.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {snapshots.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <button onClick={() => onOpen(s)} style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title || `Proiezione ${s.view}`}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {fmtDate((s.createdAt || '').slice(0, 10))} {(s.createdAt || '').slice(11, 16)} · vista {s.view} · {s.rows?.length || 0} periodi
                  </div>
                </button>
                <button onClick={() => onDelete(s.id)} title="Elimina" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14 }}>🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Overlay: confronto forecast salvato vs reale ─────────────────────────────
export function SnapshotOverlay({ snapshot, computeActual, onClose }) {
  const cols = snapshot.columns || []
  const periodCol = snapshot.view === 'annuale' ? 'Anno' : 'Mese'
  // Colonne del forecast salvato che NON sono il periodo (già mostrato a sinistra)
  const valueCols = cols.filter(c => c !== periodCol)

  const chartData = snapshot.rows.map(r => {
    const a = computeActual(r.key)
    return {
      label: r.label,
      fRisparmio: r.fRisparmio,
      fSaldo: r.fSaldo,
      aRisparmio: a ? a.risparmio : null,
      aSaldo: a ? a.saldo : null,
    }
  })

  const th = { padding: '7px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td = { padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={cardStyle(1100)} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{snapshot.title || `Proiezione ${snapshot.view}`}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Salvato il {fmtDate((snapshot.createdAt || '').slice(0, 10))} {(snapshot.createdAt || '').slice(11, 16)} · vista {snapshot.view}.
          Le colonne <strong style={{ color: 'var(--green)' }}>Risparmio (reale)</strong> e <strong style={{ color: 'var(--blue)' }}>Saldo (reale)</strong> sono i valori veri calcolati oggi dalle transazioni.
        </div>

        {/* Chart confronto */}
        <div style={{ height: 300, marginBottom: 18 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="risparmio" tick={{ fontSize: 11 }} tickFormatter={v => fmtIT(v, 0)} />
              <YAxis yAxisId="saldo" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => fmtIT(v, 0)} />
              <Tooltip formatter={(v, n) => [v == null ? '—' : `€ ${fmtIT(Math.round(v), 0)}`, n]} />
              <Line yAxisId="risparmio" type="monotone" dataKey="fRisparmio" name="Risparmio previsto" stroke="var(--green)" strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line yAxisId="risparmio" type="monotone" dataKey="aRisparmio" name="Risparmio reale" stroke="var(--green)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              <Line yAxisId="saldo" type="monotone" dataKey="fSaldo" name="Saldo previsto" stroke="var(--blue)" strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line yAxisId="saldo" type="monotone" dataKey="aSaldo" name="Saldo reale" stroke="var(--blue)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Tabella confronto */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>{periodCol}</th>
                {valueCols.map(c => <th key={c} style={th}>{c}</th>)}
                <th style={{ ...th, color: 'var(--green)' }}>Risparmio (reale)</th>
                <th style={{ ...th, color: 'var(--blue)' }}>Saldo (reale)</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map(r => {
                const a = computeActual(r.key)
                return (
                  <tr key={r.key}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.label}</td>
                    {valueCols.map(c => <td key={c} style={td}>{fmtSigned(r.cells?.[c])}</td>)}
                    <td style={{ ...td, color: 'var(--green)', fontWeight: 700 }}>{a ? fmtSigned(a.risparmio) : '—'}</td>
                    <td style={{ ...td, color: 'var(--blue)', fontWeight: 700 }}>{a ? fmtSigned(a.saldo) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
