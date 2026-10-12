// Entry halaman render banner Share Cuaca — dibundel runtime oleh
// lib/cuaca-share-render.js dan dijalankan di headless Chromium. Props disuntik
// via window.CUACA_RENDER; hasil element-screenshot = persis pratinjau.
import { createRoot } from 'react-dom/client';
import { CuacaShareTemplate } from './components/cuaca-share/CuacaShareTemplate';
import type { CuacaShareAssets } from './components/cuaca-share/CuacaShareTemplate';
import type { CuacaShareProps } from '../lib/cuaca-share-data.js';

declare global {
  interface Window {
    CUACA_RENDER: { data: CuacaShareProps; assets: CuacaShareAssets };
    __ready?: boolean;
    __renderError?: string;
  }
}

async function main() {
  try {
    const { data, assets } = window.CUACA_RENDER;
    createRoot(document.getElementById('banner')!).render(<CuacaShareTemplate data={data} assets={assets} />);
    await new Promise(r => setTimeout(r, 50));
    await document.fonts.ready;
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(imgs.map(img => img.complete
      ? Promise.resolve()
      : new Promise(res => { img.addEventListener('load', res); img.addEventListener('error', res); })));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__ready = true;
  } catch (e: any) {
    window.__renderError = String(e?.message || e);
  }
}

main();
