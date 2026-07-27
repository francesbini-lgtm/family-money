/**
 * MobileWelcome — quick-action launcher shown once per app load.
 * Lets the user jump straight into logging something instead of
 * landing on the Overview and hunting for the right tab + FAB.
 */
import Portal from './Portal'

const ACTIONS = [
  {
    id: 'nanny',
    icon: '👩',
    title: ({ nannyName }) => `Spesa ${nannyName}`,
    sub: 'Aggiungi ore o pagamento del mese',
  },
  {
    id: 'colf',
    icon: '🧹',
    title: ({ colfName }) => `Spesa ${colfName}`,
    sub: 'Aggiungi ore o pagamento del mese',
  },
  {
    id: 'contanti',
    icon: '💵',
    title: () => 'Spesa in contanti',
    sub: 'Registra un utilizzo di contanti',
  },
  {
    id: 'prelievo',
    icon: '🏧',
    title: () => 'Nota prelievo',
    sub: 'Segna un prelievo ATM da abbinare dopo',
  },
  {
    id: 'ricevuta',
    icon: '📷',
    title: () => 'Foto ricevuta / scontrino',
    sub: 'Allega una foto a una transazione',
  },
]

export default function MobileWelcome({ nannyName, colfName, onAction, onClose }) {
  return (
    <Portal>
      <div className="m-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="m-modal">
          <div className="m-modal-handle" />
          <div className="m-modal-title" style={{ marginBottom: 4 }}>👋 Ciao! Cosa registriamo?</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.5 }}>
            Scegli un'azione rapida, oppure chiudi per andare all'Overview.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ACTIONS.map(a => (
              <button key={a.id} className="m-btn m-btn-ghost"
                onClick={() => onAction(a.id)}
                style={{ fontSize: 15, padding: 14, justifyContent: 'flex-start', gap: 14 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{a.icon}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text1)' }}>{a.title({ nannyName, colfName })}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: .75, color: 'var(--text3)' }}>{a.sub}</div>
                </div>
              </button>
            ))}
          </div>

          <button className="m-btn m-btn-primary" onClick={onClose} style={{ marginTop: 16, width: '100%' }}>
            Chiudi
          </button>
        </div>
      </div>
    </Portal>
  )
}
