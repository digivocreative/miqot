import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Check, Copy, Loader2, Phone, Send, Ticket, X } from 'lucide-react';
import { portalJamaahAdmin, type PortalMagicLinkResponse } from '../../../lib/portalJamaahAdmin';
import { trackEvent } from '../../../utils/analytics';
import { normalizeWaNumber } from '../../../utils/phone';

interface Props {
  jamaahId: number;
  jamaahName: string;
  jamaahWa: string | null;
  idUmroh: string;
  agentSlug: string;
  agentName: string;
  onClose: () => void;
}

function buildDefaultMessage(data: PortalMagicLinkResponse, jamaahName: string, agentName: string) {
  return `Assalamualaikum ${jamaahName} 🤲

Berikut link akses Portal Jamaah untuk booking Anda di ${agentName}:

${data.url}

Di portal ini Anda bisa:
✅ Cek persiapan dokumen & perlengkapan
✅ Pantau pembayaran
✅ Lihat info perjalanan & itinerary
✅ Checklist persiapan H-30, H-7, H-1

Link berlaku 30 hari & hanya untuk satu kali pakai.
Jika ada pertanyaan, langsung balas pesan ini ya 🙏`;
}

export default function MagicLinkModal({
  jamaahId,
  jamaahName,
  jamaahWa,
  idUmroh,
  agentSlug,
  agentName,
  onClose,
}: Props) {
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [generated, setGenerated] = useState<PortalMagicLinkResponse | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);

  const waNumber = useMemo(() => normalizeWaNumber(jamaahWa), [jamaahWa]);

  async function generate() {
    try {
      setState('loading');
      setError('');
      setRetryAfter(0);
      const data = await portalJamaahAdmin.generateMagicLink(agentSlug, jamaahId);
      setGenerated(data);
      setMessage(buildDefaultMessage(data, jamaahName, agentName));
      setState('success');
      trackEvent('feature', 'portal_magic_link_generated', {
        jamaah_id: jamaahId,
        id_umroh: data.id_umroh || idUmroh,
      });
    } catch (err) {
      const retrySeconds = Number((err as { retry_after?: number })?.retry_after || 0);
      setRetryAfter(retrySeconds);
      setError(err instanceof Error ? err.message : 'Gagal membuat link');
      setState('error');
    }
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSlug, jamaahId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function copyToClipboard(text: string, kind: 'link' | 'message') {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  }

  function handleSendWhatsApp() {
    if (!waNumber) return;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.div
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] rounded-2xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700/50">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Akses Portal Jamaah</h2>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Link ini aktif 30 hari dan hanya bisa dipakai sekali.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100/80 dark:bg-slate-700/80 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {state === 'loading' && (
          <div className="flex-1 p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-4">Membuat link akses...</p>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Sedang memverifikasi jamaah dan booking.</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex-1 p-4">
            <div className="rounded-2xl border border-red-100 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-4 text-center">
              <AlertCircle className="w-9 h-9 mx-auto text-red-600 dark:text-red-400" />
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mt-3">Gagal membuat link</p>
              <p className="text-xs text-red-600 dark:text-red-300 mt-1 leading-relaxed">{error}</p>
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={retryAfter > 0}
              className="w-full mt-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:hover:bg-emerald-500 disabled:active:scale-100"
            >
              {retryAfter > 0 ? `Tunggu ${Math.ceil(retryAfter / 60)} menit` : 'Coba Lagi'}
            </button>
          </div>
        )}

        {state === 'success' && generated && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/40 p-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500">Jamaah</p>
                  <p className="text-sm font-bold leading-snug text-gray-900 dark:text-slate-100 break-words mt-1">{jamaahName}</p>
                  <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-slate-500" strokeWidth={2.2} />
                      <span className="truncate">{waNumber || jamaahWa || 'Nomor WA belum ada'}</span>
                    </span>
                    <span className="w-1 h-1 shrink-0 rounded-full bg-gray-300 dark:bg-slate-600" />
                    <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-gray-600 dark:text-slate-300">
                      <Ticket className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-slate-500" strokeWidth={2.2} />
                      <span>{generated.id_umroh || idUmroh}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500">Magic Link Jamaah</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generated.url, 'link')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                  >
                    {copied === 'link' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'link' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="w-full rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-3 py-2 overflow-hidden">
                  <p className="text-xs text-gray-700 dark:text-slate-200 truncate">{generated.url}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/40 p-3">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500 mb-2">Pesan WhatsApp</p>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={7}
                  className="w-full h-40 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-3 py-2 text-xs leading-relaxed text-gray-700 dark:text-slate-200 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 resize-none"
                />
              </div>

              {!waNumber && (
                <div className="rounded-xl border border-amber-100 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Nomor WhatsApp belum valid. Agent tetap bisa copy pesan dan kirim manual.
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-100 dark:border-slate-700/50 bg-white dark:bg-slate-800 p-4 space-y-2">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={!waNumber}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:hover:bg-emerald-500 disabled:active:scale-100"
              >
                <Send className="w-4 h-4" />
                Kirim via WhatsApp
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(generated.url, 'link')}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 text-xs font-bold transition-all duration-200 active:scale-95"
                >
                  {copied === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Link
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(message, 'message')}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 text-xs font-bold transition-all duration-200 active:scale-95"
                >
                  {copied === 'message' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Pesan Lengkap
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
