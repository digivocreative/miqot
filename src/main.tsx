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
import { AGENTS_DATA, loadAgentsFromSupabase } from '@/data/agents'

// PWA scope is alhijaz.co only. On a custom domain the HTML is server-rendered
// with `window.__AGENT_CONTEXT__` per-host, and the precached SW index.html
// would clobber that context — so skip SW entirely and proactively clear any
// previously installed SW + Cache Storage so reconnect/disconnect flows don't
// serve a stale shell.
const host = window.location.hostname
const isPwaHost = host === 'alhijaz.co' || host === 'localhost' || host === '127.0.0.1'

if (isPwaHost) {
  const updateSW = registerSW({
    onNeedRefresh() {
      updateSW(true)
    },
    onOfflineReady() {
      console.log('App ready to work offline')
    },
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return
      const checkForUpdate = () => {
        registration.update().catch(() => { /* offline — ignore */ })
      }
      setInterval(checkForUpdate, 60_000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
    },
    immediate: true
  })
} else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => Promise.all(regs.map(r => r.unregister())))
    .catch(() => { /* ignore */ })
  if (typeof caches !== 'undefined') {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .catch(() => { /* ignore */ })
  }
}

// Simple path-based routing (only /:slug/kalkulasi is valid, not bare /kalkulasi)
const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
const isLogin = segments.length === 1 && segments[0] === 'login'
const isRegister = segments.length === 1 && segments[0] === 'register'
const isDashboard = segments.length >= 1 && segments[0] === 'dashboard'
const isResetPassword = segments.length === 1 && segments[0] === 'reset-password'
const isFlightShare = segments.length >= 2 && segments[0] === 'f'
const flightShareCode = isFlightShare ? segments[1] : null
// On custom domain the agent is implicit, so /kalkulasi and /compare may be single-segment.
const isCustomDomainHost = !!(window as unknown as { __AGENT_CONTEXT__?: { customDomain?: string | null } }).__AGENT_CONTEXT__?.customDomain
const isKalkulasi = (segments.length >= 2 && segments[1] === 'kalkulasi')
  || (isCustomDomainHost && segments.length === 1 && segments[0] === 'kalkulasi')
const isCompare = (segments.length >= 2 && segments[1] === 'compare') || (segments.length === 1 && segments[0] === 'compare')
const isCapi = segments.length >= 2 && segments[1] === 'capi'
const isBio = segments.length >= 2 && segments[1] === 'bio'
const bioSlug = isBio ? segments[0]?.toLowerCase() : null

// Detect single-package URL: /:agent/:jadwalId OR bare /:jadwalId
import { getFilterModeFromSlug } from '@/utils'
const knownFirstSegments = ['login', 'register', 'dashboard', 'compare', 'reset-password', 'f']
const knownSecondSegments = ['kalkulasi', 'compare', 'umroh', 'haji', 'capi', 'bio']

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
    if (!session?.token) { setChecking(false); return }
    const token = session.token
    // Verify token — but never auto-logout on failure (network error, server restart, etc.)
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error('expired'); return r.json() })
      .then((user) => {
        setSession(prev => {
          if (!prev || prev.token !== token) return prev
          const next = { ...prev, user: { ...prev.user, ...user } }
          try {
            const storage = localStorage.getItem('auth_session')
              ? localStorage
              : sessionStorage.getItem('auth_session')
              ? sessionStorage
              : null
            storage?.setItem('auth_session', JSON.stringify(next))
          } catch { /* ignore */ }
          return next
        })
        setChecking(false)
      })
      .catch(() => {
        // Don't clear session — just proceed with existing session
        // Agent should never be auto-logged out
        setChecking(false)
      })
  }, [session?.token])

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

if (!shouldAutoRedirect) {
  void (async () => {
    // Routing for /:slug paths depends on AGENTS_DATA. If the cache doesn't
    // know this slug (cold start or stale cache after a new agent was added),
    // fetch fresh agent list from Supabase before deciding the route — otherwise
    // an unknown agent slug gets misclassified as a bare jadwalId and shows
    // "Paket tidak ditemukan" until the user refreshes.
    const firstSlug = segments[0]?.toLowerCase()
    const slugMaybeAgent = !!firstSlug
      && !knownFirstSegments.includes(firstSlug)
      && !AGENTS_DATA[firstSlug]
    if (slugMaybeAgent) {
      await loadAgentsFromSupabase()
    }

    // On custom domain, /kalkulasi and /compare are single-segment and the
    // agent comes from the host (server-injected context), not the path.
    const ctxSlug = isCustomDomainHost
      ? ((window as unknown as { __AGENT_CONTEXT__?: { slug?: string } }).__AGENT_CONTEXT__?.slug || '').toLowerCase()
      : ''
    const agentSlugForKalkulasi = isKalkulasi
      ? (segments.length === 1 && ctxSlug
          ? AGENTS_DATA[ctxSlug] || null
          : AGENTS_DATA[firstSlug] || null)
      : null
    const agentSlugForCompare = isCompare
      ? (segments.length === 1 && ctxSlug
          ? AGENTS_DATA[ctxSlug] || null
          : (segments.length >= 2 ? AGENTS_DATA[firstSlug] || null : null))
      : null

    // Case 1: /:agent/:jadwalId (2 segments, first is agent)
    const isSinglePackageWithAgent = !isKalkulasi && !isCompare
      && segments.length >= 2
      && !!AGENTS_DATA[firstSlug]
      && !knownSecondSegments.includes(segments[1]?.toLowerCase())
      && !getFilterModeFromSlug(segments[1]?.toLowerCase())

    // Case 2: bare /:jadwalId (1 segment, not a known route/agent/filter)
    const isBarePackageId = segments.length === 1
      && !knownFirstSegments.includes(firstSlug)
      && !AGENTS_DATA[firstSlug]
      && !getFilterModeFromSlug(firstSlug)

    const singlePackageId = isSinglePackageWithAgent ? segments[1]
      : isBarePackageId ? segments[0]
      : null

    const page = (() => {
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
    })()

    createRoot(document.getElementById('root')!).render(page)
  })()
}
