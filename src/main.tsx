import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import KalkulasiPage from './components/KalkulasiPage.tsx'
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

// Simple path-based routing (supports /kalkulasi and /:slug/kalkulasi)
const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
const isKalkulasi = segments.includes('kalkulasi')
const agentSlugForKalkulasi = isKalkulasi && segments.length >= 2 && segments[1] === 'kalkulasi'
  ? AGENTS_DATA[segments[0]?.toLowerCase()] || null
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isKalkulasi ? <KalkulasiPage agent={agentSlugForKalkulasi} /> : <App />}
  </StrictMode>,
)
