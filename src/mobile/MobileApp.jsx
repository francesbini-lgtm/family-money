import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/useStore'
import { setHouseholdId } from '../services/firestore'
import MobileOverview  from './MobileOverview'
import MobileContanti  from './MobileContanti'
import MobileDiscovery from './MobileDiscovery'
import MobileStaff     from './MobileStaff'
import MobileQuality   from './MobileQuality'
import MobileBlocNotes from './MobileBlocNotes'
import MobileWelcome   from './MobileWelcome'
import MobileFotoRicevuta from './MobileFotoRicevuta'
import './mobile.css'

// Bottom nav — Discovery & Accuracy live as icon shortcuts in the top bar instead (see topbar-actions)
const TABS = [
  { id: 'overview',  icon: '🏠', label: 'Overview'  },
  { id: 'contanti',  icon: '💵', label: 'Contanti'  },
  { id: 'nanny',     icon: '👩', label: 'Nanny'     },
  { id: 'colf',      icon: '🧹', label: 'Colf'      },
  { id: 'notes',     icon: '📝', label: 'Note'      },
]

// Maps a MobileWelcome action id -> tab to open (the "+" is triggered right after)
const WELCOME_TARGET_TAB = { nanny: 'nanny', colf: 'colf', contanti: 'contanti', prelievo: 'contanti' }
// Contanti ha 2 sotto-modali (Utilizzo/Nota Prelievo) — questo dice a MobileContanti
// quale aprire DIRETTAMENTE, saltando lo step intermedio "Cosa vuoi aggiungere?"
// richiesta utente 2026-07-28: niente doppia domanda contante/prelievo.
const WELCOME_ADD_KIND = { contanti: 'utilizzo', prelievo: 'prelievo' }

function topbarIconBtnStyle(active) {
  return {
    width: 32, height: 32, borderRadius: 8,
    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
    background: active ? 'rgba(100,140,255,.14)' : 'var(--bg)',
    cursor: 'pointer', fontSize: 14, display: 'flex',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  }
}

function getDiscoveryBadge(transactions) {
  return transactions.filter(t =>
    !t.excluded && t.amount < 0 && !t.userEditedCat &&
    (!t.cat1 || t.cat1 === 'Non Categorizzato' || t.cat1 === 'Altro' || !t.aiEnriched)
  ).length
}

export default function MobileApp() {
  const { user, householdId, logOut } = useAuth()
  const [tab,         setTab]         = useState('overview')
  const [showAdd,     setShowAdd]     = useState(false)
  const [addKind,     setAddKind]     = useState(null)
  const [showWelcome, setShowWelcome] = useState(true)
  const [showFotoRicevuta, setShowFotoRicevuta] = useState(false)
  const [darkMode,    setDarkMode]    = useState(() => localStorage.getItem('fm-dark') === 'true')

  const {
    loadAllData, startRealtimeSync, stopRealtimeSync, isDemoMode,
    transactions, appPrefs,
    nannyTS, addNannyMonth, deleteNannyMonth,
    colfTS,  addColfMonth,  deleteColfMonth,
  } = useStore()

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('fm-dark', darkMode)
  }, [darkMode])

  const syncKeyRef = useRef(null)
  useEffect(() => {
    if (householdId && user && !isDemoMode) {
      setHouseholdId(householdId)
      // Realtime sync: safe to (re)start — startRealtimeSync unsubscribes existing listeners first
      startRealtimeSync()
      // Full data load: only once per household/user pair
      const key = `${householdId}|${user.uid}`
      if (syncKeyRef.current !== key) {
        syncKeyRef.current = key
        loadAllData(user.uid)
      }
    }
    return () => stopRealtimeSync()
  }, [householdId, user, isDemoMode])

  // Close add modal when switching tabs
  function switchTab(id) { setTab(id); setShowAdd(false); setAddKind(null) }

  // Welcome quick-actions: jump to the right tab and pop its "+" straight away.
  // "ricevuta" è un caso speciale — richiesta utente 2026-07-27: non cambia tab,
  // apre direttamente il flusso dedicato MobileFotoRicevuta.
  function handleWelcomeAction(actionId) {
    if (actionId === 'ricevuta') {
      setShowFotoRicevuta(true)
      setShowWelcome(false)
      return
    }
    setTab(WELCOME_TARGET_TAB[actionId] || 'overview')
    setAddKind(WELCOME_ADD_KIND[actionId] || null)
    setShowAdd(true)
    setShowWelcome(false)
  }
  // Richiesta utente 2026-07-28: chiudere il quick-picker non deve più forzare
  // il ritorno a Overview — se aperto dal "+" globale da un'altra scheda, l'utente
  // resta dove si trovava.
  function handleWelcomeClose() {
    setShowWelcome(false)
  }

  const discBadge  = getDiscoveryBadge(transactions)
  const nannyName  = appPrefs?.nannyName || 'Nanny'
  const colfName   = appPrefs?.colfName  || 'Colf'

  // Tab titles
  const TITLES = { overview: 'Overview', contanti: 'Contanti', nanny: nannyName, colf: colfName, discovery: 'Discovery', quality: 'Accuracy', notes: 'Bloc Notes' }
  const SUBS   = {
    overview:  'Situazione finanziaria',
    contanti:  'Gestione contanti',
    nanny:     'Timesheet Nanny',
    colf:      'Timesheet Colf',
    discovery: 'Revisione transazioni',
    quality:   'Accuratezza e KPIs',
    notes:     'Post-it e appunti veloci',
  }

  return (
    <div className="m-app" style={{ position: 'relative', boxShadow: '0 0 40px rgba(0,0,0,.15)' }}>

      {/* Top bar */}
      <div className="m-topbar">
        <div>
          <div className="m-topbar-title">💎 {TITLES[tab]}</div>
          <div className="m-topbar-sub">{SUBS[tab]}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setShowFotoRicevuta(true)} title="Foto ricevuta / scontrino"
            style={topbarIconBtnStyle(false)}>
            📷
          </button>
          <button onClick={() => switchTab('discovery')} title="Discovery"
            style={topbarIconBtnStyle(tab === 'discovery')}>
            🔍
            {discBadge > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: 'var(--red)', color: '#fff',
                borderRadius: '50%', width: 15, height: 15,
                fontSize: 9, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {discBadge > 99 ? '99' : discBadge}
              </span>
            )}
          </button>
          <button onClick={() => switchTab('quality')} title="Accuracy"
            style={topbarIconBtnStyle(tab === 'quality')}>
            📊
          </button>
          <button onClick={() => setDarkMode(d => !d)}
            style={topbarIconBtnStyle(false)}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={logOut} title="Esci"
            style={{ ...topbarIconBtnStyle(false), color: 'var(--text3)' }}>
            ⏻
          </button>
        </div>
      </div>

      {/* Page content */}
      <div className="m-content">
        {tab === 'overview'  && <MobileOverview />}
        {tab === 'contanti'  && (
          <MobileContanti showAdd={showAdd} addKind={addKind}
            onCloseAdd={() => { setShowAdd(false); setAddKind(null) }} />
        )}
        {tab === 'nanny'     && (
          <MobileStaff role="nanny" name={nannyName}
            entries={nannyTS} addMonth={addNannyMonth} deleteMonth={deleteNannyMonth}
            showAdd={showAdd} onCloseAdd={() => setShowAdd(false)} />
        )}
        {tab === 'colf'      && (
          <MobileStaff role="colf" name={colfName}
            entries={colfTS} addMonth={addColfMonth} deleteMonth={deleteColfMonth}
            showAdd={showAdd} onCloseAdd={() => setShowAdd(false)} />
        )}
        {tab === 'discovery' && <MobileDiscovery />}
        {tab === 'quality'   && <MobileQuality />}
        {tab === 'notes'     && <MobileBlocNotes />}
      </div>

      {/* FAB — absolutely positioned within m-app so it stays inside the 430px container.
          Richiesta utente 2026-07-28: presente in OGNI schermata, apre sempre il
          quick-picker "Cosa registriamo?" (MobileWelcome) invece di un add diretto. */}
      <button className="m-fab-inner" onClick={() => setShowWelcome(true)} title="Aggiungi">
        +
      </button>

      {/* Bottom nav — floating pill */}
      <nav className="m-nav">
        {TABS.map(t => {
          const isActive = tab === t.id
          const badge = t.id === 'discovery' ? discBadge : 0
          return (
            <button key={t.id}
              className={'m-nav-btn' + (isActive ? ' active' : '')}
              onClick={() => switchTab(t.id)}>
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <span className="m-nav-icon">{t.icon}</span>
                {badge > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -6,
                    background: 'var(--red)', color: '#fff',
                    borderRadius: '50%', width: 15, height: 15,
                    fontSize: 9, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {badge > 99 ? '99' : badge}
                  </span>
                )}
              </div>
              <span className="m-nav-label">{t.label}</span>
            </button>
          )
        })}
      </nav>

      {showWelcome && (
        <MobileWelcome
          nannyName={nannyName}
          colfName={colfName}
          onAction={handleWelcomeAction}
          onClose={handleWelcomeClose}
        />
      )}

      {showFotoRicevuta && (
        <MobileFotoRicevuta onClose={() => setShowFotoRicevuta(false)} />
      )}
    </div>
  )
}
