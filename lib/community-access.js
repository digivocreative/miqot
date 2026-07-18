const COMMUNITY_AGENT_SLUG = 'nikita';

export function isCommunityEnabledForAgent(agentOrSlug) {
  const slug = typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug;
  return String(slug || '').trim().toLowerCase() === COMMUNITY_AGENT_SLUG;
}

export function requireCommunityAccess(agent, res) {
  if (isCommunityEnabledForAgent(agent)) return true;
  res.status(403).json({ error: 'Fitur Ruang Komunitas belum tersedia untuk agent ini' });
  return false;
}
