import { supabase } from '../lib/supabase';

export interface AgentData {
  name: string;
  website: string;
  phone: string; // Format: 628...
  photo: string; // Path ke folder public
  card_variant?: string;
  role?: string;
}

// Whitelist landing-page slug yang boleh pakai fitur Diskusi (Tanya AI).
// Admin otomatis dapat akses via check role === 'admin'.
export const DISKUSI_ENABLED_SLUGS: ReadonlySet<string> = new Set([
  'harga',                    // Yeyen
  'ninanasution',             // Nina Nasution
  'nila',                     // Nila Novita
  'indowisata',               // Hj. Linda
  'isti',                     // Isti
  'nani',                     // Nani Rohani
  'indonesia',                // Siska
  'selfiahalhijazindowisata', // Selfiah Handayani
  'dianwahyuni',              // Dian
  'travel',                   // Hj. Merry Susanty
]);

export function isDiskusiEnabled(slug: string, agent?: AgentData | null): boolean {
  if (!slug) return false;
  if (agent?.role === 'admin') return true;
  return DISKUSI_ENABLED_SLUGS.has(slug);
}

// Fallback data — digunakan saat Supabase belum ter-load atau offline
const FALLBACK_AGENTS: Record<string, AgentData> = {
  'nikita': { name: 'Nikita', website: 'alhijazindonesia.com', phone: '62822900020', photo: '/agents/nikita.jpg', role: 'admin' },
  'nila': { name: 'Nila', website: 'alhijaztourtravels.com', phone: '6285211209049', photo: '/agents/nila.jpg' },
  'andra': { name: 'Andra', website: 'travelalhijazwisata.com', phone: '628129909795', photo: '/agents/andra.jpg' },
  'dyah': { name: 'Dyah', website: 'alhijaztraveltours.com', phone: '6281385975678', photo: '/agents/dyah.jpg' },
  'widi': { name: 'Widi', website: 'alhijaz-hajiumroh.com', phone: '6287820813228', photo: '/agents/widi.jpg' },
  'aulia': { name: 'Aulia', website: 'alhijazumrohtravel.com', phone: '6282110407229', photo: '/agents/aulia.jpg' },
  'selfiah': { name: 'Selfiah', website: 'alhijaztourtravel.co.id', phone: '6281410478212', photo: '/agents/selfiah.jpg' },
  'zakia': { name: 'Zakia', website: 'alhijazbirowisata.com', phone: '6285158005623', photo: '/agents/zakia.jpg' },
  'dianwahyuni': { name: 'Dian', website: 'alhijazindowisatatours.com', phone: '6283197968407', photo: '/agents/dianwahyuni.jpg' },
  'anne': { name: 'Anne', website: 'hajialhijaz.com', phone: '628129953424', photo: '/agents/anne.jpg' },
  'evi': { name: 'Evi', website: 'alhijazbirohajiumroh.com', phone: '6281806742789', photo: '/agents/evi.jpg' },
  'yenita': { name: 'Yenita', website: 'alhijazumrahtravel.com', phone: '6281316803128', photo: '/agents/yenita.jpg' },
  'indah': { name: 'Indah', website: 'alhijaztraveltour.com', phone: '6281943631008', photo: '/agents/indah.jpg' },
  'aisyah': { name: 'Aisyah', website: 'travelalhijazumrah.com', phone: '6281225600900', photo: '/agents/aisyah.jpg' },
  'siska': { name: 'Siska', website: 'alhijazumroh.com', phone: '6281188885291', photo: '/agents/siska.jpg' },
  'linda': { name: 'Linda', website: 'alhijazcallcenter.com', phone: '6282112094089', photo: '/agents/linda.jpg' },
  'nina': { name: 'Nina', website: 'alhijazumrahtours.com', phone: '6285943191075', photo: '/agents/nina.jpg' },
  'sari': { name: 'Sari', website: 'alhijaz.co/sari', phone: '6281907018220', photo: '/agents/sari.jpg' },
  'isti': { name: 'Isti', website: 'al-hijaztravelumroh.com', phone: '6281315002460', photo: '/agents/isti.jpg' },
  'ferra': { name: 'Ferra', website: 'alhijaztourtravel.id', phone: '62811802789', photo: '/agents/ferra.jpg' },
  'jan-praba': { name: 'Jan Praba', website: 'alhijaz.co/jan-praba', phone: '62816728940', photo: '/agents/jan-praba.jpg' },
  'ekawati': { name: 'Ekawati', website: 'alhijaz.co/ekawati', phone: '62816728904', photo: '/agents/ekawati.jpg' },
  'bagas': { name: 'Bagas Pramudita', website: 'alhijaz.co', phone: '6287878573311', photo: '/agents/bagas.jpg' },
};

// ── localStorage cache key ──
const LS_KEY = 'agents_cache';

/**
 * Try to restore agent data from localStorage so the very first render
 * already shows up-to-date info (no flash of stale hardcoded fallback).
 */
function loadCachedAgents(): Record<string, AgentData> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, AgentData>;
      if (Object.keys(parsed).length > 0) return parsed;
    }
  } catch { /* ignore parse errors */ }
  return { ...FALLBACK_AGENTS };
}

// Live data — dimulai dari localStorage cache (atau fallback), lalu di-refresh oleh Supabase
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
      .select('slug, name, website, phone, photo, card_variant, role')
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
          role: row.role,
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
