import { useState } from 'react'

// Testo su una riga, troncato con ellissi; se non ci sta tutto, cliccandolo si apre un
// popup che lo mostra per intero. Autonomo (gestisce il proprio stato). Usato nelle
// tabelle di import (anteprima, doppioni) per le descrizioni originali lunghe.
export default function LongText({ text, label = 'Descrizione', style }) {
  const [open, setOpen] = useState(false)
  const t = (text ?? '').toString().trim() || '—'
  const clickable = t !== '—'
  return (
    <>
      <span onClick={clickable ? (e => { e.preventDefault(); e.stopPropagation(); setOpen(true) }) : undefined}
        title={t}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
          cursor: clickable ? 'pointer' : 'default', ...style }}>
        {t}
      </span>
      {open && (
        <div onClick={e => { e.stopPropagation(); setOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 12, padding: '18px 20px', maxWidth: 520, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word', color: 'var(--text)' }}>{t}</div>
            <div style={{ textAlign: 'right', marginTop: 14 }}>
              <button onClick={() => setOpen(false)} className="btn btn-secondary" style={{ fontSize: 13, padding: '8px 18px' }}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
