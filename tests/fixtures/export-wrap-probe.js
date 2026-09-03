// Probe bersama untuk penjaga "teks ekspor tidak boleh patah baris".
//
// modern-screenshot (domToPng / captureStableDom) mengkloning DOM lalu MEMAKU
// setiap kotak ke width/height hasil pengukuran DOM hidup. Kotak teks yang
// shrink-to-fit jadi punya slack nol: begitu font di konteks render SVG
// mengukur teks sedikit lebih lebar daripada font saat pengukuran, teks patah
// ke baris kedua — dan karena height ikut dipaku, baris itu MENIMPA elemen di
// bawahnya. Gejala pertama yang dilaporkan dari lapangan: "Pendaftaran"
// menindih "Dibayar sekarang" di kartu penawaran Haji Plus (055693e).
//
// measureClonedTextLines() dijalankan DI DALAM browser lewat page.evaluate(),
// jadi badannya tidak boleh menutup variabel apa pun dari Node — semua masukan
// lewat satu argumen.

// Selisih metrik font yang ditiru: 6% dari font-size per karakter, jadi setara
// di semua ukuran teks. Nilai di lapangan lebih kecil dari ini, tapi kotak yang
// dipaku bocor pada selisih sekecil apa pun.
export const METRIC_DRIFT = '0.06em';

/**
 * Menjalankan pipeline kloning modern-screenshot yang asli atas `selector`,
 * memasang klonnya ke dokumen dengan selisih metrik font, lalu melaporkan
 * jumlah baris tiap elemen yang membawa teks.
 *
 * @param {{selector: string, drift: string, captureOptions?: object}} input
 * @returns {Promise<{readings: Array, pinnedBoxes: number, skippedHidden: number}>}
 */
export async function measureClonedTextLines({ selector, drift, captureOptions }) {
  // Badan fungsi ini di-serialize apa adanya ke browser: tidak boleh ada
  // referensi ke scope modul, jadi konstanta pun tinggal di dalam.
  const XHTML_NS = 'http://www.w3.org/1999/xhtml';
  const target = document.querySelector(selector);
  if (!target) throw new Error(`target tidak ditemukan: ${selector}`);

  const svg = await window.__modernScreenshot.domToForeignObjectSvg(
    target,
    { scale: 1, ...(captureOptions || {}) },
  );
  const clone = svg.querySelector('foreignObject > *');
  if (!clone) throw new Error('klon tidak ditemukan di dalam foreignObject');

  const stage = document.createElement('div');
  stage.id = '__wrap_probe__';
  stage.setAttribute('style', 'position:absolute;left:-99999px;top:0;');
  const nudge = document.createElement('style');
  // !important supaya menang atas letter-spacing inline yang ikut disalin ke klon.
  nudge.textContent = `#__wrap_probe__, #__wrap_probe__ * { letter-spacing: ${drift} !important; }`;
  stage.appendChild(clone);
  document.body.append(nudge, stage);

  const readings = [];
  let pinnedBoxes = 0;
  let skippedHidden = 0;

  try {
    for (const el of clone.querySelectorAll('*')) {
      if (el.style.width.endsWith('px') && el.style.height.endsWith('px')) pinnedBoxes += 1;

      // SVG (ikon, chart recharts) tidak pernah membungkus teks; <style>/<script>
      // membawa teks yang tak pernah dicat.
      if (el.namespaceURI !== XHTML_NS) continue;
      const tag = el.tagName.toUpperCase();
      if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'TITLE') continue;

      // Elemen "pembawa teks" = punya anak teks langsung yang tak kosong.
      // Yang diukur HANYA anak-anak teksnya, bukan seluruh isi elemen: kotak
      // ikon <svg> dan anak blok lain karenanya tidak ikut mengarang baris.
      // (Menyaring anak lewat computed display tidak bisa dipakai — anak dari
      // flex container di-blockify semua, sehingga pil URL berikon terlewat.)
      const textNodes = Array.from(el.childNodes).filter(
        node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
      );
      if (textNodes.length === 0) continue;

      const rects = textNodes
        .flatMap(node => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return Array.from(range.getClientRects());
        })
        .filter(r => r.width > 0.5 && r.height > 0.5)
        .sort((a, b) => a.top - b.top);
      // Nol rect = elemen tidak tercat (display:none / tinggi nol). Teks yang
      // tak tampil tidak bisa menimpa apa pun.
      if (rects.length === 0) { skippedHidden += 1; continue; }

      // Satu baris bisa memuat beberapa rect dengan `top` BERBEDA: teks 20px
      // ditambah <span> 9px di sebelahnya rata-baseline, bukan rata-atas.
      // Jadi baris dihitung dari tumpang-tindih vertikal, bukan kesamaan
      // `top` — kalau dua rect saling menutupi lebih dari separuh tinggi yang
      // lebih pendek, keduanya ada di baris yang sama.
      let lines = 0;
      let lineTop = -Infinity;
      let lineBottom = -Infinity;
      for (const rect of rects) {
        const overlap = Math.min(rect.bottom, lineBottom) - Math.max(rect.top, lineTop);
        const shorter = Math.min(rect.height, lineBottom - lineTop);
        if (lines > 0 && overlap > shorter / 2) {
          lineTop = Math.min(lineTop, rect.top);
          lineBottom = Math.max(lineBottom, rect.bottom);
          continue;
        }
        lines += 1;
        lineTop = rect.top;
        lineBottom = rect.bottom;
      }

      // Teks yang MEMANG boleh banyak baris harus mengumumkannya lewat kotak
      // yang berbatas — -webkit-line-clamp + overflow tersembunyi. Baris
      // berlebih di kotak seperti itu terpotong, bukan menimpa tetangganya,
      // jadi ia dikecualikan. Tinggi yang "kebetulan pas satu baris" bukan
      // pengumuman apa pun dan tetap dituntut satu baris.
      const style = getComputedStyle(el);
      const clamp = style.webkitLineClamp || style.getPropertyValue('-webkit-line-clamp');
      const clampLines = /^\d+$/.test(clamp) ? Number(clamp) : 0;
      const clipped = style.overflow === 'hidden' || style.overflow === 'clip';

      readings.push({
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60),
        lines,
        tag,
        fontSize: style.fontSize,
        pinnedWidth: el.style.width || '(auto)',
        pinnedHeight: el.style.height || '(auto)',
        clampLines,
        bounded: clampLines > 1 && clipped,
      });
    }
  } finally {
    stage.remove();
    nudge.remove();
  }

  return { readings, pinnedBoxes, skippedHidden };
}

/** Bacaan yang melanggar: lebih dari satu baris tanpa kotak berbatas. */
export function wrappedReadings(readings) {
  return readings.filter(r => r.lines !== 1 && !r.bounded);
}

/** Ringkasan enak-baca untuk pesan assert. */
export function describeWrapped(readings) {
  return readings
    .map(r => (
      `  · "${r.text}" → ${r.lines} baris (${r.tag}, ${r.fontSize}, kotak ${r.pinnedWidth}×${r.pinnedHeight}`
      + `, line-clamp ${r.clampLines || 'tidak ada'})`
    ))
    .join('\n');
}
