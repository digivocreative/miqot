import { useEffect, useRef, useState } from 'react';

import { stampAgentOnBrochure, type BrochureAgentIdentity } from '../utils/stampAgentOnBrochure';

// Brosur dengan identitas agent terbakar di piksel, siap dipakai sebagai <img
// src> MAUPUN sebagai berkas yang dibagikan.
//
// Hook, bukan sekadar fungsi, karena brosurnya muncul di DUA tempat dengan
// siklus hidup berbeda — pratinjau di dalam kartu paket dan modal layar penuh —
// dan keduanya butuh hal yang sama: satu gambar yang dipakai untuk dilihat dan
// untuk dikirim. Menyalin efeknya ke dua tempat berarti dua tempat yang bisa
// bocor object URL dengan cara berbeda.

export interface StampedBrochure {
  /** URL siap pakai: hasil gubahan bila ada, kalau tidak URL aslinya. */
  url: string;
  /**
   * Blob hasil gubahan, atau null kalau tidak ada yang berhasil digambar.
   * null berarti pemanggil harus mengambil ulang dari `url` seperti dulu.
   */
  blob: Blob | null;
  /**
   * Sedang menggubah. Pemanggil sebaiknya menahan gambar selama ini bernilai
   * true: menampilkan brosur polos lalu menukarnya membuat identitas agent
   * berkedip masuk, dan yang lebih buruk, sempat bisa ter-screenshot tanpa
   * identitas.
   */
  isStamping: boolean;
}

/**
 * @param enabled Gerbang pemicu. Di daftar kartu, ini yang menjaga agar hanya
 *   kartu yang benar-benar terbuka yang menggubah brosurnya.
 * @param imageUrl URL brosur asli (sudah dinormalkan pemanggil).
 * @param agent Identitas yang dibakar; null = tidak menggubah apa pun.
 */
export function useStampedBrochure(
  enabled: boolean,
  imageUrl: string,
  agent: BrochureAgentIdentity | null,
): StampedBrochure {
  const [stamped, setStamped] = useState<{ url: string; blob: Blob } | null>(null);
  const [isStamping, setIsStamping] = useState(false);

  // Pemanggil merakit `agent` sebagai objek literal, jadi identitasnya berubah
  // tiap render. Efek di bawah karena itu bergantung pada NILAI-nya, bukan
  // objeknya; tanpa ini ia menggubah ulang gambar tanpa henti.
  const agentKey = agent ? [agent.name, agent.phone].join('|') : '';
  const agentRef = useRef(agent);
  agentRef.current = agent;

  const urlRef = useRef<string | null>(null);
  const replace = (next: { url: string; blob: Blob } | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next?.url ?? null;
    setStamped(next);
  };

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled || !imageUrl || !agentKey) {
      setIsStamping(false);
      replace(null);
      return;
    }
    let cancelled = false;
    setIsStamping(true);
    (async () => {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Fetch failed');
        const original = await response.blob();
        const out = await stampAgentOnBrochure(original, agentRef.current!);
        if (cancelled) return;
        // Blob yang sama = tidak ada yang berhasil digambar; pakai jalur lama
        // apa adanya ketimbang menahan satu salinan identik di memori.
        replace(out === original ? null : { url: URL.createObjectURL(out), blob: out });
      } catch {
        if (!cancelled) replace(null);
      } finally {
        if (!cancelled) setIsStamping(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, imageUrl, agentKey]);

  return { url: stamped?.url || imageUrl, blob: stamped?.blob ?? null, isStamping };
}
