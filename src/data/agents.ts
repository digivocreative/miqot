export interface AgentData {
  name: string;
  website: string;
  phone: string; // Format: 628...
  photo: string; // Path ke folder public
}

/** Satu baris GET /api/agents/public — proyeksi lima kolom publik (lib/public-agents.js). */
interface PublicAgentRow {
  slug: string;
  name: string;
  website: string;
  phone: string;
  photo: string;
}

// ── localStorage cache key ──
const LS_KEY = 'agents_cache';

function loadCachedAgents(): Record<string, AgentData> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, AgentData>;
      if (Object.keys(parsed).length > 0) return parsed;
    }
  } catch { /* ignore parse errors */ }
  return {};
}

// Live data — dimulai dari localStorage cache, lalu di-refresh dari /api/agents/public
export let AGENTS_DATA: Record<string, AgentData> = loadCachedAgents();

let _loaded = false;

/**
 * Fetch agent data dari GET /api/agents/public dan update AGENTS_DATA in-place.
 * Dipanggil sekali saat App mount. Kalau gagal, fallback/cache tetap aktif.
 *
 * Dulu membaca tabel agents langsung lewat anon key Supabase — @supabase/* 172 KB
 * ikut di chunk entry hanya untuk select 5 kolom (audit 21 Sep 2026). Filter
 * status (active/null) & kolom kini di server; nama fungsi dipertahankan untuk
 * importer (main.tsx, App.tsx, BioPage, SharePage, portal-jamaah).
 */
export async function loadAgentsFromSupabase(): Promise<Record<string, AgentData>> {
  if (_loaded) return AGENTS_DATA;
  try {
    const response = await fetch('/api/agents/public', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error('Respons /api/agents/public bukan array');

    if (data.length > 0) {
      const fresh: Record<string, AgentData> = {};
      for (const row of data as PublicAgentRow[]) {
        if (!row || typeof row.slug !== 'string') continue;
        fresh[row.slug] = {
          name: row.name,
          website: row.website,
          phone: row.phone,
          photo: row.photo,
        };
      }
      // Update the exported object in-place so all imports see new data
      Object.keys(AGENTS_DATA).forEach(k => delete AGENTS_DATA[k]);
      Object.assign(AGENTS_DATA, fresh);
      _loaded = true;

      // Persist to localStorage for next page load
      try { localStorage.setItem(LS_KEY, JSON.stringify(fresh)); } catch { /* quota exceeded */ }
    }
  } catch (err) {
    console.warn('[agents] Gagal memuat daftar agent, pakai fallback/cache:', err);
  }
  return AGENTS_DATA;
}
