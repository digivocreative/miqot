import { createHmac, timingSafeEqual } from 'node:crypto';

export function requireJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || secret === 'fallback-secret-change-me') {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes');
  }
  return secret;
}

// A reset link is bound to the current password hash. Updating the password
// invalidates every previously issued reset link without a schema migration.
export function passwordResetVersion(agent, secret) {
  return createHmac('sha256', secret)
    .update(JSON.stringify(['password-reset-v1', agent.id, agent.password || '']))
    .digest('hex');
}

export function matchesPasswordResetVersion(version, agent, secret) {
  if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) return false;
  return timingSafeEqual(Buffer.from(version, 'hex'), Buffer.from(passwordResetVersion(agent, secret), 'hex'));
}

export function currentAgentSession(decoded, agent) {
  if (!agent?.id || (agent.status && agent.status !== 'active')) return null;
  // In particular, never retain an admin claim from a deleted/demoted account.
  return { ...decoded, id: agent.id, slug: agent.slug, name: agent.name, role: agent.role === 'admin' ? 'admin' : 'agent' };
}
