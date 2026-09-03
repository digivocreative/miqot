import { createRoot } from 'react-dom/client';
import * as modernScreenshot from 'modern-screenshot';
import BrochureSchedulePage from '../../src/components/BrochureSchedulePage';
import '../../src/index.css';

// Penjaga patah-baris menjalankan pipeline kloning yang asli, jadi ia butuh
// build library yang persis sama dengan yang dipakai captureStableDom. Vite
// yang me-resolve bare specifier di sini; page.evaluate() tidak bisa.
(window as unknown as { __modernScreenshot: typeof modernScreenshot }).__modernScreenshot = modernScreenshot;

const displayMode = new URLSearchParams(window.location.search).get('mode') === 'seat' ? 'seat' : 'hari';

createRoot(document.getElementById('root')!).render(
  <BrochureSchedulePage
    agent={{
      slug: 'agen-uji',
      name: 'Agen Uji',
      phone: '628123456789',
      photo: '',
      website: 'https://example.test',
    }}
    displayMode={displayMode}
  />,
);
