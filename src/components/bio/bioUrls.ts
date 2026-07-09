export function getBioAgentPath(agentSlug: string, path = '') {
  const normalizedPath = path.replace(/^\/+/, '');
  const context = window.__AGENT_CONTEXT__;
  const onOwnCustomDomain = Boolean(
    context?.customDomain &&
    context.slug?.toLowerCase() === agentSlug.toLowerCase()
  );

  if (onOwnCustomDomain) {
    return normalizedPath ? `/${normalizedPath}` : '/';
  }
  return normalizedPath ? `/${agentSlug}/${normalizedPath}` : `/${agentSlug}`;
}
