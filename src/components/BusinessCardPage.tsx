import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Loader2, Share2, Check, Maximize2, Minimize2, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { trackEvent } from '../utils/analytics';
import { getAuthHeaders } from './LoginPage';
import {
  DESIGNS, CARD_SIZE, RENDERERS, getInitials,
  type CardProps, type DesignId, type CardFormat,
} from './business-card/designs';

type QrMode = 'web' | 'vcard';

const QR_MODES: { id: QrMode; label: string; desc: string }[] = [
  { id: 'web', label: 'Halaman Web', desc: 'Scan membuka halaman paket umroh kamu' },
  { id: 'vcard', label: 'Simpan Kontak', desc: 'Scan langsung menyimpan nama & nomormu ke kontak HP. Paling andal discan dari layar; untuk kartu cetak, pakai mode Halaman Web.' },
];

function normalizePhoneDigits(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return d;
}

// "6281234567890" → "+62 812-3456-7890"
function formatPhoneDisplay(phone: string): string {
  const d = normalizePhoneDigits(phone);
  if (!d) return '';
  const rest = d.startsWith('62') ? d.slice(2) : d;
  const tail = rest.slice(3).match(/.{1,4}/g) || [];
  return `+62 ${[rest.slice(0, 3), ...tail].filter(Boolean).join('-')}`;
}

function escapeVCard(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
}

// vCard 3.0 seminimal mungkin: tiap karakter menaikkan kepadatan QR (payload
// penuh = QR versi 11 yang gagal discan dari cetakan). TITLE & URL sengaja
// tidak disertakan — URL sudah dilayani mode QR "Halaman Web".
function buildVCard(o: { name: string; phoneDigits: string; email: string }): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:;${escapeVCard(o.name)};;;`, `FN:${escapeVCard(o.name)}`, 'ORG:Alhijaz Indowisata'];
  if (o.phoneDigits) lines.push(`TEL;TYPE=CELL:+${o.phoneDigits}`);
  if (o.email) lines.push(`EMAIL:${escapeVCard(o.email)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

// ══════════════════════════════════════
// Main Page Component
// ══════════════════════════════════════
interface BusinessCardPageProps {
  agent: { slug: string; name: string; phone: string; email: string; photo: string; website: string; };
}

export default function BusinessCardPage({ agent }: BusinessCardPageProps) {
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_business_card'); mountTracked.current = true; } }, []);

  const name = agent.name || 'Agent';
  const initials = getInitials(name);
  const role = 'Konsultan Umroh & Haji';
  const brand = 'Alhijaz Indowisata';
  const waDigits = normalizePhoneDigits(agent.phone || '');
  const wa = formatPhoneDisplay(agent.phone || '');
  const email = agent.email || '';
  const rawPhoto = agent.photo || '';
  // Foto default agent baru adalah URL ui-avatars — inisial bergaya desain kartu lebih rapi.
  const photoUrl: string | null = rawPhoto && !rawPhoto.includes('ui-avatars.com') ? rawPhoto : null;

  // Target QR selalu alhijaz.co/{slug}: tahan ganti slug (301 via agent_slug_history)
  // dan otomatis redirect ke custom domain selagi aktif. Custom domain hanya
  // dipakai untuk teks URL di kartu.
  const publicUrl = `https://alhijaz.co/${agent.slug || 'agent'}`;
  const [customDomain, setCustomDomain] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/agent/custom-domain', { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.domain && j.status === 'active') setCustomDomain(j.domain); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const web = customDomain || `alhijaz.co/${agent.slug || 'agent'}`;

  const [selectedDesign, setSelectedDesign] = useState<DesignId>('d1');
  const [format, setFormat] = useState<CardFormat>('landscape');
  const [qrMode, setQrMode] = useState<QrMode>('web');
  const hasTrackedGenerate = useRef(false);
  const [exporting, setExporting] = useState<'download' | 'share' | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const currentDesign = DESIGNS.find(d => d.id === selectedDesign)!;
  const qrCaption = qrMode === 'vcard' ? 'Scan → simpan kontak' : 'Scan → lihat paket umroh';

  useEffect(() => {
    const content = qrMode === 'vcard'
      ? buildVCard({ name, phoneDigits: waDigits, email })
      : publicUrl;
    // scale (px per modul, bukan width) menjaga modul tetap integer-crisp tanpa
    // blur antialiasing; ECC L untuk vCard menurunkan versi QR agar modulnya
    // lebih besar dan mudah discan.
    QRCode.toDataURL(content, {
      scale: qrMode === 'vcard' ? 6 : 8, margin: 1,
      errorCorrectionLevel: qrMode === 'vcard' ? 'L' : 'M',
      color: { dark: currentDesign.qrColor.dark, light: currentDesign.qrColor.light },
    }).then(url => {
      setQrDataUrl(url);
      if (!hasTrackedGenerate.current) {
        trackEvent('action', 'generate_business_card', { theme: currentDesign.name, orientation: format, qr: qrMode });
        hasTrackedGenerate.current = true;
      }
    });
  }, [publicUrl, selectedDesign, qrMode, name, waDigits, email]);

  const cardExportRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.35);

  const computeScale = useCallback(() => {
    if (!previewContainerRef.current) return;
    const containerW = previewContainerRef.current.clientWidth - 48;
    setPreviewScale(Math.min(containerW / CARD_SIZE[format].w, 0.6));
  }, [format]);

  useEffect(() => {
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, [computeScale]);

  const cardProps: CardProps = { name, initials, role, brand, wa, email, web, qrCaption, photoUrl, qrDataUrl };
  const CardRenderer = RENDERERS[selectedDesign][format];
  const cardSize = CARD_SIZE[format];

  const handleDownload = async () => {
    if (!cardExportRef.current || exporting) return;
    setExporting('download');
    try {
      const { snapdom } = await import('@zumer/snapdom');
      // embedFonts wajib: tanpa ini hasil export jatuh ke font sistem, bukan Inter.
      const result = await snapdom(cardExportRef.current, { scale: 2, embedFonts: true });
      await result.download({ type: 'png', filename: `kartu-nama-${agent.slug || 'agent'}-${format}` });
      trackEvent('action', 'download_business_card', { theme: currentDesign.name });
    } catch (e) { console.error('Export gagal:', e); }
    finally { setExporting(null); }
  };

  const handleShare = async () => {
    if (!cardExportRef.current || exporting) return;
    setExporting('share');
    try {
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(cardExportRef.current, { scale: 2, embedFonts: true });
      const blob = await result.toBlob({ type: 'png' });
      const file = new File([blob], `kartu-nama-${agent.slug || 'agent'}.png`, { type: 'image/png' });
      if (navigator.share) {
        await navigator.share({ files: [file] });
        trackEvent('action', 'share_business_card', { theme: currentDesign.name });
      }
    } catch (e: any) { if (e?.name !== 'AbortError') console.error('Share gagal:', e); }
    finally { setExporting(null); }
  };

  const thumbW = format === 'landscape' ? 88 : 54;
  const thumbH = format === 'landscape' ? 54 : 88;
  const thumbScale = format === 'landscape' ? 88 / 1050 : 54 / 600;

  return (
    <div className="px-4 pt-4 pb-8 space-y-3.5">
      {/* Pilih Desain */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Maximize2 size={13} className="text-gray-400" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Pilih Desain</span>
          </div>
          <div className="flex bg-gray-100 dark:bg-slate-900 rounded-lg p-0.5">
            {(['landscape', 'portrait'] as const).map(f => (
              <button key={f} onClick={() => setFormat(f)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${format === f ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>
                {f === 'landscape' ? '⬜ Landscape' : '⬜ Portrait'}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {DESIGNS.map(d => (
              <button key={d.id} onClick={() => setSelectedDesign(d.id)}
                className={`flex flex-col items-center gap-1.5 flex-shrink-0 transition-all ${selectedDesign === d.id ? '' : 'opacity-60'}`}>
                <div className={`relative rounded-lg overflow-hidden border-2 transition-colors ${selectedDesign === d.id ? 'border-emerald-500' : 'border-gray-200 dark:border-slate-600'}`} style={{ width: thumbW, height: thumbH }}>
                  <div style={{ width: CARD_SIZE[format].w, height: CARD_SIZE[format].h, transform: `scale(${thumbScale})`, transformOrigin: 'top left' }}>
                    {(() => { const R = RENDERERS[d.id][format]; return <R {...cardProps} />; })()}
                  </div>
                  {selectedDesign === d.id && (
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <span className={`text-[9px] font-bold ${selectedDesign === d.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-1.5">
          <QrCode size={13} className="text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">QR Code</span>
        </div>
        <div className="p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {QR_MODES.map(m => (
              <button key={m.id} onClick={() => setQrMode(m.id)}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95 ${qrMode === m.id
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                  : 'border-gray-200 dark:border-slate-600 text-gray-400 dark:text-slate-500'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 text-center">{QR_MODES.find(m => m.id === qrMode)!.desc}</p>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-1.5">
          <Minimize2 size={13} className="text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Preview</span>
        </div>
        <div ref={previewContainerRef} className="bg-gray-50 dark:bg-slate-900 p-6 flex justify-center">
          <div style={{ width: cardSize.w * previewScale, height: cardSize.h * previewScale, overflow: 'hidden', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
            <div style={{ width: cardSize.w, height: cardSize.h, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              <CardRenderer {...cardProps} />
            </div>
          </div>
        </div>
        <div className="px-4 py-2 border-t border-gray-50 dark:border-slate-700/50">
          <p className="text-[9px] text-gray-400 dark:text-slate-500 text-center">{cardSize.w}×{cardSize.h}px · Resolusi tinggi untuk print & digital</p>
        </div>
      </div>

      {/* Download */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-1.5">
          <Download size={13} className="text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Download</span>
        </div>
        <div className="p-4 space-y-2">
          <button onClick={handleDownload} disabled={!!exporting}
            className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
            {exporting === 'download' ? <><Loader2 size={16} className="animate-spin" /> Exporting...</> : <><Download size={16} /> Download PNG</>}
          </button>
          {'share' in navigator && (
            <button onClick={handleShare} disabled={!!exporting}
              className="w-full py-3 rounded-xl text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
              {exporting === 'share' ? <><Loader2 size={16} className="animate-spin" /> Menyiapkan...</> : <><Share2 size={16} /> Bagikan</>}
            </button>
          )}
          <p className="text-[9px] text-gray-400 dark:text-slate-500 text-center mt-1">Format PNG · Resolusi tinggi · Siap print & share</p>
        </div>
      </div>

      {/* Hidden export card */}
      <div style={{ position: 'fixed', left: -9999, top: -9999, pointerEvents: 'none', opacity: 0 }}>
        <div ref={cardExportRef} style={{ width: cardSize.w, height: cardSize.h }}>
          <CardRenderer {...cardProps} />
        </div>
      </div>
    </div>
  );
}
