// ⚠️  DUAL TEMPLATE: when changing visuals here, mirror the same change in
// `lib/kurs-image-generator.mjs` (server-side renderer used for Telegram broadcast).

export interface KursTemplateProps {
  kurs: { usd: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string; website?: string };
}

export const TEMPLATE_W = 1400;
export const TEMPLATE_H = 1000;

export const KURS_FONT_STACK = "'Inter', 'Inter var', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

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

function cleanWebsite(website: string): string {
  return website
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '');
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

function CalendarIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="#F8DFA1" strokeWidth="1.8" />
      <path d="M7.5 3.5V7.2M16.5 3.5V7.2M4 9.2H20" stroke="#F8DFA1" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13H10M12 13H14M16 13H18M8 16H10M12 16H14" stroke="#D1FAE5" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function VerifiedCheck({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r="17" fill="#1D9BF0" stroke="#FFFFFF" strokeWidth="5" />
      <path d="M12.8 20.7L17.4 25.3L27.9 14.8" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GeometricPattern() {
  return (
    <svg
      width={TEMPLATE_W}
      height={TEMPLATE_H}
      viewBox={`0 0 ${TEMPLATE_W} ${TEMPLATE_H}`}
      style={{
        position: 'absolute',
        inset: 0,
        opacity: 1,
        zIndex: 0,
      }}
    >
      <g opacity="0.06" stroke="#D1FAE5" strokeWidth="1.1">
        <path d="M80 190H1320M80 350H1320M80 510H1320M80 670H1320" />
        <path d="M180 110L20 270M360 110L200 270M540 110L380 270M720 110L560 270M900 110L740 270M1080 110L920 270M1260 110L1100 270M1440 110L1280 270" />
      </g>

      <g transform="translate(1015 482)" opacity="0.19" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 -260C62 -192 62 -88 0 -18C-62 -88 -62 -192 0 -260Z" stroke="#F8DFA1" strokeWidth="4" />
        <path d="M0 260C62 192 62 88 0 18C-62 88 -62 192 0 260Z" stroke="#F8DFA1" strokeWidth="4" />
        <path d="M-260 0C-192 -62 -88 -62 -18 0C-88 62 -192 62 -260 0Z" stroke="#F8DFA1" strokeWidth="4" />
        <path d="M260 0C192 -62 88 -62 18 0C88 62 192 62 260 0Z" stroke="#F8DFA1" strokeWidth="4" />

        <path d="M-184 -184C-92 -180 -28 -108 -18 -18C-108 -28 -180 -92 -184 -184Z" stroke="#D1FAE5" strokeWidth="3" />
        <path d="M184 -184C180 -92 108 -28 18 -18C28 -108 92 -180 184 -184Z" stroke="#D1FAE5" strokeWidth="3" />
        <path d="M184 184C92 180 28 108 18 18C108 28 180 92 184 184Z" stroke="#D1FAE5" strokeWidth="3" />
        <path d="M-184 184C-180 92 -108 28 -18 18C-28 108 -92 180 -184 184Z" stroke="#D1FAE5" strokeWidth="3" />

        <path d="M0 -18C38 -62 38 -122 0 -166C-38 -122 -38 -62 0 -18Z" stroke="#D1FAE5" strokeWidth="2.2" opacity="0.85" />
        <path d="M0 18C38 62 38 122 0 166C-38 122 -38 62 0 18Z" stroke="#D1FAE5" strokeWidth="2.2" opacity="0.85" />
        <path d="M-18 0C-62 -38 -122 -38 -166 0C-122 38 -62 38 -18 0Z" stroke="#D1FAE5" strokeWidth="2.2" opacity="0.85" />
        <path d="M18 0C62 -38 122 -38 166 0C122 38 62 38 18 0Z" stroke="#D1FAE5" strokeWidth="2.2" opacity="0.85" />

        <path d="M-130 -42C-76 -86 -30 -84 0 0C30 -84 76 -86 130 -42" stroke="#F8DFA1" strokeWidth="2.4" opacity="0.85" />
        <path d="M-130 42C-76 86 -30 84 0 0C30 84 76 86 130 42" stroke="#F8DFA1" strokeWidth="2.4" opacity="0.85" />
        <path d="M-42 -130C-86 -76 -84 -30 0 0C-84 30 -86 76 -42 130" stroke="#F8DFA1" strokeWidth="2.4" opacity="0.85" />
        <path d="M42 -130C86 -76 84 -30 0 0C84 30 86 76 42 130" stroke="#F8DFA1" strokeWidth="2.4" opacity="0.85" />

        <circle cx="0" cy="0" r="34" stroke="#F8DFA1" strokeWidth="3" />
        <circle cx="0" cy="0" r="12" stroke="#D1FAE5" strokeWidth="2" />
      </g>

      <g transform="translate(1220 265) scale(0.58)" opacity="0.12" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 -180C44 -132 44 -60 0 -12C-44 -60 -44 -132 0 -180Z" stroke="#F8DFA1" strokeWidth="4" />
        <path d="M0 180C44 132 44 60 0 12C-44 60 -44 132 0 180Z" stroke="#F8DFA1" strokeWidth="4" />
        <path d="M-180 0C-132 -44 -60 -44 -12 0C-60 44 -132 44 -180 0Z" stroke="#F8DFA1" strokeWidth="4" />
        <path d="M180 0C132 -44 60 -44 12 0C60 44 132 44 180 0Z" stroke="#F8DFA1" strokeWidth="4" />
        <path d="M-120 -120C-54 -116 -16 -64 -10 -10C-64 -16 -116 -54 -120 -120Z" stroke="#D1FAE5" strokeWidth="3" />
        <path d="M120 120C54 116 16 64 10 10C64 16 116 54 120 120Z" stroke="#D1FAE5" strokeWidth="3" />
      </g>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// Template — Hero USD (16:10)
// ═══════════════════════════════════════════════════════════════

export function KursTemplate({ kurs, agent }: KursTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const website = agent.website?.trim() ? cleanWebsite(agent.website) : `wa.me/${wa}`;

  return (
    <div style={{
      width: TEMPLATE_W,
      height: TEMPLATE_H,
      background: 'radial-gradient(circle at 76% 34%, rgba(248, 223, 161, 0.14) 0%, rgba(248, 223, 161, 0) 28%), radial-gradient(circle at 20% 72%, rgba(110, 231, 183, 0.16) 0%, rgba(110, 231, 183, 0) 26%), linear-gradient(135deg, #054233 0%, #0F6E56 52%, #064e3b 100%)',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: KURS_FONT_STACK,
      padding: '68px 84px 62px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <GeometricPattern />

      {/* Top row: Title (left) + Logo (right) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: 78,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: -1,
            lineHeight: 1,
            margin: 0,
            whiteSpace: 'nowrap',
          }}>
            Kurs Hari Ini
          </h1>
          <div style={{
            marginTop: 18,
            fontSize: 28,
            color: '#D1FAE5',
            fontWeight: 600,
            letterSpacing: 0,
            whiteSpace: 'nowrap',
          }}>
            Update nilai tukar USD ke Rupiah
          </div>
        </div>
        <div style={{ width: 300, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <img
            src="/logo-alhijaz-besar.svg"
            alt="Alhijaz"
            style={{
              height: 150,
              width: 'auto',
              filter: 'brightness(0) invert(1)',
              opacity: 0.96,
            }}
          />
        </div>
      </div>

      {/* USD hero (only) */}
      <div style={{ marginTop: 74, position: 'relative', zIndex: 2 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 20,
          marginBottom: 30,
          padding: '16px 24px 16px 18px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.14)',
        }}>
          <FlagUS size={62} />
          <span style={{ fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>USD</span>
          <span style={{ width: 1, height: 42, background: 'rgba(255,255,255,0.25)' }} />
          <span style={{ fontSize: 28, fontWeight: 600, color: '#D1FAE5', whiteSpace: 'nowrap' }}>US Dollar</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, whiteSpace: 'nowrap' }}>
          <span style={{
            fontSize: 72,
            fontWeight: 800,
            color: '#F8DFA1',
            lineHeight: 1,
          }}>
            Rp
          </span>
          <span style={{
            fontSize: 246,
            fontWeight: 900,
            color: '#fff',
            lineHeight: 0.9,
            letterSpacing: -5,
            fontFamily: KURS_FONT_STACK,
          }}>
            {formatKurs(kurs.usd)}
          </span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginTop: 26,
          fontSize: 34,
          color: '#D1FAE5',
          fontWeight: 600,
        }}>
          <span style={{ width: 58, height: 4, borderRadius: 999, background: '#F8DFA1' }} />
          <span style={{ whiteSpace: 'nowrap' }}>per 1 USD</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom row: Agent (left) + Date (right) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '26px 30px',
        borderRadius: 34,
        background: 'rgba(3, 59, 45, 0.74)',
        border: '1px solid rgba(248, 223, 161, 0.22)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        position: 'relative',
        zIndex: 2,
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
              border: '4px solid #F8DFA1',
              flexShrink: 0,
              boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
            <strong style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 36,
              color: '#fff',
              fontWeight: 800,
              maxWidth: 620,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</span>
              <VerifiedCheck size={34} />
            </strong>
            <span style={{ fontSize: 24, color: '#A7F3D0', fontWeight: 600, marginTop: 6 }}>
              {website}
            </span>
          </div>
        </div>

        {/* Date — bottom right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '18px 22px',
          borderRadius: 24,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
          fontSize: 28,
          color: '#fff',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>
          <CalendarIcon size={34} />
          <span>{kurs.updatedAt}</span>
        </div>
      </div>
    </div>
  );
}
