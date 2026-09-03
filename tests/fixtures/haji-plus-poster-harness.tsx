import { createRoot } from 'react-dom/client';
import * as modernScreenshot from 'modern-screenshot';
import HajiPlusExportPage from '../../src/components/HajiPlusExportPage';
import '../../src/index.css';

// Penjaga menjalankan pipeline capture yang asli, jadi ia butuh build library
// yang persis sama dengan yang di-lazy-import komponen. Vite yang me-resolve
// bare specifier di sini; page.evaluate() tidak bisa.
(window as unknown as { __modernScreenshot: typeof modernScreenshot }).__modernScreenshot = modernScreenshot;

createRoot(document.getElementById('root')!).render(
  <HajiPlusExportPage
    agent={{
      slug: 'agen-uji',
      name: 'Nikita Sari Rahmawati',
      phone: '628229000200',
      email: 'nikita.sari@alhijazindowisata.com',
      photo: '',
      website: 'alhijazindonesia.com',
    }}
  />,
);
