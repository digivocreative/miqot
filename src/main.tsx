import { StrictMode, lazy, Suspense } from 'react'
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

// ── Stale-deploy guard ──
// After a new build, the loaded HTML can reference JS chunk hashes that no longer
// exist (classic case: a precached SW shell pointing at chunks already purged by
// the new SW). The next dynamic import then fails and the page goes blank. Vite
// fires `vite:preloadError` for exactly this — reload once to pull the fresh index
// + chunks. A sessionStorage cooldown stops a reload loop when a chunk is genuinely
// gone or the user is offline.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'preload-error-reloaded-at'
  const now = Date.now()
  const last = Number(sessionStorage.getItem(KEY) || '0')
  if (now - last < 10_000) return // already retried recently — let the error surface
  sessionStorage.setItem(KEY, String(now))
  event.preventDefault() // we're handling it via reload; don't rethrow
  window.location.reload()
})

// Route-level pages are code-split so the initial entry chunk stays small.
// KalkulasiPage/ComparePage pull in heavy PDF libs — keep them off the critical path.
const KalkulasiPage = lazy(() => import('./components/KalkulasiPage.tsx'))
const ComparePage = lazy(() => import('./components/ComparePage.tsx'))
const FlightSharePage = lazy(() => import('./components/FlightSharePage.tsx'))
const BioPage = lazy(() => import('./components/bio/BioPage.tsx'))
const TopPartnerPage = lazy(() => import('./components/TopPartnerPage.tsx'))
const RahmahJuliLandingPage = lazy(() => import('./components/RahmahJuliLandingPage.tsx'))
const LocalAgentation = import.meta.env.DEV
  ? lazy(() => import('agentation').then(({ Agentation }) => ({ default: Agentation })))
  : null
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
      // Poll hourly — the visibilitychange handler below already catches updates
      // whenever the user returns to the tab, so a tight 60s poll was redundant
      // network chatter.
      setInterval(checkForUpdate, 3_600_000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
    },
    immediate: true
  })

  // ── Stuck-SW escape hatch ──────────────────────────────────────────────────
  // After a deploy the SW's navigateFallback can keep serving a stale precached
  // shell (made worse by Cloudflare caching *.js immutable), so registration.update()
  // alone may never take. Poll /api/version (NetworkOnly → always fresh) and, when the
  // deployed entry chunk differs from the running one, force a CLEAN reload: unregister
  // the SW + clear caches so the navigation actually hits the new shell. Guarded so it
  // fires at most once per new build per tab session (no reload loop).
  const runningEntry = (
    document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null
  )?.src.match(/index-[A-Za-z0-9]+\.js/)?.[0] || ''

  let versionChecking = false
  const checkBuildVersion = async () => {
    if (versionChecking || !runningEntry || document.visibilityState !== 'visible') return
    versionChecking = true
    try {
      const res = await fetch('/api/version', { cache: 'no-store' })
      if (!res.ok) return
      const { entry } = (await res.json()) as { entry?: string }
      if (!entry || entry === runningEntry) return
      const KEY = 'forced-reload-entry'
      if (sessionStorage.getItem(KEY) === entry) return // already tried for this build
      sessionStorage.setItem(KEY, entry)
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
        if (window.caches) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
      } catch { /* ignore */ }
      window.location.reload()
    } catch {
      /* offline / network error — ignore */
    } finally {
      versionChecking = false
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkBuildVersion()
  })
  window.addEventListener('online', checkBuildVersion)
  setTimeout(checkBuildVersion, 4000) // shortly after load
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
const isTopPartner = segments.length === 1 && segments[0] === 'top-partner'
const isRahmahJuliLanding = segments.length === 1 && segments[0] === 'rahmah-1-juli-2026'

// Detect single-package URL: /:agent/:jadwalId OR bare /:jadwalId
import { getFilterModeFromSlug } from '@/utils'
const knownFirstSegments = ['login', 'register', 'dashboard', 'compare', 'reset-password', 'f', 'top-partner', 'rahmah-1-juli-2026']
const knownSecondSegments = ['kalkulasi', 'compare', 'umroh', 'haji', 'capi', 'bio', 'jamaah']

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
import LoginPage, { getStoredSession, clearSession, type AuthSession } from './components/LoginPage.tsx'
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
    clearSession()
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
      if (isTopPartner) return <TopPartnerPage />
      if (isRahmahJuliLanding) return <RahmahJuliLandingPage />
      return <App singlePackageId={singlePackageId} />
    })()

    createRoot(document.getElementById('root')!).render(
      <Suspense fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      }>
        {page}
        {LocalAgentation ? <LocalAgentation /> : null}
      </Suspense>
    )
  })()
}
