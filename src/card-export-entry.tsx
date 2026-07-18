// Entry halaman export kartu nama server-side — dibundel runtime oleh lib/card-export.js
// dan dijalankan di headless Chromium. Props disuntik via window.CARD_RENDER sebelum load.
// Hasil element-screenshot #card = persis preview (renderer & engine yang sama).
import { createRoot } from 'react-dom/client';
import { RENDERERS, CARD_SIZE } from './components/business-card/designs';
import type { CardProps, DesignId, CardFormat } from './components/business-card/designs';

declare global {
  interface Window {
    CARD_RENDER: { design: DesignId; format: CardFormat; props: CardProps };
    __ready?: boolean;
    __renderError?: string;
  }
}

async function main() {
  try {
    const { design, format, props } = window.CARD_RENDER;
    const R = RENDERERS[design][format];
    const { w, h } = CARD_SIZE[format];
    const host = document.getElementById('card')!;
    host.style.width = `${w}px`;
    host.style.height = `${h}px`;
    createRoot(host).render(<R {...props} />);

    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 250));
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(imgs.map(img => img.complete
      ? Promise.resolve()
      : new Promise(res => { img.addEventListener('load', res); img.addEventListener('error', res); })));
    // Jeda ekstra: beri waktu retry foto (agent-photo helper) & settle layout.
    await new Promise(r => setTimeout(r, 300));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__ready = true;
  } catch (e: any) {
    window.__renderError = String(e?.message || e);
  }
}

main();
