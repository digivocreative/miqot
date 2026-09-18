import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { StickerStudio } from '../../src/components/StickerStudio';
import '../../src/index.css';

// Gambar dasar dibuat di browser, bukan diunduh: yang diuji perilaku studio,
// bukan jaringan. 540×720 = rasio 3:4 yang sama dengan brosur paket.
function Harness() {
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = 540;
    c.height = 720;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    c.toBlob(b => {
      setBlob(b);
      (window as unknown as { __ready: boolean }).__ready = true;
    }, 'image/png');
  }, []);

  return (
    <StickerStudio
      isOpen={blob !== null}
      onClose={() => { (window as unknown as { __closed: boolean }).__closed = true; }}
      baseBlob={blob}
      fileNameBase="Brosur Uji"
    />
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
