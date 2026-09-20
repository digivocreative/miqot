export interface FilterShareMeta {
  /** FilterMode internal, mis. 'TIPE PAKET'. */
  mode: string;
  /** Teks kecil ber-letterspacing di atas headline kartu (HURUF BESAR). */
  eyebrow: string;
  /** Teks besar di kartu, mis. 'Umroh Ramadhan'. */
  headline: string;
  title: string;
  description: string;
  /** Path relatif, mis. '/og/filter/nikita/umroh-ramadhan.png'. */
  ogImagePath: string;
}

/** `null` = slug ini bukan filter berdimensi → pemanggil pakai kartu agent. */
export function buildFilterShareMeta(input: {
  filterSlug?: string | null;
  agentName?: string | null;
  agentSlug?: string | null;
}): FilterShareMeta | null;
