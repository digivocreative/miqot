const COMMUNITY_AGENT_SLUGS = new Set(['nikita', 'bagas']);

export function communityMemberSlugs() {
  return [...COMMUNITY_AGENT_SLUGS];
}

export function isCommunityEnabledForAgent(agentOrSlug) {
  const slug = typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug;
  return COMMUNITY_AGENT_SLUGS.has(String(slug || '').trim().toLowerCase());
}

export function requireCommunityAccess(agent, res) {
  if (isCommunityEnabledForAgent(agent)) return true;
  res.status(403).json({ error: 'Fitur Teras belum tersedia untuk agent ini' });
  return false;
}
