import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Download } from 'lucide-react';
import { trackEvent } from '../utils/analytics';
import type { Birthday } from './BirthdayWidget';
import {
  BirthdayCard,
  BirthdayCardThumb,
  TEMPLATE_LABELS,
  type CardTemplate,
} from './BirthdayCardTemplates';

interface Props {
  jamaah: Birthday;
  onClose: () => void;
  agentName: string;
  agentPhone?: string;
  agentPhoto?: string;
  agentSlug: string;
}

function getFirstName(nama: string): string {
  const first = (nama || '').trim().split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function getDefaultMessage(jamaah: Birthday, agentName: string): string {
  const jamaahFirst = getFirstName(jamaah.nama);
  const agentFirst = getFirstName(agentName) || 'Saya';
  const sapaan = jamaah.jk === 'P' ? 'Bu' : 'Pak';

  const upcomingWord = jamaah.day_offset === 1
    ? 'besok'
    : `${jamaah.day_offset} hari lagi`;

  const doa = `Allah panjangkan umur ${sapaan} ${jamaahFirst} dengan keberkahan, dilimpahkan kesehatan, dilapangkan rezekinya, dan dimudahkan langkah menuju Baitullah`;

  const body = jamaah.day_offset === 0
    ? `*Barakallahu fii umrik, ${sapaan} ${jamaahFirst}!*\n\nDi hari yang penuh berkah ini, ${agentFirst} ikut mendoakan — semoga di usia ke-${jamaah.age} ini, ${doa}.\n\n_Aamiin Yaa Rabbal 'Alamiin_ 🤲`
    : `*${sapaan} ${jamaahFirst}*, _${upcomingWord}_ ulang tahun ya 🎉\n\nSebelum harinya, ${agentFirst} ingin doakan dulu — semoga di usia ke-${jamaah.age} nanti, ${doa}.\n\n_Aamiin Yaa Rabbal 'Alamiin_ 🤲`;

  return `Assalamu'alaikum 🌹\n\n${body}\n\n— *${agentName}*\n_Alhijaz Indowisata_`;
}

function normalizeWaNumber(wa: string): string | null {
  const cleaned = (wa || '').replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('0')) return '62' + cleaned.slice(1);
  if (cleaned.startsWith('62')) return cleaned;
  if (cleaned.startsWith('8')) return '62' + cleaned;
  return cleaned;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function dayLabel(offset: 0 | 1 | 2 | 3): string {
  return ['Hari ini', 'Besok', '2 hari lagi', '3 hari lagi'][offset];
}

function cardFileName(jamaah: Birthday, template: CardTemplate): string {
  return `ucapan-${slugify(jamaah.nama)}-${template}.jpg`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openPreparedWindow(): Window | null {
  const win = window.open('', '_blank');
  if (!win) return null;
  try {
    win.document.write(`
      <!doctype html>
      <html>
        <head><title>Menyiapkan WhatsApp...</title></head>
        <body style="font-family: system-ui, sans-serif; padding: 24px;">
          <p>Menyiapkan WhatsApp...</p>
        </body>
      </html>
    `);
    win.document.close();
  } catch { /* noop */ }
  return win;
}

function openWhatsAppUrl(url: string, preparedWindow?: Window | null): void {
  if (preparedWindow && !preparedWindow.closed) {
    preparedWindow.location.href = url;
    return;
  }
  window.location.assign(url);
}

function WhatsAppIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 448 512" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.3-5-3.7-10.5-6.5z" />
    </svg>
  );
}

export default function BirthdayDetailSheet({
  jamaah,
  onClose,
  agentName,
  agentPhone,
  agentPhoto,
  agentSlug,
}: Props) {
  const [message, setMessage] = useState(() => getDefaultMessage(jamaah, agentName));
  const [includeKartu, setIncludeKartu] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<CardTemplate>('classic');
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const classicRef = useRef<HTMLDivElement>(null);
  const islamicRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    try {
      document.fonts?.load('500 96px "DM Serif Display"');
      document.fonts?.load('700 110px "Amiri"');
    } catch { /* noop */ }
    trackEvent('feature', 'open_birthday_sheet', { day_offset: jamaah.day_offset });
  }, [jamaah.day_offset]);

  const initials = useMemo(
    () => jamaah.nama.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase(),
    [jamaah.nama],
  );

  const captureCardBlob = async (): Promise<Blob | null> => {
    const target = selectedTemplate === 'classic' ? classicRef.current : islamicRef.current;
    if (!target) return null;
    try {
      try { await document.fonts?.ready; } catch { /* noop */ }
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(target, { scale: 1 });
      // JPEG quality 0.9 — file size ~10-15% of PNG, no transparency needed
      // (cards have solid backgrounds), still high visual quality for sharing.
      return await result.toBlob({ type: 'jpeg', quality: 0.9 });
    } catch (e) {
      console.error('[BirthdaySheet] snapdom error:', e);
      return null;
    }
  };

  const handleDownload = async () => {
    if (isExporting) return;
    if (!includeKartu) {
      try {
        await navigator.clipboard.writeText(message);
        showToast('Pesan disalin ke clipboard');
      } catch {
        showToast('Gagal menyalin pesan');
      }
      return;
    }
    setIsExporting(true);
    try {
      const blob = await captureCardBlob();
      if (!blob) {
        showToast('Gagal generate kartu, coba lagi');
        return;
      }
      downloadBlob(blob, cardFileName(jamaah, selectedTemplate));
      showToast('Berhasil download');
      trackEvent('action', 'birthday_download', { template: selectedTemplate });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSend = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      trackEvent('action', 'birthday_send', {
        template: selectedTemplate,
        has_kartu: includeKartu,
        day_offset: jamaah.day_offset,
      });

      const phone = normalizeWaNumber(jamaah.wa);
      if (!phone) {
        showToast('Nomor WA jamaah tidak valid');
        return;
      }

      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      const preparedWaWindow = includeKartu ? openPreparedWindow() : null;

      // WhatsApp deep links cannot prefill media attachments. Download the card
      // first, then open the jamaah chat with the message pre-filled.
      if (includeKartu) {
        const blob = await captureCardBlob();
        if (blob) {
          downloadBlob(blob, cardFileName(jamaah, selectedTemplate));
          showToast('Kartu didownload — attach ke chat');
        } else {
          showToast('Gagal generate kartu, lanjut buka WA');
        }
      }

      openWhatsAppUrl(waUrl, preparedWaWindow);
    } finally {
      setIsExporting(false);
    }
  };

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 max-h-[85vh] overflow-y-auto shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        <div className="flex items-start gap-3 px-4 pt-2 pb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
            jamaah.jk === 'P'
              ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          }`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-gray-900 dark:text-white truncate">
              {jamaah.salutation} {jamaah.nama}
            </div>
            <div className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">
              {dayLabel(jamaah.day_offset)} · {jamaah.age} tahun
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
              Pesan WhatsApp · bisa diedit
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={10}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all resize-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setIncludeKartu(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm active:bg-gray-50 dark:active:bg-slate-700/40 transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                Sertakan kartu ucapan
              </div>
              <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                Dikirim sebagai gambar
              </div>
            </div>
            <div
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                includeKartu ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={includeKartu}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
                  includeKartu ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </div>
          </button>

          {includeKartu && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
                Pilih Template Kartu
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['classic', 'islamic'] as CardTemplate[]).map(tpl => {
                  const selected = selectedTemplate === tpl;
                  return (
                    <button
                      key={tpl}
                      onClick={() => setSelectedTemplate(tpl)}
                      className={`relative aspect-square rounded-xl border-2 overflow-hidden cursor-pointer transition-all active:scale-[0.98] ${
                        selected
                          ? 'border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-100 dark:ring-emerald-900/40'
                          : 'border-gray-200 dark:border-slate-700'
                      }`}
                      aria-label={`Template ${TEMPLATE_LABELS[tpl]}`}
                    >
                      <ThumbBox
                        jamaah={jamaah}
                        template={tpl}
                        agentName={agentName}
                        agentSlug={agentSlug}
                        agentPhoto={agentPhoto}
                        agentPhone={agentPhone}
                      />
                      <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold bg-black/40 text-white px-1.5 py-0.5 rounded">
                        {TEMPLATE_LABELS[tpl]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-slate-700/50">
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="px-4 py-3 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl disabled:opacity-50 active:scale-95 transition-all duration-200 flex items-center justify-center"
              aria-label={includeKartu ? 'Download kartu' : 'Salin pesan'}
            >
              <Download size={16} strokeWidth={2.5} />
            </button>
            <button
              onClick={handleSend}
              disabled={isExporting}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 rounded-xl text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95"
            >
              <WhatsAppIcon size={16} />
              {isExporting ? 'Memproses...' : 'Kirim Ucapan'}
            </button>
          </div>
        </div>

        <div
          style={{ position: 'fixed', top: '-99999px', left: 0, pointerEvents: 'none' }}
          aria-hidden
        >
          <div ref={classicRef}>
            <BirthdayCard template="classic" jamaah={jamaah} agentName={agentName} agentSlug={agentSlug} agentPhoto={agentPhoto} agentPhone={agentPhone} />
          </div>
          <div ref={islamicRef}>
            <BirthdayCard template="islamic" jamaah={jamaah} agentName={agentName} agentSlug={agentSlug} agentPhoto={agentPhoto} agentPhone={agentPhone} />
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
            {toast}
          </div>
        )}
      </motion.div>
    </>,
    document.body,
  );
}

function ThumbBox({
  jamaah,
  template,
  agentName,
  agentSlug,
  agentPhoto,
  agentPhone,
}: {
  jamaah: Birthday;
  template: CardTemplate;
  agentName: string;
  agentSlug: string;
  agentPhoto?: string;
  agentPhone?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(160);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="absolute inset-0">
      <BirthdayCardThumb
        template={template}
        jamaah={jamaah}
        agentName={agentName}
        agentSlug={agentSlug}
        agentPhoto={agentPhoto}
        agentPhone={agentPhone}
        width={width}
      />
    </div>
  );
}
