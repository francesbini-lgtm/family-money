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

function MobileNote({ note, onUpdate, onDelete }) {
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
      padding: '11px 13px 9px',
      boxShadow: '1px 3px 10px rgba(0,0,0,.08)',
    }}>
      {/* Color pickers + delete */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        {NOTE_COLORS.map(c => (
          <button key={c.id} onClick={() => onUpdate({ ...note, color: c.id })}
            style={{
              width: 15, height: 15, borderRadius: '50%',
              background: c.bg, border: `2px solid ${c.border}`,
              cursor: 'pointer', padding: 0, flexShrink: 0,
              outline: note.color === c.id ? `2px solid ${c.border}` : 'none',
              outlineOffset: 1.5,
            }}/>
        ))}
        <button onClick={onDelete}
          style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            cursor: 'pointer', color: color.text, opacity: 0.45,
            fontSize: 16, lineHeight: 1, padding: '0 3px',
          }}>✕</button>
      </div>

      {/* Text */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onBlur={handleBlur}
        placeholder="Scrivi qui…"
        rows={3}
        style={{
          width: '100%', border: 'none', background: 'transparent',
          color: color.text, fontSize: 14, lineHeight: 1.6,
          resize: 'none', outline: 'none',
          fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
        }}
      />

      {/* Date */}
      <div style={{ fontSize: 10, color: color.text, opacity: 0.38, textAlign: 'right', marginTop: 4 }}>
        {note.createdAt
          ? new Date(note.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
          : ''}
      </div>
    </div>
  )
}

export default function MobileBlocNotes() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)

  const notes = useMemo(() => appPrefs?.blocNotes || [], [appPrefs?.blocNotes])

  function saveNotes(n) { setAppPref('blocNotes', n) }

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
    <div style={{ padding: '14px 14px 90px' }}>

      {/* Add button */}
      <button onClick={addNote}
        style={{
          width: '100%', padding: '11px',
          background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: 10,
          fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 16,
        }}>
        + Nuovo post-it
      </button>

      {/* Empty state */}
      {notes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📝</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--text2)' }}>Nessun post-it</div>
          <div style={{ fontSize: 12 }}>Premi il tasto sopra per iniziare</div>
        </div>
      )}

      {/* Notes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notes.map(note => (
          <MobileNote
            key={note.id}
            note={note}
            onUpdate={updateNote}
            onDelete={() => deleteNote(note.id)}
          />
        ))}
      </div>
    </div>
  )
}
