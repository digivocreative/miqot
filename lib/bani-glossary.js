export const BANI_GLOSSARY_CACHE_TTL_MS = 5 * 60 * 1000;
export const BANI_GLOSSARY_PROMPT_LIMIT = 40;

const glossaryCache = new WeakMap();
const WIB_YEAR = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
});

function dateFromNow(now) {
  const value = typeof now === 'function' ? now() : (now ?? Date.now());
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function resolveRelativeYears(value, tahunIni, tahunDepan) {
  if (typeof value === 'string') {
    return value
      .replaceAll('{{TAHUN_INI}}', tahunIni)
      .replaceAll('{{TAHUN_DEPAN}}', tahunDepan);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveRelativeYears(item, tahunIni, tahunDepan));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveRelativeYears(item, tahunIni, tahunDepan)]),
    );
  }
  return value;
}

function normalizeEntries(rows, date) {
  const tahunIni = WIB_YEAR.format(date);
  const tahunDepan = String(Number(tahunIni) + 1);
  const entries = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const istilah = typeof row?.istilah === 'string' ? row.istilah.trim().toLowerCase() : '';
    const tafsir = typeof row?.tafsir === 'string' ? row.tafsir.trim() : '';
    if (!istilah || !tafsir) continue;
    const sinonim = (Array.isArray(row.sinonim) ? row.sinonim : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    const filter = row.filter && typeof row.filter === 'object' && !Array.isArray(row.filter)
      ? row.filter
      : {};
    entries.push({
      istilah,
      sinonim,
      tafsir,
      filter: resolveRelativeYears(filter, tahunIni, tahunDepan),
    });
  }
  return entries;
}

export async function loadBaniGlossary(supabase, { now = Date.now } = {}) {
  const date = dateFromNow(now);
  const nowMs = date.getTime();

  if (!supabase || (typeof supabase !== 'object' && typeof supabase !== 'function')
      || typeof supabase.from !== 'function') {
    console.warn('[Bani] Kamus istilah gagal dimuat: koneksi Supabase tidak tersedia.');
    return [];
  }

  const cached = glossaryCache.get(supabase);
  if (cached && nowMs < cached.expiresAt) return normalizeEntries(cached.rows, date);

  try {
    const { data, error } = await supabase
      .from('bani_glossary')
      .select('istilah, sinonim, tafsir, filter')
      .eq('aktif', true)
      .order('istilah', { ascending: true });
    if (error) throw new Error(error.message || 'query bani_glossary gagal');

    const rows = Array.isArray(data) ? data : [];
    glossaryCache.set(supabase, {
      rows,
      expiresAt: nowMs + BANI_GLOSSARY_CACHE_TTL_MS,
    });
    return normalizeEntries(rows, date);
  } catch (error) {
    console.warn(`[Bani] Kamus istilah gagal dimuat: ${error?.message || String(error)}`);
    return [];
  }
}

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function formatGlossaryForPrompt(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === 'object' && oneLine(entry.istilah) && oneLine(entry.tafsir))
    .slice(0, BANI_GLOSSARY_PROMPT_LIMIT)
    .map((entry) => {
      const istilah = oneLine(entry.istilah);
      const sinonim = (Array.isArray(entry.sinonim) ? entry.sinonim : [])
        .map(oneLine)
        .filter(Boolean)
        .join(', ') || '-';
      const tafsir = oneLine(entry.tafsir);
      const filter = entry.filter && typeof entry.filter === 'object' && !Array.isArray(entry.filter)
        ? entry.filter
        : {};
      return `${istilah} (sinonim: ${sinonim}) → ${tafsir} → filter: ${JSON.stringify(filter)}`;
    })
    .join('\n');
}
