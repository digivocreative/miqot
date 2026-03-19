export async function trackEvent(eventType: string, eventName: string, metadata: Record<string, any> = {}) {
  try {
    const token = localStorage.getItem('auth_session');
    if (!token) return;
    let parsed: { token?: string; user?: { role?: string } } = {};
    try { parsed = JSON.parse(token); } catch { return; }
    if (!parsed.token) return;
    // Skip tracking for admin users
    if (parsed.user?.role === 'admin') return;

    fetch('/api/analytics/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parsed.token}`,
      },
      body: JSON.stringify({ eventType, eventName, metadata }),
    });
    // Fire-and-forget — no await
  } catch {
    // Silent fail
  }
}

export async function trackPublicEvent(slug: string, eventName: string, metadata: Record<string, any> = {}) {
  try {
    fetch('/api/analytics/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, eventName, metadata }),
    });
  } catch {
    // Silent fail
  }
}
