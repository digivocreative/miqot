import { supabase } from '../lib/supabase';

export interface AgentData {
  name: string;
  website: string;
  phone: string; // Format: 628...
  photo: string; // Path ke folder public
  card_variant?: string;
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

// Live data — dimulai dari localStorage cache, lalu di-refresh oleh Supabase
export let AGENTS_DATA: Record<string, AgentData> = loadCachedAgents();

let _loaded = false;

/**
 * Fetch agent data dari Supabase dan update AGENTS_DATA in-place.
 * Dipanggil sekali saat App mount. Kalau gagal, fallback/cache tetap aktif.
 */
export async function loadAgentsFromSupabase(): Promise<Record<string, AgentData>> {
  if (_loaded) return AGENTS_DATA;
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('slug, name, website, phone, photo, card_variant')
      .or('status.eq.active,status.is.null');

    if (error) throw error;
    if (data && data.length > 0) {
      const fresh: Record<string, AgentData> = {};
      for (const row of data) {
        fresh[row.slug] = {
          name: row.name,
          website: row.website,
          phone: row.phone,
          photo: row.photo,
          card_variant: row.card_variant || 'default',
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
    console.warn('[Supabase] Failed to load agents, using fallback/cache:', err);
  }
  return AGENTS_DATA;
}
