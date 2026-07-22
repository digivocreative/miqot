import { useCallback, useEffect, useState } from 'react';

// Pengaturan tampilan pembaca Al-Quran, dipertahankan di localStorage antar sesi.
// Ukuran Arab, latin, dan terjemahan diatur terpisah (indeks 0..3 masing-masing).
export interface QuranReaderSettings {
  arabicSizeIndex: number;
  latinSizeIndex: number;
  terjemahSizeIndex: number;
  showLatin: boolean;
  showTerjemah: boolean;
}

export type QuranSizeField = 'arabicSizeIndex' | 'latinSizeIndex' | 'terjemahSizeIndex';

// Kelas ukuran teks Arab (Tailwind) — dari kecil ke sangat besar.
export const ARABIC_SIZES = [
  'text-xl leading-loose',
  'text-2xl leading-loose',
  'text-3xl leading-[2.4]',
  'text-4xl leading-[2.6]',
] as const;

// Kelas ukuran teks latin & terjemahan — dari kecil ke sangat besar.
export const TRANSLATION_SIZES = [
  'text-xs leading-5',
  'text-sm leading-6',
  'text-base leading-7',
  'text-lg leading-8',
] as const;

export const SIZE_LABELS = ['Kecil', 'Sedang', 'Besar', 'Sangat Besar'] as const;
const LEVEL_COUNT = SIZE_LABELS.length;

const STORAGE_KEY = 'portal_quran_reader_settings_v2';
const DEFAULTS: QuranReaderSettings = {
  arabicSizeIndex: 1,
  latinSizeIndex: 1,
  terjemahSizeIndex: 1,
  showLatin: true,
  showTerjemah: true,
};

function clampSize(index: number) {
  return Math.min(LEVEL_COUNT - 1, Math.max(0, index));
}

function num(value: unknown, fallback: number) {
  return clampSize(typeof value === 'number' ? value : fallback);
}

function loadSettings(): QuranReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<QuranReaderSettings>;
    return {
      arabicSizeIndex: num(parsed.arabicSizeIndex, DEFAULTS.arabicSizeIndex),
      latinSizeIndex: num(parsed.latinSizeIndex, DEFAULTS.latinSizeIndex),
      terjemahSizeIndex: num(parsed.terjemahSizeIndex, DEFAULTS.terjemahSizeIndex),
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

  const adjustSize = useCallback((field: QuranSizeField, delta: number) => {
    setSettings((s) => ({ ...s, [field]: clampSize(s[field] + delta) }));
  }, []);

  const toggleLatin = useCallback(() => setSettings((s) => ({ ...s, showLatin: !s.showLatin })), []);
  const toggleTerjemah = useCallback(
    () => setSettings((s) => ({ ...s, showTerjemah: !s.showTerjemah })),
    []
  );

  return { settings, adjustSize, toggleLatin, toggleTerjemah };
}
