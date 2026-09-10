import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as kloter45Data from '../src/lib/kloter45Landing.js';

const {
  KLOTER45_CHECKLIST_ITEMS,
  KLOTER45_CONTACTS,
  KLOTER45_JAMAAH,
  KLOTER45_PUBLIC_PATH,
  KLOTER45_SLUG,
  KLOTER45_TRIP,
  filterKloter45Groups,
  getKloter45Groups,
} = kloter45Data;

const rootPath = new URL('..', import.meta.url).pathname;
const COMPONENT_PATH = 'src/components/Kloter45LandingPage.tsx';
const DB_HELPER_PATH = 'src/lib/kloter45PrepDb.ts';

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('Kloter 45 landing data uses the agreed slug and carries all 45 jamaah', () => {
  assert.equal(KLOTER45_SLUG, '26sep2026');
  assert.equal(KLOTER45_PUBLIC_PATH, '/26SEP2026');
  // Slug internal harus huruf kecil: RESERVED_SPA_SLUGS selalu dibandingkan
  // dengan segmen yang sudah di-lowercase.
  assert.equal(KLOTER45_SLUG, KLOTER45_SLUG.toLowerCase());
  assert.equal(KLOTER45_PUBLIC_PATH.toLowerCase(), `/${KLOTER45_SLUG}`);

  assert.equal(KLOTER45_JAMAAH.length, 45);
  assert.equal(KLOTER45_TRIP.totalJamaah, KLOTER45_JAMAAH.length);
  assert.equal(KLOTER45_JAMAAH[0].name, 'ARMIA FARANA');
  assert.equal(KLOTER45_JAMAAH[44].name, 'SARIBUNAN SIMBOLON');
  assert.deepEqual(
    KLOTER45_JAMAAH.map((member) => member.no),
    Array.from({ length: 45 }, (_, index) => index + 1)
  );
});

test('Kloter 45 landing trip copy matches the JBU1569 manifest', () => {
  assert.equal(KLOTER45_TRIP.kloterLabel, 'Kloter 45');
  assert.equal(KLOTER45_TRIP.tripCode, 'JBU1569');
  assert.equal(KLOTER45_TRIP.packageName, 'Paket Umroh Plus Dubai');
  assert.equal(KLOTER45_TRIP.packageVariant, 'Hemat 10 Hari');
  assert.equal(KLOTER45_TRIP.departureDate, '26 September 2026');
  assert.equal(KLOTER45_TRIP.returnDate, '5 Oktober 2026');
  assert.equal(KLOTER45_TRIP.travelDateRange, '26 SEPTEMBER - 5 OKTOBER 2026');
  assert.equal(KLOTER45_TRIP.airline, 'Emirates');
  assert.equal(KLOTER45_TRIP.tourLeader, 'Bagas Pramudita');

  const component = read(COMPONENT_PATH);
  assert.match(component, /const packageTitle = `\$\{packageNameWithoutPrefix\} \(\$\{KLOTER45_TRIP\.packageVariant\}\)`\.toUpperCase\(\);/);
  assert.match(component, /KLOTER45_TRIP\.travelDateRange/);
  assert.match(component, /by \{KLOTER45_TRIP\.airline\}/);
  assert.match(component, /\{KLOTER45_TRIP\.kloterLabel\}/);
});

test('Kloter 45 landing groups jamaah by ID Umrah and sorts each family oldest first', () => {
  const groups = getKloter45Groups();

  assert.equal(groups.length, 20);
  assert.equal(groups[0].idUmrah, 'AIW0029251');
  assert.equal(groups[0].displayName, 'Keluarga 1');
  assert.deepEqual(groups[0].members.map((member) => member.age), [66, 50]);

  const biggestFamily = groups.find((group) => group.idUmrah === 'AIW0030311');
  assert.ok(biggestFamily);
  assert.equal(biggestFamily.members.length, 9);
  const ages = biggestFamily.members.map((member) => member.age);
  assert.deepEqual(ages, [...ages].sort((left, right) => right - left));

  // Setiap jamaah muncul tepat sekali di seluruh grup.
  const grouped = groups.flatMap((group) => group.members.map((member) => member.no));
  assert.deepEqual([...grouped].sort((a, b) => a - b), KLOTER45_JAMAAH.map((member) => member.no));
});

test('Kloter 45 landing exposes full phone numbers plus a consistent masked form', () => {
  assert.equal(KLOTER45_JAMAAH[0].phone, '081310430877');
  assert.equal(KLOTER45_JAMAAH[31].name, 'BAGAS PRAMUDITA');
  assert.equal(KLOTER45_JAMAAH[31].phone, '087878573311');

  for (const jamaah of KLOTER45_JAMAAH) {
    assert.match(jamaah.phone, /^\d{9,15}$/, `${jamaah.name} punya nomor tak wajar`);
    assert.doesNotMatch(jamaah.phone, /\*/);
    assert.equal(
      jamaah.phoneMasked,
      `${jamaah.phone.slice(0, 4)}****${jamaah.phone.slice(-4)}`,
      `${jamaah.name} punya masking yang tidak konsisten`
    );
    assert.match(jamaah.idUmrah, /^AIW\d{7}$/);
    assert.ok(jamaah.gender === 'L' || jamaah.gender === 'P');
    assert.ok(Number.isInteger(jamaah.age) && jamaah.age > 0 && jamaah.age < 120);
  }
});

test('Kloter 45 landing checklist covers WA and Nusuk only', () => {
  assert.deepEqual(
    KLOTER45_CHECKLIST_ITEMS.map((item) => item.id),
    ['wa', 'nusuk']
  );
  assert.deepEqual(
    KLOTER45_CHECKLIST_ITEMS.map((item) => item.label),
    ['Nomor WhatsApp', 'Nusuk']
  );
  assert.equal(kloter45Data.KLOTER45_ROOM_FIELDS, undefined);
});

test('Kloter 45 landing ships a tour leader contact only', () => {
  assert.deepEqual(KLOTER45_CONTACTS.map((contact) => contact.role), ['Tour Leader']);
  assert.deepEqual(KLOTER45_CONTACTS.map((contact) => contact.name), ['Bagas Pramudita']);
  assert.deepEqual(KLOTER45_CONTACTS.map((contact) => contact.whatsappDisplay), ['087878573311']);
  assert.deepEqual(KLOTER45_CONTACTS.map((contact) => contact.whatsappUrl), ['https://wa.me/6287878573311']);

  for (const contact of KLOTER45_CONTACTS) {
    assert.match(contact.whatsappUrl, /^https:\/\/wa\.me\/\d+$/);
    assert.match(contact.photoUrl, /^https:\/\/alhijaz\.b-cdn\.net\//);
    assert.match(contact.photoClassName, /from-/);
  }
});

test('Kloter 45 landing has route-specific share metadata', () => {
  const server = read('server.js');

  assert.match(server, /const KLOTER45_META_TITLE = 'KLOTER 45 \| 26 SEP - 5 OKT 2026 \| ALHIJAZ INDOWISATA';/);
  assert.match(server, /const KLOTER45_META_DESCRIPTION = 'Daftar jamaah dan checklist persiapan Kloter 45 Umroh Plus Dubai, 26 September - 5 Oktober 2026 bersama Emirates dan Tour Leader Bagas Pramudita\.';/);
  assert.match(server, /const KLOTER45_OG_IMAGE_URL = 'https:\/\/alhijaz\.b-cdn\.net\/og-kloter45-26sep2026\.jpg';/);
  assert.match(server, /const KLOTER45_PUBLIC_SLUG = '26sep2026';/);
  assert.match(server, /const KLOTER45_PUBLIC_PATH = '\/26SEP2026';/);
  assert.match(server, /RESERVED_SPA_SLUGS = new Set\(\[[^\]]*'26sep2026'/);
  assert.match(server, /function injectKloter45Meta\(html, origin\)/);
  assert.match(server, /const pageUrl = escapeHtmlAttr\(`\$\{origin\}\$\{KLOTER45_PUBLIC_PATH\}`\);/);
  assert.match(server, /<meta property="og:image" content="\$\{ogImageUrl\}" \/>/);
  assert.match(server, /<meta property="og:image:height" content="675" \/>/);
  assert.match(server, /<meta property="og:image:type" content="image\/jpeg" \/>/);
  assert.match(server, /<meta name="twitter:image" content="\$\{ogImageUrl\}" \/>/);
  assert.match(server, /app\.get\(\['\/26SEP2026', '\/26SEP2026\/', '\/26sep2026', '\/26sep2026\/'\]/);

  // Tidak boleh ada sisa halaman kloter sebelumnya.
  assert.doesNotMatch(server, /RAHMAH_JULI/);
  assert.doesNotMatch(server, /rahmah-1-juli-2026/);
});

test('Kloter 45 landing renders the preparation checklist for every jamaah', () => {
  assert.equal(existsSync(join(rootPath, COMPONENT_PATH)), true);
  const component = read(COMPONENT_PATH);

  assert.match(component, /document\.title = 'KLOTER 45 \| 26 SEP - 5 OKT 2026 \| ALHIJAZ INDOWISATA';/);
  assert.match(component, /getKloter45Groups/);
  assert.match(component, /KLOTER45_CHECKLIST_ITEMS\.map\(\(item\) => \{/);
  assert.match(component, /Checklist Persiapan/);
  assert.match(component, /data-checklist-id=\{item\.id\}/);
  assert.match(component, /data-jamaah-no=\{member\.no\}/);
  assert.match(component, /onClick=\{\(\) => onToggleChecklist\(member\.no, item\.id\)\}/);
  assert.match(component, /aria-pressed=\{checked\}/);
  assert.match(component, /\{memberReady \? 'Siap' : 'Belum lengkap'\}/);

  // Ketiga pertanyaan checklist harus ikut tampil, bukan cuma labelnya.
  assert.match(component, /wa: 'Nomor WhatsApp sudah sesuai apa belum\?'/);
  assert.match(component, /nusuk: 'Nusuk sudah install apa belum\?'/);
  assert.match(component, /\{CHECKLIST_QUESTIONS\[item\.id\]\}/);

  // Toggle harus benar-benar membalik nilai tersimpan, bukan selalu true.
  assert.match(
    component,
    /handlePrepChange\(jamaahNo, \{ \[itemId\]: !prepRef\.current\[jamaahNo\]\?\.\[itemId\] \}\)/
  );
  // "Siap" ditentukan checklist saja setelah nomor kamar dibuang.
  assert.match(
    component,
    /KLOTER45_CHECKLIST_ITEMS\.every\(\(item\) => isChecked\(prep, member\.no, item\.id\)\);/
  );
});

test('Kloter 45 landing gives every jamaah a direct WhatsApp action', () => {
  const component = read(COMPONENT_PATH);

  assert.match(component, /function normalizeJamaahWhatsAppNumber/);
  assert.match(component, /function getJamaahWhatsAppUrl/);
  assert.match(component, /digits\.startsWith\('0'\) \? `62\$\{digits\.slice\(1\)\}` : digits/);
  assert.match(component, /const memberWhatsAppUrl = getJamaahWhatsAppUrl\(phone\)/);
  assert.match(component, /data-member-whatsapp=\{member\.no\}/);
  assert.match(component, /<span>WhatsApp<\/span>/);
  assert.match(component, /aria-label=\{`Chat WhatsApp \$\{member\.name\}`\}/);
});

test('Kloter 45 landing drops the Zam-zam form, the Raudhah check, and the Offline status', () => {
  const component = read(COMPONENT_PATH);
  const dbHelper = read(DB_HELPER_PATH);
  const server = read('server.js');

  for (const source of [component, dbHelper]) {
    assert.doesNotMatch(source, /zam-?zam/i);
  }
  for (const source of [component, dbHelper, server]) {
    assert.doesNotMatch(source, /raudhah/i);
  }
  // server.js masih menyebut hotel "PULLMAN ZAMZAM" di prompt AI, jadi yang
  // dijaga di sini kolom prep-nya, bukan katanya.
  for (const field of [
    'zamzam_method',
    'zamzam_recipient_name',
    'zamzam_recipient_phone',
    'zamzam_address',
  ]) {
    assert.doesNotMatch(server, new RegExp(field));
  }
  assert.doesNotMatch(server, /Air Zam-zam/i);
  assert.doesNotMatch(server, /sanitizeTourLeaderPrepText/);

  // Status simpan tinggal Menyimpan/Tersimpan; kegagalan balik ke idle diam-diam.
  assert.match(component, /type SaveStatus = 'idle' \| 'saving' \| 'saved';/);
  assert.doesNotMatch(component, /offline/i);
  assert.match(component, /\{saveStatus === 'saving' \? 'Menyimpan' : 'Tersimpan'\}/);

  // Filter Raudhah ikut hilang, sisa Semua + Belum Nusuk.
  assert.match(component, /type FilterMode = 'all' \| 'nusuk';/);
});

test('Kloter 45 landing drops the room-number controls end to end', () => {
  const component = read(COMPONENT_PATH);
  const dbHelper = read(DB_HELPER_PATH);
  const server = read('server.js');

  for (const source of [component, dbHelper, server]) {
    assert.doesNotMatch(source, /room_mekkah/);
    assert.doesNotMatch(source, /room_madinah/);
  }
  assert.doesNotMatch(component, /function RoomValueEditor/);
  assert.doesNotMatch(component, /ROOM_FIELDS/);
  assert.doesNotMatch(component, /data-room-field/);
  assert.doesNotMatch(component, /data-room-edit/);
  assert.doesNotMatch(component, /data-room-ok/);
  assert.doesNotMatch(component, /editingRoom/);
  assert.doesNotMatch(component, /roomDraft/);
  assert.doesNotMatch(component, /Kamar (?:Mekkah|Madinah)/);
  assert.doesNotMatch(server, /sanitizeTourLeaderPrepRoomNumber/);
});

test('Kloter 45 landing persists prep changes to Supabase with a local fallback', () => {
  const component = read(COMPONENT_PATH);
  assert.equal(existsSync(join(rootPath, DB_HELPER_PATH)), true);

  const dbHelper = read(DB_HELPER_PATH);
  const server = read('server.js');
  const viteConfig = read('vite.config.ts');

  assert.match(component, /fetchKloter45PrepFromDb/);
  assert.match(component, /saveKloter45PrepToDb/);
  assert.match(component, /return persistPrepPatch\(jamaahNo, patch\)/);
  assert.match(component, /localStorage/);
  assert.match(dbHelper, /KLOTER45_PREP_TABLE = 'booking_persiapan'/);
  assert.match(dbHelper, /KLOTER45_PREP_API = `\/api\/tour-leader-prep\/\$\{KLOTER45_SLUG\}`/);
  assert.match(dbHelper, /fetch\(KLOTER45_PREP_API/);
  assert.match(dbHelper, /method: 'PUT'/);
  for (const column of ['wa_confirmed', 'nusuk_installed']) {
    assert.match(dbHelper, new RegExp(column));
    assert.match(server, new RegExp(column));
  }
  assert.match(server, /app\.get\('\/api\/tour-leader-prep\/:tripSlug'/);
  assert.match(server, /app\.put\('\/api\/tour-leader-prep\/:tripSlug\/:jamaahNo'/);
  assert.match(server, /supabase\.from\('booking_persiapan'\)\.upsert/);
  assert.match(server, /onConflict: 'id_umroh'/);
  assert.match(viteConfig, /'\/api\/tour-leader-prep'/);

  // Slug rute API dibandingkan tanpa peduli besar-kecil huruf, sama seperti
  // rute halamannya.
  assert.match(server, /String\(tripSlug \|\| ''\)\.toLowerCase\(\) !== KLOTER45_PUBLIC_SLUG/);
});

test('Kloter 45 landing refuses to write before the server state is known', () => {
  const component = read(COMPONENT_PATH);

  // PUT menimpa seluruh entry jamaah, jadi menyimpan sebelum state server
  // terbaca akan menghapus centang yang sudah ada di database.
  assert.match(component, /prepLoadStateRef\.current = 'ready'/);
  assert.match(component, /prepLoadStateRef\.current = 'failed'/);
  assert.match(
    component,
    /if \(prepLoadStateRef\.current !== 'ready'\) \{[\s\S]{0,400}?const state = await loadPrepFromDb\(\);\s*if \(state !== 'ready'\) \{\s*setSaveStatus\('idle'\);\s*return false;\s*\}/
  );

  // Setelah coba-ulang berhasil, state server ditumpangkan lebih dulu, jadi
  // perubahan harus dipasang ulang dan yang ditulis adalah hasil gabungannya.
  assert.match(component, /applyPrepPatchLocally\(jamaahNo, patch\);\s*\}\s*try \{/);
  assert.match(component, /await saveKloter45PrepToDb\(jamaahNo, prepRef\.current\[jamaahNo\]\)/);

  // Satu percobaan muat ulang dipakai bersama, bukan satu per centang.
  assert.match(component, /if \(loadPrepPromiseRef\.current\) return loadPrepPromiseRef\.current;/);
  assert.match(component, /loadPrepPromiseRef\.current = pending;/);
});

test('Kloter 45 landing member rows summarise the checklist as chips', () => {
  const component = read(COMPONENT_PATH);

  assert.match(component, /function getMemberChecklistChips/);
  assert.match(component, /wa: 'WA Sesuai'/);
  assert.match(component, /nusuk: 'Nusuk'/);
  assert.match(component, /data-checklist-chip=\{item\.id\}/);
  // Chip diturunkan dari daftar checklist, jadi ikut berubah kalau itemnya berubah.
  assert.match(component, /return KLOTER45_CHECKLIST_ITEMS\.map\(\(item\) => \(\{/);
  assert.match(component, /\{checklistChips\.map\(\(item\) => \(/);
});

test('Kloter 45 landing keeps the collapsible rows, search, filters, and theme toggle', () => {
  const component = read(COMPONENT_PATH);

  assert.match(component, /data-jamaah-toggle=\{member\.no\}/);
  assert.match(component, /const isExpanded = expandedJamaahNos\.has\(member\.no\)/);
  assert.match(component, /aria-expanded=\{isExpanded\}/);
  assert.match(component, /inert=\{isExpanded \? undefined : ''\}/);
  assert.match(component, /grid-rows-\[1fr\] opacity-100/);
  assert.match(component, /grid-rows-\[0fr\] opacity-0 pointer-events-none/);
  assert.match(component, /event\.stopPropagation\(\);[\s\S]*onStartEditPhone\(member\)/);

  // Ikon pensil diganti tombol berteks "Ubah".
  assert.match(component, /data-phone-edit=\{member\.no\}/);
  assert.match(component, /aria-label=\{`Ubah nomor WhatsApp \$\{member\.name\}`\}/);
  assert.match(component, />\s*Ubah\s*<\/button>/);
  assert.doesNotMatch(component, /Pencil/);

  assert.match(component, /Command Bar \(Search \+ Filters\)/);
  assert.match(component, /placeholder="Cari nama jamaah"/);
  assert.match(component, /role="listbox"/);
  assert.match(component, /aria-haspopup="listbox"/);
  assert.match(component, /\{ id: 'nusuk', label: 'Belum Nusuk' \}/);
  // Satu-satunya aturan pencarian ada di modul data; komponen tidak boleh
  // punya salinannya sendiri yang bisa melenceng.
  assert.match(component, /filterKloter45Groups\(groups, \{ query, prep, filter \}\)/);
  assert.doesNotMatch(component, /normalizedQuery/);

  assert.match(component, /function Kloter45ThemeToggle/);
  assert.match(component, /KLOTER45_THEME_KEY/);
  assert.match(component, /document\.documentElement\.classList\.toggle\('dark', isDark\)/);
  assert.match(component, /<Kloter45ThemeToggle \/>/);
});

test('Kloter 45 landing hides raw ID Umrah behind family labels', () => {
  const component = read(COMPONENT_PATH);

  assert.match(component, /\{group\.displayName\}/);
  assert.doesNotMatch(component, /\{group\.idUmrah\}<\/span>/);
  assert.doesNotMatch(component, /AIW\d{7}/);
});

test('Kloter 45 search keeps the whole family visible, not just the matching person', () => {
  const groups = getKloter45Groups();
  const family = groups.find((group) => group.idUmrah === 'AIW0029767');
  assert.equal(family.members.length, 5, 'fixture berubah — pilih keluarga lain');

  // Satu nama ketemu → lima-limanya tampil.
  const byName = filterKloter45Groups(groups, { query: 'KIANI' });
  assert.equal(byName.length, 1);
  assert.equal(byName[0].idUmrah, 'AIW0029767');
  assert.deepEqual(
    byName[0].members.map((member) => member.no),
    family.members.map((member) => member.no)
  );

  // Nomor telepon dan ID Umrah juga menarik satu keluarga utuh.
  assert.deepEqual(
    filterKloter45Groups(groups, { query: '081310655821' })[0].members.length,
    family.members.length
  );
  assert.deepEqual(
    filterKloter45Groups(groups, { query: 'aiw0029767' })[0].members.length,
    family.members.length
  );

  // Pencarian ikut nomor yang sudah dikoreksi di halaman, bukan cuma nomor asli.
  const editedPrep = { [family.members[0].no]: { phone: '081999000111' } };
  const byEditedPhone = filterKloter45Groups(groups, { query: '081999000111', prep: editedPrep });
  assert.equal(byEditedPhone.length, 1);
  assert.equal(byEditedPhone[0].members.length, family.members.length);

  // Tanpa kata kunci semua tampil; kata kunci asing tidak menyisakan apa pun.
  const all = filterKloter45Groups(groups, { query: '' });
  assert.equal(all.length, groups.length);
  assert.equal(all.flatMap((group) => group.members).length, KLOTER45_JAMAAH.length);
  assert.deepEqual(filterKloter45Groups(groups, { query: 'tidakadaorangini' }), []);
});

test('Kloter 45 Belum Nusuk filter still narrows down to individuals', () => {
  const groups = getKloter45Groups();
  const family = groups.find((group) => group.idUmrah === 'AIW0029767');
  const [first, second] = family.members;
  const prep = {
    [first.no]: { nusuk: true },
    [second.no]: { nusuk: false },
  };

  // Filter checklist memotong per orang, walau pencarian menarik satu keluarga.
  const filtered = filterKloter45Groups(groups, { query: 'KIANI', prep, filter: 'nusuk' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].members.length, family.members.length - 1);
  assert.ok(!filtered[0].members.some((member) => member.no === first.no));

  // Kalau seluruh keluarga sudah Nusuk, kartunya hilang sama sekali.
  const allChecked = Object.fromEntries(family.members.map((member) => [member.no, { nusuk: true }]));
  assert.deepEqual(
    filterKloter45Groups(groups, { query: 'KIANI', prep: allChecked, filter: 'nusuk' }),
    []
  );
});

test('main.tsx routes /26SEP2026 case-insensitively before the package fallback', () => {
  const main = read('src/main.tsx');

  assert.match(main, /Kloter45LandingPage/);
  assert.match(main, /const isKloter45Landing = segments\.length === 1 && segments\[0\]\?\.toLowerCase\(\) === '26sep2026'/);
  assert.match(main, /const knownFirstSegments = \[[^\]]*'26sep2026'\]/);
  assert.match(main, /if \(isKloter45Landing\) return <Kloter45LandingPage \/>/);
  assert.doesNotMatch(main, /RahmahJuli/);
  assert.doesNotMatch(main, /rahmah-1-juli-2026/);
});
