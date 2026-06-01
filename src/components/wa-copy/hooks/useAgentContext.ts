import { useState } from 'react';
import { getStoredSession } from '../../LoginPage';
import type { AgentContext } from '../lib/types';

/** Derive the agent placeholder context from the stored auth session. */
function deriveAgentContext(): AgentContext {
  const session = getStoredSession();
  if (!session) return { nama: '', wa: '', link: '' };
  const { name, phone, slug } = session.user;
  return {
    nama: name || '',
    wa: phone || '',
    link: slug ? `https://alhijaz.co/${slug}` : '',
  };
}

/**
 * Read-only agent context for the placeholder engine: {nama, wa, link}.
 * Sourced once from getStoredSession() (non-reactive — the logged-in agent's
 * identity does not change within a dashboard session).
 */
export function useAgentContext(): AgentContext {
  const [ctx] = useState<AgentContext>(deriveAgentContext);
  return ctx;
}
