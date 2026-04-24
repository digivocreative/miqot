import type React from 'react';

export interface KursTemplateProps {
  kurs: { usd: number; sar: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string };
}

export type KursTemplateId = 'minimalist' | 'islamic' | 'bold' | 'premium';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function formatKurs(rate: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rate);
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}

function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=192`;
}

// Canvas wrapper — semua template pakai ini agar ukuran 1080×1080 konsisten
function CanvasFrame({ background, children }: { background: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 1080,
      height: 1080,
      background,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// T1 — Minimalist
// ═══════════════════════════════════════════════════════════════

function Minimalist({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const web = `${agent.slug || 'agent'}.alhijaz.co`;

  return (
    <CanvasFrame background="#FFFFFF">
      {/* Header */}
      <div style={{ padding: '64px 64px 0 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src="/logo-alhijaz-besar.svg" style={{ height: 56 }} alt="Alhijaz" />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#059669', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Kurs Bank Mandiri
          </div>
          <div style={{ fontSize: 16, color: '#6B7280', marginTop: 6 }}>{kurs.updatedAt}</div>
        </div>
      </div>

      {/* Body — 2 rate cards */}
      <div style={{ padding: '48px 64px', display: 'flex', gap: 24, marginTop: 64 }}>
        <RateCardLight flag="🇺🇸" label="USD" rate={kurs.usd} />
        <RateCardLight flag="🇸🇦" label="SAR" rate={kurs.sar} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderTop: '2px solid #10B981', padding: '40px 64px', display: 'flex', alignItems: 'center', gap: 24, background: '#FFFFFF' }}>
        <img src={photo} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '3px solid #ECFDF5' }} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{agent.name}</div>
          <div style={{ fontSize: 18, color: '#4B5563', marginTop: 6 }}>wa.me/{wa}</div>
          <div style={{ fontSize: 18, color: '#059669', marginTop: 2 }}>{web}</div>
        </div>
      </div>
    </CanvasFrame>
  );
}

function RateCardLight({ flag, label, rate }: { flag: string; label: string; rate: number }) {
  return (
    <div style={{ flex: 1, background: '#F9FAFB', borderRadius: 24, padding: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <span style={{ fontSize: 64, lineHeight: 1 }}>{flag}</span>
        <span style={{ fontSize: 26, fontWeight: 600, color: '#6B7280', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 88, fontWeight: 800, color: '#111827', fontFamily: '"SF Mono", Menlo, monospace', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {formatKurs(rate)}
      </div>
      <div style={{ fontSize: 20, color: '#9CA3AF', marginTop: 12 }}>Rupiah</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Registry (stub — template lain ditambah di Task 5)
// ═══════════════════════════════════════════════════════════════

export const KURS_TEMPLATES: Array<{
  id: KursTemplateId;
  name: string;
  Renderer: React.FC<KursTemplateProps>;
}> = [
  { id: 'minimalist', name: 'Minimalist', Renderer: Minimalist },
];
