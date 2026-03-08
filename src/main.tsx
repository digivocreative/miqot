import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Declare build-time constants injected by Vite
declare const __APP_VERSION__: string
declare const __APP_COMMIT_MSG__: string

// Log version info on startup
console.log(
  `%c🚀 Alhijaz v${__APP_VERSION__} %c${__APP_COMMIT_MSG__}`,
  'background:#001427;color:#4ade80;padding:4px 8px;border-radius:4px 0 0 4px;font-weight:bold',
  'background:#1e293b;color:#94a3b8;padding:4px 8px;border-radius:0 4px 4px 0'
)
import KalkulasiPage from './components/KalkulasiPage.tsx'
import ComparePage from './components/ComparePage.tsx'
import CapiPage from './components/CapiPage.tsx'
import { AGENTS_DATA } from '@/data/agents'

// Register Service Worker for PWA
const updateSW = registerSW({
  onNeedRefresh() {
    // Auto update when new content is available
    updateSW(true)
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
  immediate: true
})

// Simple path-based routing (only /:slug/kalkulasi is valid, not bare /kalkulasi)
const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
const isLogin = segments.length === 1 && segments[0] === 'login'
const isDashboard = segments.length >= 1 && segments[0] === 'dashboard'
const isKalkulasi = segments.length >= 2 && segments[1] === 'kalkulasi'
const isCompare = (segments.length >= 2 && segments[1] === 'compare') || (segments.length === 1 && segments[0] === 'compare')
const isCapi = segments.length >= 2 && segments[1] === 'capi'
const agentSlugForKalkulasi = isKalkulasi
  ? AGENTS_DATA[segments[0]?.toLowerCase()] || null
  : null
const agentSlugForCompare = isCompare && segments.length >= 2
  ? AGENTS_DATA[segments[0]?.toLowerCase()] || null
  : null
const agentSlugForCapi = isCapi ? segments[0]?.toLowerCase() : null

// Detect single-package URL: /:agent/:jadwalId OR bare /:jadwalId
import { getFilterModeFromSlug } from '@/utils'
const knownFirstSegments = ['login', 'dashboard', 'compare']
const knownSecondSegments = ['kalkulasi', 'compare', 'umroh', 'haji', 'capi']

// Case 1: /:agent/:jadwalId (2 segments, first is agent)
const isSinglePackageWithAgent = !isKalkulasi && !isCompare
  && segments.length >= 2
  && !!AGENTS_DATA[segments[0]?.toLowerCase()]
  && !knownSecondSegments.includes(segments[1]?.toLowerCase())
  && !getFilterModeFromSlug(segments[1]?.toLowerCase())

// Case 2: bare /:jadwalId (1 segment, not a known route/agent/filter)
const isBarePackageId = segments.length === 1
  && !knownFirstSegments.includes(segments[0]?.toLowerCase())
  && !AGENTS_DATA[segments[0]?.toLowerCase()]
  && !getFilterModeFromSlug(segments[0]?.toLowerCase())

const isSinglePackage = isSinglePackageWithAgent || isBarePackageId
const singlePackageId = isSinglePackageWithAgent ? segments[1]
  : isBarePackageId ? segments[0]
  : null

// ── Page Transition: inject overlay div & trigger reveal ──
const overlay = document.createElement('div')
overlay.className = 'page-transition-overlay'
document.body.appendChild(overlay)

// Check if we arrived via an animated navigation
const searchParams = new URLSearchParams(window.location.search)
if (searchParams.has('transition')) {
  document.body.classList.add('page-entering')
  // Clean up the URL param
  searchParams.delete('transition')
  const cleanUrl = searchParams.toString()
    ? `${window.location.pathname}?${searchParams.toString()}`
    : window.location.pathname
  window.history.replaceState(null, '', cleanUrl)
  // Remove animation class after it completes
  setTimeout(() => document.body.classList.remove('page-entering'), 600)
}

// ── Login/Dashboard wrapper component ──
import { useState, useEffect } from 'react'
import LoginPage, { getStoredSession, type AuthSession } from './components/LoginPage.tsx'
import DashboardLayout from './components/DashboardLayout.tsx'

function LoginRouter() {
  const [session, setSession] = useState<AuthSession | null>(getStoredSession)

  if (session) {
    return <DashboardLayout session={session} onLogout={() => {
      setSession(null)
      window.location.href = '/login'
    }} />
  }
  return <LoginPage onLogin={(s) => setSession(s)} />
}

function DashboardRouter() {
  const [session, setSession] = useState<AuthSession | null>(getStoredSession)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!session) { setChecking(false); return }
    // Verify token is still valid
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => { if (!r.ok) throw new Error('expired'); return r.json() })
      .then(() => setChecking(false))
      .catch(() => {
        // Token expired, clear and redirect
        import('./components/LoginPage.tsx').then(mod => mod.clearSession())
        setSession(null)
        setChecking(false)
      })
  }, [session])

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    window.location.href = '/login'
    return null
  }

  return <DashboardLayout session={session} onLogout={() => {
    import('./components/LoginPage.tsx').then(mod => mod.clearSession())
    window.location.href = '/login'
  }} />
}

// Determine which page to render
const renderPage = () => {
  if (isLogin) return <LoginRouter />
  if (isDashboard) return <DashboardRouter />
  if (isCapi && agentSlugForCapi) {
    // Check if agent slug is valid
    if (!AGENTS_DATA[agentSlugForCapi]) {
      return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#0f172a',color:'#e2e8f0',fontFamily:'Inter,sans-serif'}}><div style={{textAlign:'center'}}><h1 style={{fontSize:48,margin:'0 0 8px'}}>404</h1><p style={{color:'#94a3b8'}}>Username / password salah</p></div></div>
    }
    return <CapiPage agentSlug={agentSlugForCapi} />
  }
  if (isKalkulasi) return <KalkulasiPage agent={agentSlugForKalkulasi} />
  if (isCompare) return <ComparePage agent={agentSlugForCompare} />
  return <App singlePackageId={singlePackageId} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {renderPage()}
  </StrictMode>,
)

