import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';

export interface CatalogLoadingModalProps {
  /** Whether the modal is shown at all. */
  open: boolean;
  status: 'loading' | 'success' | 'error';
  /** Human step label, e.g. "Menyusun sampul…" / "Menyiapkan Juni 2026…". */
  stageLabel: string;
  done: number;
  total: number;
  /** Error detail (status === 'error'). */
  message?: string;
  onClose: () => void;
}

const GOLD = '#E8C36B';
const GOLD_DEEP = '#C98A2C';

/**
 * Loading overlay for the "Unduh Katalog (PDF)" flow — concept "Dokumen terisi":
 * a PDF page icon that fills from the bottom as real per-page progress advances,
 * with a per-step label. Rendered as a portal modal so it never shifts the page
 * layout. This is live on-screen UI (NOT part of the captured PDF), so normal CSS
 * effects (blur, gradients, animation) are fine here.
 */
export function CatalogLoadingModal({ open, status, stageLabel, done, total, message, onClose }: CatalogLoadingModalProps) {
  if (!open) return null;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Membuat katalog PDF"
      onClick={status === 'error' ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'rgba(8,2,5,0.62)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <style>{`
        @keyframes catShimmer { 0%{transform:translateX(-130%)} 100%{transform:translateX(130%)} }
        @keyframes catFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes catPop { 0%{transform:scale(0.6);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 320, borderRadius: 22, padding: '30px 26px 26px',
          background: 'linear-gradient(180deg, #2a0510 0%, #16040a 100%)',
          border: `1px solid ${GOLD_DEEP}55`, boxShadow: '0 24px 60px -12px rgba(0,0,0,0.7)',
          textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          {status === 'success' ? (
            <div style={{
              width: 86, height: 86, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(180deg, #FCEFC0, ${GOLD} 50%, ${GOLD_DEEP})`, color: '#1a0205', animation: 'catPop 0.4s ease',
            }}>
              <Check size={44} strokeWidth={3.5} />
            </div>
          ) : status === 'error' ? (
            <div style={{
              width: 86, height: 86, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(239,68,68,0.15)', border: '2px solid #ef4444', color: '#fca5a5',
            }}>
              <X size={44} strokeWidth={3} />
            </div>
          ) : (
            <div style={{ position: 'relative', width: 76, height: 96, animation: 'catFloat 2.4s ease-in-out infinite' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 10, border: `2.5px solid ${GOLD}`, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ position: 'absolute', left: 12, right: 12, top: 16, height: 3, borderRadius: 2, background: `${GOLD}40` }} />
                <div style={{ position: 'absolute', left: 12, right: 22, top: 26, height: 3, borderRadius: 2, background: `${GOLD}40` }} />
                <div style={{ position: 'absolute', left: 12, right: 16, top: 36, height: 3, borderRadius: 2, background: `${GOLD}40` }} />
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pct}%`, overflow: 'hidden',
                  background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DEEP})`, transition: 'height 0.45s cubic-bezier(.6,0,.4,1)',
                }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.5) 50%, transparent 80%)', animation: 'catShimmer 1.2s linear infinite' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>
          {status === 'success' ? 'Katalog Siap!' : status === 'error' ? 'Gagal Membuat Katalog' : 'Membuat Katalog'}
        </div>
        <div style={{ marginTop: 7, fontSize: 12.5, color: status === 'error' ? '#fca5a5' : '#e8d6a8', minHeight: 17, lineHeight: 1.4 }}>
          {status === 'success' ? 'PDF berhasil diunduh' : status === 'error' ? (message || 'Terjadi kesalahan') : stageLabel}
        </div>

        {status === 'loading' && (
          <>
            <div style={{ marginTop: 16, height: 6, borderRadius: 99, background: 'rgba(232,195,107,0.18)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD})`, transition: 'width 0.45s cubic-bezier(.6,0,.4,1)' }} />
            </div>
            <div style={{ marginTop: 9, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: '#b99a5e' }}>
              {done}/{total} halaman · {pct}%
            </div>
          </>
        )}

        {status === 'error' && (
          <button
            type="button"
            onClick={onClose}
            style={{
              marginTop: 18, width: '100%', padding: '11px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: `linear-gradient(180deg, #FCEFC0, ${GOLD} 50%, ${GOLD_DEEP})`, color: '#1a0205', fontWeight: 800, fontSize: 13,
            }}
          >
            Tutup
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default CatalogLoadingModal;
