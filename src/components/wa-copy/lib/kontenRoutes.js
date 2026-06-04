// Pure route logic for the /dashboard/konten admin subtree (URL = source of truth,
// see docs/superpowers/specs/2026-06-04-konten-url-routing-design.md).
// Plain JS + kontenRoutes.d.ts so node:test can exercise it directly — same pattern
// as categoryOps.js and hajiPlusPricing.js.

const KONTEN_BASE = '/dashboard/konten';
const TABS = ['faq', 'caption', 'tourleader'];

export function kontenPath(route) {
  const base = `${KONTEN_BASE}/${route.tab}`;
  switch (route.kind) {
    case 'list': return base;
    case 'entry-new': return `${base}/tambah`;
    case 'entry-edit': return `${base}/edit/${encodeURIComponent(route.id)}`;
    case 'cat-list': return `${base}/kategori`;
    case 'cat-new': return `${base}/kategori/tambah`;
    case 'cat-edit': return `${base}/kategori/edit/${encodeURIComponent(route.value)}`;
    case 'cat-delete': return `${base}/kategori/hapus/${encodeURIComponent(route.value)}`;
    default: return `${KONTEN_BASE}/faq`;
  }
}

export function parseKontenPath(pathname) {
  const fallback = { route: { kind: 'list', tab: 'faq' }, canonical: false };
  let segs;
  try {
    segs = String(pathname || '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return fallback; // malformed percent-encoding
  }
  if (segs[0] !== 'dashboard' || segs[1] !== 'konten') return fallback;
  const tab = segs[2];
  if (!TABS.includes(tab)) return fallback;
  const rest = segs.slice(3);
  let route = null;
  if (rest.length === 0) route = { kind: 'list', tab };
  else if (rest.length === 1 && rest[0] === 'tambah') route = { kind: 'entry-new', tab };
  else if (rest.length === 2 && rest[0] === 'edit') route = { kind: 'entry-edit', tab, id: rest[1] };
  else if (rest[0] === 'kategori') {
    const sub = rest.slice(1);
    if (sub.length === 0) route = { kind: 'cat-list', tab };
    else if (sub.length === 1 && sub[0] === 'tambah') route = { kind: 'cat-new', tab };
    else if (sub.length === 2 && sub[0] === 'edit') route = { kind: 'cat-edit', tab, value: sub[1] };
    else if (sub.length === 2 && sub[0] === 'hapus') route = { kind: 'cat-delete', tab, value: sub[1] };
  }
  if (!route) return { route: { kind: 'list', tab }, canonical: false };
  return { route, canonical: kontenPath(route) === pathname };
}

export function kontenParentPath(route) {
  switch (route.kind) {
    case 'entry-new':
    case 'entry-edit':
    case 'cat-list':
      return kontenPath({ kind: 'list', tab: route.tab });
    case 'cat-new':
    case 'cat-edit':
    case 'cat-delete':
      return kontenPath({ kind: 'cat-list', tab: route.tab });
    default:
      return null; // 'list' has no konten parent — caller goes home
  }
}
