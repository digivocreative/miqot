import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

// The module under test is TS; compile it to a temp CJS file and require it.
// realpathSync: macOS /var -> /private/var, and a symlinked path breaks require.
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), 'list-scroll-anchor-')));
const outfile = join(outDir, 'list-scroll-anchor.cjs');
buildSync({
  entryPoints: [join(projectRoot, 'src/lib/list-scroll-anchor.ts')],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});
const { captureListAnchor, restoreListAnchor } = createRequire(import.meta.url)(outfile);

// ── Miniatur layout daftar jadwal ──
// Kartu ditumpuk berurutan dengan jarak 8px (space-y-2), tinggi asli 247px
// (judul 1 baris) / 261px (badge PROMO + judul 2 baris).
const GAP = 8;

function makeLayout(cards, scrollY = 0) {
  const state = { cards: cards.map(c => ({ ...c })), scrollY };

  const doc = {
    querySelectorAll() {
      let y = 0;
      return state.cards.map(card => {
        const docTop = y;
        y += card.height + GAP;
        return {
          getAttribute: name => (name === 'data-jadwal-id' ? card.id : null),
          getBoundingClientRect: () => ({
            top: docTop - state.scrollY,
            bottom: docTop - state.scrollY + card.height,
          }),
        };
      });
    },
  };

  const win = {
    scrollBy(_x, dy) {
      state.scrollY += dy;
    },
  };

  return {
    state,
    doc,
    win,
    remove(...ids) {
      state.cards = state.cards.filter(c => !ids.includes(c.id));
    },
    insertAt(index, card) {
      state.cards.splice(index, 0, card);
    },
    /** Posisi kartu relatif viewport — persis yang dilihat mata pengguna. */
    viewTop(id) {
      for (const el of doc.querySelectorAll('[data-jadwal-id]')) {
        if (el.getAttribute('data-jadwal-id') === id) return el.getBoundingClientRect().top;
      }
      return null;
    },
  };
}

function sixCards() {
  return [
    { id: 'A', height: 261 },
    { id: 'B', height: 247 },
    { id: 'C', height: 261 },
    { id: 'D', height: 247 },
    { id: 'E', height: 247 },
    { id: 'F', height: 247 },
  ];
}

describe('list-scroll-anchor', () => {
  test('jangkar = kartu pertama yang masih kelihatan (bottom > 0), bukan kartu pertama dokumen', () => {
    // scrollY 800: A (0..261) dan B (269..516) sudah lewat; C (524..785) juga.
    // D mulai 793, jadi bottom-nya (1040) > 0 → D yang jadi jangkar.
    const layout = makeLayout(sixCards(), 800);
    const anchor = captureListAnchor(layout.doc);

    assert.equal(anchor.candidates[0].id, 'D');
    assert.equal(anchor.candidates[0].top, -7);
  });

  test('kartu yang hilang DI ATAS viewport tidak menggeser kartu yang sedang dibaca', () => {
    const layout = makeLayout(sixCards(), 800);
    const before = layout.viewTop('D');
    const anchor = captureListAnchor(layout.doc);

    layout.remove('A', 'B'); // dua paket kursinya habis → keluar dari mode AVAILABLE
    assert.notEqual(layout.viewTop('D'), before, 'prasyarat: tanpa koreksi kartu memang bergeser');

    const delta = restoreListAnchor(anchor, layout.doc, layout.win);

    assert.equal(layout.viewTop('D'), before, 'kartu jangkar harus kembali ke posisi layar semula');
    assert.equal(delta, -(261 + GAP) - (247 + GAP));
    assert.equal(layout.state.scrollY, 800 - 524);
  });

  test('kartu yang BERTAMBAH di atas viewport juga dikompensasi (arah sebaliknya)', () => {
    const layout = makeLayout(sixCards(), 800);
    const before = layout.viewTop('D');
    const anchor = captureListAnchor(layout.doc);

    layout.insertAt(0, { id: 'NEW', height: 247 });
    const delta = restoreListAnchor(anchor, layout.doc, layout.win);

    assert.equal(layout.viewTop('D'), before);
    assert.equal(delta, 247 + GAP);
  });

  test('kalau kartu jangkar SENDIRI ikut hilang, kandidat berikutnya yang diluruskan', () => {
    const layout = makeLayout(sixCards(), 800);
    const beforeE = layout.viewTop('E');
    const anchor = captureListAnchor(layout.doc);
    assert.equal(anchor.candidates[0].id, 'D');

    // Paket D itu sendiri yang kursinya habis, bersama satu paket di atasnya.
    layout.remove('A', 'D');
    restoreListAnchor(anchor, layout.doc, layout.win);

    assert.equal(layout.viewTop('E'), beforeE, 'kartu selamat berikutnya harus diam di tempat');
  });

  test('kartu yang hilang DI BAWAH viewport tidak memicu koreksi apa pun', () => {
    const layout = makeLayout(sixCards(), 800);
    const anchor = captureListAnchor(layout.doc);

    layout.remove('F');
    const delta = restoreListAnchor(anchor, layout.doc, layout.win);

    assert.equal(delta, 0);
    assert.equal(layout.state.scrollY, 800, 'scroll tidak boleh disentuh kalau tak ada yang bergeser');
  });

  test('daftar kosong / semua kandidat lenyap tidak menebak-nebak', () => {
    assert.equal(captureListAnchor(makeLayout([], 0).doc), null);

    const layout = makeLayout(sixCards(), 800);
    const anchor = captureListAnchor(layout.doc);
    layout.remove('D', 'E', 'F');
    assert.equal(restoreListAnchor(anchor, layout.doc, layout.win), 0);
    assert.equal(layout.state.scrollY, 800);
  });

  test('anchor null (belum ada daftar) aman', () => {
    const layout = makeLayout(sixCards(), 800);
    assert.equal(restoreListAnchor(null, layout.doc, layout.win), 0);
  });
});
