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

export default function MobileFotoRicevuta({ onClose }) {
  const transactions      = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
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
  const [error, setError] = useState(null)

  const lastDate = transactions[0]?._effDate || transactions[0]?.date || null

  async function handlePickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    // Le foto scattate da fotocamera mobile possono pesare diversi MB: comprimiamo
    // lato client prima di caricare, altrimenti su rete lenta l'upload sembra
    // bloccato (segnalazione utente 2026-07-27).
    const compressed = await compressImage(f)
    setFile(compressed)
    setPreview(URL.createObjectURL(compressed))
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

  async function attachToTransaction(tx) {
    if (!file) return
    setSaving(true); setError(null); setProgress(0)
    try {
      const uploaded = await withTimeout(uploadTransactionFiles(tx.txId, [file], setProgress), 30000, 'Caricamento foto')
      updateTransaction(tx.txId, { attachments: [...(tx.attachments||[]), ...uploaded] })
      setStep('done')
    } catch (e) {
      setError((e.message||String(e)))
    }
    setSaving(false)
  }

  async function saveManual() {
    if (!manualDate || !manualDesc.trim() || !manualAmount || !file) return
    setSaving(true); setError(null); setProgress(0)
    try {
      const pendingId = 'pend-' + Date.now().toString(36)
      const uploaded = await withTimeout(uploadTransactionFiles(pendingId, [file], setProgress), 30000, 'Caricamento foto')
      addPendingReceipt({
        date: manualDate,
        description: manualDesc.trim(),
        amount: parseFloat(manualAmount),
        attachment: uploaded[0] || null,
      })
      setStep('done')
    } catch (e) {
      setError((e.message||String(e)))
    }
    setSaving(false)
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
              {error}
            </div>
          )}

          {step === 'photo' && (
            <>
              <div style={{ fontSize:12.5, color:'var(--text3)', marginBottom:16, lineHeight:1.5 }}>
                Scatta o carica la foto di una ricevuta/scontrino. Dopo ti chiediamo a quale transazione appartiene.
              </div>
              <label className="m-btn m-btn-primary" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' }}>
                📷 Scatta / Carica foto
                <input type="file" accept="image/*" capture="environment" onChange={handlePickFile} style={{ display:'none' }}/>
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
                <button className="m-btn m-btn-ghost" disabled={saving} onClick={() => setStep('select')}>← Indietro</button>
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
                <button className="m-btn m-btn-ghost" disabled={saving} onClick={() => setStep('question')}>← Indietro</button>
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
