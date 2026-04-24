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
// T2 — Islamic
// ═══════════════════════════════════════════════════════════════

// Arabic geometric pattern sebagai data URL
const ISLAMIC_PATTERN = `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1' opacity='0.15'%3E%3Cpath d='M40 0L80 40L40 80L0 40Z'/%3E%3Cpath d='M40 12L68 40L40 68L12 40Z'/%3E%3Cpath d='M40 24L56 40L40 56L24 40Z'/%3E%3C/g%3E%3C/svg%3E")`;

function Islamic({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const web = `${agent.slug || 'agent'}.alhijaz.co`;

  return (
    <CanvasFrame background="linear-gradient(135deg, #047857 0%, #022C22 100%)">
      {/* Pattern overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: ISLAMIC_PATTERN, backgroundRepeat: 'repeat', opacity: 0.5 }} />

      {/* Logo pill top-right */}
      <div style={{ position: 'absolute', top: 48, right: 48, background: '#FFFFFF', borderRadius: 14, padding: '10px 18px', display: 'flex', alignItems: 'center' }}>
        <img src="/logo-alhijaz-besar.svg" style={{ height: 36 }} alt="Alhijaz" />
      </div>

      {/* Header */}
      <div style={{ padding: '96px 64px 0 64px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: '"Amiri", serif', fontSize: 40, color: '#A7F3D0', lineHeight: 1.2 }}>
          بسم الله الرحمن الرحيم
        </div>
        <div style={{ fontSize: 22, color: '#FFFFFF', letterSpacing: '0.3em', fontWeight: 700, marginTop: 36, textTransform: 'uppercase' }}>
          Kurs Bank Mandiri
        </div>
        <div style={{ fontSize: 16, color: '#A7F3D0', marginTop: 8 }}>{kurs.updatedAt}</div>
      </div>

      {/* Rate cards */}
      <div style={{ padding: '56px 64px', display: 'flex', gap: 24, marginTop: 12, position: 'relative', zIndex: 1 }}>
        <RateCardGlass flag="🇺🇸" label="USD" rate={kurs.usd} />
        <RateCardGlass flag="🇸🇦" label="SAR" rate={kurs.sar} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px 64px', display: 'flex', alignItems: 'center', gap: 24, zIndex: 1 }}>
        <img src={photo} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '3px solid #6EE7B7' }} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>{agent.name}</div>
          <div style={{ fontSize: 18, color: '#A7F3D0', marginTop: 6 }}>wa.me/{wa}</div>
          <div style={{ fontSize: 18, color: '#6EE7B7', marginTop: 2 }}>{web}</div>
        </div>
      </div>
    </CanvasFrame>
  );
}

function RateCardGlass({ flag, label, rate }: { flag: string; label: string; rate: number }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 24, padding: 40, backdropFilter: 'blur(4px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <span style={{ fontSize: 64, lineHeight: 1 }}>{flag}</span>
        <span style={{ fontSize: 26, fontWeight: 600, color: '#A7F3D0', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 88, fontWeight: 800, color: '#FFFFFF', fontFamily: '"SF Mono", Menlo, monospace', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {formatKurs(rate)}
      </div>
      <div style={{ fontSize: 20, color: '#6EE7B7', marginTop: 12 }}>Rupiah</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// T3 — Bold
// ═══════════════════════════════════════════════════════════════

function Bold({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const web = `${agent.slug || 'agent'}.alhijaz.co`;

  return (
    <CanvasFrame background="#0F172A">
      {/* Header */}
      <div style={{ padding: '64px 64px 0 64px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, color: '#34D399', letterSpacing: '0.3em', fontWeight: 700, textTransform: 'uppercase' }}>
            Kurs Bank Mandiri
          </div>
          <div style={{ fontSize: 14, color: '#64748B', marginTop: 8, letterSpacing: '0.1em' }}>{kurs.updatedAt}</div>
        </div>
        <div style={{ background: '#FFFFFF', borderRadius: 12, padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
          <img src="/logo-alhijaz-besar.svg" style={{ height: 32 }} alt="Alhijaz" />
        </div>
      </div>

      {/* Stacked rates */}
      <div style={{ padding: '48px 64px 0 64px' }}>
        <BoldRate label="USD" rate={kurs.usd} />
        <div style={{ height: 1, background: '#1E293B', margin: '32px 0' }} />
        <BoldRate label="SAR" rate={kurs.sar} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderTop: '1px solid #10B981', padding: '36px 64px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <img src={photo} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #10B981' }} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>{agent.name}</div>
          <div style={{ fontSize: 16, color: '#94A3B8', marginTop: 4 }}>wa.me/{wa} · {web}</div>
        </div>
      </div>
    </CanvasFrame>
  );
}

function BoldRate({ label, rate }: { label: string; rate: number }) {
  return (
    <div>
      <div style={{ fontSize: 20, color: '#94A3B8', letterSpacing: '0.2em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 128, fontWeight: 800, color: '#FFFFFF', fontFamily: '"SF Mono", Menlo, monospace', lineHeight: 1, letterSpacing: '-0.03em', marginTop: 8 }}>
        {formatKurs(rate)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// T4 — Premium
// ═══════════════════════════════════════════════════════════════

const GOLD = '#C9A961';

function Premium({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const web = `${agent.slug || 'agent'}.alhijaz.co`;

  return (
    <CanvasFrame background="#FDF8F0">
      {/* Gold frame */}
      <div style={{ position: 'absolute', top: 32, left: 32, right: 32, bottom: 32, border: `3px solid ${GOLD}`, borderRadius: 4, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ padding: '80px 80px 0 80px', textAlign: 'center' }}>
        <img src="/logo-alhijaz-besar.svg" style={{ height: 64, margin: '0 auto' }} alt="Alhijaz" />
        <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 30, color: GOLD, letterSpacing: '0.15em', marginTop: 32, textTransform: 'uppercase' }}>
          Kurs Bank Mandiri
        </div>
        <div style={{ height: 1, background: GOLD, maxWidth: 200, margin: '20px auto' }} />
        <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, color: '#475569', fontStyle: 'italic' }}>{kurs.updatedAt}</div>
      </div>

      {/* Rate row */}
      <div style={{ padding: '64px 80px', display: 'flex', alignItems: 'stretch', marginTop: 24 }}>
        <PremiumRate label="USD" rate={kurs.usd} />
        <div style={{ width: 1, background: GOLD, margin: '0 32px' }} />
        <PremiumRate label="SAR" rate={kurs.sar} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 60, left: 80, right: 80, display: 'flex', alignItems: 'center', gap: 24 }}>
        <img src={photo} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `3px solid ${GOLD}`, boxShadow: `0 0 0 2px #FDF8F0, 0 0 0 4px ${GOLD}` }} alt="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 26, color: '#0F172A', lineHeight: 1.2 }}>{agent.name}</div>
          <div style={{ fontSize: 16, color: '#64748B', marginTop: 4 }}>wa.me/{wa}</div>
          <div style={{ fontSize: 16, color: GOLD, marginTop: 2 }}>{web}</div>
        </div>
      </div>
    </CanvasFrame>
  );
}

function PremiumRate({ label, rate }: { label: string; rate: number }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 26, color: GOLD, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 104, color: '#0F172A', lineHeight: 1, marginTop: 16, letterSpacing: '-0.02em' }}>
        {formatKurs(rate)}
      </div>
      <div style={{ fontSize: 16, color: '#94A3B8', marginTop: 8, letterSpacing: '0.1em' }}>RUPIAH</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

export const KURS_TEMPLATES: Array<{
  id: KursTemplateId;
  name: string;
  Renderer: React.FC<KursTemplateProps>;
}> = [
  { id: 'minimalist', name: 'Minimalist', Renderer: Minimalist },
  { id: 'islamic', name: 'Islamic', Renderer: Islamic },
  { id: 'bold', name: 'Bold', Renderer: Bold },
  { id: 'premium', name: 'Premium', Renderer: Premium },
];
