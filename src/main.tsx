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
import FlightSharePage from './components/FlightSharePage.tsx'
import BioPage from './components/bio/BioPage.tsx'
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
const isRegister = segments.length === 1 && segments[0] === 'register'
const isDashboard = segments.length >= 1 && segments[0] === 'dashboard'
const isResetPassword = segments.length === 1 && segments[0] === 'reset-password'
const isFlightShare = segments.length >= 2 && segments[0] === 'f'
const flightShareCode = isFlightShare ? segments[1] : null
const isKalkulasi = segments.length >= 2 && segments[1] === 'kalkulasi'
const isCompare = (segments.length >= 2 && segments[1] === 'compare') || (segments.length === 1 && segments[0] === 'compare')
const isCapi = segments.length >= 2 && segments[1] === 'capi'
const isBio = segments.length >= 2 && segments[1] === 'bio'
const bioSlug = isBio ? segments[0]?.toLowerCase() : null

// Detect single-package URL: /:agent/:jadwalId OR bare /:jadwalId
import { getFilterModeFromSlug } from '@/utils'
const knownFirstSegments = ['login', 'register', 'dashboard', 'compare', 'reset-password', 'f']
const knownSecondSegments = ['kalkulasi', 'compare', 'umroh', 'haji', 'capi', 'bio']

const agentSlugForKalkulasi = isKalkulasi
  ? AGENTS_DATA[segments[0]?.toLowerCase()] || null
  : null
const agentSlugForCompare = isCompare && segments.length >= 2
  ? AGENTS_DATA[segments[0]?.toLowerCase()] || null
  : null

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

// ── Auto-redirect: logged-in agents go straight to dashboard ──
import { isSessionValid } from './utils/authUtils'

const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
const shouldAutoRedirect = isSessionValid() && (currentPath === '/' || currentPath === '/login')

if (shouldAutoRedirect) {
  window.location.replace('/dashboard')
}

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
import ResetPasswordPage from './components/ResetPasswordPage.tsx'
import RegisterPage from './components/RegisterPage.tsx'

function LoginRouter() {
  const [session, setSession] = useState<AuthSession | null>(null)

  if (session) {
    // Setelah login berhasil, redirect ke /dashboard
    window.location.href = '/dashboard'
    return null
  }
  return <LoginPage onLogin={(s) => setSession(s)} />
}

function DashboardRouter() {
  const [session, setSession] = useState<AuthSession | null>(getStoredSession)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!session) { setChecking(false); return }
    // Verify token — but never auto-logout on failure (network error, server restart, etc.)
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => { if (!r.ok) throw new Error('expired'); return r.json() })
      .then(() => setChecking(false))
      .catch(() => {
        // Don't clear session — just proceed with existing session
        // Agent should never be auto-logged out
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
  if (isRegister) return <RegisterPage />
  if (isResetPassword) return <ResetPasswordPage />
  if (isFlightShare && flightShareCode) {
    return <FlightSharePage code={flightShareCode} />
  }
  if (isDashboard) return <DashboardRouter />
  if (isCapi) {
    // Redirect /:slug/capi to /dashboard/settings/capi
    window.location.replace('/dashboard/settings/capi')
    return null
  }
  if (isKalkulasi) return <KalkulasiPage agent={agentSlugForKalkulasi} hideDiscount />
  if (isCompare) return <ComparePage agent={agentSlugForCompare} />
  if (isBio && bioSlug) return <BioPage slug={bioSlug} />
  return <App singlePackageId={singlePackageId} />
}

// Only render if not auto-redirecting
if (!shouldAutoRedirect) {
  createRoot(document.getElementById('root')!).render(
    renderPage()
  )
}

