import { useCallback, useEffect, useState } from 'react';

// Pengaturan tampilan pembaca Al-Quran, dipertahankan di localStorage antar sesi.
export interface QuranReaderSettings {
  sizeIndex: number; // indeks ke ARABIC_SIZES
  showLatin: boolean;
  showTerjemah: boolean;
}

// Kelas ukuran teks Arab (Tailwind) — dari kecil ke sangat besar.
export const ARABIC_SIZES = [
  'text-xl leading-loose',
  'text-2xl leading-loose',
  'text-3xl leading-[2.4]',
  'text-4xl leading-[2.6]',
] as const;

// Ukuran teks latin & terjemahan, selaras (satu tingkat) dgn ARABIC_SIZES.
export const TRANSLATION_SIZES = [
  'text-xs leading-5',
  'text-sm leading-6',
  'text-base leading-7',
  'text-lg leading-8',
] as const;

export const ARABIC_SIZE_LABELS = ['Kecil', 'Sedang', 'Besar', 'Sangat Besar'] as const;

const STORAGE_KEY = 'portal_quran_reader_settings_v1';
const DEFAULTS: QuranReaderSettings = { sizeIndex: 1, showLatin: true, showTerjemah: true };

function clampSize(index: number) {
  return Math.min(ARABIC_SIZES.length - 1, Math.max(0, index));
}

function loadSettings(): QuranReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<QuranReaderSettings>;
    return {
      sizeIndex: clampSize(typeof parsed.sizeIndex === 'number' ? parsed.sizeIndex : DEFAULTS.sizeIndex),
      showLatin: typeof parsed.showLatin === 'boolean' ? parsed.showLatin : DEFAULTS.showLatin,
      showTerjemah: typeof parsed.showTerjemah === 'boolean' ? parsed.showTerjemah : DEFAULTS.showTerjemah,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useQuranReaderSettings() {
  const [settings, setSettings] = useState<QuranReaderSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // penyimpanan penuh / mode privat — abaikan, tetap berlaku untuk sesi ini.
    }
  }, [settings]);

  const decreaseSize = useCallback(
    () => setSettings((s) => ({ ...s, sizeIndex: clampSize(s.sizeIndex - 1) })),
    []
  );
  const increaseSize = useCallback(
    () => setSettings((s) => ({ ...s, sizeIndex: clampSize(s.sizeIndex + 1) })),
    []
  );
  const toggleLatin = useCallback(() => setSettings((s) => ({ ...s, showLatin: !s.showLatin })), []);
  const toggleTerjemah = useCallback(
    () => setSettings((s) => ({ ...s, showTerjemah: !s.showTerjemah })),
    []
  );

  return { settings, decreaseSize, increaseSize, toggleLatin, toggleTerjemah };
}
