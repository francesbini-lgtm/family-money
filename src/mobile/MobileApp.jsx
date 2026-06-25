import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/useStore'
import { setHouseholdId } from '../services/firestore'
import MobileOverview  from './MobileOverview'
import MobileContanti  from './MobileContanti'
import MobileDiscovery from './MobileDiscovery'
import MobileStaff     from './MobileStaff'
import './mobile.css'

const TABS = [
  { id: 'overview',  icon: '🏠', label: 'Overview'  },
  { id: 'contanti',  icon: '💵', label: 'Contanti'  },
  { id: 'nanny',     icon: '👩', label: 'Nanny'     },
  { id: 'colf',      icon: '🧹', label: 'Colf'      },
  { id: 'discovery', icon: '🔍', label: 'Discovery' },
]

// Tabs that expose a "+" FAB
const FAB_TABS = new Set(['contanti', 'nanny', 'colf'])

function getDiscoveryBadge(transactions) {
  return transactions.filter(t =>
    !t.excluded && t.amount < 0 && !t.userEditedCat &&
    (!t.cat1 || t.cat1 === 'Non Categorizzato' || t.cat1 === 'Altro' || !t.aiEnriched)
  ).length
}

export default function MobileApp() {
  const { user, householdId, logOut } = useAuth()
  const [tab,      setTab]      = useState('overview')
  const [showAdd,  setShowAdd]  = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('fm-dark') === 'true')

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

  useEffect(() => {
    if (householdId && user && !isDemoMode) {
      setHouseholdId(householdId)
      loadAllData(user.uid)
      startRealtimeSync()
    }
    return () => stopRealtimeSync()
  }, [householdId])

  // Close add modal when switching tabs
  function switchTab(id) { setTab(id); setShowAdd(false) }

  const discBadge  = getDiscoveryBadge(transactions)
  const nannyName  = appPrefs?.nannyName || 'Nanny'
  const colfName   = appPrefs?.colfName  || 'Colf'

  // Tab titles
  const TITLES = { overview: 'Overview', contanti: 'Contanti', nanny: nannyName, colf: colfName, discovery: 'Discovery' }
  const SUBS   = {
    overview:  'Situazione finanziaria',
    contanti:  'Gestione contanti',
    nanny:     'Timesheet Nanny',
    colf:      'Timesheet Colf',
    discovery: 'Revisione transazioni',
  }

  return (
    <div className="m-app" style={{ position: 'relative', boxShadow: '0 0 40px rgba(0,0,0,.15)' }}>

      {/* Top bar */}
      <div className="m-topbar">
        <div>
          <div className="m-topbar-title">💎 {TITLES[tab]}</div>
          <div className="m-topbar-sub">{SUBS[tab]}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setDarkMode(d => !d)}
            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', cursor: 'pointer', fontSize: 15, display: 'flex',
              alignItems: 'center', justifyContent: 'center' }}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={logOut} title="Esci"
            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', cursor: 'pointer', fontSize: 14, display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
            ⏻
          </button>
        </div>
      </div>

      {/* Page content */}
      <div className="m-content">
        {tab === 'overview'  && <MobileOverview />}
        {tab === 'contanti'  && <MobileContanti showAdd={showAdd} onCloseAdd={() => setShowAdd(false)} />}
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
      </div>

      {/* FAB — absolutely positioned within m-app so it stays inside the 430px container */}
      {FAB_TABS.has(tab) && (
        <button className="m-fab-inner" onClick={() => setShowAdd(true)} title="Aggiungi">
          +
        </button>
      )}

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
    </div>
  )
}
