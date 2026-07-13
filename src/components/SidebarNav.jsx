import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

// ── Sidebar dinamica (richiesta utente 2026-07-14) ───────────────────────────
// L'ordine/i gruppi di default vivono nel NAV array (App.jsx). L'utente può
// personalizzarli: creare/rinominare/cancellare divisori di sezione, riordinare
// voci e sezioni via drag&drop, nascondere/mostrare singole voci. Tutto questo
// viene persistito in appPrefs.navLayout (array di {type:'item',id} | {type:
// 'divider',key,label}) + appPrefs.disabledNav (già esistente, riusato tale e
// quale — stessa chiave usata anche da Impostazioni → Sezioni). Il NAV array
// nel codice resta la fonte di verità per id/icona/label/gruppo di DEFAULT;
// navLayout è solo un override di ordine+raggruppamento scelto dall'utente.

function buildDefaultLayout(NAV) {
  const layout = []
  let lastGroup
  NAV.forEach(item => {
    if (item.group && item.group !== lastGroup) {
      layout.push({ type: 'divider', key: `div-default-${item.group}`, label: item.group })
      lastGroup = item.group
    }
    layout.push({ type: 'item', id: item.id })
  })
  return layout
}

// Riconcilia il layout salvato con l'attuale NAV: rimuove voci di pagine non
// più esistenti, aggiunge in coda eventuali pagine nuove non ancora presenti
// (es. introdotte da uno sviluppo successivo alla personalizzazione dell'utente).
function reconcileLayout(stored, NAV) {
  const base = stored && stored.length ? stored : buildDefaultLayout(NAV)
  const navIds = new Set(NAV.map(n => n.id))
  const cleaned = base.filter(e => e.type === 'divider' || navIds.has(e.id))
  const known = new Set(cleaned.filter(e => e.type === 'item').map(e => e.id))
  const missing = NAV.filter(n => !known.has(n.id)).map(n => ({ type: 'item', id: n.id }))
  return [...cleaned, ...missing]
}

function entryKey(e) { return e.type === 'divider' ? e.key : `item:${e.id}` }

// Icone custom per voci il cui simbolo di brand non è rappresentabile con
// un'emoji standard (richiesta utente: "solo simbolo, non la scritta").
// item.icon vale 'svg:<key>' per queste — mappa key -> piccolo SVG inline.
const BRAND_ICONS = {
  satispay: (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <polygon points="12,2 22,12 12,22 2,12" fill="#FF4438"/>
      <polygon points="12,2 22,12 12,12" fill="#FF7A6E"/>
    </svg>
  ),
  paypal: (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <text x="4" y="19" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="21" fill="#1F2670">P</text>
      <text x="7.5" y="20" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="21" fill="#139AD6">P</text>
    </svg>
  ),
}

function NavIcon({ icon }) {
  if (typeof icon === 'string' && icon.startsWith('svg:')) {
    const key = icon.slice(4)
    return <span className="nav-icon" style={{ display: 'inline-flex' }}>{BRAND_ICONS[key] || null}</span>
  }
  return <span className="nav-icon">{icon}</span>
}

// Nasconde i divisori rimasti senza nessuna voce visibile sotto (es. l'unica
// voce di quella sezione è stata disabilitata) — solo per la vista normale.
function visibleEntries(layout, disabledNav) {
  const kept = layout.filter(e => e.type === 'divider' || !disabledNav.includes(e.id))
  const out = []
  for (let i = 0; i < kept.length; i++) {
    const e = kept[i]
    if (e.type === 'divider') {
      let hasItem = false
      for (let j = i + 1; j < kept.length; j++) {
        if (kept[j].type === 'divider') break
        hasItem = true
        break
      }
      if (!hasItem) continue
    }
    out.push(e)
  }
  return out
}

function moveEntry(layout, fromKey, toKey) {
  const arr = [...layout]
  const fromIdx = arr.findIndex(e => entryKey(e) === fromKey)
  const toIdx = arr.findIndex(e => entryKey(e) === toKey)
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return layout
  const [moved] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, moved)
  return arr
}

export default function SidebarNav({ NAV, page, navigate }) {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const disabledNav = appPrefs.disabledNav || []

  const [editMode, setEditMode] = useState(false)
  const [dragKey, setDragKey]   = useState(null)
  const [renamingKey, setRenamingKey] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const renameRef = useRef(null)

  const layout = reconcileLayout(appPrefs.navLayout, NAV)

  // La prima volta che si entra in modalità modifica, persiste il layout
  // riconciliato così tutte le operazioni successive (drag, rinomina, ecc.)
  // lavorano su un array concreto e stabile in appPrefs, non su uno calcolato
  // al volo che sparirebbe al refresh se l'utente non tocca nulla.
  useEffect(() => {
    if (editMode && !appPrefs.navLayout) {
      setAppPref('navLayout', layout)
    }
  }, [editMode])

  useEffect(() => {
    if (renamingKey && renameRef.current) { renameRef.current.focus(); renameRef.current.select() }
  }, [renamingKey])

  function persist(newLayout) { setAppPref('navLayout', newLayout) }

  function toggleHidden(id) {
    const next = disabledNav.includes(id) ? disabledNav.filter(x => x !== id) : [...disabledNav, id]
    setAppPref('disabledNav', next)
  }

  function addSection() {
    const name = window.prompt('Nome della nuova sezione:')
    if (!name || !name.trim()) return
    persist([...layout, { type: 'divider', key: `div-${Date.now()}`, label: name.trim() }])
  }

  function deleteSection(key) {
    persist(layout.filter(e => entryKey(e) !== key))
  }

  function commitRename(key) {
    const val = renameVal.trim()
    setRenamingKey(null)
    if (!val) return
    persist(layout.map(e => entryKey(e) === key ? { ...e, label: val } : e))
  }

  function handleDrop(targetKey) {
    if (dragKey && dragKey !== targetKey) persist(moveEntry(layout, dragKey, targetKey))
    setDragKey(null)
  }

  const rows = editMode ? layout : visibleEntries(layout, disabledNav)

  return (
    <>
      <nav className="sidebar-nav">
        {rows.map(entry => {
          const key = entryKey(entry)

          if (entry.type === 'divider') {
            return (
              <div key={key}
                draggable={editMode}
                onDragStart={() => setDragKey(key)}
                onDragOver={e => editMode && e.preventDefault()}
                onDrop={() => editMode && handleDrop(key)}
                onDragEnd={() => setDragKey(null)}
                style={editMode ? {
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
                  background: dragKey === key ? 'var(--surface2)' : 'transparent',
                  borderRadius: 6, cursor: 'grab',
                } : undefined}
              >
                {editMode && <span style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 4 }}>⠿</span>}
                {editMode && renamingKey === key ? (
                  <input
                    ref={renameRef}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => commitRename(key)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(key); if (e.key === 'Escape') setRenamingKey(null) }}
                    style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em',
                      flex: 1, border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px',
                      background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                  />
                ) : (
                  <div
                    className="nav-group"
                    style={editMode ? { flex: 1, cursor: 'text', padding: '10px 4px 4px' } : undefined}
                    onClick={() => editMode && (setRenamingKey(key), setRenameVal(entry.label))}
                  >
                    {entry.label}
                  </div>
                )}
                {editMode && (
                  <button
                    onClick={() => deleteSection(key)}
                    title="Elimina sezione"
                    style={{ border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}
                  >✕</button>
                )}
              </div>
            )
          }

          const item = NAV.find(n => n.id === entry.id)
          if (!item) return null
          const hidden = disabledNav.includes(item.id)

          return (
            <div key={key}
              draggable={editMode}
              onDragStart={() => setDragKey(key)}
              onDragOver={e => editMode && e.preventDefault()}
              onDrop={() => editMode && handleDrop(key)}
              onDragEnd={() => setDragKey(null)}
              style={editMode ? {
                display: 'flex', alignItems: 'center', gap: 2, borderRadius: 8,
                background: dragKey === key ? 'var(--surface2)' : 'transparent', cursor: 'grab',
                opacity: hidden ? .45 : 1,
              } : undefined}
            >
              {editMode && <span style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 6 }}>⠿</span>}
              <button
                className={'nav-item' + (page === item.id ? ' active' : '')}
                onClick={() => !editMode && navigate(item.id)}
                style={editMode ? { cursor: 'default', flex: 1 } : undefined}
              >
                <NavIcon icon={item.icon}/>
                {item.label}
              </button>
              {editMode && (
                <button
                  onClick={() => toggleHidden(item.id)}
                  title={hidden ? 'Mostra voce' : 'Nascondi voce'}
                  style={{ border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, padding: '2px 8px' }}
                >{hidden ? '🚫' : '👁'}</button>
              )}
            </div>
          )
        })}

        {editMode && (
          <button
            onClick={addSection}
            style={{
              marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 8,
              border: '1px dashed var(--border)', background: 'none', color: 'var(--text3)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >+ Nuova sezione</button>
        )}
      </nav>

      <button
        onClick={() => setEditMode(v => !v)}
        title={editMode ? 'Fine modifica menu' : 'Personalizza menu'}
        style={{
          margin: '0 8px 8px', padding: '6px 10px', borderRadius: 8,
          border: '1px solid var(--border)', background: editMode ? 'var(--accent-l)' : 'var(--surface)',
          color: editMode ? 'var(--accent)' : 'var(--text3)',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {editMode ? <>✓ Fine modifica</> : <>⚙ Personalizza menu</>}
      </button>
    </>
  )
}
