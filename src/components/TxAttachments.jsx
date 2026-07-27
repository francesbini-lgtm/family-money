/**
 * Allegati generici per una transazione reale (tx.attachments, array di
 * {name,url,type,size,path} — stessa identica shape usata da Firebase Storage
 * in services/storage.js, sia per veicoli (uploadExpenseFiles) che per
 * transazioni (uploadTransactionFiles)). Componente condiviso, richiesta utente
 * 2026-07-27 (flusso "📷 Foto ricevuta"): la foto allegata a una transazione deve
 * essere visibile ovunque quella transazione compaia — Transazioni, Nanny, Colf,
 * Veicoli, Vacanze, Uscite, ecc. — quindi qui, a differenza di altre piccole
 * funzioni duplicate per pagina in questo codebase, un componente condiviso ha
 * senso: la logica di upload/cancellazione/visualizzazione è identica ovunque.
 */
import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { uploadTransactionFiles, deleteExpenseFile } from '../services/storage'
import Modal, { ModalFooter } from './Modal'
import { Trash2 } from 'lucide-react'

function isImage(att) {
  return (att.type||'').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(att.name||'')
}

// Piccola icona 📎 con badge conteggio — da usare in qualunque riga/tabella che
// mostri una transazione reale (serve solo tx.txId + tx.attachments).
export function TxAttachmentBadge({ tx, title }) {
  const [open, setOpen] = useState(false)
  const atts = tx?.attachments || []
  if (!tx?.txId) return null
  return (
    <>
      <button onClick={() => setOpen(true)}
        title={title || (atts.length ? `${atts.length} allegat${atts.length===1?'o':'i'}` : 'Nessun allegato')}
        style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 4px', position:'relative',
          display:'inline-flex', color: atts.length ? 'var(--accent)' : 'var(--text3)', opacity: atts.length ? 1 : .4 }}>
        📎
        {atts.length > 0 && (
          <span style={{ position:'absolute', top:-3, right:-3, background:'var(--accent)', color:'#fff',
            borderRadius:'50%', width:13, height:13, fontSize:8, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            {atts.length}
          </span>
        )}
      </button>
      {open && <TxAttachmentsModal tx={tx} onClose={() => setOpen(false)}/>}
    </>
  )
}

// Modale completo: vedi/apri/elimina allegati esistenti + carica nuovi.
export function TxAttachmentsModal({ tx, onClose }) {
  const updateTransaction = useStore(s => s.updateTransaction)
  const transactions      = useStore(s => s.transactions)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  // Rilegge sempre la versione più aggiornata della tx dallo store (nel caso il
  // chiamante passi un oggetto "congelato" da un useMemo di riga tabella).
  const live = transactions.find(t => t.txId === tx.txId) || tx
  const atts = live.attachments || []

  async function handleUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      const uploaded = await uploadTransactionFiles(live.txId, files)
      updateTransaction(live.txId, { attachments: [...atts, ...uploaded] })
    } catch (err) {
      console.error('upload allegato transazione:', err)
      alert('Errore durante il caricamento del file.')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(att, i) {
    if (!window.confirm(`Eliminare "${att.name}"?`)) return
    if (att.path) await deleteExpenseFile(att.path)
    updateTransaction(live.txId, { attachments: atts.filter((_, j) => j !== i) })
  }

  return (
    <Modal title={`📎 Allegati — ${live.descAI || live.description || live.txId}`} onClose={onClose} width={460}>
      {atts.length === 0 && (
        <div style={{ padding:'20px 0', textAlign:'center', color:'var(--text3)', fontSize:13 }}>Nessun allegato</div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
        {atts.map((att, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8 }}>
            {isImage(att)
              ? <img src={att.url} alt="" style={{ width:44, height:44, objectFit:'cover', borderRadius:6, flexShrink:0 }}/>
              : <div style={{ fontSize:22, flexShrink:0 }}>📄</div>}
            <div style={{ flex:1, minWidth:0, fontSize:12 }}>
              <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{att.name}</div>
              <a href={att.url} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'var(--accent)' }}>Apri ↗</a>
            </div>
            <button className="btn btn-ghost" onClick={() => handleDelete(att, i)}><Trash2 size={13}/></button>
          </div>
        ))}
      </div>
      <label className="btn btn-secondary" style={{ display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }}>
        {uploading ? 'Caricamento…' : '+ Aggiungi allegato'}
        <input ref={fileRef} type="file" multiple onChange={handleUpload} style={{ display:'none' }} disabled={uploading}/>
      </label>
      <ModalFooter>
        <button className="btn btn-primary" onClick={onClose}>Chiudi</button>
      </ModalFooter>
    </Modal>
  )
}
