import { useEffect } from 'react';
import { setUnsaved } from '../lib/unsavedChanges';

/**
 * Daftarkan form yang sedang punya perubahan belum tersimpan. Selama `dirty` true,
 * menutup/memuat ulang halaman memunculkan peringatan peramban, dan tombol "Muat ulang"
 * versi baru meminta konfirmasi dulu. `key` harus unik per form.
 */
export function useUnsavedChanges(key: string, dirty: boolean): void {
  useEffect(() => {
    setUnsaved(key, dirty);
    return () => setUnsaved(key, false);
  }, [key, dirty]);
}
