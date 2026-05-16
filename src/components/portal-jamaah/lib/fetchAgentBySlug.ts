import { AGENTS_DATA, loadAgentsFromSupabase, type AgentData } from '@/data/agents';

export interface PortalAgent extends AgentData {
  slug: string;
}

export async function fetchAgentBySlug(slug: string): Promise<PortalAgent | null> {
  const normalizedSlug = slug.toLowerCase();
  try {
    const res = await fetch(`/api/agents/${encodeURIComponent(normalizedSlug)}/public`);
    if (res.ok) {
      const data = await res.json();
      return {
        slug: data.slug || normalizedSlug,
        name: data.name || '',
        phone: data.phone || '',
        photo: data.photo || '',
        website: data.website || '',
        card_variant: 'default',
      };
    }
  } catch {
    // Fallback below covers local/offline cases where the Supabase cache exists.
  }

  await loadAgentsFromSupabase();
  const cached = AGENTS_DATA[normalizedSlug];
  return cached ? { slug: normalizedSlug, ...cached } : null;
}
