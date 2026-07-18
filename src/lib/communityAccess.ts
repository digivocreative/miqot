const COMMUNITY_AGENT_SLUG = 'nikita';

export function isCommunityEnabledForAgent(slug?: string | null): boolean {
  return String(slug || '').trim().toLowerCase() === COMMUNITY_AGENT_SLUG;
}
