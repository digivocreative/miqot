import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Halaman publik (jadwal, detail paket, kalkulasi, banding, status penerbangan) —
// audit PWA 2026-09-17: tombol Kembali memakai `location.href` ke induk, jadi tiap
// ketukan MENUMPUK entri riwayat dan back Android berikutnya memantul ke halaman
// yang baru ditinggal. Sekarang: dibuka dari dalam app → history.back(); dibuka
// langsung (link WhatsApp) → location.replace ke induk.
//
// Keputusan "dari dalam app?" ada di hasInAppHistory (src/lib/appHistory.ts, modul kecil
// tanpa dependensi — aman diimpor halaman lazy). Tes ini MENJALANKAN fungsinya dan memastikan
// keempat halaman memakai versi bersama itu, bukan salinan yang bisa melenceng.

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const FILES_WITH_HELPER = [
  'src/App.tsx',
  'src/components/KalkulasiPage.tsx',
  'src/components/ComparePage.tsx',
  'src/components/FlightSharePage.tsx',
];

const { hasInAppHistory } = await import('../src/lib/appHistory.ts');

function run({ navigation, historyLength, referrer, origin = 'https://alhijaz.co' }) {
  globalThis.window = {
    history: { length: historyLength },
    location: { origin },
    ...(navigation === undefined ? {} : { navigation }),
  };
  globalThis.document = { referrer };
  try {
    return hasInAppHistory();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
}

test('hasInAppHistory: Navigation API (bila ada) yang memutuskan', () => {
  // Overlay (useBackToClose) meninggalkan entri MAJU: history.length > 1 dan
  // referrer se-origin, padahal halaman ini entri pertama tab. Tanpa API itu
  // history.back() tak melakukan apa-apa — tombolnya mati.
  assert.equal(run({ navigation: { canGoBack: false }, historyLength: 3, referrer: 'https://alhijaz.co/nikita' }), false);
  assert.equal(run({ navigation: { canGoBack: true }, historyLength: 2, referrer: '' }), true);
});

test('hasInAppHistory: tanpa Navigation API → referrer se-origin + riwayat > 1', () => {
  const base = { historyLength: 2, referrer: 'https://alhijaz.co/nikita' };
  assert.equal(run(base), true, 'dibuka dari daftar jadwal di tab yang sama');
  assert.equal(run({ ...base, referrer: '' }), false, 'link WhatsApp / ketik URL');
  assert.equal(run({ ...base, referrer: 'https://l.wl.co/l?u=x' }), false, 'referrer lintas origin');
  assert.equal(run({ ...base, historyLength: 1 }), false, 'tab baru: tak ada yang bisa dimundurkan');
  assert.equal(run({ ...base, referrer: 'bukan url' }), false, 'referrer rusak tidak melempar');
  // Properti navigation yang bukan Navigation API (mis. polyfill setengah jadi).
  assert.equal(run({ ...base, navigation: {} }), true);
});

for (const rel of FILES_WITH_HELPER) {
  test(`${rel}: memakai hasInAppHistory bersama, tanpa salinan lokal`, () => {
    const source = read(rel);
    assert.match(source, /import \{[^}]*\bhasInAppHistory\b[^}]*\} from '[^']*lib\/appHistory'/);
    assert.doesNotMatch(source, /function hasInAppHistory\(/);
  });
}

/**
 * Handler tombol Kembali: potongan dari pemanggilan hasInAppHistory() sampai
 * title="Kembali" milik tombol yang sama.
 */
function backHandler(source, rel) {
  const start = source.indexOf('if (hasInAppHistory())');
  assert.notEqual(start, -1, `${rel}: tombol Kembali tidak memakai hasInAppHistory()`);
  const end = source.indexOf('title="Kembali"', start);
  assert.notEqual(end, -1, `${rel}: title="Kembali" tidak ditemukan setelah handler`);
  return source.slice(start, end);
}

for (const rel of ['src/App.tsx', 'src/components/KalkulasiPage.tsx', 'src/components/ComparePage.tsx']) {
  test(`${rel}: Kembali mundur lewat riwayat, fallback MENGGANTI entri (bukan href)`, () => {
    const handler = backHandler(read(rel), rel);
    assert.match(handler, /if \(hasInAppHistory\(\)\) \{\s*window\.history\.back\(\);\s*return;\s*\}/);
    assert.match(handler, /window\.location\.replace\(/);
    assert.doesNotMatch(handler, /window\.location\.href\s*=/, 'href menumpuk entri → back memantul');
  });
}

test('Kalkulasi & Banding: induk fallback dihitung dari jumlah segmen (domain kustom → /)', () => {
  // /:agent/kalkulasi → /:agent; /kalkulasi (domain kustom) & /compare → "/".
  // Dulu `/${segments[0]}` membuat /kalkulasi kembali ke /kalkulasi sendiri.
  for (const rel of ['src/components/KalkulasiPage.tsx', 'src/components/ComparePage.tsx']) {
    const handler = backHandler(read(rel), rel);
    assert.match(handler, /const parent = segments\.length >= 2 \? `\/\$\{segments\[0\]\}` : '\/';/, rel);
  }
});

test('Status penerbangan: tombol Kembali hanya dirender kalau dibuka dari dalam app', () => {
  const page = read('src/components/FlightSharePage.tsx');
  assert.match(page, /const \[canGoBack\] = useState\(hasInAppHistory\);/);
  assert.match(page, /\{canGoBack && \(\s*<button[\s\S]*?onClick=\{\(\) => window\.history\.back\(\)\}/);
});

test('sheet Filter & overlay layar penuh ditutup oleh back, bukan meninggalkan halaman', () => {
  assert.match(read('src/components/FilterModal.tsx'), /useBackToClose\(isOpen, onClose\);/);
  assert.match(read('src/App.tsx'), /useBackToClose\(compactDetailId !== null, closeCompactDetail\);/);
  assert.match(read('src/components/ComparePage.tsx'), /useBackToClose\(showModal, closeModal\);/);
});

test('App menulis ulang URL filter saat popstate — lewat penulis yang sama', () => {
  // Menutup sheet Filter (back atau tombol) mendaratkan riwayat di entri SEBELUM
  // sheet dibuka, yang URL-nya masih filter lama kalau filter diubah di dalam sheet.
  const app = read('src/App.tsx');
  const effect = app.match(/const onPopState = \(\) => \{[\s\S]*?\n {4}\};/)?.[0] ?? '';
  assert.notEqual(effect, '', 'listener popstate App tidak ditemukan');
  assert.match(effect, /writeFilterUrl\(filterUrlRef\.current\)/);
  assert.match(app, /window\.addEventListener\('popstate', onPopState\)/);
});

test('bfcache: halaman jadwal yang dipulihkan melepas tirai transisi', () => {
  // PackageCard memasang body.navigating sebelum pindah ke Kalkulasi/Banding. Kembali
  // lewat history.back() memulihkan DOM apa adanya — tirai buram menutupi halaman.
  const app = read('src/App.tsx');
  const handler = app.match(/const onPageShow = \(event: PageTransitionEvent\) => \{[\s\S]*?\n {4}\};/)?.[0] ?? '';
  assert.notEqual(handler, '', 'listener pageshow tidak ditemukan');
  assert.match(handler, /if \(!event\.persisted\) return;/);
  assert.match(handler, /document\.body\.classList\.remove\('navigating'\)/);
  assert.match(app, /window\.addEventListener\('pageshow', onPageShow\)/);
});

test('galat muat tidak pernah dirender mentah', () => {
  // "HTTP error! status: 503" / "signal is aborted without reason" → describeLoadError.
  const app = read('src/App.tsx');
  assert.doesNotMatch(app, /\{error\}/);
  assert.match(app, /describeLoadError\(error\)/);
  for (const rel of ['src/components/KalkulasiPage.tsx', 'src/components/ComparePage.tsx']) {
    const src = read(rel);
    assert.doesNotMatch(src, /\{packagesError\}/, rel);
    assert.match(src, /describeLoadError\(packagesError\)/, rel);
  }
  const flight = read('src/components/FlightSharePage.tsx');
  assert.doesNotMatch(flight, /\{loadError\}/);
  assert.match(flight, /describeLoadError\(loadError\)/);
});

test('status penerbangan: gagal jaringan/server bukan "link tidak ditemukan"', () => {
  const page = read('src/components/FlightSharePage.tsx');
  // Hanya 404 yang berarti link tak ada.
  assert.match(page, /if \(!response\.ok && response\.status !== 404\) \{\s*throw /);
  const catchBlock = page.match(/\} catch \(error\) \{[\s\S]*?\} finally \{/)?.[0] ?? '';
  assert.notEqual(catchBlock, '', 'catch muat penerbangan tidak ditemukan');
  assert.doesNotMatch(catchBlock, /setNotFound\(true\)/);
  assert.match(catchBlock, /setLoadError\(error\)/);
});

/**
 * Chrome app terpasang di iOS digambar di bawah status bar & di atas home
 * indicator (iOS 26, apa pun meta tag-nya). Setiap kelas yang memaku chrome ke
 * tepi atas/bawah viewport wajib membawa inset-nya.
 */
test('chrome fixed/sticky di halaman publik membawa safe-area inset', () => {
  const files = [
    'src/App.tsx',
    'src/components/FilterHeader.tsx',
    'src/components/KalkulasiPage.tsx',
    'src/components/ComparePage.tsx',
    'src/components/FloatingAgentBar.tsx',
    'src/components/FilterModal.tsx',
    'src/components/FlightSharePage.tsx',
  ];
  let topChrome = 0;
  let bottomChrome = 0;
  for (const rel of files) {
    // Satu literal className (string atau template) per temuan.
    const classLiterals = [...read(rel).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]);
    for (const cls of classLiterals) {
      if (/\b(?:fixed|sticky)\b/.test(cls) && /(?:^|\s)top-0(?:\s|$)/.test(cls)) {
        topChrome += 1;
        assert.match(cls, /safe-area-inset-top/, `${rel}: chrome atas tanpa inset → ${cls.replace(/\s+/g, ' ').trim()}`);
      }
      // Melayang di atas tepi bawah (bottom-6 dsb.). bottom-0 = sheet/footer yang
      // menempel; inset-nya ada di padding dalamnya (dicek terpisah di bawah).
      if (/\bfixed\b/.test(cls) && /(?:^|\s)bottom-(?!0(?:\s|$))/.test(cls)) {
        bottomChrome += 1;
        assert.match(cls, /safe-area-inset-bottom/, `${rel}: chrome bawah tanpa inset → ${cls.replace(/\s+/g, ' ').trim()}`);
      }
    }
  }
  assert.ok(topChrome >= 4, `hanya ${topChrome} chrome atas yang terperiksa — regex tes basi?`);
  assert.ok(bottomChrome >= 2, `hanya ${bottomChrome} chrome bawah yang terperiksa — regex tes basi?`);

  // Sheet & overlay yang menempel ke tepi: inset di padding isinya.
  assert.match(read('src/components/FilterModal.tsx'), /Footer Actions[\s\S]*?className="[^"]*safe-area-inset-bottom[^"]*"/);
  assert.match(read('src/components/ComparePage.tsx'), /Modal Footer[\s\S]*?className="[^"]*safe-area-inset-bottom[^"]*"/);
  assert.match(read('src/components/ComparePage.tsx'), /Kepala Modal[\s\S]*?className="[^"]*safe-area-inset-top[^"]*"/);
  assert.match(read('src/App.tsx'), /Floating Close Button[\s\S]*?className="[^"]*safe-area-inset-bottom[^"]*"/);
});
