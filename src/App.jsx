import { useState, useMemo, useEffect, lazy, Suspense } from 'react'
const MobileApp = lazy(() => import('./mobile/MobileApp'))
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginScreen from './auth/LoginScreen'
import { useStore } from './store/useStore'
import { APP_VERSION, BUILD_TIME } from './auth/LoginScreen'
// Debug: expose store to window
if (typeof window !== 'undefined') { import('./store/useStore').then(m => { window.__store = m.useStore }) }
import { setHouseholdId } from './services/firestore'
import { navigateRef } from './utils/navigate'
import NotifichePage from './pages/NotifichePage'
import ImportModal from './components/ImportModal'

import DashboardPage       from './pages/DashboardPage'
import TransactionsPage    from './pages/TransactionsPage'
import AIChatPage          from './pages/AIChatPage'
import CasaPage            from './pages/CasaPage'
import VeicoliRegistroPage from './pages/VeicoliRegistroPage'
import VeicoliPage         from './pages/VeicoliPage'
import SpeseAlimentariPage from './pages/SpeseAlimentariPage'
import TempoLiberoPage     from './pages/TempoLiberoPage'
import ShoppingPage        from './pages/ShoppingPage'
import SalutePage          from './pages/SalutePage'
import FigliPage           from './pages/FigliPage'
import AltroPage           from './pages/AltroPage'
import AltreEntratePage    from './pages/AltreEntratePage'
import ScadenzePage        from './pages/ScadenzePage'
import MutuoPage           from './pages/MutuoPage'
import CalendarioPage      from './pages/CalendarioPage'
import MappaSpesePage      from './pages/MappaSpesePage'
import StipendiPage        from './pages/StipendiPage'
import StipendioPage       from './pages/StipendioPage'
import WeekendVacanzePage  from './pages/WeekendVacanzePage'
import { NannyPage, ColfPage } from './pages/NannyColfPage'
import SettingsPage        from './pages/SettingsPage'
import InvestimentiPage    from './pages/InvestimentiPage'
import ForecastPage        from './pages/ForecastPage'
import SatispayPage        from './pages/SatispayPage'
import PaypalPage           from './pages/PaypalPage'
import PatrimonioPage      from './pages/PatrimonioPage'
import PrestitiMutuoPage   from './pages/PrestitiMutuoPage'
import EntratePage         from './pages/EntratePage'
import UtenzePage         from './pages/UtenzePage'
import CeciliaPage          from './pages/CeciliaPage'
import ContantiPage         from './pages/ContantiPage'
import EnergiePage          from './pages/EnergiePage'
import AnalyticsPage        from './pages/AnalyticsPage'
import RisparmioPage        from './pages/RisparmioPage'
import CarteCreditoPage     from './pages/CarteCreditoPage'
import UscitePage           from './pages/UscitePage'
import DevlogPage           from './pages/DevlogPage'
import QualityDashboard     from './pages/QualityDashboard'
import BlocNotesPage        from './pages/BlocNotesPage'
import OnboardingWizard     from './components/OnboardingWizard'

import { requestNotificationPermission, scheduleScadenzeNotifications } from './services/notifications'
import { OfflineBanner } from './hooks/useOnlineStatus'
import ErrorBoundary from './components/ErrorBoundary'
import './theme.css'
import './App.css'


const NAV = [
  { id:'quality',          icon:'📊', label:'Accuracy',           group:null },
  { id:'ai',              icon:'✨', label:'AI Assistant',       group:'AI' },
  { id:'dashboard',       icon:'🏠', label:'Summary',           group:'Overview' },
  { id:'transactions',    icon:'💳', label:'Transazioni',        group:null },
  { id:'entrate',         icon:'💰', label:'Entrate',             group:null },
  { id:'uscite',          icon:'📉', label:'Uscite',              group:null },
  { id:'tempo-libero',    icon:'🎭', label:'Tempo Libero',       group:'Main Categories' },
  { id:'scadenze',        icon:'📅', label:'Scadenze',           group:null },
  { id:'cecilia',         icon:'👧', label:'Cecilia',             group:'Famiglia' },
  { id:'nanny',           icon:'👩', label:'Nanny',              group:null },
  { id:'colf',            icon:'🧹', label:'Colf',               group:null },
  { id:'shopping',        icon:'🛍', label:'Shopping',           group:'Other' },
  { id:'salute',          icon:'💊', label:'Salute e Cura',      group:null },
  { id:'analytics',       icon:'🔬', label:'Analytics',           group:'Analytics' },
  { id:'calendario',      icon:'🗓', label:'Calendario',          group:null },
  { id:'forecast',        icon:'📊', label:'Forecast',           group:null },
  { id:'patrimonio',      icon:'💎', label:'Patrimonio',          group:'Finanza' },
  { id:'risparmio',       icon:'🐷', label:'Risparmio',           group:'Finanza' },
  { id:'prestiti',        icon:'🏦', label:'Prestiti & Mutui',    group:null },
  { id:'investimenti',    icon:'📈', label:'Investimenti',       group:null },
  { id:'satispay',        icon:'💚', label:'Satispay',           group:null },
  { id:'paypal',          icon:'💙', label:'PayPal',             group:null },
  { id:'carte',          icon:'💳', label:'Carte',               group:null },
  { id:'contanti',        icon:'💵', label:'Contanti',            group:null },
  { id:'mutuo',          icon:'🏠', label:'Mutuo',              group:null },
  { id:'stipendio',      icon:'💼', label:'Stipendi',            group:null },
  { id:'settings',        icon:'⚙️', label:'Impostazioni',       group:null },
  { id:'devlog',          icon:'🛠', label:'Sviluppo',            group:null },
  { id:'blocnotes',       icon:'📝', label:'Bloc Notes',          group:null },
]

const PAGE_MAP = {
  dashboard:         DashboardPage,
  transactions:      TransactionsPage,
  ai:                AIChatPage,
  casa:              CasaPage,
  'veicoli-spese':   VeicoliRegistroPage,
  veicoli:           VeicoliPage,
  spesa:             SpeseAlimentariPage,
  'tempo-libero':    TempoLiberoPage,
  'weekend-vacanze': WeekendVacanzePage,
  shopping:          ShoppingPage,
  salute:            SalutePage,
  satispay:          SatispayPage,
  paypal:            PaypalPage,
  figli:             FigliPage,
  altro:             AltroPage,
  nanny:             NannyPage,
  colf:              ColfPage,
  calendario:        CalendarioPage,
  mappa:             MappaSpesePage,
  stipendi:          StipendiPage,
  stipendio:         StipendioPage,
  scadenze:          ScadenzePage,
  mutuo:             MutuoPage,
  investimenti:      InvestimentiPage,
  forecast:          ForecastPage,
  patrimonio:        PatrimonioPage,
  'prestiti':        PrestitiMutuoPage,
  entrate:           EntratePage,
  'altre-entrate':   AltreEntratePage,
  utenze:          UtenzePage,
  cecilia:           CeciliaPage,
  contanti:          ContantiPage,
  energie:           UtenzePage,
  uscite:            UscitePage,
  analytics:         AnalyticsPage,
  risparmio:         RisparmioPage,
  carte:             CarteCreditoPage,
  quality:           QualityDashboard,
  blocnotes:         BlocNotesPage,
  settings:          SettingsPage,
  devlog:            DevlogPage,
  notifiche:         NotifichePage,
}

function getInitials(name='') {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase()
}
function isFemale(fn='') {
  const f=fn.toLowerCase()
  return ['sofia','sara','anna','giulia','francesca','elena','chiara','laura','maria','valentina','alessia','martina','federica','silvia','paola'].includes(f)||f.endsWith('a')
}

function DemoBanner() {
  const { isDemoMode } = useStore()
  if (!isDemoMode) return null
  return (
    <div style={{
      position:'fixed',top:0,left:0,right:0,zIndex:9999,
      background:'var(--gold)',color:'#1A1512',
      textAlign:'center',padding:'6px',fontSize:12,fontWeight:700,
      letterSpacing:'.05em'
    }}>
      🎭 MODALITÀ DEMO — dati di esempio, nessun dato reale
    </div>
  )
}

function AppShell() {
  const { user, householdId, logOut } = useAuth()

  const appPrefs = useStore(s => s.appPrefs)

  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('fm-dark') === 'true')
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('fm-dark', darkMode)
  }, [darkMode])
  const { loadAllData, startRealtimeSync, stopRealtimeSync, loadDemoData, isDemoMode, onboardingDone, setOnboardingDone, checkOnboarding, transactions } = useStore()
  const [page, setPage]         = useState('dashboard')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [menuOpen, setMenu]     = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const uncatCount = useMemo(() =>
    transactions.filter(t => !t.excluded && t.cat1 === 'Non Categorizzato').length
  , [transactions])

  const missingDays = useMemo(() => {
    const dates = transactions
      .filter(t => !t._forcedBalance && !t.excluded && t.date)
      .map(t => t.date)
      .sort()
    if (!dates.length) return null
    const last = new Date(dates[dates.length - 1])
    last.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.floor((today - last) / 86400000)
  }, [transactions])

  // Auto-refresh after 30 minutes of inactivity (long enough to not kill
  // long-running operations like AI enrichment or data migration)
  useEffect(() => {
    const TIMEOUT = 30 * 60 * 1000
    let timer = setTimeout(() => window.location.reload(), TIMEOUT)
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => window.location.reload(), TIMEOUT) }
    const events = ['mousemove','mousedown','keydown','touchstart','scroll','click']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [])

  useEffect(() => {
    if (householdId && user && !isDemoMode) {
      setHouseholdId(householdId)
      loadAllData(user.uid)
      startRealtimeSync()
    }
    return () => stopRealtimeSync()
  }, [householdId])

  const current    = NAV.find(n=>n.id===page)
  const firstName  = user?.displayName?.split(' ')[0] || ''
  const initials   = getInitials(user?.displayName || user?.email || '')
  const avatarColor = isFemale(firstName) ? '#c8628a' : '#2a5c8a'
  const PageComp   = PAGE_MAP[page]

  function navigate(id) { setPage(id); setMenu(false) }
  // Expose navigate globally for use in pages
  navigateRef.current = navigate

  return (
    <div className="app-shell" style={isDemoMode?{paddingTop:30}:{}}>
      <DemoBanner/>
      <OfflineBanner/>
      {showOnboarding && (
        <OnboardingWizard onComplete={(goTo) => {
          setShowOnboarding(false)
          setPage(goTo || 'dashboard')
        }}/>
      )}

      {/* Mobile overlay */}
      <div className={'sidebar-overlay'+(menuOpen?' open':'')} onClick={()=>setMenu(false)}/>

      <aside className={'sidebar'+(menuOpen?' open':'')} >
        <div className="sidebar-logo">
          <span className="logo-gem">💎</span>
          <div className="logo-text">
            <span className="logo-name">Family Dashboard</span>
            <span className="logo-sub logo-version">v{APP_VERSION} · {BUILD_TIME}</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {(()=>{ const visibleNav = NAV.filter(n => !(appPrefs.disabledNav||[]).includes(n.id)); return visibleNav.map(item=>(
            <div key={item.id}>
              {item.group && <div className="nav-group">{item.group}</div>}
              <button className={"nav-item"+(page===item.id?" active":"")} onClick={()=>navigate(item.id)}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            </div>
          ))})()}
        </nav>
        <div className="sidebar-user">
          {user?.photoURL
            ? <img src={user.photoURL} className="user-photo" alt=""/>
            : <div className="user-avatar" style={{background:avatarColor}}>{initials}</div>
          }
          <div style={{flex:1,minWidth:0}}>
            <div className="user-name">{user?.displayName||user?.email}</div>
            <div className="user-email">{user?.email}</div>
          </div>
          <button className="signout-btn" onClick={logOut} title="Esci">⏻</button>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <button className="mob-menu-btn" onClick={()=>setMenu(o=>!o)}>☰</button>
          <div className="topbar-title">{current?.label}</div>

          {/* ── Missing days badge — centered ── */}
          {missingDays !== null && (
            <button
              onClick={() => setImportOpen(true)}
              title={missingDays <= 2 ? 'Dati aggiornati — clicca per importare CSV' : `Ultimo dato: ${missingDays} giorni fa — clicca per importare CSV`}
              style={{
                position:'absolute', left:'50%', transform:'translateX(-50%)',
                display:'flex', alignItems:'center', gap:5,
                padding:'5px 12px', borderRadius:8, cursor:'pointer',
                fontSize:11, fontWeight:700, lineHeight:1,
                border:'1px solid',
                ...(missingDays <= 2
                  ? { background:'rgba(56,161,105,.12)', borderColor:'rgba(56,161,105,.4)', color:'#38a169' }
                  : missingDays < 10
                  ? { background:'rgba(56,161,105,.12)', borderColor:'rgba(56,161,105,.4)', color:'#38a169' }
                  : missingDays < 20
                  ? { background:'rgba(221,107,32,.12)', borderColor:'rgba(221,107,32,.4)', color:'#dd6b20' }
                  : { background:'rgba(229,62,62,.12)',  borderColor:'rgba(229,62,62,.4)',  color:'#e53e3e' }
                ),
                transition:'all .15s',
              }}
            >
              {missingDays <= 2
                ? <><span style={{fontSize:13}}>✅</span> UP TO DATE</>
                : <><span style={{fontSize:13}}>⚠️</span> -{missingDays}d missing</>
              }
            </button>
          )}

          <div className="topbar-right">
          <button
            onClick={()=>setDarkMode(d=>!d)}
            title={darkMode?'Modalità chiara':'Modalità scura'}
            style={{width:36,height:36,borderRadius:8,background:'var(--bg)',border:'1px solid var(--border)',
              display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:16,
              transition:'all .15s'}}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
            <button className="icon-btn" onClick={()=>navigate('notifiche')}
              style={{position:'relative'}}>
              🔔
              {uncatCount > 0 && (
                <span style={{position:'absolute',top:0,right:0,width:8,height:8,
                  borderRadius:'50%',background:'var(--red,#e53e3e)',border:'2px solid var(--bg)'}}/>
              )}
            </button>
            <div className="topbar-avatar" onClick={()=>navigate('settings')} style={{cursor:'pointer'}}>
              <div className="avatar-circle" style={{background:avatarColor}}>{initials}</div>
              <span>{firstName}</span>
            </div>
          </div>
        </header>
        <main className="main-content">
          <ErrorBoundary key={page}>
            {PageComp ? <PageComp /> : <div style={{padding:40,textAlign:'center',color:'var(--text3)'}}>Pagina in arrivo</div>}
          </ErrorBoundary>
        </main>
      </div>
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

function Root() {
  const { authStep } = useAuth()
  if (authStep !== 'done') return <LoginScreen />
  if (window.location.pathname === '/mobile') {
    return (
      <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',fontSize:14,color:'var(--text3)'}}>⏳</div>}>
        <MobileApp />
      </Suspense>
    )
  }
  return <AppShell />
}

export default function App() {
  return <AuthProvider><Root /></AuthProvider>
}
