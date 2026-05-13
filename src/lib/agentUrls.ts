export interface AgentForUrl {
  slug: string;
  custom_domain?: string | null;
  custom_domain_status?: string | null;
}

function joinPath(path: string): string {
  if (!path) return '';
  return path.startsWith('/') ? path : '/' + path;
}

export function getAgentBaseUrl(agent: AgentForUrl): string {
  if (agent.custom_domain && agent.custom_domain_status === 'active') {
    return `https://${agent.custom_domain}`;
  }
  return `https://alhijaz.co/${agent.slug}`;
}

export function getAgentPublicUrl(agent: AgentForUrl, path: string = ''): string {
  return `${getAgentBaseUrl(agent)}${joinPath(path)}`;
}
