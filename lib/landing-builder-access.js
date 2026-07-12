const LANDING_BUILDER_AGENT_SLUG = 'nikita';

export function isLandingBuilderEnabledForAgent(agentOrSlug) {
  const slug = typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug;
  return String(slug || '').trim().toLowerCase() === LANDING_BUILDER_AGENT_SLUG;
}

export function requireLandingBuilderAccess(agent, res) {
  if (isLandingBuilderEnabledForAgent(agent)) return true;

  res.status(403).json({ error: 'Fitur Landing Page Builder belum tersedia untuk agent ini' });
  return false;
}
