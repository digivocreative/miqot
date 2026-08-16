/**
 * Draf komposer Teras di localStorage — logika murni, tanpa React.
 * Storage dioper sebagai parameter supaya bisa diuji unit tanpa jsdom.
 * SEMUA operasi best-effort: gagal baca/tulis (quota, mode privat) = senyap.
 */

export const TERAS_DRAFT_VERSION = 1;
export const TERAS_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const TERAS_REPLY_DRAFT_MAX = 20;

/** Subset Storage yang dipakai; window.localStorage memenuhinya. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

interface DraftPayload {
  v: number;
  savedAt: number;
  segments: string[];
}

export function feedDraftKey(slug: string): string {
  return `teras:draft:${slug.toLowerCase()}:feed`;
}

export function replyDraftKey(slug: string, postId: string): string {
  return `${replyDraftPrefix(slug)}${postId}`;
}

/**
 * Lampiran teks komposer feed. Kunci TERPISAH dari feedDraftKey, bukan field
 * baru di dalam amplop segmen: menambah field ke payload lama berarti menaikkan
 * TERAS_DRAFT_VERSION, dan parsePayload menolak versi asing — setiap draf yang
 * sedang tersimpan di perangkat agent akan terbuang begitu deploy mendarat.
 * Dua kunci = draf teks lama tetap terbaca apa adanya.
 *
 * Berakhiran `:feed:lampiran`, jadi ia TIDAK tertangkap prefiks reply
 * (`:reply:`) yang disapu pruneReplyDrafts, dan bukan pula kunci `:feed`
 * (localStorage mencocokkan kunci persis, bukan awalan).
 */
export function feedSnippetDraftKey(slug: string): string {
  return `teras:draft:${slug.toLowerCase()}:feed:lampiran`;
}

function replyDraftPrefix(slug: string): string {
  return `teras:draft:${slug.toLowerCase()}:reply:`;
}

function parsePayload(raw: string): DraftPayload | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<DraftPayload>;
    if (payload.v !== TERAS_DRAFT_VERSION) return null;
    if (typeof payload.savedAt !== 'number' || !Number.isFinite(payload.savedAt)) return null;
    if (!Array.isArray(payload.segments)) return null;
    if (!payload.segments.every(segment => typeof segment === 'string')) return null;
    return payload as DraftPayload;
  } catch {
    return null;
  }
}

/** Dipakai amplop segmen DAN amplop lampiran — keduanya hanya perlu savedAt. */
function isExpired(payload: { savedAt: number }, now: number): boolean {
  return now - payload.savedAt > TERAS_DRAFT_MAX_AGE_MS;
}

/** null = tak ada draf layak pakai; kunci korup/basi/kosong ikut dibersihkan. */
export function loadDraft(storage: DraftStorage, key: string, now: number): string[] | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const payload = parsePayload(raw);
    if (!payload || isExpired(payload, now) || payload.segments.every(segment => !segment.trim())) {
      storage.removeItem(key);
      return null;
    }
    return payload.segments;
  } catch {
    return null;
  }
}

/** Semua segmen kosong (trim) = buang draf; itu satu-satunya cara "hapus draf". */
export function saveDraft(storage: DraftStorage, key: string, segments: string[], now: number): void {
  try {
    if (segments.every(segment => !segment.trim())) {
      storage.removeItem(key);
      return;
    }
    const payload: DraftPayload = { v: TERAS_DRAFT_VERSION, savedAt: now, segments };
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // best-effort
  }
}

interface SnippetDraftPayload {
  v: number;
  savedAt: number;
  title: string;
  body: string;
}

export interface SnippetDraftValue {
  title: string;
  body: string;
}

/**
 * Amplop lampiran dibaca terpisah dari parsePayload: bentuknya beda (title/body,
 * bukan segments), jadi memaksakan satu parser hanya akan membuat salah satu
 * dari keduanya menolak amplop yang sah.
 */
function parseSnippetPayload(raw: string): SnippetDraftPayload | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<SnippetDraftPayload>;
    if (payload.v !== TERAS_DRAFT_VERSION) return null;
    if (typeof payload.savedAt !== 'number' || !Number.isFinite(payload.savedAt)) return null;
    if (typeof payload.body !== 'string') return null;
    if (payload.title !== undefined && typeof payload.title !== 'string') return null;
    return { v: payload.v, savedAt: payload.savedAt, title: payload.title ?? '', body: payload.body };
  } catch {
    return null;
  }
}

/** null = tak ada lampiran layak pakai; kunci korup/basi/kosong ikut dibersihkan. */
export function loadSnippetDraft(
  storage: DraftStorage,
  key: string,
  now: number,
): SnippetDraftValue | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const payload = parseSnippetPayload(raw);
    if (!payload || isExpired(payload, now) || !payload.body.trim()) {
      storage.removeItem(key);
      return null;
    }
    return { title: payload.title, body: payload.body };
  } catch {
    return null;
  }
}

/**
 * Body kosong (trim) = buang draf — semantik yang sama dengan saveDraft.
 * Judul saja tanpa isi bukan lampiran, jadi ia ikut terbuang.
 */
export function saveSnippetDraft(
  storage: DraftStorage,
  key: string,
  value: SnippetDraftValue,
  now: number,
): void {
  try {
    if (!value.body.trim()) {
      storage.removeItem(key);
      return;
    }
    const payload: SnippetDraftPayload = {
      v: TERAS_DRAFT_VERSION,
      savedAt: now,
      title: value.title,
      body: value.body,
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // best-effort
  }
}

export function clearDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // best-effort
  }
}

/**
 * Jaga kunci reply per agent tetap <= max: buang yang basi + yang paling tua.
 * Kunci feed dan kunci agent lain di luar urusan fungsi ini.
 */
export function pruneReplyDrafts(storage: DraftStorage, slug: string, max: number, now: number): void {
  try {
    const prefix = replyDraftPrefix(slug);
    const alive: { key: string; savedAt: number }[] = [];
    const drop: string[] = [];
    // Kumpulkan dulu, hapus belakangan: menghapus sambil iterasi index membuat
    // storage.key(i) meloncati entri.
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const raw = storage.getItem(key);
      const payload = raw === null ? null : parsePayload(raw);
      if (!payload || isExpired(payload, now)) {
        drop.push(key);
        continue;
      }
      alive.push({ key, savedAt: payload.savedAt });
    }
    alive.sort((a, b) => b.savedAt - a.savedAt);
    alive.slice(max).forEach(entry => drop.push(entry.key));
    drop.forEach(key => clearDraft(storage, key));
  } catch {
    // best-effort
  }
}
