const COMMUNITY_AGENT_SLUGS = new Set(['nikita', 'bagas']);

export function isCommunityEnabledForAgent(slug?: string | null): boolean {
  return COMMUNITY_AGENT_SLUGS.has(String(slug || '').trim().toLowerCase());
}
