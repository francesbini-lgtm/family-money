import { useState } from 'react'

// ── Tooltip su hover per il tasto d'azione principale degli step di import ──
// Mostra una riga che spiega: (1) cosa fa il click, (2) qual è lo step successivo.
// Testo specifico per ogni step (passato via prop `text`). Wrappa il bottone:
//   <HoverTip text="Salva… e passa a…"><button>Continua →</button></HoverTip>
export default function HoverTip({ text, children, placement = 'top' }) {
  const [show, setShow] = useState(false)
  if (!text) return children
  const isTop = placement === 'top'
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span role="tooltip" style={{
          position: 'absolute', right: 0, zIndex: 3000,
          [isTop ? 'bottom' : 'top']: 'calc(100% + 8px)',
          width: 'max-content', maxWidth: 320,
          background: 'var(--text, #1a1512)', color: 'var(--surface, #fff)',
          fontSize: 12, lineHeight: 1.4, fontWeight: 500,
          padding: '8px 11px', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.28)',
          pointerEvents: 'none', whiteSpace: 'normal', textAlign: 'left',
        }}>
          {text}
          <span style={{
            position: 'absolute', right: 18,
            [isTop ? 'top' : 'bottom']: '100%',
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            [isTop ? 'borderTop' : 'borderBottom']: '6px solid var(--text, #1a1512)',
          }}/>
        </span>
      )}
    </span>
  )
}
