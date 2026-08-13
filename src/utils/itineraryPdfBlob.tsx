// Perakit PDF "Rencana Perjalanan": mengubah aset jadi dataURL lalu menyerahkan
// ke ItineraryDocument. Dipisah dari dokumennya supaya dokumen tetap render-only
// dan bisa dipakai ulang bila nanti dipanggil dari halaman share publik.
// Spec: docs/superpowers/specs/2026-08-13-itinerary-pdf-versi-kita-design.md
import { pdf } from '@react-pdf/renderer';
import { pdfjs } from 'react-pdf';
import QRCode from 'qrcode';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';
// Logo hidup di src/, bukan public/ — diambil sebagai URL bundle, bukan path origin.
import logoAlhijazWhite from '@/new-logo/new-logo-alhijaz-white.png';
import { destinationPhotosForDays, destinationPhotoUrl } from '../../lib/itinerary-destinasi.js';
import {
  ItineraryDocument, ITINERARY_PAD_BAWAH, ITINERARY_TINGGI_MAKS,
  type ItineraryDocProps, type ItineraryFoto,
} from '../components/ItineraryDocument';

/**
 * react-pdf tidak bisa membaca WebP (dan tidak bisa membaca JPEG progresif),
 * sedangkan derivatif foto destinasi di Bunny semuanya WebP. Kanvas dipakai
 * sebagai penerjemah — pola yang sama dengan foto agent di
 * generateQuotationPdfBlob. Bunny mengirim `access-control-allow-origin: *`
 * sehingga kanvasnya tidak ter-taint.
 *
 * `format` PNG dipakai untuk aset ber-transparansi (logo putih): mengubahnya
 * jadi JPEG akan mengecat latar hitam di belakang logo.
 */
async function toDataUrl(
  url: string,
  { format = 'image/jpeg', maxWidth = 800, quality = 0.82 }: { format?: 'image/jpeg' | 'image/png'; maxWidth?: number; quality?: number } = {},
): Promise<string | null> {
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas 2d tidak tersedia')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(format, quality));
      };
      img.onerror = () => reject(new Error(`gagal memuat ${url}`));
      img.src = url;
    });
  } catch (err) {
    // Satu aset hilang tidak boleh menggagalkan seluruh dokumen.
    console.warn('[itinerary-pdf] aset dilewati:', url, err);
    return null;
  }
}

/**
 * "ITINERARY UMRAH HEMAT 9HR (KERETA CEPAT).pdf" — nama paket dipakai apa adanya
 * supaya jamaah langsung tahu isi lampirannya di daftar berkas WhatsApp.
 * Karakter yang dilarang di nama berkas Windows/macOS/Android dibuang, dan spasi
 * ganda dari data jadwal ("( KERETA CEPAT)") dirapikan.
 */
export function itineraryPdfFileName(namaPaket: string, jadwalId?: string): string {
  const inti = String(namaPaket || '').trim() || String(jadwalId || '').trim();
  const aman = inti
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
  return `ITINERARY ${aman || 'ALHIJAZ'}.pdf`;
}

/**
 * Tinggi isi sebenarnya dari cetakan mode `ukur`, dalam titik.
 *
 * react-pdf tidak pernah melaporkan tinggi hasil tata letaknya, jadi satu-satunya
 * sumber yang jujur adalah dokumen yang sudah jadi: dicetak setinggi mungkin pada
 * satu halaman, lalu dibaca baris teks paling bawah. Cetakan `ukur` tidak memuat
 * kaki dokumen, sehingga baris terbawah pasti catatan penutup.
 *
 * Mengembalikan null bila pengukuran tak bisa dipercaya — isinya melebihi batas
 * satu halaman, tak ada teks sama sekali, atau pdf.js gagal dimuat. Pemanggil
 * lalu kembali ke paginasi, bukan menerbitkan dokumen yang terpotong.
 */
async function ukurTinggiIsi(blob: Blob): Promise<number | null> {
  try {
    const data = new Uint8Array(await blob.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    try {
      if (doc.numPages !== 1) return null;
      const teks = await (await doc.getPage(1)).getTextContent();
      let terbawah = Infinity;
      for (const item of teks.items as Array<{ transform?: number[] }>) {
        const y = item.transform?.[5];
        if (typeof y === 'number' && y < terbawah) terbawah = y;
      }
      if (!Number.isFinite(terbawah)) return null;
      // `terbawah` adalah garis alas (origin PDF di kiri-BAWAH). Tambah turunan
      // huruf secukupnya, lalu ruang untuk kaki dokumen.
      const tinggi = Math.ceil(ITINERARY_TINGGI_MAKS - terbawah + 4 + ITINERARY_PAD_BAWAH);
      return tinggi > 0 && tinggi <= ITINERARY_TINGGI_MAKS ? tinggi : null;
    } finally {
      await doc.destroy();
    }
  } catch (err) {
    console.warn('[itinerary-pdf] tinggi isi gagal diukur, kembali ke paginasi:', err);
    return null;
  }
}

export async function generateItineraryPdfBlob({
  content,
  paket,
  agent,
  shareUrl,
}: {
  content: ItineraryDocProps['content'];
  paket: UmrohPackage;
  agent?: AgentData | null;
  shareUrl?: string;
}): Promise<Blob> {
  const photoPlan = destinationPhotosForDays(content.days) as Array<Array<{ file: string; label: string } | null>>;

  // Dedup foto sudah global di destinationPhotosForDays; cache ini hanya jaring
  // pengaman bila aturannya berubah, dan menghindari dua kali unduh + encode.
  const cache = new Map<string, string | null>();
  const photosByDay: Array<Array<ItineraryFoto | null>> = [];
  for (const perDay of photoPlan) {
    const out: Array<ItineraryFoto | null> = [];
    for (const p of perDay) {
      if (!p) { out.push(null); continue; }
      if (!cache.has(p.file)) cache.set(p.file, await toDataUrl(destinationPhotoUrl(p.file)));
      const dataUrl = cache.get(p.file);
      out.push(dataUrl ? { dataUrl, label: p.label } : null);
    }
    photosByDay.push(out);
  }

  const [logoDataUrl, flagDataUrl, agentPhotoDataUrl] = await Promise.all([
    toDataUrl(logoAlhijazWhite, { format: 'image/png', maxWidth: 400 }),
    toDataUrl(`${window.location.origin}/flags/saudi.png`, { format: 'image/png', maxWidth: 200 }),
    // PNG, bukan JPEG: foto agent di Bunny sering progressive JPEG yang tak bisa
    // dibaca react-pdf — alasan yang sama dengan fotoAgentPng di CompareDocument.
    agent?.photo ? toDataUrl(agent.photo, { format: 'image/png', maxWidth: 240 }) : Promise.resolve(null),
  ]);

  let qrDataUrl: string | undefined;
  if (shareUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(shareUrl, {
        margin: 0,
        width: 232,
        color: { dark: '#1E1512', light: '#FFFFFF' },
      });
    } catch (err) {
      console.warn('[itinerary-pdf] QR dilewati:', err);
    }
  }

  const isi: Omit<ItineraryDocProps, 'mode' | 'pageHeight'> = {
    content,
    paket,
    agent,
    photosByDay,
    flagDataUrl: flagDataUrl || undefined,
    logoDataUrl: logoDataUrl || undefined,
    qrDataUrl,
    agentPhotoDataUrl: agentPhotoDataUrl || undefined,
  };

  // Dokumen terbit sebagai SATU halaman utuh: di layar HP orang menggeser, dan
  // memotongnya per halaman menyisakan rongga di kaki tiap halaman. Tingginya
  // harus diukur dari cetakan sungguhan lebih dulu — react-pdf tidak menyediakan
  // hasil tata letaknya. Bila pengukuran gagal atau isinya melewati batas
  // halaman PDF, dokumen tetap terbit dengan paginasi lama.
  const tinggi = await ukurTinggiIsi(await pdf(<ItineraryDocument {...isi} mode="ukur" />).toBlob());

  return pdf(
    tinggi
      ? <ItineraryDocument {...isi} mode="utuh" pageHeight={tinggi} />
      : <ItineraryDocument {...isi} />,
  ).toBlob();
}
