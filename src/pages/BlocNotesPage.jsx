import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'

const NOTE_COLORS = [
  { id: 'yellow', bg: '#fef9c3', border: '#eab308', text: '#713f12' },
  { id: 'pink',   bg: '#fce7f3', border: '#ec4899', text: '#831843' },
  { id: 'blue',   bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
  { id: 'green',  bg: '#dcfce7', border: '#22c55e', text: '#14532d' },
  { id: 'orange', bg: '#ffedd5', border: '#f97316', text: '#7c2d12' },
  { id: 'purple', bg: '#ede9fe', border: '#8b5cf6', text: '#4c1d95' },
]

function uid() { return Math.random().toString(36).slice(2, 9) }

function StickyNote({ note, onUpdate, onDelete }) {
  const color = NOTE_COLORS.find(c => c.id === note.color) || NOTE_COLORS[0]
  const [content, setContent] = useState(note.content || '')

  function handleBlur() {
    if (content !== note.content) onUpdate({ ...note, content })
  }

  return (
    <div style={{
      background: color.bg,
      border: `1.5px solid ${color.border}`,
      borderRadius: 12,
      padding: '12px 14px 10px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 170,
      boxShadow: '2px 4px 14px rgba(0,0,0,.09)',
      transition: 'box-shadow .15s',
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = '3px 6px 20px rgba(0,0,0,.14)'}
    onMouseLeave={e => e.currentTarget.style.boxShadow = '2px 4px 14px rgba(0,0,0,.09)'}>

      {/* Top bar: color pickers + delete */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 10, alignItems: 'center' }}>
        {NOTE_COLORS.map(c => (
          <button key={c.id} onClick={() => onUpdate({ ...note, color: c.id })}
            title={c.id}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: c.bg, border: `2px solid ${c.border}`,
              cursor: 'pointer', padding: 0, flexShrink: 0,
              outline: note.color === c.id ? `2.5px solid ${c.border}` : 'none',
              outlineOffset: 1.5,
            }}/>
        ))}
        <button onClick={onDelete}
          style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            cursor: 'pointer', color: color.text, opacity: 0.4,
            fontSize: 15, lineHeight: 1, padding: '0 2px',
            transition: 'opacity .1s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
          title="Elimina nota">✕</button>
      </div>

      {/* Content */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onBlur={handleBlur}
        placeholder="Scrivi qui…"
        style={{
          flex: 1, border: 'none', background: 'transparent',
          color: color.text, fontSize: 13, lineHeight: 1.65,
          resize: 'none', outline: 'none', fontFamily: 'var(--font-sans)',
          minHeight: 100, width: '100%',
        }}
      />

      {/* Footer: date */}
      <div style={{ fontSize: 10, color: color.text, opacity: 0.4, marginTop: 6, textAlign: 'right', letterSpacing: '.03em' }}>
        {note.createdAt
          ? new Date(note.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
          : ''}
      </div>
    </div>
  )
}

export default function BlocNotesPage() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)

  const notes = useMemo(() => appPrefs?.blocNotes || [], [appPrefs?.blocNotes])

  function saveNotes(newNotes) {
    setAppPref('blocNotes', newNotes)
  }

  function addNote() {
    const color = NOTE_COLORS[notes.length % NOTE_COLORS.length].id
    saveNotes([...notes, { id: uid(), content: '', color, createdAt: new Date().toISOString() }])
  }

  function updateNote(updated) {
    saveNotes(notes.map(n => n.id === updated.id ? updated : n))
  }

  function deleteNote(id) {
    saveNotes(notes.filter(n => n.id !== id))
  }

  return (
    <div style={{ padding: '32px 32px 48px', maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>📝 Bloc Notes</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3 }}>
            {notes.length > 0
              ? `${notes.length} post-it — clicca su un post-it per modificarlo`
              : 'Post-it digitali — appunti veloci'}
          </div>
        </div>
        <button onClick={addNote} className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          + Nuovo post-it
        </button>
      </div>

      {/* Empty state */}
      {notes.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          color: 'var(--text3)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📝</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text2)' }}>Nessun post-it ancora</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>Usa i post-it per appunti veloci, promemoria, idee — salvati automaticamente</div>
          <button onClick={addNote} className="btn btn-primary" style={{ fontSize: 13 }}>
            + Crea il primo post-it
          </button>
        </div>
      )}

      {/* Notes grid */}
      {notes.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 20,
        }}>
          {notes.map(note => (
            <StickyNote
              key={note.id}
              note={note}
              onUpdate={updateNote}
              onDelete={() => deleteNote(note.id)}
            />
          ))}

          {/* "Add new" tile */}
          <button onClick={addNote}
            style={{
              background: 'var(--surface)',
              border: '2px dashed var(--border)',
              borderRadius: 12,
              minHeight: 170,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 8,
              color: 'var(--text3)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              transition: 'border-color .15s, color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}>
            <span style={{ fontSize: 30, lineHeight: 1 }}>+</span>
            <span>Nuovo post-it</span>
          </button>
        </div>
      )}
    </div>
  )
}
