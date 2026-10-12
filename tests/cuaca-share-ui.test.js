import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const modal = read('src/components/ShareCuacaModal.tsx');
const widget = read('src/components/CuacaWidget.tsx');
const dashboard = read('src/components/DashboardLayout.tsx');

test('modal prefetches the server image for the active city and reuses it', () => {
  assert.match(modal, /`\/api\/weather\/share-image\?city=\$\{encodeURIComponent\(city\.key\)\}`/);
  assert.match(modal, /blobRef\.current/);
  assert.match(modal, /<CuacaShareTemplate data=\{data\} assets=\{previewAssets\} \/>/);
  assert.match(modal, /photoSrc: data\.photo \? `\/cuaca-share\/\$\{data\.photo\}` : null/);
});

test('modal tracks the four registered events with the city', () => {
  assert.match(modal, /trackEvent\('feature', 'open_share_cuaca', \{ city: city\.key \}\)/);
  assert.match(modal, /trackEvent\('action', 'download_share_cuaca', \{ city: city\.key \}\)/);
  assert.match(modal, /trackEvent\('action', 'share_cuaca', \{ city: city\.key \}\)/);
  assert.match(modal, /trackEvent\('action', 'copy_cuaca_caption', \{ city: city\.key \}\)/);
});

test('caption uses the shared builder and the normalized WA number', () => {
  assert.match(modal, /buildCuacaCaption\(data, \{ waNumber: normalizeWaNumber\(agent\.phone\) \}\)/);
});

test('modal closes on Android back and has a retry path', () => {
  assert.match(modal, /useBackToClose\(open, onClose\)/);
  assert.match(modal, /Gagal membuat gambar/);
  assert.match(modal, /Coba lagi/);
});

test('tapping Share refreshes the weather so preview, caption and file use the same sync', () => {
  assert.match(widget, /onClick=\{\(\) => \{ fetchWeather\(true\); setShareMounted\(true\); setShareOpen\(true\); \}\}/);
});

test('widget shows the Share pill only with data and an agent, and passes syncedAt', () => {
  assert.match(widget, /setSyncedAt\(json\.syncedAt \?\? null\)/);
  assert.match(widget, /\{agent && \(\s*<button[\s\S]*aria-label="Bagikan cuaca"/);
  assert.match(widget, /<ShareCuacaModal[\s\S]*city=\{city\}[\s\S]*syncedAt=\{syncedAt\}[\s\S]*agent=\{agent\}/);
  assert.match(dashboard, /<CuacaWidget agent=\{\{ name: agentData\.name, phone: agentData\.phone, photo: agentData\.photo, slug: agentData\.slug \}\} \/>/);
});

test('a 200 response that is not an image shows the error state, not a broken .jpg', () => {
  const guard = modal.indexOf("if (!blob.type.startsWith('image/') || blob.size === 0) throw new Error(");
  assert.ok(guard > 0, 'blob diperiksa jenisnya');
  assert.ok(guard < modal.indexOf('blobRef.current = blob;'));
});

test('cuaca share actions get their own icons in Analytics', () => {
  const analytics = read('src/components/AnalyticsPage.tsx');
  const icons = analytics.match(/const ACTION_ICONS: Record<string, string> = \{[\s\S]*?\n\};/)?.[0] ?? '';
  assert.notEqual(icons, '', 'ACTION_ICONS tidak ditemukan');
  for (const name of ['download_share_cuaca', 'share_cuaca', 'copy_cuaca_caption']) {
    assert.match(icons, new RegExp(`\\b${name}: '[^']+'`), `${name} jatuh ke ikon default`);
  }
});
