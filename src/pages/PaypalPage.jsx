import React, { useState, useMemo, useEffect } from 'react'
import VehicleQuickPicker from '../components/VehicleQuickPicker'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
import { useStore } from '../store/useStore'
import { fmtIT, fmtDate } from '../utils/format'
import { CATS, getMergedCats } from '../data/categories'
import { callPaypalVision, callPaypalText, callPaypalReclassify } from '../data/aiService'
import { showToast } from '../services/notifications'
import { netAmt, isCompensated, compensateGroup, removeCompensationGroup } from '../data/compensation'
import { PaypalIcon } from '../components/BrandIcons'
import CompDaConfermare from '../components/CompDaConfermare'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts'
import './PaypalPage.css'

// ── Helpers ───────────────────────────────────────────────
// export: riusato dal wizard di importazione unificata (ImportWizard.jsx)
export const isPayPal = t => {
  const haystack = `${t.merchant||''} ${t.description||''} ${t.descAI||''}`.toLowerCase()
  return haystack.includes('paypal') || haystack.includes('pay pal')
}

function fmtDateLong(d) {
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
  const usedTxIds = new Set()
  // Seed with transactions already claimed by matched/pending imports
  imports.forEach(imp => {
    if (imp.matchedTxId) usedTxIds.add(imp.matchedTxId)
    if (imp.pendingTxId) usedTxIds.add(imp.pendingTxId)
  })
  return imports.map(imp => {
    if (imp.status === 'matched' || imp.status === 'pending_approval') return imp
    const impDate = new Date(imp.date)
    const amtCents = Math.round(Math.abs(imp.amount) * 100)

    let bestMatch = null
    let bestDiff = Infinity
    for (const t of transactions) {
      if (!isPayPal(t)) continue
      if (t._paypalOverride) continue
      if (usedTxIds.has(t.txId)) continue
      if (Math.abs(Math.round(Math.abs(t.amount) * 100) - amtCents) >= 2) continue
      const diff = Math.abs(new Date(t._effDate || t.date) - impDate) / 86400000
      if (diff < bestDiff) { bestDiff = diff; bestMatch = t }
    }

    if (!bestMatch) return imp
    if (bestDiff <= 1) {
      usedTxIds.add(bestMatch.txId)
      return { ...imp, status: 'matched', matchedTxId: bestMatch.txId }
    }
    if (bestDiff <= 6) {
      usedTxIds.add(bestMatch.txId)
      return { ...imp, status: 'pending_approval', pendingTxId: bestMatch.txId }
    }
    return imp
  })
}

function daysDiff(d1, d2) {
  if (!d1 || !d2) return '?'
  return Math.round(Math.abs(new Date(d1) - new Date(d2)) / 86400000)
}

// ── Applica un import PayPal (estratto da handleImport per riuso nel wizard di
// importazione unificata, ImportWizard.jsx) ─────────────────────────────────────
// Dedup, assegnazione id, auto-match con le transazioni bancarie (autoMatch: importo
// al centesimo, ≤1 giorno → matched, ≤6 giorni → pending_approval), applicazione dei
// match automatici alle transazioni (merchant/descAI/categorie suggerite, con backup
// _paypalOrig per il dis-abbina) e salvataggio del registro in appPrefs.paypalImports.
// Ritorna i conteggi che servono alla schermata di riepilogo del wizard.
export function applyPaypalImport(newItems, { paypalImports, transactions, updateTransaction, setAppPref }) {
  const deduped = newItems.filter(item => !isAlreadyImported(item, paypalImports))
  if (deduped.length === 0) return { added: 0, matchedNew: 0, pendingNew: 0, unmatchedNew: 0, afterMatch: paypalImports }
  const withId = deduped.map(item => ({
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

  const origPatch = (txId) => {
    const tx = transactions.find(t => t.txId === txId)
    if (!tx || tx._paypalOrig) return {}
    return { _paypalOrig: {
      merchant: tx.merchant ?? null, descAI: tx.descAI ?? null,
      cat1: tx.cat1 ?? null, cat2: tx.cat2 ?? null, conf: tx.conf ?? null,
    } }
  }

  afterMatch.forEach(imp => {
    if (imp.status === 'matched' && imp.matchedTxId) {
      const alreadyDone = paypalImports.find(p => p.id === imp.id && p.status === 'matched')
      if (!alreadyDone) {
        const patch = {
          ...origPatch(imp.matchedTxId),
          merchant: imp.merchant,
          descAI: imp.merchant,
          _paypalOverride: true,
          conf: 100,
        }
        if (imp.cat1_suggestion) patch.cat1 = imp.cat1_suggestion
        if (imp.cat2_suggestion) patch.cat2 = imp.cat2_suggestion
        updateTransaction(imp.matchedTxId, patch)
      }
    }
  })

  setAppPref('paypalImports', afterMatch)

  const isNew = (imp) => withId.some(w => w.id === imp.id)
  return {
    added:        withId.length,
    matchedNew:   afterMatch.filter(i => isNew(i) && i.status === 'matched').length,
    pendingNew:   afterMatch.filter(i => isNew(i) && i.status === 'pending_approval').length,
    unmatchedNew: afterMatch.filter(i => isNew(i) && i.status === 'unmatched').length,
    afterMatch,
  }
}

// ── PayPal Abbinamento confirmation modal ─────────────────
function PaypalAbbinamentoModal({ incomes, expenses, onConfirm, onClose }) {
  // Compute how each income covers each expense (greedy)
  const preview = (() => {
    const incRem = incomes.map(t => ({ ...t, rem: t.amount }))
    const expRem = expenses.map(t => ({ ...t, rem: Math.abs(t.amount) }))
    const pairs = []
    for (const exp of expRem) {
      for (const inc of incRem) {
        if (inc.rem <= 0 || exp.rem <= 0) continue
        const comp = Math.min(inc.rem, exp.rem)
        pairs.push({ inc, exp, comp })
        inc.rem -= comp
        exp.rem -= comp
      }
    }
    return { pairs, incRem, expRem }
  })()

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,width:520,maxWidth:'92vw',maxHeight:'85vh',overflowY:'auto',padding:24,boxShadow:'0 8px 32px rgba(0,0,0,.2)'}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>🔗 Abbina transazioni PayPal</div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          <div style={{background:'rgba(22,163,74,.08)',border:'1px solid rgba(22,163,74,.25)',borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:8}}>Entrate</div>
            {incomes.map(t => (
              <div key={t.txId} style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:12,marginBottom:4}}>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{t.descAI||t.merchant||t.description?.slice(0,30)}</span>
                <span style={{fontWeight:700,color:'var(--green)',whiteSpace:'nowrap',fontFamily:'var(--font-mono)'}}>+€{t.amount.toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
              </div>
            ))}
          </div>
          <div style={{background:'rgba(214,78,78,.06)',border:'1px solid rgba(214,78,78,.2)',borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:8}}>Uscite</div>
            {expenses.map(t => (
              <div key={t.txId} style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:12,marginBottom:4}}>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{t.descAI||t.merchant||t.description?.slice(0,30)}</span>
                <span style={{fontWeight:700,color:'var(--red,#d64e4e)',whiteSpace:'nowrap',fontFamily:'var(--font-mono)'}}>−€{Math.abs(t.amount).toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px',marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:8}}>Compensazioni</div>
          {preview.pairs.map((p,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,marginBottom:4}}>
              <span style={{color:'var(--green)',fontWeight:600,fontFamily:'var(--font-mono)'}}>+€{p.comp.toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
              <span style={{color:'var(--text3)'}}>da</span>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{p.inc.descAI||p.inc.merchant||'entrata'}</span>
              <span style={{color:'var(--text3)'}}>→</span>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{p.exp.descAI||p.exp.merchant||'uscita'}</span>
            </div>
          ))}
          {preview.incRem.some(t => t.rem > 0.005) && (
            <div style={{marginTop:6,fontSize:11,color:'var(--gold)'}}>
              ⚠️ Residuo entrate: {preview.incRem.filter(t=>t.rem>0.005).map(t=>`€${t.rem.toLocaleString('it-IT',{minimumFractionDigits:2})}`).join(', ')}
            </div>
          )}
          {preview.expRem.some(t => t.rem > 0.005) && (
            <div style={{marginTop:4,fontSize:11,color:'var(--red,#d64e4e)'}}>
              ⚠️ Non coperte: {preview.expRem.filter(t=>t.rem>0.005).map(t=>`€${t.rem.toLocaleString('it-IT',{minimumFractionDigits:2})}`).join(', ')}
            </div>
          )}
        </div>

        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={onConfirm}>Conferma abbinamento</button>
        </div>
      </div>
    </div>
  )
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
function TxDetailModal({ tx, onClose, updateTransaction, customCats }) {
  const [cat1, setCat1] = useState(tx.cat1 || '')
  const [cat2, setCat2] = useState(tx.cat2 || '')
  const [saved, setSaved]  = useState(false)
  const [toReview, setToReview] = useState(tx?._flagged || false)
  function toggleReview() { const n=!toReview; setToReview(n); updateTransaction(tx.txId,{_flagged:n}) }

  const allCats = getMergedCats(customCats)
  const cat1Options = Object.keys(allCats)
  const cat2Options = cat1 && allCats[cat1]?.sub ? allCats[cat1].sub : []

  function handleSave() {
    updateTransaction(tx.txId, { cat1, cat2 })
    setSaved(true)
    setTimeout(onClose, 1000)
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

        {/* ── To Review flag ── */}
        <div onClick={toggleReview}
          style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'10px 14px',borderRadius:8,cursor:'pointer',userSelect:'none',
            background:toReview?'rgba(245,158,11,.08)':'var(--surface2)',
            border:`1px solid ${toReview?'#f59e0b':'var(--border)'}`}}>
          <span style={{fontSize:13,fontWeight:600,color:toReview?'#92400e':'var(--text2)'}}>
            🔍 Da rivedere
          </span>
          <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,fontWeight:700,
            background:toReview?'#f59e0b':'var(--border)',
            color:toReview?'#fff':'var(--text3)'}}>
            {toReview ? 'Attivo' : 'Off'}
          </span>
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
          <VehicleQuickPicker txId={tx.txId} cat1={cat1} />
        </div>
      </div>
    </div>
  )
}

// ── Pending approval modal ────────────────────────────────
function PendingApprovalModal({ imp, tx, onApprove, onReject, onClose }) {
  const impMerchant = imp.merchant || '—'
  const txMerchant  = tx ? (tx.merchant || tx.descAI || tx.description?.slice(0,40) || '—') : null
  const diff        = tx ? daysDiff(imp.date, tx._effDate || tx.date) : '?'

  return (
    <div className="pp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pp-approval-modal">
        <button className="pp-modal-close" onClick={onClose}>✕</button>
        <div className="pp-modal-title">⏳ Abbinamento da approvare</div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16 }}>
          Stesso importo, {diff} giorni di distanza. Conferma se è la stessa operazione.
        </div>

        <div className="pp-approval-sides">
          <div className="pp-approval-side pp-approval-side--import">
            <div className="pp-approval-side-title">📱 Da PayPal (importato)</div>
            <div className="pp-approval-field"><span className="pp-approval-label">Merchant</span><span>{impMerchant}</span></div>
            <div className="pp-approval-field"><span className="pp-approval-label">Data</span><span>{fmtDate(imp.date)}</span></div>
            <div className="pp-approval-field">
              <span className="pp-approval-label">Importo</span>
              <span style={{ color: imp.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a', fontWeight:700 }}>
                {imp.amount < 0 ? '-' : '+'}€{fmtIT(Math.abs(imp.amount), 2)}
              </span>
            </div>
            {imp.cat1_suggestion && (
              <div className="pp-approval-field"><span className="pp-approval-label">Categoria</span><span>{imp.cat1_suggestion}</span></div>
            )}
          </div>

          <div className="pp-approval-side pp-approval-side--tx">
            <div className="pp-approval-side-title">🏦 Dal conto bancario</div>
            {tx ? (
              <>
                <div className="pp-approval-field"><span className="pp-approval-label">Merchant</span><span>{txMerchant}</span></div>
                <div className="pp-approval-field"><span className="pp-approval-label">Data</span><span>{fmtDate(tx._effDate || tx.date)}</span></div>
                <div className="pp-approval-field">
                  <span className="pp-approval-label">Importo</span>
                  <span style={{ color: tx.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a', fontWeight:700 }}>
                    {tx.amount < 0 ? '-' : '+'}€{fmtIT(Math.abs(tx.amount), 2)}
                  </span>
                </div>
                {tx.cat1 && (
                  <div className="pp-approval-field"><span className="pp-approval-label">Categoria</span><span>{tx.cat1}{tx.cat2 ? ' › ' + tx.cat2 : ''}</span></div>
                )}
              </>
            ) : (
              <div style={{ color:'var(--text3)', fontSize:12, padding:'12px 0' }}>Transazione bancaria non trovata</div>
            )}
          </div>
        </div>

        <div className="pp-approval-actions">
          <button className="pp-btn-approve" onClick={onApprove}>✅ Approva abbinamento</button>
          <button className="pp-btn-reject" onClick={onReject}>❌ Rifiuta</button>
        </div>
      </div>
    </div>
  )
}

// ── Abbina tx → import modal ──────────────────────────────
function AbbinaTxModal({ tx, unmatchedImports, onLink, onClose }) {
  const [chosen, setChosen] = useState('')
  const txMerchant = tx.merchant || tx.descAI || tx.description?.slice(0,40) || '—'
  const txDate = new Date(tx._effDate || tx.date)

  const sorted = useMemo(() =>
    [...unmatchedImports].sort((a,b) =>
      Math.abs(new Date(a.date) - txDate) - Math.abs(new Date(b.date) - txDate)
    ),
    [unmatchedImports, tx]
  )

  return (
    <div className="pp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pp-abbina-modal">
        <button className="pp-modal-close" onClick={onClose}>✕</button>
        <div className="pp-modal-title">🔗 Abbina transazione PayPal</div>

        <div className="pp-abbina-tx-header">
          <span style={{ fontWeight:700 }}>{txMerchant}</span>
          <span style={{ marginLeft:10, fontSize:12, color:'var(--text3)' }}>
            {fmtDate(tx._effDate || tx.date)} ·{' '}
            <span style={{ color: tx.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a', fontWeight:600 }}>
              {tx.amount < 0 ? '-' : '+'}€{fmtIT(Math.abs(tx.amount), 2)}
            </span>
          </span>
        </div>

        <div style={{ fontSize:12, color:'var(--text3)', margin:'12px 0 8px' }}>
          Seleziona l'operazione PayPal importata corrispondente:
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding:'24px', textAlign:'center', color:'var(--text3)', fontSize:13 }}>
            Nessuna operazione PayPal non abbinata disponibile
          </div>
        ) : (
          <div className="pp-abbina-list">
            {sorted.map(imp => {
              const diff = Math.round(Math.abs(new Date(imp.date) - txDate) / 86400000)
              const amtMatch = Math.abs(Math.abs(imp.amount) - Math.abs(tx.amount)) < 0.02
              return (
                <div
                  key={imp.id}
                  className={`pp-abbina-item${chosen === imp.id ? ' selected' : ''}`}
                  onClick={() => setChosen(imp.id)}
                >
                  <input type="radio" readOnly checked={chosen === imp.id} style={{ flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{imp.merchant}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {fmtDate(imp.date)} · {diff === 0 ? 'stesso giorno' : `${diff}gg di distanza`}
                      {amtMatch && <span style={{ marginLeft:6, color:'#16a34a', fontWeight:600 }}>✓ stesso importo</span>}
                    </div>
                  </div>
                  <div style={{ fontWeight:700, color: imp.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a', fontSize:13, flexShrink:0 }}>
                    {imp.amount < 0 ? '-' : '+'}€{fmtIT(Math.abs(imp.amount), 2)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="pp-approval-actions">
          <button className="pp-btn-approve" disabled={!chosen} onClick={() => onLink(tx.txId, chosen)}>
            🔗 Abbina selezionato
          </button>
          <button className="pp-btn-reject" onClick={onClose}>Annulla</button>
        </div>
      </div>
    </div>
  )
}

// ── Dedup key helper ──────────────────────────────────────
function dupKey(item) {
  return `${item.date}|${String(item.merchant||'').toLowerCase().trim()}|${Math.round(Math.abs(item.amount||0) * 100)}`
}
function isAlreadyImported(item, existingImports) {
  const k = dupKey(item)
  return existingImports.some(e => dupKey(e) === k)
}

// ── Build merchant→category history map for AI prompt ─────
function buildMerchantHistory(transactions) {
  const paypalTxs = transactions.filter(t =>
    t._paypalOverride && t.cat1 && t.cat1 !== 'Non Categorizzato' && t.cat1 !== 'Altro'
  )
  const merchantMap = {}
  paypalTxs.forEach(t => {
    const m = (t.descAI || t.merchant || '').trim()
    if (!m || m.toLowerCase().includes('paypal')) return
    const k = `${t.cat1}||${t.cat2||''}`
    if (!merchantMap[m]) merchantMap[m] = {}
    merchantMap[m][k] = (merchantMap[m][k] || 0) + 1
  })
  const result = {}
  Object.entries(merchantMap).forEach(([merchant, counts]) => {
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    const [cat1, cat2] = best[0].split('||')
    result[merchant] = { cat1, cat2: cat2 || '' }
  })
  return result
}

// ── Merchant history category suggestion ──────────────────
function getMerchantCatSuggestion(merchant, transactions) {
  if (!merchant || !transactions?.length) return {}
  const norm = merchant.toLowerCase().replace(/[^a-z0-9]/g, '')
  const paypalTxs = transactions.filter(t =>
    t._paypalOverride && t.cat1 && t.cat1 !== 'Non Categorizzato' && t.cat1 !== 'Altro'
  )
  const matched = paypalTxs.filter(t => {
    const tNorm = (t.descAI || t.merchant || t.description || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!tNorm) return false
    return tNorm.includes(norm) || norm.includes(tNorm.replace('paypal', ''))
  })
  if (!matched.length) return {}
  const counts = {}
  matched.forEach(t => {
    const k = `${t.cat1}||${t.cat2 || ''}`
    counts[k] = (counts[k] || 0) + 1
  })
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  const [cat1, cat2] = best[0].split('||')
  return { cat1, cat2: cat2 || '' }
}

// ── Import Modal ──────────────────────────────────────────
// export: riusato anche dal wizard di importazione unificata (ImportWizard.jsx)
export function PaypalImportModal({ onClose, onImport, transactions, apiKey, paypalImports }) {
  const [files, setFiles]       = useState([])
  const [processing, setProc]   = useState(false)
  const [results, setResults]   = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [duplicates, setDuplicates] = useState(new Set())
  const [importYear, setImportYear] = useState(new Date().getFullYear())

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
      const merchantHistory = buildMerchantHistory(transactions)
      const pdfs   = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf')
      const images = files.filter(f => !f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf')

      let allResults = []

      // ── Handle PDFs: extract text → gpt-4o-mini ──────────
      if (pdfs.length > 0) {
        for (const pdf of pdfs) {
          const arrayBuffer = await pdf.arrayBuffer()
          const doc  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
          let fullText = ''
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i)
            const content = await page.getTextContent()
            fullText += content.items.map(item => item.str).join(' ') + '\n'
          }
          const parsed = await callPaypalText(fullText, apiKey, importYear, merchantHistory)
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
        const parsed = await callPaypalVision(base64List, apiKey, importYear, merchantHistory)
        allResults = allResults.concat(parsed)
      }

      // Detect duplicates: against existing imports + intra-batch
      const dupSet = new Set()
      const batchSeen = new Set()
      allResults.forEach((r, i) => {
        const k = dupKey(r)
        if (isAlreadyImported(r, paypalImports) || batchSeen.has(k)) {
          dupSet.add(i)
        } else {
          batchSeen.add(k)
        }
      })

      setResults(allResults)
      setDuplicates(dupSet)
      // Auto-select only non-duplicates
      setSelected(new Set(allResults.map((_,i) => i).filter(i => !dupSet.has(i))))
    } catch(e) {
      alert('Errore analisi AI: ' + e.message)
    } finally {
      setProc(false)
    }
  }

  function toggleAll(v) {
    if (v) setSelected(new Set(results.map((_,i) => i).filter(i => !duplicates.has(i))))
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
    const items = results.filter((_,i) => selected.has(i)).map(r => {
      // Override AI category suggestions with merchant history if available
      const hist = getMerchantCatSuggestion(r.merchant, transactions)
      return hist.cat1
        ? { ...r, cat1_suggestion: hist.cat1, cat2_suggestion: hist.cat2 || r.cat2_suggestion || '' }
        : r
    })
    onImport(items)
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

        {/* Year selector */}
        <div style={{ display:'flex', alignItems:'center', gap:10, margin:'10px 0 6px' }}>
          <span style={{ fontSize:13, color:'var(--text2)', fontWeight:600, whiteSpace:'nowrap' }}>📅 Anno screenshot:</span>
          <select
            value={importYear}
            onChange={e => setImportYear(Number(e.target.value))}
            style={{
              fontSize:13, padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)',
              background:'var(--surface)', color:'var(--text)', cursor:'pointer',
              fontFamily:'var(--font-sans)',
            }}
          >
            {Array.from({ length: new Date().getFullYear() - 2019 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span style={{ fontSize:11, color:'var(--text3)' }}>L'anno verrà usato per interpretare le date nello screenshot</span>
        </div>

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
                {results.length} trovate
                {duplicates.size > 0 && (
                  <span style={{ marginLeft:8, fontSize:11, color:'#b45309', background:'#fef3c7',
                    borderRadius:6, padding:'1px 7px', border:'1px solid #fcd34d' }}>
                    {duplicates.size} già importate
                  </span>
                )}
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
                {results.map((r,i) => {
                  const isDup = duplicates.has(i)
                  return (
                    <tr key={i} style={{ opacity: isDup ? .4 : (selected.has(i) ? 1 : .5) }}>
                      <td className="pp-results-td">
                        <input type="checkbox" checked={selected.has(i)} disabled={isDup}
                          onChange={() => !isDup && toggleItem(i)} />
                      </td>
                      <td className="pp-results-td">
                        {r.merchant}
                        {isDup && (
                          <span style={{ marginLeft:6, fontSize:10, color:'#b45309',
                            background:'#fef3c7', borderRadius:4, padding:'1px 5px',
                            border:'1px solid #fcd34d', verticalAlign:'middle' }}>🔁 già importata</span>
                        )}
                      </td>
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
                  )
                })}
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

// ── Auto Abbina results modal ─────────────────────────────
function AutoAbbinaModal({ pairs, updatedImports, customCats, transactions, onConfirm, onClose }) {
  const allCats  = getMergedCats(customCats)
  const catNames = Object.keys(allCats).filter(n => n !== 'Non Categorizzato')
  const [rows, setRows] = useState(() =>
    pairs.map(({ imp, tx }) => {
      const hist = getMerchantCatSuggestion(imp.merchant, transactions)
      const cat1 = hist.cat1 || imp.cat1_suggestion || tx.cat1 || ''
      const cat2 = hist.cat2 || imp.cat2_suggestion || tx.cat2 || ''
      return { imp, tx, cat1, cat2, flagged: false, selected: true }
    })
  )
  const selCount = rows.filter(r => r.selected).length
  const allSel   = selCount === rows.length
  const toggleAll = () => setRows(rs => rs.map(r => ({ ...r, selected: !allSel })))
  const [vehOpenIdx, setVehOpenIdx] = useState(null)
  const [propagatePrompt, setPropagatePrompt] = useState(null) // {merchant, cat1, cat2, count}

  const upd = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))

  function handleCatChange(i, patch) {
    upd(i, patch)
    // Check for same-merchant siblings
    const merchant = rows[i].imp.merchant
    const siblings = rows.filter((r, j) => j !== i && r.imp.merchant === merchant)
    if (siblings.length > 0) {
      const newCat1 = patch.cat1 !== undefined ? patch.cat1 : rows[i].cat1
      const newCat2 = patch.cat2 !== undefined ? patch.cat2 : (patch.cat1 !== undefined ? '' : rows[i].cat2)
      setPropagatePrompt({ i, merchant, cat1: newCat1, cat2: newCat2, count: siblings.length })
    }
  }

  function applyPropagate() {
    if (!propagatePrompt) return
    const { merchant, cat1, cat2 } = propagatePrompt
    setRows(rs => rs.map(r =>
      r.imp.merchant === merchant ? { ...r, cat1, cat2 } : r
    ))
    setPropagatePrompt(null)
  }

  const sel = (style) => ({
    padding:'3px 6px', borderRadius:6, border:'1px solid var(--border)',
    background:'var(--bg)', color:'var(--text)', fontSize:11, cursor:'pointer', ...style
  })

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-approval-modal"
        style={{maxWidth:920, width:'96%', maxHeight:'82vh', display:'flex', flexDirection:'column'}}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexShrink:0}}>
          <div style={{fontSize:16,fontWeight:700}}>
            ⚡ Auto Abbina — {pairs.length} abbinament{pairs.length===1?'o':'i'} trovati
          </div>
          <button onClick={onClose}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:20,lineHeight:1,color:'var(--text3)'}}>×</button>
        </div>

        {/* Table */}
        <div style={{overflowY:'auto',flex:1}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead style={{position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>
              <tr style={{borderBottom:'2px solid var(--border)',color:'var(--text3)',textAlign:'left'}}>
                <th style={{padding:'6px 8px',width:32,textAlign:'center'}}>
                  <input type="checkbox" checked={allSel} onChange={toggleAll}
                    style={{cursor:'pointer',accentColor:'var(--accent)'}}/>
                </th>
                <th style={{padding:'6px 8px'}}>PayPal Merchant</th>
                <th style={{padding:'6px 8px'}}>Data PP</th>
                <th style={{padding:'6px 8px',textAlign:'right'}}>Importo</th>
                <th style={{padding:'6px 8px'}}>Banca Merchant</th>
                <th style={{padding:'6px 8px'}}>Data Banca</th>
                <th style={{padding:'6px 8px'}}>L1</th>
                <th style={{padding:'6px 8px'}}>L2</th>
                <th style={{padding:'6px 8px',textAlign:'center'}}>🚩</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ imp, tx, cat1, cat2, flagged }, i) => {
                const subs      = allCats[cat1]?.sub || []
                const isVeicoli = cat1 === 'Veicoli'
                const rowBg     = flagged
                  ? 'rgba(229,62,62,.06)'
                  : i%2===0 ? 'transparent' : 'var(--surface)'
                return (
                  <React.Fragment key={i}>
                  <tr style={{borderBottom:'1px solid var(--border)', background:rowBg, opacity: rows[i].selected ? 1 : 0.45}}>
                    <td style={{padding:'6px 4px',textAlign:'center',width:32}}>
                      <input type="checkbox" checked={rows[i].selected}
                        onChange={() => upd(i, {selected: !rows[i].selected})}
                        style={{cursor:'pointer',accentColor:'var(--accent)'}}/>
                    </td>
                    <td style={{padding:'6px 8px',fontWeight:600,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {imp.merchant || '—'}
                    </td>
                    <td style={{padding:'6px 8px',color:'var(--text3)',whiteSpace:'nowrap'}}>{fmtDate(imp.date)}</td>
                    <td style={{padding:'6px 8px',textAlign:'right',color:'var(--red)',fontWeight:700,whiteSpace:'nowrap'}}>
                      −€{Math.abs(imp.amount).toFixed(2)}
                    </td>
                    <td style={{padding:'6px 8px',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {tx.merchant || tx.descAI || tx.description?.slice(0,28) || '—'}
                    </td>
                    <td style={{padding:'6px 8px',color:'var(--text3)',whiteSpace:'nowrap'}}>
                      {fmtDate(tx._effDate||tx.date)}
                    </td>
                    {/* L1 */}
                    <td style={{padding:'6px 4px'}}>
                      <select value={cat1} style={sel({maxWidth:110})}
                        onChange={e => handleCatChange(i, {cat1:e.target.value, cat2:''})}>
                        <option value="">— nessuna —</option>
                        {catNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    {/* L2 */}
                    <td style={{padding:'6px 4px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <select value={cat2} style={sel({maxWidth:120})}
                          onChange={e => handleCatChange(i, {cat2:e.target.value})}>
                          <option value="">— nessuna —</option>
                          {subs.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {isVeicoli && (
                          <button
                            onClick={() => setVehOpenIdx(v => v === i ? null : i)}
                            title="Assegna veicolo"
                            style={{
                              width:18, height:18, borderRadius:'50%', border:'1.5px solid',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              cursor:'pointer', fontSize:10, fontWeight:800, lineHeight:1, padding:0,
                              flexShrink:0,
                              background: vehOpenIdx===i ? 'var(--accent)' : 'var(--surface)',
                              borderColor: vehOpenIdx===i ? 'var(--accent)' : 'var(--border)',
                              color: vehOpenIdx===i ? '#fff' : 'var(--text3)',
                              transition:'all .12s',
                            }}>!</button>
                        )}
                      </div>
                    </td>
                    {/* Flag */}
                    <td style={{padding:'6px 4px',textAlign:'center'}}>
                      <button
                        onClick={() => upd(i, {flagged:!flagged})}
                        title={flagged ? 'Rimuovi flag' : 'Segna da rivedere'}
                        style={{
                          background:'none', border:'none', cursor:'pointer',
                          fontSize:15, padding:2, lineHeight:1,
                          opacity: flagged ? 1 : 0.25,
                          filter: flagged ? 'none' : 'grayscale(1)',
                          transition:'all .15s',
                        }}>🚩</button>
                    </td>
                  </tr>
                  {/* Vehicle picker sub-row */}
                  {isVeicoli && vehOpenIdx === i && (
                    <tr style={{background:'rgba(59,130,246,.04)'}}>
                      <td colSpan={9} style={{padding:'8px 12px 10px',borderBottom:'1px solid var(--border)'}}>
                        <VehicleQuickPicker txId={tx.txId} cat1={cat1} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Propagate prompt */}
        {propagatePrompt && (
          <div style={{
            display:'flex',alignItems:'center',gap:10,flexShrink:0,
            padding:'10px 14px',margin:'8px 0 0',borderRadius:8,
            background:'rgba(var(--accent-rgb,59,130,246),.08)',
            border:'1px solid rgba(59,130,246,.25)',fontSize:12,
          }}>
            <span style={{flex:1}}>
              Applicare <strong>{propagatePrompt.cat1}{propagatePrompt.cat2 ? ' › ' + propagatePrompt.cat2 : ''}</strong> a tutte le altre {propagatePrompt.count} righe <strong>{propagatePrompt.merchant}</strong>?
            </span>
            <button onClick={applyPropagate}
              style={{padding:'4px 12px',borderRadius:6,border:'none',background:'var(--accent)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>
              Sì, applica
            </button>
            <button onClick={() => setPropagatePrompt(null)}
              style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'none',color:'var(--text3)',fontSize:11,cursor:'pointer'}}>
              No
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',alignItems:'center',marginTop:14,flexShrink:0,borderTop:'1px solid var(--border)',paddingTop:12}}>
          <span style={{fontSize:11,color:'var(--text3)',marginRight:'auto'}}>
            {selCount} selezionat{selCount===1?'o':'i'}
            {rows.length - selCount > 0 && <span style={{color:'var(--text3)'}}> · {rows.length - selCount} esclus{rows.length-selCount===1?'o':'i'}</span>}
            {rows.filter(r=>r.flagged).length > 0 && <span style={{color:'var(--red)'}}> · 🚩 {rows.filter(r=>r.flagged).length} da rivedere</span>}
          </span>
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" style={{background:'#38a169',borderColor:'#38a169'}}
            disabled={selCount === 0}
            onClick={() => {
              // Revert deselected imports back to their original status
              const finalImports = updatedImports.map(imp => {
                const desel = rows.find(r => !r.selected && r.imp.id === imp.id)
                return desel ? desel.imp : imp
              })
              onConfirm(rows.filter(r => r.selected), finalImports)
            }}>
            ✅ Approva {selCount === rows.length ? 'tutti' : 'selezionati'} ({selCount})
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function PaypalPage() {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const customCats        = useStore(s => s.customCats)

  // Read API key from settings (same key used for AI enrichment)
  const apiKey = appPrefs?.geminiKey || localStorage.getItem('fm-gemini-key') || ''

  const [showModal, setShowModal]         = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [search, setSearch]               = useState('')
  const [selectedTx, setSelectedTx]       = useState(null)
  const [hideComm, setHideComm]           = useState(true)
  const [pendingModal, setPendingModal]   = useState(null)  // import with pending_approval
  const [abbinaTx, setAbbinaTx]           = useState(null)  // bank tx to link to an import
  const [autoAbbinaResults, setAutoAbbinaResults] = useState(null)  // [{imp, tx}] after auto-abbina
  const [reclassifying, setReclassifying]         = useState(false)
  const [ppSelIds, setPpSelIds]                   = useState(new Set())
  const [ppAbbinaModal, setPpAbbinaModal]         = useState(false)

  const paypalImports = useMemo(
    () => appPrefs?.paypalImports || [],
    [appPrefs?.paypalImports]
  )

  const paypalTxs = useMemo(
    () => transactions.filter(isPayPal),
    [transactions]
  )

  // Data PayPal (quella riportata da PayPal stesso, salvata solo nel registro
  // paypalImports) per ogni transazione abbinata — richiesta utente 2026-07-14:
  // mostrarla in tabella accanto alla data di competenza bancaria, che spesso
  // differisce di qualche giorno (autoMatch tollera fino a 6gg di scarto).
  const paypalDateByTx = useMemo(() => {
    const map = {}
    paypalImports.forEach(imp => {
      if (imp.status === 'matched' && imp.matchedTxId && imp.date) map[imp.matchedTxId] = imp.date
    })
    return map
  }, [paypalImports])

  const last6 = useMemo(() => getLast6Months(), [])
  const paypalExpenses = useMemo(() =>
    paypalTxs.filter(t => {
      if (t.amount >= 0) return false
      const ym = (t._effDate||t.date||'').slice(0,7)
      return last6.includes(ym)
    }),
    [paypalTxs, last6]
  )

  // KPIs — netAmt(t) invece di t.amount: una spesa PayPal compensata (qui o da
  // Altre Entrate/Carte, stesso campo condiviso) deve contare solo il netto.
  const totalSpent   = useMemo(() => paypalExpenses.reduce((s,t) => s + Math.abs(netAmt(t)), 0), [paypalExpenses])
  const txCount              = paypalTxs.length
  const unmatchedCnt         = paypalImports.filter(i => i.status === 'unmatched').length
  const pendingApprovalCount = paypalImports.filter(i => i.status === 'pending_approval').length
  const monthlyAvg           = last6.length > 0 ? totalSpent / last6.length : 0

  // Pie data
  const pieData = useMemo(() => {
    const map = {}
    paypalExpenses.forEach(t => {
      const k = t.cat1 || 'Non Categorizzato'
      map[k] = (map[k] || 0) + Math.abs(netAmt(t))
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
      const row = { month: ym.slice(5), _zero: 0 }
      barCats.forEach(c => { row[c] = 0 })
      paypalExpenses
        .filter(t => (t._effDate||t.date||'').slice(0,7) === ym)
        .forEach(t => {
          const c = t.cat1 || 'Altro'
          row[c] = (row[c] || 0) + Math.abs(netAmt(t))
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

  const isComm = t => t.descAI === 'Commissioni' || t.cat2 === 'Commissione Banca'

  const filteredTxs = useMemo(() => {
    let list = sortedTxs
    if (hideComm) list = list.filter(t => !isComm(t))
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(t => {
      const d = (t._effDate||t.date||'').replace(/-/g,'/')
      const m = (t.merchant||'').toLowerCase()
      const desc = (t.description||'').toLowerCase()
      const descAI = (t.descAI||'').toLowerCase()
      const cat1 = (t.cat1||'').toLowerCase()
      const cat2 = (t.cat2||'').toLowerCase()
      const amt = String(Math.abs(t.amount))
      return m.includes(q) || desc.includes(q) || descAI.includes(q) || cat1.includes(q) || cat2.includes(q) || d.includes(q) || amt.includes(q)
    })
  }, [sortedTxs, search, hideComm])

  // ── PayPal multi-select abbinamento ──────────────────────
  const ppSelList = useMemo(() => [...ppSelIds].map(id => filteredTxs.find(t => t.txId === id) || paypalTxs.find(t => t.txId === id)).filter(Boolean), [ppSelIds, filteredTxs, paypalTxs])
  const ppIncomes  = ppSelList.filter(t => t.amount > 0)
  const ppExpenses = ppSelList.filter(t => t.amount < 0)
  const ppCanAbbina = ppIncomes.length > 0 && ppExpenses.length > 0

  function handlePpAbbina() {
    // Motore condiviso con Carte di Credito (src/data/compensation.js): scrive
    // sullo stesso registro compLinks e usa il residuo disponibile (non
    // l'importo lordo) per ogni transazione selezionata, quindi una voce già
    // parzialmente compensata da un'altra pagina non viene ricompensata da zero.
    const result = compensateGroup(ppSelList, updateTransaction)
    setPpSelIds(new Set())
    setPpAbbinaModal(false)
    if (!result.ok) {
      showToast(result.reason === 'nothing-available'
        ? 'Nessun residuo disponibile da compensare (già compensate altrove?)'
        : 'Seleziona almeno un\'entrata e un\'uscita', 'error')
      return
    }
    showToast('✅ Abbinamento PayPal salvato!')
  }

  function handlePpRemoveComp(t) {
    removeCompensationGroup(t, updateTransaction)
    showToast('Abbinamento rimosso', 'info')
  }

  function handleImport(newItems) {
    // Logica estratta in applyPaypalImport (module-level, riusata dal wizard di
    // importazione unificata) — qui restano solo le notifiche.
    const res = applyPaypalImport(newItems, { paypalImports, transactions, updateTransaction, setAppPref })
    if (res.pendingNew > 0) {
      showToast(`${res.pendingNew} abbinamento PayPal da approvare`, 'warning', 6000)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('💙 PayPal — Abbinamenti da approvare', {
          body: `${res.pendingNew} transazioni trovate con date simili, conferma l'abbinamento`,
          icon: '/icon.svg',
          tag: 'paypal-pending',
        })
      }
    }
  }

  // Save the tx's original fields before a PayPal match overwrites them,
  // so handleDisabbina can restore them (skip if already saved)
  function paypalOrigPatch(txId) {
    const tx = transactions.find(t => t.txId === txId)
    if (!tx || tx._paypalOrig) return {}
    return { _paypalOrig: {
      merchant: tx.merchant ?? null,
      descAI:   tx.descAI ?? null,
      cat1:     tx.cat1 ?? null,
      cat2:     tx.cat2 ?? null,
      conf:     tx.conf ?? null,
    } }
  }

  function handleManualMatch(importId, txId) {
    const imp = paypalImports.find(i => i.id === importId)
    if (!imp) return
    const patch = {
      ...paypalOrigPatch(txId),
      merchant: imp.merchant,
      descAI: imp.merchant,
      _paypalOverride: true,
      conf: 100,
    }
    if (imp.cat1_suggestion) patch.cat1 = imp.cat1_suggestion
    if (imp.cat2_suggestion) patch.cat2 = imp.cat2_suggestion
    updateTransaction(txId, patch)
    const updated = paypalImports.map(i =>
      i.id === importId ? { ...i, status: 'matched', matchedTxId: txId } : i
    )
    setAppPref('paypalImports', updated)
  }

  function handleApprovePending(importId) {
    const imp = paypalImports.find(i => i.id === importId)
    if (!imp || !imp.pendingTxId) return
    const patch = {
      ...paypalOrigPatch(imp.pendingTxId),
      merchant: imp.merchant,
      descAI: imp.merchant,
      _paypalOverride: true,
      conf: 100,
    }
    if (imp.cat1_suggestion) patch.cat1 = imp.cat1_suggestion
    if (imp.cat2_suggestion) patch.cat2 = imp.cat2_suggestion
    updateTransaction(imp.pendingTxId, patch)
    const updated = paypalImports.map(i =>
      i.id === importId ? { ...i, status: 'matched', matchedTxId: imp.pendingTxId, pendingTxId: null } : i
    )
    setAppPref('paypalImports', updated)
    const next = updated.find(i => i.status === 'pending_approval' && i.id !== importId)
    setPendingModal(next || null)
    showToast(next ? 'Approvato — prossimo abbinamento' : 'Abbinamento approvato', 'success')
  }

  function handleRejectPending(importId) {
    const updated = paypalImports.map(i =>
      i.id === importId ? { ...i, status: 'unmatched', pendingTxId: null } : i
    )
    setAppPref('paypalImports', updated)
    const next = updated.find(i => i.status === 'pending_approval' && i.id !== importId)
    setPendingModal(next || null)
    showToast(next ? 'Rifiutato — prossimo abbinamento' : 'Abbinamento rifiutato', 'info')
  }

  async function handleReclassify() {
    const toReclassify = paypalImports.filter(i => i.status !== 'matched')
    if (!toReclassify.length) { showToast('Nessun import da reclassificare', 'info'); return }
    if (!apiKey) { showToast('Chiave API non configurata — aggiungila in Impostazioni → AI', 'error'); return }
    setReclassifying(true)
    try {
      const merchantHistory = buildMerchantHistory(transactions)
      const items = toReclassify.map(imp => ({ id: imp.id, merchant: imp.merchant, amount: imp.amount }))
      const suggestions = await callPaypalReclassify(items, apiKey, merchantHistory)
      const suggMap = Object.fromEntries(suggestions.map(s => [s.id, s]))
      const updated = paypalImports.map(imp => {
        if (imp.status === 'matched') return imp
        const s = suggMap[imp.id]
        if (!s) return imp
        return {
          ...imp,
          cat1_suggestion: s.cat1 || imp.cat1_suggestion || '',
          cat2_suggestion: s.cat2 || imp.cat2_suggestion || '',
        }
      })
      setAppPref('paypalImports', updated)
      showToast(`Categorie aggiornate per ${toReclassify.length} import`, 'success')
    } catch(e) {
      showToast('Errore reclassificazione: ' + e.message, 'error')
    } finally {
      setReclassifying(false)
    }
  }

  function handleAutoAbbina() {
    const usedTxIds = new Set(
      paypalImports.filter(i => i.status === 'matched').map(i => i.matchedTxId).filter(Boolean)
    )
    const matched = []
    const updatedImports = paypalImports.map(imp => {
      if (imp.status === 'matched') return imp
      const impCents = Math.round(Math.abs(imp.amount) * 100)
      const impDate = new Date(imp.date)
      // Require same amount AND same sign AND date within ±7 days; prefer closest date
      let bankTx = null
      let bestDiff = Infinity
      for (const t of transactions) {
        if (!isPayPal(t) || t._paypalOverride || usedTxIds.has(t.txId)) continue
        if (Math.round(Math.abs(t.amount) * 100) !== impCents) continue
        if (Math.sign(t.amount) !== Math.sign(imp.amount)) continue
        const diff = Math.abs(new Date(t._effDate || t.date) - impDate) / 86400000
        if (diff <= 7 && diff < bestDiff) { bestDiff = diff; bankTx = t }
      }
      if (!bankTx) return imp
      usedTxIds.add(bankTx.txId)
      matched.push({ imp, tx: bankTx })
      return { ...imp, status: 'matched', matchedTxId: bankTx.txId, pendingTxId: null }
    })
    if (!matched.length) { showToast('Nessun abbinamento esatto trovato', 'info'); return }
    // Don't apply yet — open modal for review/confirm
    setAutoAbbinaResults({ pairs: matched, updatedImports })
  }

  function handleAutoAbbinaConfirm(rows, updatedImports) {
    rows.forEach(({ imp, tx, cat1, cat2, flagged }) => {
      const patch = {
        ...paypalOrigPatch(tx.txId),
        merchant: imp.merchant,
        descAI:   imp.merchant,
        _paypalOverride: true,
        conf: 100,
        ...(flagged ? { _flagged: true } : {}),
      }
      const c1 = cat1 || imp.cat1_suggestion
      const c2 = cat2 || imp.cat2_suggestion
      if (c1) patch.cat1 = c1
      if (c2) patch.cat2 = c2
      updateTransaction(tx.txId, patch)
    })
    setAppPref('paypalImports', updatedImports)
    setAutoAbbinaResults(null)
    showToast(`${rows.length} abbinament${rows.length===1?'o':'i'} approvati`, 'success')
  }

  function handleDisabbina(txId) {
    if (!window.confirm('Disabbinare questa transazione dall\'import PayPal?')) return
    // Find the import matched to this tx and reset it
    const updated = paypalImports.map(i =>
      i.matchedTxId === txId
        ? { ...i, status: 'unmatched', matchedTxId: null, pendingTxId: null }
        : i
    )
    setAppPref('paypalImports', updated)
    // Restore the original fields saved at match time, else null them so AI can re-enrich
    const tx = transactions.find(t => t.txId === txId)
    const orig = tx?._paypalOrig
    if (orig) {
      updateTransaction(txId, {
        _paypalOverride: false, _paypalOrig: null,
        merchant: orig.merchant ?? null,
        descAI:   orig.descAI ?? null,
        cat1:     orig.cat1 ?? null,
        cat2:     orig.cat2 ?? null,
        conf:     orig.conf ?? null,
      })
    } else {
      updateTransaction(txId, { _paypalOverride: false, merchant: null, descAI: null, cat1: null, cat2: null, conf: null })
    }
    showToast('Abbinamento rimosso', 'info')
  }

  function handleLinkTxToImport(txId, importId) {
    const imp = paypalImports.find(i => i.id === importId)
    if (!imp) return
    const patch = {
      ...paypalOrigPatch(txId),
      merchant: imp.merchant,
      descAI: imp.merchant,
      _paypalOverride: true,
      conf: 100,
    }
    if (imp.cat1_suggestion) patch.cat1 = imp.cat1_suggestion
    if (imp.cat2_suggestion) patch.cat2 = imp.cat2_suggestion
    updateTransaction(txId, patch)
    const updated = paypalImports.map(i =>
      i.id === importId ? { ...i, status: 'matched', matchedTxId: txId, pendingTxId: null } : i
    )
    setAppPref('paypalImports', updated)
    setAbbinaTx(null)
    showToast('Transazione abbinata con successo', 'success')
  }

  const unmatchedImports = paypalImports.filter(i => i.status === 'unmatched')

  return (
    <div className="pp-page">
      {/* Header */}
      <div className="pp-header">
        <div>
          <div className="pp-title" style={{ display:'flex', alignItems:'center', gap:8 }}><PaypalIcon size={20}/> PayPal</div>
          <div className="pp-subtitle">Transazioni PayPal · ultimi 6 mesi</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {pendingApprovalCount > 0 && (
            <button className="pp-pending-btn" onClick={() => {
              const first = paypalImports.find(i => i.status === 'pending_approval')
              if (first) setPendingModal(first)
            }}>
              ⏳ Da approvare ({pendingApprovalCount})
            </button>
          )}
          {unmatchedCnt > 0 && (
            <button className="pp-unmatched-btn" onClick={() => setShowUnmatched(true)}>
              ⚠️ Non abbinate ({unmatchedCnt})
            </button>
          )}
          <button className="pp-import-btn"
            onClick={handleReclassify}
            disabled={reclassifying || paypalImports.filter(i => i.status !== 'matched').length === 0}
            title="Ri-analizza L1/L2 di tutti gli import non abbinati usando AI + storico merchant"
          >
            {reclassifying ? '⏳ Ricalcolo…' : '🔄 Aggiorna L1/L2'}
          </button>
          <button className="pp-import-btn" style={{background:'var(--accent)',color:'#fff',border:'none'}}
            onClick={handleAutoAbbina}>
            ⚡ Auto Abbina
          </button>
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
              <BarChart data={barData} margin={{ top:20, right:4, left:-10, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize:11 }} axisLine />
                <YAxis tick={{ fontSize:11 }} axisLine tickFormatter={v => `€${fmtIT(v)}`} />
                {barCats.map((c) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={CATS[c]?.color||'#aaa'} isAnimationActive={false}>
                    {/* Label interna solo per i segmenti abbastanza alti da essere leggibili.
                        NB: si legge il valore da barData[index][c], MAI dalla prop `value` di
                        Recharts (per gli stack è il cumulativo, non il segmento — stesso bug
                        corretto in UscitePage SegmentLabel). */}
                    <LabelList
                      content={({ x, y, width, height, index }) => {
                        const v = barData[index]?.[c] || 0
                        if (!v || height < 16) return null
                        return (
                          <text x={x + width / 2} y={y + height / 2 + 3} textAnchor="middle"
                            fontSize={9} fontWeight={600} fill="rgba(255,255,255,0.9)"
                            style={{ pointerEvents: 'none' }}>
                            €{fmtIT(Math.round(v))}
                          </text>
                        )
                      }}
                    />
                  </Bar>
                ))}
                {/* Transparent sentinel bar — sits at top of every stack, fires LabelList for all months */}
                <Bar key="_zero" dataKey="_zero" stackId="a" fill="transparent" stroke="none" isAnimationActive={false}>
                  <LabelList
                    content={({ x, y, width, index }) => {
                      const total = barCats.reduce((s, cat) => s + (barData[index]?.[cat] || 0), 0)
                      if (!total) return null
                      return (
                        <text x={x + width / 2} y={y - 4} textAnchor="middle"
                          fontSize={10} fontWeight={700} fill="var(--text2)">
                          €{fmtIT(total)}
                        </text>
                      )
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Main transactions table */}
      <div className="pp-table-card">
        {/* PayPal multi-select abbina bar */}
        {ppSelIds.size > 0 && (
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',background:'var(--accent-l)',border:'1px solid var(--accent)',borderRadius:8,marginBottom:8,fontSize:13}}>
            <span style={{fontWeight:600}}>{ppSelIds.size} selezionate</span>
            <span style={{color:'var(--text3)',fontSize:12}}>
              {ppIncomes.length > 0 && <span style={{color:'var(--green)'}}>+€{ppIncomes.reduce((s,t)=>s+t.amount,0).toLocaleString('it-IT',{minimumFractionDigits:2})}</span>}
              {ppIncomes.length > 0 && ppExpenses.length > 0 && <span style={{margin:'0 4px'}}>·</span>}
              {ppExpenses.length > 0 && <span style={{color:'var(--red,#d64e4e)'}}>−€{ppExpenses.reduce((s,t)=>s+Math.abs(t.amount),0).toLocaleString('it-IT',{minimumFractionDigits:2})}</span>}
            </span>
            <div style={{flex:1}}/>
            <button className="btn btn-ghost" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>setPpSelIds(new Set())}>✕ Deseleziona</button>
            <button
              className="btn btn-primary"
              style={{fontSize:12,padding:'4px 12px',opacity:ppCanAbbina?1:.45}}
              disabled={!ppCanAbbina}
              onClick={()=>setPpAbbinaModal(true)}
            >🔗 Abbina{ppCanAbbina ? ` (${ppIncomes.length}+${ppExpenses.length})` : ''}</button>
          </div>
        )}
        <div className="pp-table-header">
          <div className="pp-table-title">Transazioni PayPal ({filteredTxs.length}{(search || hideComm) ? `/${paypalTxs.length}` : ''})</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* Sezione "Da confermare" (come Satispay): coppie spesa/rimborso PayPal stesso importo */}
            <CompDaConfermare txs={paypalTxs} scope="paypal" incomeLabel="📥 Rimborso PayPal"/>
            <button
              className={`pp-comm-toggle${hideComm ? ' active' : ''}`}
              onClick={() => setHideComm(v => !v)}
              title={hideComm ? 'Mostra commissioni' : 'Nascondi commissioni'}
            >
              🚫 Commissioni
            </button>
            <input
              className="pp-search-input"
              type="search"
              placeholder="Cerca merchant, categoria, importo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        {filteredTxs.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', color:'var(--text3)', fontSize:13 }}>
            {search ? 'Nessun risultato per la ricerca' : 'Nessuna transazione PayPal trovata'}
          </div>
        ) : (
          <table className="pp-table">
            <thead>
              <tr>
                <th className="pp-th" style={{width:32,padding:'6px 4px 6px 10px'}}>
                  <input type="checkbox"
                    checked={filteredTxs.length > 0 && filteredTxs.every(t => ppSelIds.has(t.txId))}
                    onChange={e => {
                      if (e.target.checked) setPpSelIds(new Set(filteredTxs.map(t => t.txId)))
                      else setPpSelIds(new Set())
                    }}
                    style={{cursor:'pointer'}}
                  />
                </th>
                <th className="pp-th">Data competenza</th>
                <th className="pp-th">Data PayPal</th>
                <th className="pp-th">Merchant</th>
                <th className="pp-th">AI descr</th>
                <th className="pp-th">Importo</th>
                <th className="pp-th">L1</th>
                <th className="pp-th">L2</th>
                <th className="pp-th">Stato</th>
              </tr>
              {/* Riga riepilogativa (N righe / totali +/-) rimossa su richiesta utente 2026-07-11 */}
            </thead>
            <tbody>
              {filteredTxs.map(t => {
                const pendingImp = paypalImports.find(i => i.status === 'pending_approval' && i.pendingTxId === t.txId)
                const isSel = ppSelIds.has(t.txId)
                return (
                  <tr
                    key={t.txId}
                    className="pp-tr pp-tr-clickable"
                    onClick={() => setSelectedTx(t)}
                    style={{...(t._flagged ? { background: '#fff7ed' } : {}), ...(isSel ? { background:'var(--accent-l)' } : {})}}
                  >
                    <td className="pp-td" style={{padding:'6px 4px 6px 10px'}} onClick={e => {
                      e.stopPropagation()
                      setPpSelIds(prev => {
                        const next = new Set(prev)
                        if (next.has(t.txId)) next.delete(t.txId)
                        else next.add(t.txId)
                        return next
                      })
                    }}>
                      <input type="checkbox" readOnly checked={isSel} style={{cursor:'pointer',pointerEvents:'none'}}/>
                    </td>
                    <td className="pp-td">{fmtDate(t._effDate||t.date)}</td>
                    <td className="pp-td" style={{color:'var(--text3)'}}>
                      {paypalDateByTx[t.txId] ? fmtDate(paypalDateByTx[t.txId]) : <span style={{opacity:.4}}>—</span>}
                    </td>
                    <td className="pp-td">{t.merchant || t.descAI || t.description?.slice(0,40)}</td>
                    <td className="pp-td" style={{ color:'var(--text3)', fontSize:12, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                      title={t.descAI || ''}>
                      {t.descAI || <span style={{opacity:.4}}>—</span>}
                    </td>
                    <td className="pp-td" style={{ fontWeight:600, color: t.amount < 0 ? 'var(--red,#d64e4e)' : '#16a34a' }}>
                      {t.amount < 0 ? '-' : '+'}€{fmtIT(Math.abs(netAmt(t)), 2)}
                      {isCompensated(t) && (
                        <>
                          <span style={{fontSize:9,marginLeft:1}}>*</span>
                          <button
                            onClick={e => { e.stopPropagation(); handlePpRemoveComp(t) }}
                            title="Rimuovi abbinamento/compensazione"
                            style={{marginLeft:6,background:'none',border:'none',cursor:'pointer',
                              color:'var(--gold,#b45309)',fontSize:11,fontWeight:700,verticalAlign:'middle'}}>
                            🔗✕
                          </button>
                        </>
                      )}
                    </td>
                    <td className="pp-td">
                      {t.cat1 && (
                        <span className="pp-cat-cell">
                          <CatDot cat1={t.cat1} />
                          {t.cat1}
                        </span>
                      )}
                    </td>
                    <td className="pp-td">
                      {(() => {
                        if (!t.cat2) return <span style={{color:'var(--text3)'}}>—</span>
                        const allCats = getMergedCats(customCats)
                        const validSubs = allCats[t.cat1]?.sub || []
                        const isValid = !t.cat1 || validSubs.includes(t.cat2)
                        return (
                          <span
                            title={isValid ? undefined : `"${t.cat2}" non è valido per "${t.cat1}"`}
                            style={{
                              fontSize: 12,
                              color: isValid ? 'var(--text2)' : 'var(--gold)',
                            }}>
                            {!isValid && '⚠ '}
                            {t.cat2}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="pp-td">
                      {t._paypalOverride ? (
                        <button
                          className="pp-badge-matched"
                          style={{ cursor:'pointer', border:'none', background:'none', padding:0 }}
                          title="Clicca per disabbinare"
                          onClick={e => { e.stopPropagation(); handleDisabbina(t.txId) }}
                        >✅ abbinata</button>
                      ) : pendingImp ? (
                        <button
                          className="pp-badge-pending"
                          onClick={e => { e.stopPropagation(); setPendingModal(pendingImp) }}
                        >
                          ⏳ da approvare
                        </button>
                      ) : (
                        <button
                          className="pp-btn-abbina"
                          onClick={e => { e.stopPropagation(); setAbbinaTx(t) }}
                        >
                          🔗 Abbina
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
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
          paypalImports={paypalImports}
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
          customCats={customCats}
        />
      )}

      {pendingModal && (
        <PendingApprovalModal
          imp={pendingModal}
          tx={transactions.find(t => t.txId === pendingModal.pendingTxId) || null}
          onApprove={() => handleApprovePending(pendingModal.id)}
          onReject={() => handleRejectPending(pendingModal.id)}
          onClose={() => setPendingModal(null)}
        />
      )}

      {abbinaTx && (
        <AbbinaTxModal
          tx={abbinaTx}
          unmatchedImports={paypalImports.filter(i => i.status === 'unmatched')}
          onLink={handleLinkTxToImport}
          onClose={() => setAbbinaTx(null)}
        />
      )}

      {autoAbbinaResults && (
        <AutoAbbinaModal
          pairs={autoAbbinaResults.pairs}
          updatedImports={autoAbbinaResults.updatedImports}
          customCats={customCats}
          transactions={transactions}
          onConfirm={handleAutoAbbinaConfirm}
          onClose={() => setAutoAbbinaResults(null)}
        />
      )}

      {ppAbbinaModal && ppCanAbbina && (
        <PaypalAbbinamentoModal
          incomes={ppIncomes}
          expenses={ppExpenses}
          onConfirm={handlePpAbbina}
          onClose={() => setPpAbbinaModal(false)}
        />
      )}
    </div>
  )
}
