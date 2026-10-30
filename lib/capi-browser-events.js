export const BROWSER_CAPI_EVENTS = Object.freeze({
  pageView: 'PageView', search: 'Search', viewContent: 'ViewContent', contact: 'Contact',
});

// Browser tracking can select a UI event, not invent a Meta event or a paid
// transaction. The owner-controlled config resolves the final Meta name.
export function browserCapiEventKey(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  let key = body.eventKey;
  if (key == null) {
    key = body.eventName == null ? 'pageView'
      : Object.keys(BROWSER_CAPI_EVENTS).find(candidate => BROWSER_CAPI_EVENTS[candidate] === body.eventName);
  }
  if (typeof key !== 'string' || !Object.hasOwn(BROWSER_CAPI_EVENTS, key)) return null;
  if (body.eventName != null && body.eventName !== BROWSER_CAPI_EVENTS[key]) return null;
  return key;
}
