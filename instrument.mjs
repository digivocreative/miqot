// instrument.mjs — Sentry initialization
// HARUS di-import SEBELUM module lain agar auto-instrumentation bekerja

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Performance monitoring — sample 20% of transactions di production
  tracesSampleRate: 0.2,

  // Environment tag
  environment: process.env.NODE_ENV || 'production',

  // Filter noise: jangan kirim error dari health check atau static files
  beforeSend(event) {
    // Skip jika tidak ada exception
    if (!event.exception) return event;

    const message = event.exception?.values?.[0]?.value || '';

    // Skip common non-actionable errors
    if (message.includes('ECONNRESET') || message.includes('EPIPE')) {
      return null;
    }

    return event;
  },

  // Jangan kirim PII (personal data) — kita handle sendiri
  sendDefaultPii: false,
});
