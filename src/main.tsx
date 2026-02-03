import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
