export interface KursTemplateProps {
  kurs: { usd: number; updatedAt: string };
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
// Flag SVG (US only — single-rate template)
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

// ═══════════════════════════════════════════════════════════════
// Template — Hero USD (16:10)
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
      {/* Top row: Title (left) + Logo (right) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        position: 'relative',
        zIndex: 1,
      }}>
        <h1 style={{
          fontSize: 96,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: -2,
          lineHeight: 1,
          margin: 0,
        }}>
          Kurs Hari Ini
        </h1>
        <img
          src="/logo-alhijaz-besar.svg"
          alt="Alhijaz"
          style={{
            height: 140,
            width: 'auto',
            filter: 'brightness(0) invert(1)',
            flexShrink: 0,
          }}
        />
      </div>

      {/* USD hero (only) */}
      <div style={{ marginTop: 56, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 12 }}>
          <FlagUS size={88} />
          <span style={{ fontSize: 56, fontWeight: 700, color: '#fff', letterSpacing: 3 }}>USD</span>
        </div>
        <div style={{
          fontSize: 280,
          fontWeight: 900,
          color: '#fff',
          lineHeight: 0.9,
          letterSpacing: -8,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          {formatKurs(kurs.usd)}
        </div>
        <div style={{ fontSize: 32, color: '#6EE7B7', fontWeight: 500, marginTop: 8 }}>
          US Dollar · Rupiah
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom row: Agent (left) + Date (right) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 36,
        borderTop: '1px solid rgba(110,231,183,0.25)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Agent — bottom left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img
            src={photo}
            alt=""
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid #6EE7B7',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <strong style={{ fontSize: 36, color: '#fff', fontWeight: 700 }}>{agent.name}</strong>
            <span style={{ fontSize: 24, color: '#6EE7B7', fontWeight: 500, marginTop: 4 }}>
              wa.me/{wa}
            </span>
          </div>
        </div>

        {/* Date — bottom right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 28,
          color: '#fff',
          fontWeight: 600,
        }}>
          <span style={{ fontSize: 32 }}>📅</span>
          <span>{kurs.updatedAt}</span>
        </div>
      </div>
    </div>
  );
}
