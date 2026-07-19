import { createRoot } from 'react-dom/client';
import BrochureSchedulePage from '../../src/components/BrochureSchedulePage';
import '../../src/index.css';

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
