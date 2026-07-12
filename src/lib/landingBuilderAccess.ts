const LANDING_BUILDER_AGENT_SLUG = 'nikita';

export function isLandingBuilderEnabledForAgent(slug?: string | null): boolean {
  return String(slug || '').trim().toLowerCase() === LANDING_BUILDER_AGENT_SLUG;
}
