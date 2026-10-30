// Bounded fixed-window limiter. Consume synchronously, before any await, so a
// burst of concurrent requests cannot all pass the same remaining allowance.
export function createRateLimiter({ max, windowMs, maxKeys = 10000, now = Date.now }) {
  const entries = new Map();
  let nextSweep = 0;
  return {
    consume(key) {
      const time = now();
      if (time >= nextSweep) {
        for (const [k, entry] of entries) if (entry.resetAt <= time) entries.delete(k);
        nextSweep = time + Math.min(windowMs, 60000);
      }
      const normalized = String(key || 'unknown');
      let entry = entries.get(normalized);
      if (!entry || time >= entry.resetAt) {
        if (!entry && entries.size >= maxKeys) return { ok: false, retryAfter: Math.max(1, Math.ceil(windowMs / 1000)) };
        entry = { count: 0, resetAt: time + windowMs };
        entries.set(normalized, entry);
      }
      if (entry.count >= max) return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - time) / 1000)) };
      entry.count++;
      return { ok: true };
    },
    get size() { return entries.size; },
  };
}

export function rateLimitMiddleware(limiter, keyFor) {
  return (req, res, next) => {
    const result = limiter.consume(keyFor(req));
    if (result.ok) return next();
    res.set('Retry-After', String(result.retryAfter));
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Silakan coba lagi nanti.', retry_after: result.retryAfter });
  };
}
