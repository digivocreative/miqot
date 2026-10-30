// Loaded only by scripts/audit-smoke.mjs in its disposable child process.
const origin = process.env.AUDIT_MOCK_DB_ORIGIN;
if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Audit requires a local mock database');
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== origin) return Promise.reject(new Error('Audit blocked external network access'));
  return originalFetch(input, options);
};
