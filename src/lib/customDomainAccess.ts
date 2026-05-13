const CUSTOM_DOMAIN_ENABLED_AGENT_SLUGS = new Set(['nikita']);

export function isCustomDomainEnabledForAgent(agentSlug?: string | null) {
  return CUSTOM_DOMAIN_ENABLED_AGENT_SLUGS.has(String(agentSlug || '').toLowerCase());
}
