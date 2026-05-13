/// <reference types="vite/client" />

interface AgentContext {
  slug: string;
  name: string;
  website: string | null;
  phone: string | null;
  photo: string | null;
  email: string | null;
  customDomain: string | null;
  hasCustomDomain: boolean;
}

interface Window {
  __AGENT_CONTEXT__?: AgentContext;
}
