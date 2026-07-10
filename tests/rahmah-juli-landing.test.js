import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as rahmahData from '../src/lib/rahmahJuliLanding.js';

const {
  RAHMAH_JULI_CHECKLIST_ITEMS,
  RAHMAH_JULI_CONTACTS,
  RAHMAH_JULI_JAMAAH,
  RAHMAH_JULI_SLUG,
  RAHMAH_JULI_TRIP,
  getRahmahJuliGroups,
} = rahmahData;
const RAHMAH_JULI_ROOM_FIELDS = rahmahData.RAHMAH_JULI_ROOM_FIELDS;

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('Rahmah July landing data uses agreed slug and includes all 43 jamaah', () => {
  assert.equal(RAHMAH_JULI_SLUG, 'rahmah-1-juli-2026');
  assert.equal(RAHMAH_JULI_JAMAAH.length, 43);
  assert.equal(RAHMAH_JULI_JAMAAH[39].name, 'NANA RESMIANA');
});

test('Rahmah July landing trip copy includes kereta cepat, date range, and airline', () => {
  assert.equal(RAHMAH_JULI_TRIP.packageName, 'Paket Rahmah Reguler');
  assert.equal(RAHMAH_JULI_TRIP.packageVariant, 'Kereta Cepat');
  assert.equal(RAHMAH_JULI_TRIP.travelDateRange, '1 JULI - 9 JULI 2026');
  assert.equal(RAHMAH_JULI_TRIP.airline, 'Saudi Airlines');

  const component = read('src/components/RahmahJuliLandingPage.tsx');
  assert.match(component, /replace\(\s*\/\^Paket\\s\+\/i,\s*''\s*\)/);
  assert.match(component, /const packageTitle = `\$\{packageNameWithoutPrefix\} \(\$\{RAHMAH_JULI_TRIP\.packageVariant\}\)`\.toUpperCase\(\);/);
  assert.match(component, /<p className="text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-slate-100">\s*\{packageTitle\}\s*<\/p>/);
  assert.match(component, /RAHMAH_JULI_TRIP\.travelDateRange/);
  assert.match(component, /by \{RAHMAH_JULI_TRIP\.airline\}/);
  assert.doesNotMatch(component, /Berangkat \{RAHMAH_JULI_TRIP\.departureDate\}/);
  assert.doesNotMatch(component, /\{packageTitle\}[\s\S]*PAKET RAHMAH REGULER/);
});

test('Rahmah July landing groups jamaah by ID Umrah and sorts each family by age descending', () => {
  const groups = getRahmahJuliGroups();

  assert.equal(groups[0].idUmrah, 'AIW0028456');
  assert.equal(groups[0].displayName, 'Keluarga 1');
  assert.deepEqual(groups[0].members.map((member) => member.age), [46, 46, 17, 12]);

  const fourPersonFamily = groups.find((group) => group.idUmrah === 'AIW0029359');
  assert.ok(fourPersonFamily);
  assert.match(fourPersonFamily.displayName, /^Keluarga \d+$/);
  assert.deepEqual(fourPersonFamily.members.map((member) => member.age), [42, 41, 19, 16]);
});

test('Rahmah July landing exposes full jamaah phone numbers for self-correction', () => {
  assert.equal(RAHMAH_JULI_JAMAAH[0].phone, '087771684110');
  assert.equal(RAHMAH_JULI_JAMAAH[38].phone, '087878573311');
  assert.equal(RAHMAH_JULI_JAMAAH[42].phone, '628181874135');

  for (const jamaah of RAHMAH_JULI_JAMAAH) {
    assert.match(jamaah.phone, /^\+?\d{8,15}$/);
    assert.doesNotMatch(jamaah.phone, /\*/);
  }
});

test('Rahmah July landing checklist labels cover WA, Nusuk, Raudhah, and room fields', () => {
  assert.deepEqual(
    RAHMAH_JULI_CHECKLIST_ITEMS.map((item) => item.label),
    ['Nomor WhatsApp', 'Nusuk', 'Raudhah']
  );
  assert.deepEqual(
    RAHMAH_JULI_ROOM_FIELDS.map((item) => item.label),
    ['Kamar Mekkah', 'Kamar Madinah']
  );
});

test('Rahmah July landing includes public contacts for tour leader and muthowif', () => {
  assert.deepEqual(
    RAHMAH_JULI_CONTACTS.map((contact) => contact.role),
    ['Tour Leader', 'Muthowif']
  );
  assert.deepEqual(
    RAHMAH_JULI_CONTACTS.map((contact) => contact.photoUrl),
    [
      'https://alhijaz.b-cdn.net/bagas-p.png',
      'https://alhijaz.b-cdn.net/hanafi-fauzan.png',
    ]
  );
  assert.deepEqual(
    RAHMAH_JULI_CONTACTS.map((contact) => contact.whatsappDisplay),
    ['087878573311', '+966535224621']
  );
  assert.deepEqual(
    RAHMAH_JULI_CONTACTS.map((contact) => contact.whatsappUrl),
    ['https://wa.me/6287878573311', 'https://wa.me/966535224621']
  );

  for (const contact of RAHMAH_JULI_CONTACTS) {
    assert.match(contact.whatsappUrl, /^https:\/\/wa\.me\/\d+$/);
    assert.match(contact.photoClassName, /from-/);
  }
});

test('Rahmah July landing has route-specific share metadata', () => {
  const server = read('server.js');

  assert.match(server, /const RAHMAH_JULI_META_TITLE = 'Kloter 9 \| Rahmah 1-9 Juli 2026 \| Alhijaz Indowisata';/);
  assert.match(server, /const RAHMAH_JULI_META_DESCRIPTION = 'Persiapan jamaah Rahmah Reguler \(Kereta Cepat\) 1 Juli - 9 Juli 2026 bersama Tour Leader Bagas Pramudita & Muthowif Ust. Hanafi Fauzan.';/);
  assert.match(server, /const RAHMAH_JULI_OG_IMAGE_URL = 'https:\/\/alhijaz\.b-cdn\.net\/og-image\.png';/);
  assert.match(server, /RESERVED_SPA_SLUGS = new Set\(\[[^\]]*'rahmah-1-juli-2026'/);
  assert.match(server, /function injectRahmahJuliMeta\(html, origin\)/);
  assert.match(server, /<meta property="og:image" content="\$\{ogImageUrl\}" \/>/);
  assert.match(server, /<meta name="twitter:image" content="\$\{ogImageUrl\}" \/>/);
  assert.match(server, /app\.get\(\['\/rahmah-1-juli-2026', '\/rahmah-1-juli-2026\/'\]/);
});

test('Rahmah July landing component renders grouped cards without the preparation checklist section', () => {
  const componentPath = 'src/components/RahmahJuliLandingPage.tsx';
  assert.equal(existsSync(join(rootPath, componentPath)), true);

  const component = read(componentPath);
  assert.match(component, /document\.title = 'Kloter 9 \| Rahmah 1-9 Juli 2026 \| Alhijaz Indowisata';/);
  assert.match(component, /logoAlhijaz/);
  assert.match(component, /alt="Alhijaz Indowisata"/);
  assert.match(component, /getRahmahJuliGroups/);
  assert.match(component, /RAHMAH_JULI_CHECKLIST_ITEMS/);
  assert.match(component, /DAFTAR JAMAAH/);
  assert.match(component, /data-phone-edit/);
  assert.match(component, /data-phone-done/);
  assert.doesNotMatch(component, /data-checklist-id/);
  assert.doesNotMatch(component, /data-room-field/);
  assert.doesNotMatch(component, /Checklist (?:Persiapan|Perlengkapan)/i);
  assert.match(component, /localStorage/);
  assert.doesNotMatch(component, /Daftar jamaah tampil per keluarga/);
  assert.doesNotMatch(component, /ShieldCheck/);
  assert.doesNotMatch(component, /Urutan grup/);
  assert.doesNotMatch(component, /tertua ke termuda/);
});

test('Rahmah July landing keeps editable phone data without checklist or room controls', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /type JamaahPrepState/);
  assert.match(component, /PREP_STORAGE_KEY/);
  assert.match(component, /loadPrepState/);
  assert.match(component, /const \[prep, setPrep\]/);
  assert.match(component, /editingPhoneNo/);
  assert.match(component, /handlePhoneChange/);
  assert.match(component, /handleStopEditPhone/);
  assert.match(component, /onPhoneChange\(member\.no, event\.target\.value\)/);
  assert.match(component, /getMemberPhone\(prep, member\)/);
  assert.match(component, /typeof savedPhone === 'string' \? savedPhone : member\.phone/);
  assert.match(component, /placeholder="Nomor WA"/);
  assert.match(component, /Selesai/);
  assert.doesNotMatch(component, /Nomor WhatsApp sudah sesuai apa belum\?/);
  assert.doesNotMatch(component, /Nusuk sudah install apa belum\?/);
  assert.doesNotMatch(component, /Raudhah sudah reserved jadwal apa belum\?/);
  assert.doesNotMatch(component, /Nomor Kamar (?:Mekkah|Madinah) berapa\?/);
  assert.match(component, /isMemberReady\(prep, member\)/);
  assert.doesNotMatch(component, /data-phone-save/);
  assert.doesNotMatch(component, /handleSavePhone/);
  assert.doesNotMatch(component, /phoneDraft/);
  assert.doesNotMatch(component, /member\.phoneMasked/);
});

test('Rahmah July landing persists jamaah prep changes to Supabase with a local fallback', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');
  const dbHelperPath = 'src/lib/rahmahJuliPrepDb.ts';
  assert.equal(existsSync(join(rootPath, dbHelperPath)), true);

  const dbHelper = read(dbHelperPath);
  const server = read('server.js');
  const viteConfig = read('vite.config.ts');
  assert.match(component, /fetchRahmahJuliPrepFromDb/);
  assert.match(component, /saveRahmahJuliPrepToDb/);
  assert.match(component, /setSaveStatus/);
  assert.match(component, /return persistPrepPatch\(jamaahNo, nextItem\)/);
  assert.doesNotMatch(component, /handleRoomDraftChange/);
  assert.doesNotMatch(component, /editingRoom/);
  assert.match(component, /setPrep\(\(prev\) => \(\{\s*\.\.\.prev,\s*\.\.\.dbPrep,/);
  assert.match(dbHelper, /RAHMAH_JULI_PREP_TABLE = 'booking_persiapan'/);
  assert.match(dbHelper, /RAHMAH_JULI_PREP_API = `\/api\/tour-leader-prep\/\$\{RAHMAH_JULI_SLUG\}`/);
  assert.match(dbHelper, /fetch\(RAHMAH_JULI_PREP_API/);
  assert.match(dbHelper, /method: 'PUT'/);
  assert.match(dbHelper, /function sanitizeRahmahJuliRoomNumber/);
  assert.match(server, /app\.get\('\/api\/tour-leader-prep\/:tripSlug'/);
  assert.match(server, /app\.put\('\/api\/tour-leader-prep\/:tripSlug\/:jamaahNo'/);
  assert.match(server, /RAHMAH_JULI_MEMBER_BY_NO/);
  assert.match(server, /RAHMAH_JULI_ID_UMRAH/);
  assert.match(server, /validateTourLeaderPrepPayload/);
  assert.match(server, /function sanitizeTourLeaderPrepRoomNumber/);
  assert.match(server, /supabase\.from\('booking_persiapan'\)\.upsert/);
  assert.match(server, /onConflict: 'id_umroh'/);
  assert.match(viteConfig, /'\/api\/tour-leader-prep'/);
  assert.match(dbHelper, /wa_confirmed/);
  assert.match(dbHelper, /nusuk_installed/);
  assert.match(dbHelper, /raudhah_reserved/);
  assert.match(dbHelper, /room_mekkah/);
  assert.match(dbHelper, /room_madinah/);
});

test('Rahmah July landing stores each jamaah Zam-zam pickup or delivery choice', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');
  const dbHelper = read('src/lib/rahmahJuliPrepDb.ts');
  const server = read('server.js');

  assert.match(component, /function ZamzamPickupEditor/);
  assert.match(component, /type ZamzamMethod = 'pickup' \| 'delivery'/);
  assert.match(component, /data-zamzam-method="pickup"/);
  assert.match(component, /data-zamzam-method="delivery"/);
  assert.match(component, />Ambil Sendiri</);
  assert.match(component, />Diantar ke Rumah</);
  assert.match(component, /zamzamMethod === 'delivery' &&/);
  assert.match(component, /data-zamzam-field="recipient-name"/);
  assert.match(component, /data-zamzam-field="recipient-phone"/);
  assert.match(component, /data-zamzam-field="address"/);
  assert.match(component, /Nama penerima/);
  assert.match(component, /Nomor HP penerima/);
  assert.match(component, /Alamat lengkap/);
  assert.match(component, /data-zamzam-save=\{member\.no\}/);
  assert.match(component, /Simpan Pilihan/);
  assert.match(component, /handleSaveZamzam/);
  assert.match(component, /const \[isSaving, setIsSaving\]/);
  assert.match(component, /const savedOnline = await onSave/);
  assert.match(component, /Loader2 size=\{16\} strokeWidth=\{2\.5\} className="animate-spin"/);
  assert.match(component, /Menyimpan Pilihan\.\.\./);
  assert.match(component, /disabled=\{!canSave \|\| isSaving\}/);
  assert.match(component, /rounded-xl bg-emerald-500 px-3 py-3 text-sm font-bold/);
  assert.doesNotMatch(component, /cyan-/);

  for (const field of [
    'zamzam_method',
    'zamzam_recipient_name',
    'zamzam_recipient_phone',
    'zamzam_address',
  ]) {
    assert.match(dbHelper, new RegExp(field));
    assert.match(server, new RegExp(field));
  }
  assert.match(server, /Data penerima dan alamat pengantaran wajib dilengkapi/);
});

test('Rahmah July landing removes the jamaah WhatsApp action and preparation checklist section', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.doesNotMatch(component, /data-member-whatsapp/);
  assert.doesNotMatch(component, /memberWhatsAppUrl/);
  assert.doesNotMatch(component, /function getJamaahWhatsAppUrl/);
  assert.doesNotMatch(component, /data-checklist-disabled/);
  assert.doesNotMatch(component, /Checklist (?:Persiapan|Perlengkapan)/i);
  assert.doesNotMatch(component, /function RoomValueEditor/);
});

test('Rahmah July landing member card header removes gender text and keeps phone beside age', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /const phone = getMemberPhone\(prep, member\)/);
  assert.match(component, /<p className="truncate text-sm font-bold text-gray-800 dark:text-slate-100">\{member\.name\}<\/p>/);
  assert.doesNotMatch(component, /data-member-whatsapp=\{member\.no\}/);
  assert.doesNotMatch(component, /<span>WhatsApp<\/span>/);
  assert.doesNotMatch(component, /<a[\s\S]{0,320}className="block truncate text-sm font-bold text-gray-800/);
  assert.match(component, /<span>\{member\.age\} tahun<\/span>[\s\S]*<WhatsAppIcon size=\{12\}/);
  assert.match(component, /data-phone-edit=\{member\.no\}/);
  assert.match(component, /aria-label=\{`Edit nomor WhatsApp \$\{member\.name\}`\}/);
  assert.doesNotMatch(component, />\s*Edit\s*<\/button>/);
  assert.doesNotMatch(component, /const genderText/);
  assert.doesNotMatch(component, />\{member\.gender\}<\/span>/);
});

test('Rahmah July landing member cards are collapsed by default with chevron controls', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /ChevronDown/);
  assert.match(component, /ChevronUp/);
  assert.match(component, /expandedJamaahNos/);
  assert.match(component, /const isExpanded = expandedJamaahNos\.has\(member\.no\)/);
  assert.match(component, /role="button"/);
  assert.match(component, /tabIndex=\{0\}/);
  assert.match(component, /data-jamaah-toggle=\{member\.no\}/);
  assert.match(component, /onClick=\{\(\) => onToggleExpanded\(member\.no\)\}/);
  assert.match(component, /onKeyDown=\{handleHeaderKeyDown\}/);
  assert.match(component, /event\.stopPropagation\(\);[\s\S]*onStartEditPhone\(member\)/);
  assert.match(component, /aria-expanded=\{isExpanded\}/);
  assert.match(component, /aria-hidden=\{!isExpanded\}/);
  assert.match(component, /inert=\{isExpanded \? undefined : ''\}/);
  assert.match(component, /transition-\[grid-template-rows,opacity,margin\] duration-300 ease-out/);
  assert.match(component, /grid-rows-\[1fr\] opacity-100/);
  assert.match(component, /grid-rows-\[0fr\] opacity-0 pointer-events-none/);
  assert.match(component, /className="flex h-8 w-8 flex-none items-center justify-center text-gray-400 transition-transform duration-200 dark:text-slate-400"/);
  assert.doesNotMatch(component, /data-jamaah-toggle=\{member\.no\}[\s\S]{0,260}bg-gray-50/);
});

test('Rahmah July landing member cards always show the current Zam-zam status chip', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /function getMemberSummaryItems/);
  assert.doesNotMatch(component, /label: 'WA Sesuai'/);
  assert.doesNotMatch(component, /label: 'Nusuk'/);
  assert.doesNotMatch(component, /label: 'Raudhah'/);
  assert.match(component, /zamzamMethod === 'delivery'/);
  assert.match(component, /\? 'Diantar ke Rumah'/);
  assert.match(component, /\? 'Ambil Sendiri'/);
  assert.match(component, /: 'Belum Pilih'/);
  assert.match(component, /method: zamzamMethod \|\| 'unselected'/);
  assert.match(component, /summaryItems\.map/);
  assert.match(component, /data-zamzam-status=\{item\.method\}/);
  assert.match(component, /item\.method === 'unselected'/);
  assert.match(component, /border-amber-200 bg-amber-50 text-amber-700/);
  assert.match(component, /border-emerald-200 bg-emerald-50 text-emerald-700/);
  assert.doesNotMatch(component, /label: roomMekkah \? `Mekkah \$\{roomMekkah\}` : 'Mekkah'/);
  assert.doesNotMatch(component, /label: roomMadinah \? `Madinah \$\{roomMadinah\}` : 'Madinah'/);
});

test('Rahmah July landing does not render the removed checklist and room editor controls', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.doesNotMatch(component, /function RoomValueEditor/);
  assert.doesNotMatch(component, /editingRoom/);
  assert.doesNotMatch(component, /roomDraft/);
  assert.doesNotMatch(component, /data-room-edit/);
  assert.doesNotMatch(component, /data-room-ok/);
  assert.doesNotMatch(component, /ROOM_NUMBER_REGEX/);
  assert.doesNotMatch(component, /data-checklist-id/);
});

test('Rahmah July landing uses an animated filter dropdown beside the search input', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /Command Bar \(Search \+ Filters\)/);
  assert.match(component, /SlidersHorizontal/);
  assert.doesNotMatch(component, /aria-label=\{`Filter jamaah: \$\{activeFilterLabel\}`\}[\s\S]{0,700}<ChevronDown/);
  assert.match(component, /isFilterOpen/);
  assert.match(component, /filterPanelRef/);
  assert.match(component, /setAttribute\('inert', ''\)/);
  assert.match(component, /aria-expanded=\{isFilterOpen\}/);
  assert.match(component, /aria-haspopup="listbox"/);
  assert.match(component, /role="listbox"/);
  assert.match(component, /aria-hidden=\{!isFilterOpen\}/);
  assert.match(component, /origin-top/);
  assert.match(component, /scale-100 translate-y-0/);
  assert.match(component, /scale-95 -translate-y-1 pointer-events-none/);
  assert.match(component, /transition duration-150 ease-out/);
  assert.match(component, /rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden/);
  assert.match(component, /placeholder="Cari nama jamaah"/);
  assert.doesNotMatch(component, /grid grid-cols-3 gap-2/);
  assert.doesNotMatch(component, /Cari nama atau ID Umrah/);
});

test('Rahmah July landing command bar search follows design-system input tokens', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /bg-white dark:bg-slate-800 p-3 shadow-sm/);
  assert.match(component, /flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-gray-50 px-3 transition-all focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500\/50 dark:bg-slate-900/);
  assert.match(component, /text-gray-800 dark:text-white/);
  assert.match(component, /placeholder:text-gray-400 dark:placeholder:text-slate-500/);
  assert.match(component, /focus-within:ring-emerald-500\/50/);
});

test('Rahmah July landing header has jamaah count beside a light and dark mode toggle', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /Moon/);
  assert.match(component, /Sun/);
  assert.match(component, /RAHMAH_THEME_KEY/);
  assert.match(component, /function RahmahThemeToggle/);
  assert.match(component, /document\.documentElement\.classList\.toggle\('dark', isDark\)/);
  assert.match(component, /<RahmahThemeToggle \/>/);
  assert.match(component, /bg-gray-100\/80 dark:bg-slate-800\/80/);
  assert.match(component, /aria-label=\{isDark \? 'Mode terang' : 'Mode gelap'\}/);
  assert.match(component, /dark:from-slate-950 dark:to-slate-900/);
});

test('Rahmah July landing renders public family labels instead of exposing ID Umrah headings', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /displayName/);
  assert.doesNotMatch(component, /<span className="text-xs font-bold text-amber-600">\{group\.idUmrah\}<\/span>/);
  assert.doesNotMatch(component, /AIW0028456/);
});

test('Rahmah July landing uses Jamaah Umroh-style grouped list cards', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /JamaahGroupCard/);
  assert.match(component, /rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden dark:border-amber-900\/40 dark:bg-slate-900/);
  assert.match(component, /bg-amber-50\/60 border-b border-amber-100 dark:border-amber-900\/30 dark:bg-amber-900\/10/);
  assert.match(component, /\{group\.members\.length\} jamaah/);
  assert.match(component, /text-\[10px\] font-bold text-amber-700[\s\S]*\{group\.displayName\}/);
  assert.doesNotMatch(component, /<span>CHECKLIST<\/span>/);
  assert.doesNotMatch(component, /truncate text-\[10px\] font-medium text-gray-400 dark:text-slate-500">· \{group\.displayName\}/);
  assert.match(component, /divide-y divide-gray-100/);
  assert.match(component, /JamaahGroupMemberRow/);
  assert.doesNotMatch(component, /function FamilyHeader/);
  assert.doesNotMatch(component, /<div className="space-y-2">\s*\{group\.members\.map/);
});

test('Rahmah July landing contact cards show plain WA number, status, and Chat WA CTA', () => {
  const component = read('src/components/RahmahJuliLandingPage.tsx');

  assert.match(component, /ContactPersonCard/);
  assert.match(component, /import WhatsAppIcon from '@\/components\/common\/WhatsAppIcon';/);
  assert.match(component, /<section className="space-y-2">\s*\{RAHMAH_JULI_CONTACTS\.map/);
  assert.match(component, /<article className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">/);
  assert.match(component, /relative h-12 w-12 flex-none/);
  assert.match(component, /motion-safe:animate-pulse/);
  assert.match(component, /ring-2 ring-white dark:ring-slate-800/);
  assert.match(component, /aria-label=\{`Chat WhatsApp \$\{contact\.name\}`\}/);
  assert.match(component, /<p className="truncate text-sm font-bold text-gray-900 dark:text-slate-100">\{contact\.name\}<\/p>/);
  assert.match(component, /<div className="mt-1 flex items-center gap-1 text-\[10px\] font-semibold text-gray-500 dark:text-slate-400">/);
  assert.match(component, /<WhatsAppIcon size=\{12\} className="flex-none text-emerald-500" \/>/);
  assert.match(component, /<span className="truncate">\{contact\.whatsappDisplay\}<\/span>/);
  assert.match(component, /<span className="text-\[9px\] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">\s*\{contact\.role\}\s*<\/span>/);
  assert.match(component, /<span>Chat WA<\/span>/);
  assert.match(component, /rounded-lg bg-emerald-500 px-2\.5 py-1\.5 text-\[10px\] font-bold text-white/);
  assert.doesNotMatch(component, /<div className="mt-4 space-y-2">\s*\{RAHMAH_JULI_CONTACTS\.map/);
  assert.doesNotMatch(component, /<p className="text-\[10px\] font-semibold uppercase tracking-wide text-gray-400">\{contact\.role\}<\/p>/);
  assert.doesNotMatch(component, /rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1/);
  assert.doesNotMatch(component, /rounded-lg border border-gray-200 bg-white px-2 py-1 text-\[9px\]/);
  assert.doesNotMatch(component, /MessageCircle/);
});

test('main.tsx routes /rahmah-1-juli-2026 before the package fallback', () => {
  const main = read('src/main.tsx');

  assert.match(main, /RahmahJuliLandingPage/);
  assert.match(main, /isRahmahJuliLanding/);
  assert.match(main, /'rahmah-1-juli-2026'/);
  assert.match(main, /if \(isRahmahJuliLanding\) return <RahmahJuliLandingPage \/>/);
});
