// Katalog sticker brosur: daftar hardcode + thumbnail lokal yang menyertainya.
//
// Tes keberadaan berkas di public/img-sticker bukan formalitas: katalog dan
// thumbnail dibangun terpisah (script pembangun mengambil dari Bunny), jadi
// menambah baris di katalog tanpa menjalankan ulang script menghasilkan picker
// dengan kotak kosong. Tes ini yang menangkapnya sebelum sampai ke agent.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  STICKERS, STICKER_GROUPS, STICKER_BASE,
  stickerById, stickerFullUrl, stickerThumbUrl,
} from '../src/lib/stickerCatalog.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('21 sticker, id unik', () => {
  assert.equal(STICKERS.length, 21);
  assert.equal(new Set(STICKERS.map(s => s.id)).size, 21);
});

test('tiap sticker punya thumbnail yang benar-benar ada di public/img-sticker', () => {
  for (const s of STICKERS) {
    assert.ok(existsSync(`${root}public/img-sticker/${s.id}.webp`), `thumbnail hilang: ${s.id}`);
  }
});

test('tiap sticker masuk grup yang terdaftar dan punya label', () => {
  const ids = new Set(STICKER_GROUPS.map(g => g.id));
  for (const s of STICKERS) {
    assert.ok(ids.has(s.group), `grup tak dikenal: ${s.group}`);
    assert.ok(s.label.length > 0);
    assert.ok(s.aspect > 0);
  }
});

test('setiap grup punya minimal satu sticker — tidak ada tab kosong di picker', () => {
  for (const g of STICKER_GROUPS) {
    assert.ok(STICKERS.some(s => s.group === g.id), `grup kosong: ${g.id}`);
  }
});

test('URL terbentuk dari id, bukan ditulis ulang per entri', () => {
  assert.equal(stickerFullUrl('sold-out'), `${STICKER_BASE}/sold-out.png`);
  assert.equal(stickerThumbUrl('sold-out'), '/img-sticker/sold-out.webp');
  assert.equal(stickerById('sold-out').label, 'Sold Out');
  assert.equal(stickerById('tidak-ada'), null);
});
