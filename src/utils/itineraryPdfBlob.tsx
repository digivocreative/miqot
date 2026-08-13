// Perakit PDF "Rencana Perjalanan": mengubah aset jadi dataURL lalu menyerahkan
// ke ItineraryDocument. Dipisah dari dokumennya supaya dokumen tetap render-only
// dan bisa dipakai ulang bila nanti dipanggil dari halaman share publik.
// Spec: docs/superpowers/specs/2026-08-13-itinerary-pdf-versi-kita-design.md
import { pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';
// Logo hidup di src/, bukan public/ — diambil sebagai URL bundle, bukan path origin.
import logoAlhijazWhite from '@/new-logo/new-logo-alhijaz-white.png';
import { destinationPhotosForDays, destinationPhotoUrl } from '../../lib/itinerary-destinasi.js';
import { ItineraryDocument, type ItineraryDocProps, type ItineraryFoto } from '../components/ItineraryDocument';

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

export function itineraryPdfFileName(jadwalId: string): string {
  return `rencana-perjalanan-${jadwalId || 'alhijaz'}.pdf`;
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

  const [logoDataUrl, flagDataUrl] = await Promise.all([
    toDataUrl(logoAlhijazWhite, { format: 'image/png', maxWidth: 400 }),
    toDataUrl(`${window.location.origin}/flags/saudi.png`, { format: 'image/png', maxWidth: 200 }),
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

  return pdf(
    <ItineraryDocument
      content={content}
      paket={paket}
      agent={agent}
      photosByDay={photosByDay}
      flagDataUrl={flagDataUrl || undefined}
      logoDataUrl={logoDataUrl || undefined}
      qrDataUrl={qrDataUrl}
    />,
  ).toBlob();
}
