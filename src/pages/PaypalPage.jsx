import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { fmtIT } from '../utils/format'
import { CATS } from '../data/categories'
import { callPaypalVision, callPaypalText } from '../data/aiService'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts'
import './PaypalPage.css'

// ── Helpers ───────────────────────────────────────────────
const isPayPal = t => {
  const haystack = `${t.merchant||''} ${t.description||''} ${t.descAI||''}`.toLowerCase()
  return haystack.includes('paypal') || haystack.includes('pay pal')
}

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function getLast6Months() {
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }
  return months
}

function autoMatch(imports, transactions) {
  return imports.map(imp => {
    if (imp.status === 'matched') return imp
    const impDate = new Date(imp.date)
    const match = transactions.find(t => {
      if (!isPayPal(t)) return false
      if (t._paypalOverride) return false
      const diff = Math.abs(new Date(t._effDate || t.date) - impDate) / 86400000
      const amtMatch = Math.abs(Math.abs(t.amount) - Math.abs(imp.amount)) < 0.02
      return diff <= 3 && amtMatch
    })
    if (match) return { ...imp, status: 'matched', matchedTxId: match.txId }
    return imp
  })
}

// ── Cat dot ───────────────────────────────────────────────
function CatDot({ cat1 }) {
  const color = CATS[cat1]?.color || '#aaa'
  return <span className="pp-cat-dot" style={{ background: color }} />
}

// ── KPI Card ──────────────────────────────────────────────
function KpiCard({ label, value, colorClass, onClick }) {
  return (
    <div className={`pp-kpi${onClick ? ' pp-kpi-clickable' : ''}`} onClick={onClick}>
      <div className="pp-kpi-label">{label}</div>
      <div className={`pp-kpi-value ${colorClass || ''}`}>{value}</div>
    </div>
  )
}

// ── Transaction detail modal ──────────────────────────────
function TxDetailModal({ tx, onClose, updateTransaction }) {
  const [cat1, setCat1] = useState(tx.cat1 || '')
  const [cat2, setCat2] = useState(tx.cat2 || '')
  const [saved, setSaved]  = useState(false)

  const cat1Options = Object.keys(CATS)
  const cat2Options = cat1 && CATS[cat1]?.sub ? CATS[cat1].sub : []

  function handleSave() {
    updateTransaction(tx.txId, { cat1, cat2 })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const effDate = tx._effDate || tx.date || ''
  const valDate = tx.date || ''
  const merchant = tx.merchant || tx.descAI || tx.description?.slice(0,40) || '—'
  const amtColor = tx.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a'
  const amtStr   = `${tx.amount < 0 ? '-' : '+'}€ ${fmtIT(Math.abs(tx.amount), 2)}`

  return (
    <div className="pp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pp-detail-modal">
        <button className="pp-modal-close" onClick={onClose}>✕</button>
        <div className="pp-modal-title">{merchant}</div>
        <div className="pp-modal-amount" style={{ color: amtColor }}>{amtStr}</div>

        <div className="pp-modal-grid">
          <div>
            <div className="pp-modal-label">Data contabile</div>
            <div className="pp-modal-value">{fmtDate(effDate)}</div>
          </div>
          <div>
            <div className="pp-modal-label">Data valuta</div>
            <div className="pp-modal-value">{fmtDate(valDate)}</div>
          </div>
          <div>
            <div className="pp-modal-label">Merchant</div>
            <div className="pp-modal-value">{tx.merchant || '—'}</div>
          </div>
          <div>
            <div className="pp-modal-label">Controparte</div>
            <div className="pp-modal-value">{tx.counterpart || tx.controparte || '—'}</div>
          </div>
          <div>
            <div className="pp-modal-label">Città</div>
            <div className="pp-modal-value">{tx.city || tx.città || '—'}</div>
          </div>
          <div>
            <div className="pp-modal-label">Categoria</div>
            <div className="pp-modal-value">{tx.cat1 ? `${tx.cat1}${tx.cat2 ? ' › ' + tx.cat2 : ''}` : '—'}</div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="pp-modal-label">Descrizione originale</div>
            <div className="pp-modal-value">{tx.description || tx.descAI || '—'}</div>
          </div>
          {tx._paypalOverride && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="pp-modal-label">Fonte</div>
              <div className="pp-modal-value" style={{ color:'#16a34a', fontWeight:600 }}>✅ Abbinata da screenshot PayPal</div>
            </div>
          )}
        </div>

        <div className="pp-modal-edit">
          <div className="pp-modal-edit-title">Modifica Categoria</div>
          <div style={{ display:'flex', gap: 8, flexWrap:'wrap', alignItems:'center' }}>
            <select className="pp-modal-select" value={cat1} onChange={e => { setCat1(e.target.value); setCat2('') }}>
              <option value="">— Categoria L1 —</option>
              {cat1Options.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="pp-modal-select" value={cat2} onChange={e => setCat2(e.target.value)} disabled={!cat2Options.length}>
              <option value="">— Categoria L2 —</option>
              {cat2Options.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className={`pp-modal-save${saved ? ' saved' : ''}`} onClick={handleSave}>
              {saved ? '✓ Salvato' : 'Salva'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Import Modal ──────────────────────────────────────────
function PaypalImportModal({ onClose, onImport, transactions, apiKey }) {
  const [files, setFiles]       = useState([])
  const [processing, setProc]   = useState(false)
  const [results, setResults]   = useState(null)
  const [selected, setSelected] = useState(new Set())

  function handleFiles(newFiles) {
    setFiles(prev => [...prev, ...Array.from(newFiles)])
    setResults(null)
  }

  // Ctrl+V paste support
  useEffect(() => {
    function onPaste(e) {
      const items = Array.from(e.clipboardData?.items || [])
      const imgs = items.filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean)
      if (imgs.length > 0) handleFiles(imgs)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  function removeFile(i) {
    setFiles(prev => prev.filter((_,idx) => idx !== i))
    setResults(null)
  }

  async function analyze() {
    if (!files.length || !apiKey) {
      alert(!apiKey ? 'Chiave API non trovata. Aggiungila nelle Impostazioni.' : 'Seleziona almeno un file.')
      return
    }
    setProc(true)
    setResults(null)
    try {
      const pdfs   = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf')
      const images = files.filter(f => !f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf')

      let allResults = []

      // ── Handle PDFs: extract text → gpt-4o-mini ──────────
      if (pdfs.length > 0) {
        const pdfjsLib = await import('pdfjs-dist')
        const { GlobalWorkerOptions, getDocument } = pdfjsLib
        // Use CDN worker — most reliable in Vite/browser env
        GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

        for (const pdf of pdfs) {
          const arrayBuffer = await pdf.arrayBuffer()
          const doc  = await getDocument({ data: arrayBuffer }).promise
          let fullText = ''
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i)
            const content = await page.getTextContent()
            fullText += content.items.map(item => item.str).join(' ') + '\n'
          }
          const parsed = await callPaypalText(fullText, apiKey)
          allResults = allResults.concat(parsed)
        }
      }

      // ── Handle images: base64 → gpt-4o vision ────────────
      if (images.length > 0) {
        const base64List = await Promise.all(images.map(file => new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = e => resolve(e.target.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })))
        const parsed = await callPaypalVision(base64List, apiKey)
        allResults = allResults.concat(parsed)
      }

      setResults(allResults)
      setSelected(new Set(allResults.map((_,i) => i)))
    } catch(e) {
      alert('Errore analisi AI: ' + e.message)
    } finally {
      setProc(false)
    }
  }

  function toggleAll(v) {
    if (v) setSelected(new Set(results.map((_,i) => i)))
    else setSelected(new Set())
  }

  function toggleItem(i) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(i) ? n.delete(i) : n.add(i)
      return n
    })
  }

  function doImport() {
    if (!results) return
    onImport(results.filter((_,i) => selected.has(i)))
    onClose()
  }

  return (
    <div className="pp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pp-modal">
        <button className="pp-modal-close" onClick={onClose}>✕</button>
        <div className="pp-modal-title">📤 Importa screenshot PayPal</div>

        {!apiKey && (
          <div style={{ padding:'8px 12px', background:'#fef9c3', borderRadius:8, fontSize:12, color:'#92400e', marginBottom:12, border:'1px solid #fcd34d' }}>
            ⚠️ Nessuna chiave API configurata. Aggiungila in <strong>Impostazioni → AI</strong>.
          </div>
        )}

        <div
          className="pp-dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        >
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={e => handleFiles(e.target.files)}
          />
          <div style={{ pointerEvents:'none' }}>
            <div style={{ fontSize:28, marginBottom:6 }}>🖼️</div>
            <div>Trascina screenshot PayPal o clicca per selezionare</div>
            <div style={{ fontSize:11, marginTop:4, opacity:.7 }}>JPG, PNG, PDF · oppure incolla con ⌘V / Ctrl+V</div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="pp-file-list">
            {files.map((f,i) => (
              <div key={i} className="pp-file-item">
                <span>📄 {f.name}</span>
                <button className="pp-file-remove" onClick={() => removeFile(i)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <button
          className="pp-analyze-btn"
          onClick={analyze}
          disabled={!files.length || !apiKey || processing}
        >
          {processing ? '⏳ Analisi in corso...' : '🔍 Analizza con AI'}
        </button>

        {processing && (
          <div className="pp-spinner">Analisi in corso… potrebbe richiedere qualche secondo</div>
        )}

        {results && (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                {results.length} transazioni trovate
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="pp-btn-sm" onClick={() => toggleAll(true)}>Tutte</button>
                <button className="pp-btn-sm" onClick={() => toggleAll(false)}>Nessuna</button>
              </div>
            </div>
            <table className="pp-results-table">
              <thead>
                <tr>
                  <th className="pp-results-th">☑</th>
                  <th className="pp-results-th">Merchant</th>
                  <th className="pp-results-th">Data</th>
                  <th className="pp-results-th">Importo</th>
                  <th className="pp-results-th">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r,i) => (
                  <tr key={i} style={{ opacity: selected.has(i) ? 1 : .45 }}>
                    <td className="pp-results-td">
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggleItem(i)} />
                    </td>
                    <td className="pp-results-td">{r.merchant}</td>
                    <td className="pp-results-td">{fmtDate(r.date)}</td>
                    <td className="pp-results-td" style={{ color: r.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a', fontWeight:600 }}>
                      {r.amount < 0 ? '-' : '+'}€{fmtIT(Math.abs(r.amount), 2)}
                    </td>
                    <td className="pp-results-td">
                      {r.cat1_suggestion && (
                        <span className="pp-cat-cell">
                          <CatDot cat1={r.cat1_suggestion} />
                          {r.cat1_suggestion}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="pp-import-selected-btn"
              onClick={doImport}
              disabled={selected.size === 0}
            >
              ✅ Importa {selected.size} selezionati
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Unmatched overlay ─────────────────────────────────────
function UnmatchedOverlay({ imports, paypalTxs, onManualMatch, onClose }) {
  return (
    <div className="pp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pp-unmatched-modal">
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <div className="pp-modal-title" style={{ margin:0 }}>Operazioni non abbinate ({imports.length})</div>
          <button className="pp-modal-close" style={{ position:'static', marginLeft:'auto' }} onClick={onClose}>✕</button>
        </div>
        <table className="pp-table">
          <thead>
            <tr>
              <th className="pp-th">Data</th>
              <th className="pp-th">Merchant</th>
              <th className="pp-th">Importo</th>
              <th className="pp-th">Categoria suggerita</th>
              <th className="pp-th">Fonte</th>
              <th className="pp-th">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {imports.map(imp => (
              <UnmatchedRow key={imp.id} imp={imp} paypalTxs={paypalTxs} onManualMatch={(id, txId) => { onManualMatch(id, txId); onClose() }} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Manual match row ──────────────────────────────────────
function UnmatchedRow({ imp, paypalTxs, onManualMatch }) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState('')

  const nearby = useMemo(() => {
    const impDate = new Date(imp.date)
    return paypalTxs
      .filter(t => {
        if (t._paypalOverride) return false
        const diff = Math.abs(new Date(t._effDate || t.date) - impDate) / 86400000
        return diff <= 7
      })
      .sort((a,b) => (b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  }, [imp, paypalTxs])

  return (
    <tr className="pp-tr">
      <td className="pp-td">{fmtDate(imp.date)}</td>
      <td className="pp-td">{imp.merchant}</td>
      <td className="pp-td" style={{ color: imp.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a', fontWeight:600 }}>
        {imp.amount < 0 ? '-' : '+'}€{fmtIT(Math.abs(imp.amount), 2)}
      </td>
      <td className="pp-td">
        {imp.cat1_suggestion && (
          <span className="pp-cat-cell">
            <CatDot cat1={imp.cat1_suggestion} />
            {imp.cat1_suggestion}
          </span>
        )}
      </td>
      <td className="pp-td">screenshot</td>
      <td className="pp-td">
        {open ? (
          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
            <select
              className="pp-match-select"
              value={chosen}
              onChange={e => setChosen(e.target.value)}
            >
              <option value="">-- scegli transazione --</option>
              {nearby.map(t => (
                <option key={t.txId} value={t.txId}>
                  {fmtDate(t._effDate||t.date)} · {t.merchant||t.descAI||t.description?.slice(0,25)} · €{fmtIT(Math.abs(t.amount), 2)}
                </option>
              ))}
            </select>
            {chosen && (
              <button className="pp-btn-confirm" onClick={() => { onManualMatch(imp.id, chosen); setOpen(false) }}>
                Abbina
              </button>
            )}
            <button className="pp-btn-sm" onClick={() => setOpen(false)}>✕</button>
          </div>
        ) : (
          <button className="pp-btn-sm" onClick={() => setOpen(true)}>
            Abbina manualmente
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function PaypalPage() {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)

  // Read API key from settings (same key used for AI enrichment)
  const apiKey = appPrefs?.geminiKey || localStorage.getItem('fm-gemini-key') || ''

  const [showModal, setShowModal]       = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [search, setSearch]             = useState('')
  const [selectedTx, setSelectedTx]     = useState(null)

  const paypalImports = useMemo(
    () => appPrefs?.paypalImports || [],
    [appPrefs?.paypalImports]
  )

  const paypalTxs = useMemo(
    () => transactions.filter(isPayPal),
    [transactions]
  )

  const last6 = useMemo(() => getLast6Months(), [])
  const paypalExpenses = useMemo(() =>
    paypalTxs.filter(t => {
      if (t.amount >= 0) return false
      const ym = (t._effDate||t.date||'').slice(0,7)
      return last6.includes(ym)
    }),
    [paypalTxs, last6]
  )

  // KPIs
  const totalSpent   = useMemo(() => paypalExpenses.reduce((s,t) => s + Math.abs(t.amount), 0), [paypalExpenses])
  const txCount      = paypalTxs.length
  const unmatchedCnt = paypalImports.filter(i => i.status === 'unmatched').length
  const monthlyAvg   = last6.length > 0 ? totalSpent / last6.length : 0

  // Pie data
  const pieData = useMemo(() => {
    const map = {}
    paypalExpenses.forEach(t => {
      const k = t.cat1 || 'Non Categorizzato'
      map[k] = (map[k] || 0) + Math.abs(t.amount)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [paypalExpenses])

  const pieTotal = pieData.reduce((s,d) => s + d.value, 0)

  // Bar data
  const barCats = useMemo(() => {
    const s = new Set(paypalExpenses.map(t => t.cat1 || 'Altro'))
    return [...s]
  }, [paypalExpenses])

  const barData = useMemo(() => {
    return last6.map(ym => {
      const row = { month: ym.slice(5) }
      barCats.forEach(c => { row[c] = 0 })
      paypalExpenses
        .filter(t => (t._effDate||t.date||'').slice(0,7) === ym)
        .forEach(t => {
          const c = t.cat1 || 'Altro'
          row[c] = (row[c] || 0) + Math.abs(t.amount)
        })
      return row
    })
  }, [paypalExpenses, last6, barCats])

  // Sorted + filtered transactions
  const sortedTxs = useMemo(() =>
    [...paypalTxs].sort((a,b) =>
      (b._effDate||b.date||'').localeCompare(a._effDate||a.date||'')
    ),
    [paypalTxs]
  )

  const filteredTxs = useMemo(() => {
    if (!search.trim()) return sortedTxs
    const q = search.toLowerCase()
    return sortedTxs.filter(t => {
      const d = (t._effDate||t.date||'').replace(/-/g,'/')
      const m = (t.merchant||'').toLowerCase()
      const desc = (t.description||'').toLowerCase()
      const descAI = (t.descAI||'').toLowerCase()
      const cat1 = (t.cat1||'').toLowerCase()
      const cat2 = (t.cat2||'').toLowerCase()
      const amt = String(Math.abs(t.amount))
      return m.includes(q) || desc.includes(q) || descAI.includes(q) || cat1.includes(q) || cat2.includes(q) || d.includes(q) || amt.includes(q)
    })
  }, [sortedTxs, search])

  function handleImport(newItems) {
    const withId = newItems.map(item => ({
      id: `pp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      merchant: item.merchant,
      date: item.date,
      amount: item.amount,
      type: item.type || '',
      cat1_suggestion: item.cat1_suggestion || '',
      cat2_suggestion: item.cat2_suggestion || '',
      source: 'screenshot',
      status: 'unmatched',
      matchedTxId: null,
      importedAt: new Date().toISOString(),
    }))

    const afterMatch = autoMatch([...paypalImports, ...withId], transactions)

    afterMatch.forEach(imp => {
      if (imp.status === 'matched' && imp.matchedTxId) {
        const wasUnmatched = withId.find(w => w.id === imp.id)
        const alreadyDone  = paypalImports.find(p => p.id === imp.id && p.status === 'matched')
        if (wasUnmatched && !alreadyDone) {
          updateTransaction(imp.matchedTxId, {
            merchant: imp.merchant,
            descAI: imp.merchant,
            cat1: imp.cat1_suggestion,
            cat2: imp.cat2_suggestion,
            _paypalOverride: true,
            conf: 100,
          })
        }
      }
    })

    setAppPref('paypalImports', afterMatch)
  }

  function handleManualMatch(importId, txId) {
    const imp = paypalImports.find(i => i.id === importId)
    if (!imp) return
    updateTransaction(txId, {
      merchant: imp.merchant,
      descAI: imp.merchant,
      cat1: imp.cat1_suggestion,
      cat2: imp.cat2_suggestion,
      _paypalOverride: true,
      conf: 100,
    })
    const updated = paypalImports.map(i =>
      i.id === importId ? { ...i, status: 'matched', matchedTxId: txId } : i
    )
    setAppPref('paypalImports', updated)
  }

  const unmatchedImports = paypalImports.filter(i => i.status === 'unmatched')

  return (
    <div className="pp-page">
      {/* Header */}
      <div className="pp-header">
        <div>
          <div className="pp-title">💙 PayPal</div>
          <div className="pp-subtitle">Transazioni PayPal · ultimi 6 mesi</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {unmatchedCnt > 0 && (
            <button className="pp-unmatched-btn" onClick={() => setShowUnmatched(true)}>
              ⚠️ Non abbinate ({unmatchedCnt})
            </button>
          )}
          <button className="pp-import-btn" onClick={() => setShowModal(true)}>
            📤 Importa screenshot
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="pp-kpis">
        <KpiCard label="Totale speso (6 mesi)" value={`€ ${fmtIT(totalSpent, 2)}`} colorClass="red" />
        <KpiCard label="N. transazioni" value={txCount} colorClass="blue" />
        <KpiCard
          label="Non abbinate"
          value={unmatchedCnt}
          colorClass={unmatchedCnt > 0 ? 'amber' : ''}
          onClick={unmatchedCnt > 0 ? () => setShowUnmatched(true) : undefined}
        />
        <KpiCard label="Media mensile" value={`€ ${fmtIT(monthlyAvg, 2)}`} />
      </div>

      {/* Charts */}
      <div className="pp-charts">
        <div className="pp-chart-card" style={{ flex:'0 0 320px' }}>
          <div className="pp-chart-title">Per categoria</div>
          {pieData.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text3)', fontSize:13 }}>Nessuna transazione PayPal</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={90}
                  dataKey="value"
                  isAnimationActive={false}
                  label={({ name, value, cx, cy, midAngle, innerRadius, outerRadius }) => {
                    const pct = pieTotal > 0 ? (value / pieTotal * 100) : 0
                    if (pct < 5) return null
                    const RADIAN = Math.PI / 180
                    const r = innerRadius + (outerRadius - innerRadius) * 0.55
                    const x = cx + r * Math.cos(-midAngle * RADIAN)
                    const y = cy + r * Math.sin(-midAngle * RADIAN)
                    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>{Math.round(pct)}%</text>
                  }}
                >
                  {pieData.map((entry,i) => <Cell key={i} fill={CATS[entry.name]?.color||'#aaa'} />)}
                </Pie>
                <Tooltip formatter={(v) => `€ ${fmtIT(v, 2)}`} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 12px', marginTop:8 }}>
            {pieData.map((d,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text2)' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:CATS[d.name]?.color||'#aaa', flexShrink:0 }}/>
                {d.name}
              </div>
            ))}
          </div>
        </div>

        <div className="pp-chart-card" style={{ flex:1 }}>
          <div className="pp-chart-title">Ultimi 6 mesi per categoria</div>
          {barData.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text3)', fontSize:13 }}>Nessun dato</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top:4, right:4, left:-10, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize:11 }} axisLine />
                <YAxis tick={{ fontSize:11 }} axisLine tickFormatter={v => `€${fmtIT(v)}`} />
                <Tooltip formatter={(v,name) => [`€ ${fmtIT(v, 2)}`, name]} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                {barCats.map(c => (
                  <Bar key={c} dataKey={c} stackId="a" fill={CATS[c]?.color||'#aaa'} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Main transactions table */}
      <div className="pp-table-card">
        <div className="pp-table-header">
          <div className="pp-table-title">Transazioni PayPal ({filteredTxs.length}{search ? `/${paypalTxs.length}` : ''})</div>
          <input
            className="pp-search-input"
            type="search"
            placeholder="Cerca merchant, categoria, importo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {filteredTxs.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', color:'var(--text3)', fontSize:13 }}>
            {search ? 'Nessun risultato per la ricerca' : 'Nessuna transazione PayPal trovata'}
          </div>
        ) : (
          <table className="pp-table">
            <thead>
              <tr>
                <th className="pp-th">Data</th>
                <th className="pp-th">Merchant</th>
                <th className="pp-th">Importo</th>
                <th className="pp-th">Cat L1</th>
                <th className="pp-th">Cat L2</th>
                <th className="pp-th">Stato</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxs.map(t => (
                <tr
                  key={t.txId}
                  className="pp-tr pp-tr-clickable"
                  onClick={() => setSelectedTx(t)}
                >
                  <td className="pp-td">{fmtDate(t._effDate||t.date)}</td>
                  <td className="pp-td">{t.merchant || t.descAI || t.description?.slice(0,40)}</td>
                  <td className="pp-td" style={{ fontWeight:600, color: t.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a' }}>
                    {t.amount < 0 ? '-' : '+'}€{fmtIT(Math.abs(t.amount), 2)}
                  </td>
                  <td className="pp-td">
                    {t.cat1 && (
                      <span className="pp-cat-cell">
                        <CatDot cat1={t.cat1} />
                        {t.cat1}
                      </span>
                    )}
                  </td>
                  <td className="pp-td" style={{ color:'var(--text2)', fontSize:12 }}>
                    {t.cat2 || '—'}
                  </td>
                  <td className="pp-td">
                    {t._paypalOverride
                      ? <span className="pp-badge-matched">✅ abbinata</span>
                      : <span style={{ color:'var(--text3)' }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <PaypalImportModal
          onClose={() => setShowModal(false)}
          onImport={handleImport}
          transactions={transactions}
          apiKey={apiKey}
        />
      )}

      {showUnmatched && unmatchedImports.length > 0 && (
        <UnmatchedOverlay
          imports={unmatchedImports}
          paypalTxs={paypalTxs}
          onManualMatch={handleManualMatch}
          onClose={() => setShowUnmatched(false)}
        />
      )}

      {selectedTx && (
        <TxDetailModal
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          updateTransaction={updateTransaction}
        />
      )}
    </div>
  )
}
