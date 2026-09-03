import { createRoot } from 'react-dom/client';
import * as modernScreenshot from 'modern-screenshot';
import SimulasiHajiPlus from '../../src/components/SimulasiHajiPlus';
import '../../src/index.css';

// The guard test drives the real capture pipeline, so it needs the very same
// library build the component lazy-imports. Vite resolves the bare specifier
// here; page.evaluate() cannot.
(window as unknown as { __modernScreenshot: typeof modernScreenshot }).__modernScreenshot = modernScreenshot;

createRoot(document.getElementById('root')!).render(
  <SimulasiHajiPlus
    agent={{
      slug: 'agen-uji',
      name: 'Nikita Sari',
      phone: '0822900020',
      website: 'alhijazindonesia.com',
      photo: '',
    }}
  />,
);
