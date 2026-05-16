import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, Send, X } from 'lucide-react';
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

  const waNumber = useMemo(() => normalizeWaNumber(jamaahWa), [jamaahWa]);

  async function generate() {
    try {
      setState('loading');
      setError('');
      const data = await portalJamaahAdmin.generateMagicLink(agentSlug, jamaahId);
      setGenerated(data);
      setMessage(buildDefaultMessage(data, jamaahName, agentName));
      setState('success');
      trackEvent('feature', 'portal_magic_link_generated', {
        jamaah_id: jamaahId,
        id_umroh: data.id_umroh || idUmroh,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat link');
      setState('error');
    }
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSlug, jamaahId]);

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
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-4 border-b border-gray-100 dark:border-slate-700/50">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Kirim Akses Portal</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
              Link ini aktif 30 hari dan hanya bisa dipakai sekali.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-100/80 dark:bg-slate-700/80 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {state === 'loading' && (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-4">Membuat link akses...</p>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Sedang memverifikasi jamaah dan booking.</p>
          </div>
        )}

        {state === 'error' && (
          <div className="p-5">
            <div className="rounded-2xl border border-red-100 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-4 text-center">
              <AlertCircle className="w-9 h-9 mx-auto text-red-600 dark:text-red-400" />
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mt-3">Gagal membuat link</p>
              <p className="text-xs text-red-600 dark:text-red-300 mt-1 leading-relaxed">{error}</p>
            </div>
            <button
              type="button"
              onClick={generate}
              className="w-full mt-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {state === 'success' && generated && (
          <div className="p-4 space-y-3">
            <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/40 p-3">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-slate-500">Jamaah</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{jamaahName}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{waNumber || jamaahWa || 'Nomor WA belum ada'}</p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-[11px] font-bold text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                  {generated.id_umroh || idUmroh}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/40 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-slate-500">Generated URL</p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(generated.url, 'link')}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                >
                  {copied === 'link' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'link' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <input
                readOnly
                value={generated.url}
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-3 py-2 text-xs text-gray-700 dark:text-slate-200 outline-none"
              />
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/40 p-3">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-slate-500 mb-2">Pesan WhatsApp</p>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={10}
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-3 py-2 text-xs leading-relaxed text-gray-700 dark:text-slate-200 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 resize-none"
              />
            </div>

            {!waNumber && (
              <div className="rounded-xl border border-amber-100 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Nomor WhatsApp belum valid. Agent tetap bisa copy pesan dan kirim manual.
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={!waNumber}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500"
              >
                <Send className="w-4 h-4" />
                Kirim via WhatsApp
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(generated.url, 'link')}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 text-xs font-bold transition-colors"
                >
                  {copied === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Link
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(message, 'message')}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 text-xs font-bold transition-colors"
                >
                  {copied === 'message' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Pesan Lengkap
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
