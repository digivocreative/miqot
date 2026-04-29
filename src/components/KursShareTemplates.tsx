import type { ReactNode } from 'react';

export interface KursTemplateProps {
  kurs: { usd: number; sar: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string };
}

export const TEMPLATE_W = 1600;
export const TEMPLATE_H = 1000;

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

// ═══════════════════════════════════════════════════════════════
// Flag SVGs
// ═══════════════════════════════════════════════════════════════

function FlagUS({ size = 32 }: { size?: number }) {
  const w = Math.round(size * 1.4);
  return (
    <svg width={w} height={size} viewBox="0 0 30 21" style={{ borderRadius: 3, boxShadow: '0 2px 6px rgba(0,0,0,0.3)', flexShrink: 0 }}>
      <rect width="30" height="21" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map(y => (
        <rect key={y} x="0" y={y * 1.5} width="30" height="1.62" fill="#B22234" />
      ))}
      <rect width="12" height="11.32" fill="#3C3B6E" />
    </svg>
  );
}

function FlagSA({ size = 32 }: { size?: number }) {
  const w = Math.round(size * 1.4);
  return (
    <svg width={w} height={size} viewBox="0 0 30 21" style={{ borderRadius: 3, boxShadow: '0 2px 6px rgba(0,0,0,0.3)', flexShrink: 0 }}>
      <rect width="30" height="21" fill="#006C35" />
    </svg>
  );
}

function FlagID({ size = 24 }: { size?: number }) {
  const w = Math.round(size * 1.5);
  return (
    <svg width={w} height={size} viewBox="0 0 30 20" style={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.3)', flexShrink: 0, verticalAlign: 'middle' }}>
      <rect width="30" height="10" fill="#E70011" />
      <rect y="10" width="30" height="10" fill="#fff" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

function RateBlock({ flag, label, rate, sub }: { flag: ReactNode; label: string; rate: number; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 8 }}>
        {flag}
        <span style={{ fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: 2 }}>{label}</span>
      </div>
      <div style={{
        fontSize: 180,
        fontWeight: 900,
        color: '#fff',
        lineHeight: 0.92,
        letterSpacing: -4,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {formatKurs(rate)}
      </div>
      <div style={{ fontSize: 26, color: '#6EE7B7', fontWeight: 500, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Template — Cuaca-style hero card (16:10)
// ═══════════════════════════════════════════════════════════════

export function KursTemplate({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);

  return (
    <div style={{
      width: TEMPLATE_W,
      height: TEMPLATE_H,
      background: 'linear-gradient(135deg, #064e3b 0%, #0F6E56 50%, #065f46 100%)',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '72px 88px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Decorative emoji top-right */}
      <div style={{
        position: 'absolute',
        right: 56,
        top: 16,
        fontSize: 520,
        opacity: 0.10,
        lineHeight: 1,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        💱
      </div>

      {/* Top label */}
      <div style={{
        fontSize: 30,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: 7,
        color: '#6EE7B7',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        position: 'relative',
        zIndex: 1,
      }}>
        <span>HARI INI</span>
        <span style={{ color: 'rgba(110,231,183,0.5)' }}>·</span>
        <FlagID size={32} />
        <span>KURS BANK MANDIRI</span>
      </div>

      {/* Hero rates */}
      <div style={{
        display: 'flex',
        gap: 96,
        marginTop: 40,
        alignItems: 'flex-end',
        position: 'relative',
        zIndex: 1,
      }}>
        <RateBlock flag={<FlagUS size={64} />} label="USD" rate={kurs.usd} sub="US Dollar · Rupiah" />
        <RateBlock flag={<FlagSA size={64} />} label="SAR" rate={kurs.sar} sub="Saudi Riyal · Rupiah" />
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom row: date + agent */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '28px 56px',
        alignItems: 'center',
        paddingTop: 36,
        borderTop: '1px solid rgba(110,231,183,0.25)',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          fontSize: 26,
          color: '#6EE7B7',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 28 }}>📅</span>
          <strong style={{ color: '#fff', fontWeight: 700 }}>{kurs.updatedAt}</strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img
            src={photo}
            alt=""
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid #6EE7B7',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <strong style={{ fontSize: 30, color: '#fff', fontWeight: 700 }}>{agent.name}</strong>
            <span style={{ fontSize: 22, color: '#6EE7B7', fontWeight: 500, marginTop: 4 }}>
              📞 wa.me/{wa}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
