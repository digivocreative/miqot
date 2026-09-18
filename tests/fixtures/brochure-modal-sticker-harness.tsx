import { createRoot } from 'react-dom/client';

import { BrochureModal } from '../../src/components/BrochureModal';
import '../../src/index.css';

// URL relatif bernama khas supaya tes bisa mencegatnya lewat page.route().
createRoot(document.getElementById('root')!).render(
  <BrochureModal
    isOpen
    onClose={() => {}}
    imageUrl="/__uji-brosur-modal.png"
    title="PAKET UJI"
    onCaption={() => {}}
    onPrompt={() => {}}
    // Meniru permukaan agent (dashboard Brosur Paket): baris sticker default
    // MATI, dan hanya pemanggil agent-only yang menyalakannya.
    allowSticker
  />,
);
