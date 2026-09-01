// Membakar identitas agent ke PIKSEL brosur paket.
//
// Brosur datang dari hulu sebagai gambar jadi, dan setiap template menyisakan
// satu kotak kosong di strip bawah untuk diisi kontak — selama ini terkirim ke
// calon jamaah dalam keadaan kosong. Modul ini mengisinya, dengan dua hal saja:
// nama dan nomor WhatsApp, sebesar yang muat.
//
// Pembagian kerjanya sengaja tiga lapis, karena ketiganya gagal dengan cara
// yang berbeda dan hanya lapisan ketiga yang butuh DOM:
//   1. src/lib/brochureContactSlot.js — MENEMUKAN kotaknya (murni, teruji)
//   2. src/lib/agentBandLayout.js     — MENGATUR isinya (murni, teruji)
//   3. berkas ini                     — menggambar (kanvas)
//
// Semua jalur gagal mengembalikan blob ASLI, tidak pernah melempar ke pemanggil:
// brosur tanpa identitas agent masih berguna, brosur yang gagal tampil tidak.

import { layoutAgentBlock, AGENT_BLOCK } from '../lib/agentBandLayout.js';
import { findContactSlot, CONTACT_SLOT } from '../lib/brochureContactSlot.js';
import type { AgentBandLayout } from '../lib/agentBandLayout';
import type { ContactSlot } from '../lib/brochureContactSlot';
import { canvasToBlob, decodeImageBlob } from './canvasImage';
import { formatWaDisplay, normalizeWaNumber } from './phone';

export interface BrochureAgentIdentity {
  name: string;
  /** Nomor mentah apa adanya dari data agent; dinormalkan di sini. */
  phone: string;
}

/** Glif WhatsApp resmi — sama persis dengan src/components/bio/WhatsAppIcon.tsx. */
const WA_PATH =
  'M19.077 4.928A9.94 9.94 0 0 0 12.021 2c-5.506 0-9.989 4.483-9.989 9.989 0 1.762.46 3.483 1.336 5.001L2 22l5.135-1.346a9.97 9.97 0 0 0 4.886 1.244h.004c5.505 0 9.985-4.483 9.985-9.99a9.94 9.94 0 0 0-2.933-7.07ZM12.025 20.16h-.004a8.27 8.27 0 0 1-4.213-1.155l-.302-.18-3.046.799.812-2.97-.197-.314a8.25 8.25 0 0 1-1.262-4.351c0-4.575 3.726-8.301 8.305-8.301a8.25 8.25 0 0 1 5.864 2.434 8.24 8.24 0 0 1 2.435 5.872c-.001 4.576-3.728 8.166-8.392 8.166Zm4.55-6.187c-.249-.124-1.473-.728-1.701-.81-.228-.083-.394-.124-.56.124-.166.249-.642.81-.787.976-.145.166-.29.187-.539.062-.249-.124-1.052-.388-2.004-1.237-.741-.661-1.241-1.477-1.387-1.726-.145-.249-.015-.384.109-.508.112-.112.249-.29.374-.435.124-.145.166-.249.249-.415.083-.166.041-.311-.021-.435-.062-.124-.56-1.349-.768-1.847-.202-.485-.408-.42-.56-.428-.145-.007-.311-.009-.477-.009-.166 0-.435.062-.663.311-.228.249-.871.851-.871 2.075 0 1.224.892 2.406 1.016 2.572.124.166 1.756 2.683 4.255 3.762.595.257 1.058.41 1.42.526.597.19 1.139.163 1.568.099.479-.072 1.473-.602 1.681-1.184.207-.581.207-1.079.145-1.184-.062-.104-.228-.166-.477-.29Z';

/**
 * Dua palet, satu tata letak. Kotak yang ditemukan SELALU putih — begitulah cara
 * ia ditemukan — jadi paletnya gelap-di-atas-terang. Pita jaring pengaman yang
 * kita gambar sendiri berlatar merah, jadi paletnya dibalik.
 */
const ON_WHITE = AGENT_BLOCK.colors;
const ON_BAND = {
  name: '#FFFFFF',
  phone: '#FFFFFF',
  waIcon: '#DEAF59',
};

/** Pita tambahan dipakai HANYA kalau tidak ada kotak kosong yang ditemukan. */
const FALLBACK_BAND = {
  heightRatio: 0.0625,
  minHeight: 60,
  top: '#990E0C',
  bottom: '#6E0806',
  hairline: '#DEAF59',
  hairlineRatio: 0.033,
};

function drawWhatsApp(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  if (typeof Path2D !== 'function') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(WA_PATH));
  ctx.restore();
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  layout: AgentBandLayout,
  palette: typeof ON_WHITE,
) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${layout.fontSize}px ${AGENT_BLOCK.fontFamily}`;
  if (layout.name) {
    ctx.fillStyle = palette.name;
    ctx.fillText(layout.name.text, layout.name.x, layout.name.midY);
  }
  if (layout.wa) {
    drawWhatsApp(ctx, layout.wa.iconX, layout.wa.iconY, layout.wa.iconSize, palette.waIcon);
    ctx.fillStyle = palette.phone;
    ctx.fillText(layout.wa.text, layout.wa.textX, layout.wa.midY);
  }
  ctx.restore();
}

function measurerFor(ctx: CanvasRenderingContext2D) {
  return (text: string, fontSize: number, weight: number) => {
    ctx.font = `${weight} ${fontSize}px ${AGENT_BLOCK.fontFamily}`;
    return ctx.measureText(text).width;
  };
}

/**
 * Mengembalikan salinan brosur dengan identitas agent tercetak di piksel.
 *
 * Tidak pernah melempar: setiap kegagalan mengembalikan blob aslinya.
 */
export async function stampAgentOnBrochure(
  blob: Blob,
  agent: BrochureAgentIdentity,
): Promise<Blob> {
  const name = String(agent?.name || '').trim();
  const normalized = normalizeWaNumber(agent?.phone);
  const phone = normalized ? formatWaDisplay(normalized, '-') : '';
  if (!name && !phone) return blob;

  let decoded: Awaited<ReturnType<typeof decodeImageBlob>> | null = null;
  try {
    decoded = await decodeImageBlob(blob);
    const { bitmap, width, height } = decoded;
    if (!width || !height) return blob;

    const base = document.createElement('canvas');
    base.width = width;
    base.height = height;
    const baseCtx = base.getContext('2d', { willReadFrequently: true });
    if (!baseCtx) return blob;
    baseCtx.drawImage(bitmap, 0, 0, width, height);

    // ── Cari kotak kosong di strip bawah.
    const scanHeight = Math.max(1, Math.round(height * CONTACT_SLOT.scanRatio));
    const offsetY = height - scanHeight;
    const region = baseCtx.getImageData(0, offsetY, width, scanHeight);
    const slot: ContactSlot | null = findContactSlot({
      data: region.data,
      width,
      height: scanHeight,
      offsetY,
      imageHeight: height,
    });

    // Kotak ketemu → gambar di atas kanvas asli, rasio tidak berubah.
    if (slot) {
      const layout = layoutAgentBlock({ slot, name, phone, measure: measurerFor(baseCtx) });
      if (!layout) return blob;
      drawBlock(baseCtx, layout, ON_WHITE);
      return await encode(base, blob);
    }

    // ── Jaring pengaman: template tak dikenal. Kanvas ditinggikan supaya tidak
    //    ada satu piksel pun milik desainer yang tertimpa.
    const bandHeight = Math.max(FALLBACK_BAND.minHeight, Math.round(height * FALLBACK_BAND.heightRatio));
    const tall = document.createElement('canvas');
    tall.width = width;
    tall.height = height + bandHeight;
    const ctx = tall.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, height, 0, height + bandHeight);
    gradient.addColorStop(0, FALLBACK_BAND.top);
    gradient.addColorStop(1, FALLBACK_BAND.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height, width, bandHeight);
    ctx.fillStyle = FALLBACK_BAND.hairline;
    ctx.fillRect(0, height, width, Math.max(1, bandHeight * FALLBACK_BAND.hairlineRatio));

    const bandSlot: ContactSlot = { x: 0, y: height, width, height: bandHeight };
    const layout = layoutAgentBlock({ slot: bandSlot, name, phone, measure: measurerFor(ctx) });
    if (!layout) return blob;
    drawBlock(ctx, layout, ON_BAND);
    return await encode(tall, blob);
  } catch {
    return blob;
  } finally {
    decoded?.close();
  }
}

/**
 * PNG dipertahankan supaya transparansi tidak berubah jadi hitam; sisanya
 * (jpg, webp, avif) keluar sebagai JPEG — paling aman dibuka di galeri ponsel
 * dan aplikasi chat mana pun. Aturan yang sama dengan stampWatermark.
 */
async function encode(canvas: HTMLCanvasElement, source: Blob): Promise<Blob> {
  const png = source.type === 'image/png';
  return await canvasToBlob(canvas, png ? 'image/png' : 'image/jpeg', png ? 1 : 0.92);
}
