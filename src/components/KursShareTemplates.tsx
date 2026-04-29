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
      padding: '64px 80px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Subtle dot pattern overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px',
        pointerEvents: 'none',
      }} />

      {/* Soft radial highlight top-right */}
      <div style={{
        position: 'absolute',
        top: -200,
        right: -200,
        width: 700,
        height: 700,
        background: 'radial-gradient(circle, rgba(110,231,183,0.18) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* TOP ROW: Title + Logo */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        zIndex: 1,
      }}>
        <div>
          <h1 style={{
            fontSize: 80,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: -2,
            lineHeight: 1,
            margin: 0,
          }}>
            Kurs Hari Ini
          </h1>
          <div style={{
            fontSize: 22,
            color: '#6EE7B7',
            fontWeight: 600,
            letterSpacing: 4,
            marginTop: 14,
            textTransform: 'uppercase',
          }}>
            Bank Mandiri · Update Harian
          </div>
        </div>
        <img
          src="/logo-alhijaz-besar.svg"
          alt="Alhijaz"
          style={{
            height: 180,
            width: 'auto',
            filter: 'brightness(0) invert(1)',
            flexShrink: 0,
          }}
        />
      </div>

      {/* MIDDLE — Rate card centered */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(110,231,183,0.25)',
          borderRadius: 32,
          padding: '48px 80px',
          display: 'flex',
          alignItems: 'center',
          gap: 56,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}>
          <FlagUS size={140} />
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 64, fontWeight: 800, color: '#fff', letterSpacing: 4 }}>USD</span>
              <span style={{ fontSize: 24, color: '#A7F3D0', fontWeight: 500, letterSpacing: 1 }}>US Dollar</span>
            </div>
            <div style={{
              fontSize: 200,
              fontWeight: 900,
              color: '#fff',
              lineHeight: 0.92,
              letterSpacing: -6,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              {formatKurs(kurs.usd)}
            </div>
            <div style={{ fontSize: 24, color: '#6EE7B7', fontWeight: 500, marginTop: 8, letterSpacing: 1 }}>
              terhadap Rupiah
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Agent (left) + Date pill (right) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 32,
        borderTop: '1px solid rgba(110,231,183,0.25)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Agent — bottom left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <img
            src={photo}
            alt=""
            style={{
              width: 110,
              height: 110,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '4px solid #6EE7B7',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <strong style={{ fontSize: 40, color: '#fff', fontWeight: 800, letterSpacing: -0.5 }}>
              {agent.name}
            </strong>
            <span style={{ fontSize: 24, color: '#6EE7B7', fontWeight: 500, marginTop: 6 }}>
              wa.me/{wa}
            </span>
          </div>
        </div>

        {/* Date pill — bottom right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(110,231,183,0.30)',
          borderRadius: 100,
          padding: '16px 28px',
        }}>
          <span style={{ fontSize: 28 }}>📅</span>
          <span style={{ fontSize: 26, color: '#fff', fontWeight: 600 }}>
            {kurs.updatedAt}
          </span>
        </div>
      </div>
    </div>
  );
}
