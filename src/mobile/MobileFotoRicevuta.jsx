/**
 * MobileFotoRicevuta — flusso "📷 Foto ricevuta", richiesta utente 2026-07-27.
 *
 * 1) L'utente scatta/seleziona una foto della ricevuta.
 * 2) Si chiede se la transazione è avvenuta DOPO l'ultima data presente nel DB
 *    (transactions è sempre ordinato desc per _effDate||date — invariante di
 *    useStore.js — quindi transactions[0] è già la più recente, nessun bisogno
 *    di ricalcolare/riordinare qui).
 * 3a) Se NO (la transazione è già nello storico importato): l'utente sfoglia/
 *     cerca la lista delle transazioni (Data / Descrizione AI / Importo),
 *     apre il dettaglio di una riga per vedere la Descrizione Originale (con
 *     "Indietro"), e conferma — la foto viene allegata a quella transazione
 *     reale (transactions[].attachments, via updateTransaction), visibile poi
 *     ovunque la singola transazione sia mostrata (Transazioni, Nanny, Colf,
 *     Veicoli, Vacanze, Uscite, ecc. — badge condiviso TxAttachmentBadge).
 * 3b) Se SÌ (non ancora importata): l'utente inserisce data/descrizione/importo
 *     a mano; la foto finisce in pendingReceipts ("documenti da assegnare",
 *     visibile in Impostazioni desktop) e verrà abbinata automaticamente al
 *     prossimo import CSV (nuovo step dedicato in ImportWizard, match per
 *     importo+data, con conferma esplicita dell'utente).
 */
import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { uploadTransactionFiles } from '../services/storage'
import Portal from './Portal'
import { fmtIT, fmtDate } from '../utils/format'

// Ridimensiona+ricomprime l'immagine lato client (max 1600px, JPEG q.80) prima
// dell'upload — le foto scattate da fotocamera possono essere 5-10MB, causando
// upload lentissimi su rete mobile che sembrano "bloccati" senza feedback.
function compressImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file.type || !file.type.startsWith('image/')) { resolve(file); return }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url)
        if (!blob) { resolve(file); return }
        resolve(new File([blob], (file.name || 'ricevuta').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// Se l'upload non risponde entro N ms mostriamo un errore chiaro invece di
// lasciare il bottone bloccato su "…" all'infinito (segnalazione utente).
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: tempo scaduto. Controlla la connessione e riprova.`)), ms)),
  ])
}

// L'utente usa l'app solo da cellulare e non ha accesso alla console del
// browser: componiamo qui tutti i dettagli tecnici dell'errore (code/name/
// message/stack, tipici di Firebase Storage tipo "storage/unauthorized") in
// un testo copiabile, così può incollarlo in chat senza bisogno di devtools.
function formatErrorDetails(e) {
  const lines = []
  if (e?.name) lines.push(`name: ${e.name}`)
  if (e?.code) lines.push(`code: ${e.code}`)
  if (e?.message) lines.push(`message: ${e.message}`)
  if (e?.status) lines.push(`status: ${e.status}`)
  if (e?.serverResponse) lines.push(`serverResponse: ${e.serverResponse}`)
  if (e?.customData) { try { lines.push(`customData: ${JSON.stringify(e.customData)}`) } catch {} }
  if (e?.stack) lines.push(`stack:\n${e.stack}`)
  if (!lines.length) lines.push(String(e))
  lines.push(`ua: ${navigator.userAgent}`)
  lines.push(`when: ${new Date().toISOString()}`)
  return lines.join('\n')
}

export default function MobileFotoRicevuta({ onClose }) {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const pendingReceipts   = useStore(s => s.pendingReceipts)
  const addPendingReceipt = useStore(s => s.addPendingReceipt)

  const [step, setStep] = useState('photo') // photo | question | select | detail | manual | done
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [search, setSearch] = useState('')
  const [detailTx, setDetailTx] = useState(null)
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0,10))
  const [manualDesc, setManualDesc] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null) // {message, details}
  const [showErrorDetails, setShowErrorDetails] = useState(false)
  const [copied, setCopied] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState(null) // {name, run}

  const lastDate = transactions[0]?._effDate || transactions[0]?.date || null

  // Controllo duplicati richiesto dall'utente 2026-07-27: prima di caricare,
  // cerca una foto già allegata (a una transazione reale o a un pendingReceipt)
  // con stessa dimensione file + stessa data + stesso importo. Confronto sulla
  // dimensione del file COMPRESSO (quello effettivamente caricato), non
  // dell'originale — coerente perché anche i duplicati storici sono stati
  // caricati già compressi.
  function findDuplicateAttachment(date, amount, size) {
    const amt = Math.abs(amount)
    for (const t of transactions) {
      const txDate = t._effDate || t.date
      if (txDate !== date) continue
      if (Math.abs(Math.abs(t.amount||0) - amt) > 0.01) continue
      for (const a of (t.attachments||[])) {
        if (a.size === size) return a.name
      }
    }
    for (const r of pendingReceipts) {
      if (r.date !== date) continue
      if (Math.abs(Math.abs(r.amount||0) - amt) > 0.01) continue
      if (r.attachment && r.attachment.size === size) return r.attachment.name
    }
    return null
  }

  async function handlePickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    // Le foto scattate da fotocamera mobile possono pesare diversi MB: comprimiamo
    // lato client prima di caricare, altrimenti su rete lenta l'upload sembra
    // bloccato (segnalazione utente 2026-07-27).
    const compressed = await compressImage(f)
    setFile(compressed)
    setPreview(URL.createObjectURL(compressed))
    setDuplicateWarning(null)
    setStep('question')
  }

  const filteredTxs = useMemo(() => {
    const base = lastDate ? transactions.filter(t => (t._effDate||t.date||'') <= lastDate) : transactions
    const q = search.trim().toLowerCase()
    if (!q) return base.slice(0, 60)
    return base.filter(t =>
      (t.descAI||'').toLowerCase().includes(q) ||
      (t.description||'').toLowerCase().includes(q) ||
      String(Math.abs(t.amount||0)).includes(q)
    ).slice(0, 60)
  }, [transactions, search, lastDate])

  async function doAttachToTransaction(tx) {
    setSaving(true); setError(null); setShowErrorDetails(false); setProgress(0)
    try {
      const uploaded = await withTimeout(uploadTransactionFiles(tx.txId, [file], setProgress), 45000, 'Caricamento foto')
      updateTransaction(tx.txId, { attachments: [...(tx.attachments||[]), ...uploaded] })
      setStep('done')
    } catch (e) {
      setError({ message: e.message || String(e), details: formatErrorDetails(e) })
      setShowErrorDetails(false)
    }
    setSaving(false)
  }

  function attachToTransaction(tx) {
    if (!file) return
    const dupName = findDuplicateAttachment(tx._effDate||tx.date, tx.amount, file.size)
    if (dupName) { setDuplicateWarning({ name: dupName, run: () => doAttachToTransaction(tx) }); return }
    doAttachToTransaction(tx)
  }

  async function doSaveManual() {
    setSaving(true); setError(null); setShowErrorDetails(false); setProgress(0)
    try {
      const pendingId = 'pend-' + Date.now().toString(36)
      const uploaded = await withTimeout(uploadTransactionFiles(pendingId, [file], setProgress), 45000, 'Caricamento foto')
      addPendingReceipt({
        date: manualDate,
        description: manualDesc.trim(),
        amount: parseFloat(manualAmount),
        attachment: uploaded[0] || null,
      })
      setStep('done')
    } catch (e) {
      setError({ message: e.message || String(e), details: formatErrorDetails(e) })
      setShowErrorDetails(false)
    }
    setSaving(false)
  }

  function saveManual() {
    if (!manualDate || !manualDesc.trim() || !manualAmount || !file) return
    const dupName = findDuplicateAttachment(manualDate, parseFloat(manualAmount), file.size)
    if (dupName) { setDuplicateWarning({ name: dupName, run: doSaveManual }); return }
    doSaveManual()
  }

  function ProgressBar() {
    return (
      <div style={{ marginTop:10 }}>
        <div style={{ height:6, borderRadius:4, background:'rgba(255,255,255,.12)', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${progress}%`, background:'var(--accent,#e07b39)', transition:'width .2s ease' }}/>
        </div>
        <div style={{ fontSize:11, color:'var(--text3)', marginTop:6, textAlign:'center', fontFamily:'var(--font-mono)' }}>
          Caricamento… {progress}%
        </div>
      </div>
    )
  }

  return (
    <Portal>
      <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="m-modal">
          <div className="m-modal-handle"/>
          <div className="m-modal-title">📷 Foto ricevuta</div>

          {error && (
            <div style={{ fontSize:12, color:'#c0392b', background:'rgba(192,57,43,.1)', padding:'8px 10px', borderRadius:8, marginBottom:12 }}>
              {error.message}
              <div style={{ marginTop:6 }}>
                <button onClick={() => setShowErrorDetails(v => !v)}
                  style={{ background:'none', border:'none', color:'inherit', textDecoration:'underline', fontSize:11, padding:0, cursor:'pointer' }}>
                  {showErrorDetails ? 'Nascondi dettagli tecnici' : 'Mostra dettagli tecnici →'}
                </button>
              </div>
              {showErrorDetails && (
                <>
                  <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-all', fontSize:10.5, color:'var(--text2)',
                    background:'rgba(0,0,0,.25)', padding:8, borderRadius:6, marginTop:8, maxHeight:180, overflowY:'auto' }}>
                    {error.details}
                  </pre>
                  <button className="m-btn m-btn-ghost" style={{ marginTop:6, width:'100%' }}
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(error.details) } catch {}
                      setCopied(true); setTimeout(() => setCopied(false), 1800)
                    }}>
                    {copied ? '✓ Copiato — incollalo qui in chat' : '📋 Copia errore'}
                  </button>
                </>
              )}
            </div>
          )}

          {duplicateWarning && (
            <div style={{ fontSize:12.5, color:'#b5651d', background:'rgba(224,123,57,.12)', border:'1px solid rgba(224,123,57,.35)', padding:'10px 12px', borderRadius:8, marginBottom:12, lineHeight:1.5 }}>
              ⚠️ Hai già caricato una foto con la <strong>stessa dimensione</strong>, lo <strong>stesso importo</strong> e la <strong>stessa data</strong> (nome: <strong>{duplicateWarning.name}</strong>). Sei sicuro di volerla caricare comunque?
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10 }}>
                <button className="m-btn m-btn-ghost" onClick={() => setDuplicateWarning(null)}>Annulla</button>
                <button className="m-btn m-btn-primary" onClick={() => { const run = duplicateWarning.run; setDuplicateWarning(null); run() }}>Sì, carica comunque</button>
              </div>
            </div>
          )}

          {step === 'photo' && (
            <>
              <div style={{ fontSize:12.5, color:'var(--text3)', marginBottom:16, lineHeight:1.5 }}>
                Scatta o carica la foto di una ricevuta/scontrino. Dopo ti chiediamo a quale transazione appartiene.
              </div>
              <label className="m-btn m-btn-primary" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' }}>
                📷 Scatta foto
                <input type="file" accept="image/*" capture="environment" onChange={handlePickFile} style={{ display:'none' }}/>
              </label>
              <label className="m-btn m-btn-ghost" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', marginTop:10 }}>
                🖼️ Carica dalla galleria
                <input type="file" accept="image/*" onChange={handlePickFile} style={{ display:'none' }}/>
              </label>
              <button className="m-btn m-btn-ghost" onClick={onClose} style={{ marginTop:10, width:'100%' }}>Annulla</button>
            </>
          )}

          {step === 'question' && (
            <>
              {preview && (
                <img src={preview} alt="" style={{ width:'100%', maxHeight:180, objectFit:'cover', borderRadius:10, marginBottom:14 }}/>
              )}
              <div style={{ fontSize:14, fontWeight:600, marginBottom:16, lineHeight:1.5 }}>
                La transazione è avvenuta <strong>dopo</strong> il {lastDate ? fmtDate(lastDate) : '—'} (ultima data presente nel sistema)?
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <button className="m-btn m-btn-ghost" onClick={() => setStep('select')}>No, c'è già</button>
                <button className="m-btn m-btn-primary" onClick={() => setStep('manual')}>Sì, è nuova</button>
              </div>
            </>
          )}

          {step === 'select' && (
            <>
              <div style={{ fontSize:12.5, color:'var(--text3)', marginBottom:10 }}>
                Seleziona la transazione a cui appartiene questa foto.
              </div>
              <input className="m-input" placeholder="Cerca per descrizione o importo…" value={search}
                onChange={e => setSearch(e.target.value)} style={{ marginBottom:10 }}/>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:340, overflowY:'auto' }}>
                {filteredTxs.length === 0 && (
                  <div style={{ fontSize:12, color:'var(--text3)', textAlign:'center', padding:20 }}>Nessuna transazione trovata</div>
                )}
                {filteredTxs.map(t => (
                  <button key={t.txId} onClick={() => { setDetailTx(t); setStep('detail') }}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
                      padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)',
                      textAlign:'left', cursor:'pointer' }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--font-mono)' }}>{fmtDate(t._effDate||t.date)}</div>
                      <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.descAI||t.description||'—'}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, fontFamily:'var(--font-mono)', color: t.amount<0?'var(--text1)':'var(--green,#2a7a4a)', flexShrink:0 }}>
                      € {fmtIT(Math.abs(t.amount||0),2)}
                    </div>
                  </button>
                ))}
              </div>
              <button className="m-btn m-btn-ghost" onClick={onClose} style={{ marginTop:12, width:'100%' }}>Annulla</button>
            </>
          )}

          {step === 'detail' && detailTx && (
            <>
              <div style={{ padding:'12px 14px', background:'var(--surface2,var(--surface))', borderRadius:10, marginBottom:14 }}>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Data</div>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:10, fontFamily:'var(--font-mono)' }}>{fmtDate(detailTx._effDate||detailTx.date)}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Descrizione AI</div>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>{detailTx.descAI || '—'}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Descrizione originale</div>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:10 }}>{detailTx.description || '—'}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Importo</div>
                <div style={{ fontSize:15, fontWeight:700, fontFamily:'var(--font-mono)' }}>€ {fmtIT(Math.abs(detailTx.amount||0),2)}</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <button className="m-btn m-btn-ghost" disabled={saving} onClick={() => { setDuplicateWarning(null); setStep('select') }}>← Indietro</button>
                <button className="m-btn m-btn-primary" disabled={saving} onClick={() => attachToTransaction(detailTx)}>
                  {saving ? `${progress}%` : '✓ È questa'}
                </button>
              </div>
              {saving && (
                <>
                  <ProgressBar/>
                  <button className="m-btn m-btn-ghost" onClick={onClose} style={{ marginTop:10, width:'100%' }}>✕ Annulla caricamento</button>
                </>
              )}
            </>
          )}

          {step === 'manual' && (
            <>
              <div style={{ fontSize:12.5, color:'var(--text3)', marginBottom:14, lineHeight:1.5 }}>
                La transazione non è ancora nel sistema. Inserisci i dati: verrà abbinata automaticamente al prossimo import del conto.
              </div>
              <div className="m-field">
                <label className="m-label">Data</label>
                <input className="m-input" type="date" value={manualDate} onChange={e => setManualDate(e.target.value)}
                  style={{ width:'auto', maxWidth:170 }}/>
              </div>
              <div className="m-field">
                <label className="m-label">Descrizione</label>
                <input className="m-input" type="text" placeholder="Es: Cena ristorante"
                  value={manualDesc} onChange={e => setManualDesc(e.target.value)}/>
              </div>
              <div className="m-field">
                <label className="m-label">Importo (€)</label>
                <input className="m-input" type="number" inputMode="decimal" placeholder="0.00"
                  value={manualAmount} onChange={e => setManualAmount(e.target.value)}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:4 }}>
                <button className="m-btn m-btn-ghost" disabled={saving} onClick={() => { setDuplicateWarning(null); setStep('question') }}>← Indietro</button>
                <button className="m-btn m-btn-primary" disabled={saving || !manualDate || !manualDesc.trim() || !manualAmount}
                  onClick={saveManual}>
                  {saving ? `${progress}%` : '✓ Salva'}
                </button>
              </div>
              {saving && (
                <>
                  <ProgressBar/>
                  <button className="m-btn m-btn-ghost" onClick={onClose} style={{ marginTop:10, width:'100%' }}>✕ Annulla caricamento</button>
                </>
              )}
            </>
          )}

          {step === 'done' && (
            <>
              <div style={{ textAlign:'center', padding:'20px 10px' }}>
                <div style={{ fontSize:40, marginBottom:10 }}>✅</div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Fatto!</div>
                <div style={{ fontSize:12.5, color:'var(--text3)' }}>
                  La foto è stata salvata.
                </div>
              </div>
              <button className="m-btn m-btn-primary" onClick={onClose} style={{ width:'100%' }}>Chiudi</button>
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}
