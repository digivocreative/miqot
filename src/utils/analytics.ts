import { getStoredSession } from '../components/LoginPage';

export async function trackEvent(eventType: string, eventName: string, metadata: Record<string, any> = {}) {
  try {
    const session = getStoredSession();
    if (!session?.token) {
      console.warn('[Analytics] No session found, skipping track:', eventName);
      return;
    }
    if (session.user?.role === 'admin') return;

    fetch('/api/analytics/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({ eventType, eventName, metadata }),
    }).then(res => {
      if (!res.ok) console.warn('[Analytics] Track failed:', eventName, res.status);
    }).catch(err => {
      console.warn('[Analytics] Track error:', eventName, err.message);
    });
  } catch {
    // Silent fail for edge cases
  }
}

export async function trackPublicEvent(slug: string, eventName: string, metadata: Record<string, any> = {}) {
  try {
    fetch('/api/analytics/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, eventName, metadata }),
    }).catch(err => {
      console.warn('[Analytics] Public track error:', eventName, err.message);
    });
  } catch {
    // Silent fail
  }
}
