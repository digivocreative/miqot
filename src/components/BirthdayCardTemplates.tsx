import type { Birthday } from './BirthdayWidget';

export type CardTemplate = 'classic' | 'islamic';

export const CARD_W = 1080;
export const CARD_H = 1080;

export interface CardProps {
  template: CardTemplate;
  jamaah: Birthday;
  agentName: string;
  agentSlug: string;
  agentPhoto?: string;
  agentPhone?: string;
}

const ISLAMIC_PATTERN = `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1' opacity='0.15'%3E%3Cpath d='M40 0L80 40L40 80L0 40Z'/%3E%3Cpath d='M40 12L68 40L40 68L12 40Z'/%3E%3Cpath d='M40 24L56 40L40 56L24 40Z'/%3E%3C/g%3E%3C/svg%3E")`;

function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'A')}&background=be185d&color=fff&size=192&bold=true`;
}

function formatWaDisplay(phone?: string): string {
  const cleaned = (phone || '').replace(/[^0-9]/g, '');
  if (!cleaned) return '';
  let digits = cleaned;
  if (digits.startsWith('62')) digits = '0' + digits.slice(2);
  if (!digits.startsWith('0')) digits = '0' + digits;
  // Format: 0812 3456 7890 (Indonesian local format with spaces)
  if (digits.length >= 4) {
    const a = digits.slice(0, 4);
    const b = digits.slice(4, 8);
    const c = digits.slice(8);
    return [a, b, c].filter(Boolean).join(' ');
  }
  return digits;
}

function VerifiedBadge({ ringColor }: { ringColor: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: '#1D9BF0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `3px solid ${ringColor}`,
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="white" aria-hidden>
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
    </div>
  );
}

function WaIconCard({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 448 512" fill="currentColor" aria-hidden>
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.3-5-3.7-10.5-6.5z" />
    </svg>
  );
}

function CardFooter({
  agentName,
  agentPhone,
  agentPhoto,
  ringColor,
  topBorder,
}: {
  agentName: string;
  agentPhone?: string;
  agentPhoto?: string;
  ringColor: string;
  topBorder: string;
}) {
  const photo = agentPhoto || avatarFallback(agentName);
  const phoneDisplay = formatWaDisplay(agentPhone);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 180,
        padding: '0 60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: topBorder,
        boxSizing: 'border-box',
      }}
    >
      {/* Left group: photo + name/wa (tight group, left-anchored) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, minWidth: 0, flex: '0 1 auto' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 96, height: 96 }}>
          <img
            src={photo}
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid rgba(255,255,255,0.6)',
              display: 'block',
            }}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = avatarFallback(agentName);
            }}
          />
          <VerifiedBadge ringColor={ringColor} />
        </div>
        <div style={{ minWidth: 0, textAlign: 'left' }}>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {agentName}
          </div>
          {phoneDisplay && (
            <div
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 22,
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              <WaIconCard size={22} />
              <span>{phoneDisplay}</span>
            </div>
          )}
        </div>
      </div>

      {/* Logo right */}
      <img
        src="/logo-alhijaz-besar.svg"
        style={{ height: 120, opacity: 0.95, filter: 'brightness(0) invert(1)', flexShrink: 0, marginLeft: 16 }}
        alt="Alhijaz"
      />
    </div>
  );
}

function CanvasFrame({
  background,
  children,
}: {
  background: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        background,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function textWidthWeight(text: string): number {
  return Array.from(text).reduce((total, char) => {
    if (char === ' ') return total + 0.35;
    if ('ilI1.,'.includes(char)) return total + 0.35;
    if ('mwMW'.includes(char)) return total + 1.05;
    if (char === char.toUpperCase() && char !== char.toLowerCase()) return total + 0.72;
    return total + 0.62;
  }, 0);
}

function singleLineFontSize(text: string, max: number, min: number, maxWidth = 860): number {
  const estimated = textWidthWeight(text) || 1;
  const fitted = Math.floor(maxWidth / estimated);
  return Math.max(min, Math.min(max, fitted));
}

function Classic({ jamaah, agentName, agentPhoto, agentPhone }: Omit<CardProps, 'template'>) {
  const GOLD = '#d4af6d';
  const CONTENT_BOTTOM = 200;
  const fullName = `${jamaah.salutation} ${jamaah.nama}`;
  const nameSize = singleLineFontSize(fullName, 64, 22);
  return (
    <CanvasFrame background="linear-gradient(135deg, #3f0a0a 0%, #7f1d1d 55%, #991b1b 100%)">
      {/* Vignette overlay for depth */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.35) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Gold double-line frame */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 40,
          right: 40,
          bottom: CONTENT_BOTTOM + 40,
          border: `1.5px solid ${GOLD}`,
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 50,
          left: 50,
          right: 50,
          bottom: CONTENT_BOTTOM + 50,
          border: `1px solid ${GOLD}`,
          opacity: 0.2,
          pointerEvents: 'none',
        }}
      />

      {/* Gold corner sparkles */}
      <div style={{ position: 'absolute', top: 26, left: 26, fontSize: 32, color: GOLD, opacity: 0.85, lineHeight: 1 }}>✦</div>
      <div style={{ position: 'absolute', top: 26, right: 26, fontSize: 32, color: GOLD, opacity: 0.85, lineHeight: 1 }}>✦</div>
      <div style={{ position: 'absolute', bottom: CONTENT_BOTTOM + 26, left: 26, fontSize: 32, color: GOLD, opacity: 0.85, lineHeight: 1 }}>✦</div>
      <div style={{ position: 'absolute', bottom: CONTENT_BOTTOM + 26, right: 26, fontSize: 32, color: GOLD, opacity: 0.85, lineHeight: 1 }}>✦</div>

      {/* Subtle sparkles scattered */}
      <div style={{ position: 'absolute', top: 130, left: 100, fontSize: 18, color: GOLD, opacity: 0.4 }}>✧</div>
      <div style={{ position: 'absolute', top: 200, right: 120, fontSize: 16, color: GOLD, opacity: 0.4 }}>✧</div>
      <div style={{ position: 'absolute', top: 720, left: 130, fontSize: 18, color: GOLD, opacity: 0.4 }}>✧</div>
      <div style={{ position: 'absolute', top: 680, right: 110, fontSize: 16, color: GOLD, opacity: 0.4 }}>✧</div>
      <div style={{ position: 'absolute', top: 380, left: 70, fontSize: 14, color: GOLD, opacity: 0.3 }}>✦</div>
      <div style={{ position: 'absolute', top: 540, right: 80, fontSize: 14, color: GOLD, opacity: 0.3 }}>✦</div>

      {/* Content */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `calc(100% - ${CONTENT_BOTTOM}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 110px 40px 110px',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 110, lineHeight: 1, marginBottom: 12, flexShrink: 0 }}>💐</div>

        <div
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 92,
            color: '#FFFFFF',
            lineHeight: 1.0,
            flexShrink: 0,
          }}
        >
          Selamat
        </div>
        <div
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontStyle: 'italic',
            fontSize: 92,
            color: GOLD,
            lineHeight: 1.0,
            marginTop: 4,
            flexShrink: 0,
          }}
        >
          Ulang Tahun
        </div>

        {/* Gold divider with center diamond */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            margin: '36px 0 28px 0',
            width: '60%',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, height: 1, background: GOLD, opacity: 0.6 }} />
          <div style={{ width: 8, height: 8, background: GOLD, transform: 'rotate(45deg)', opacity: 0.85 }} />
          <div style={{ flex: 1, height: 1, background: GOLD, opacity: 0.6 }} />
        </div>

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: nameSize,
            fontWeight: 600,
            color: '#FFFFFF',
            lineHeight: 1.25,
            width: '100%',
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flexShrink: 0,
            paddingBottom: 6,
          }}
        >
          {fullName}
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 28,
            color: 'rgba(255, 230, 200, 0.9)',
            marginTop: 16,
            fontStyle: 'italic',
            lineHeight: 1.3,
            flexShrink: 0,
          }}
        >
          Kini menginjak usia {jamaah.age} tahun
        </div>

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'italic',
            fontSize: 24,
            color: 'rgba(255, 230, 200, 0.78)',
            marginTop: 26,
            maxWidth: '85%',
            lineHeight: 1.5,
            flexShrink: 0,
          }}
        >
          Semoga panjang umur, sehat selalu, dan dimudahkan menuju Baitullah.
        </div>
      </div>

      <CardFooter
        agentName={agentName}
        agentPhone={agentPhone}
        agentPhoto={agentPhoto}
        ringColor="#7f1d1d"
        topBorder={`1px solid ${GOLD}55`}
      />
    </CanvasFrame>
  );
}

function Islamic({ jamaah, agentName, agentPhoto, agentPhone }: Omit<CardProps, 'template'>) {
  const GOLD = '#d4af6d';
  const CONTENT_BOTTOM = 200;
  const fullName = `${jamaah.salutation} ${jamaah.nama}`;
  const nameSize = singleLineFontSize(fullName, 44, 20);
  return (
    <CanvasFrame background="linear-gradient(135deg, #022c22 0%, #064e3b 50%, #047857 100%)">
      {/* Islamic geometric pattern overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: ISLAMIC_PATTERN,
          backgroundRepeat: 'repeat',
          opacity: 0.45,
        }}
      />

      {/* Vignette overlay for depth */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.4) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Mosque silhouette backdrop */}
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYEnd meet"
        style={{
          position: 'absolute',
          bottom: CONTENT_BOTTOM + 60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 620,
          height: 260,
          opacity: 0.13,
          fill: '#FFFFFF',
          zIndex: 0,
        }}
      >
        <path d="M40 200V120c0-12 8-22 20-22V70l-12-8 12-12 12 12-12 8v28c12 0 20 10 20 22v80H40zM160 200V100c0-30 18-54 40-54s40 24 40 54v100H160zM200 46v-22m-10 6h20M320 200v-80c0-12 8-22 20-22V70l-12-8 12-12 12 12-12 8v28c12 0 20 10 20 22v80h-40z" />
        <path d="M0 200h400" stroke="#FFFFFF" strokeWidth="2" />
      </svg>

      {/* Gold double-line frame */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 40,
          right: 40,
          bottom: CONTENT_BOTTOM + 40,
          border: `1.5px solid ${GOLD}`,
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 50,
          left: 50,
          right: 50,
          bottom: CONTENT_BOTTOM + 50,
          border: `1px solid ${GOLD}`,
          opacity: 0.2,
          pointerEvents: 'none',
        }}
      />

      {/* 4 Islamic 8-pointed star corners */}
      <div style={{ position: 'absolute', top: 22, left: 22, fontSize: 38, color: GOLD, opacity: 0.9, lineHeight: 1 }}>✸</div>
      <div style={{ position: 'absolute', top: 22, right: 22, fontSize: 38, color: GOLD, opacity: 0.9, lineHeight: 1 }}>✸</div>
      <div style={{ position: 'absolute', bottom: CONTENT_BOTTOM + 22, left: 22, fontSize: 38, color: GOLD, opacity: 0.9, lineHeight: 1 }}>✸</div>
      <div style={{ position: 'absolute', bottom: CONTENT_BOTTOM + 22, right: 22, fontSize: 38, color: GOLD, opacity: 0.9, lineHeight: 1 }}>✸</div>

      {/* Subtle scattered sparkles */}
      <div style={{ position: 'absolute', top: 130, left: 100, fontSize: 18, color: GOLD, opacity: 0.45 }}>✧</div>
      <div style={{ position: 'absolute', top: 200, right: 120, fontSize: 16, color: GOLD, opacity: 0.45 }}>✧</div>
      <div style={{ position: 'absolute', top: 720, left: 130, fontSize: 18, color: GOLD, opacity: 0.45 }}>✧</div>
      <div style={{ position: 'absolute', top: 680, right: 110, fontSize: 16, color: GOLD, opacity: 0.45 }}>✧</div>
      <div style={{ position: 'absolute', top: 380, left: 70, fontSize: 14, color: GOLD, opacity: 0.35 }}>✦</div>
      <div style={{ position: 'absolute', top: 540, right: 80, fontSize: 14, color: GOLD, opacity: 0.35 }}>✦</div>

      {/* Content */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `calc(100% - ${CONTENT_BOTTOM}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '85px 110px 40px 110px',
          textAlign: 'center',
          zIndex: 1,
          boxSizing: 'border-box',
        }}
      >
        {/* Top decorative ornament: --- ❋ --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexShrink: 0 }}>
          <div style={{ width: 70, height: 1, background: GOLD, opacity: 0.55 }} />
          <div style={{ fontSize: 18, color: GOLD, lineHeight: 1, opacity: 0.9 }}>❋</div>
          <div style={{ width: 70, height: 1, background: GOLD, opacity: 0.55 }} />
        </div>

        <div
          style={{
            fontFamily: '"Amiri", serif',
            fontSize: 56,
            color: '#FFFFFF',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          بِسْمِ اللَّهِ
        </div>

        <div style={{ marginTop: 28, flexShrink: 0 }}>
          <div
            style={{
              fontFamily: '"Amiri", serif',
              fontSize: 100,
              color: '#FFFFFF',
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            Barakallah
          </div>
          <div
            style={{
              fontFamily: '"Amiri", serif',
              fontStyle: 'italic',
              fontSize: 64,
              color: GOLD,
              lineHeight: 1,
              marginTop: 4,
            }}
          >
            fii Umrik
          </div>
        </div>

        {/* Gold divider with diamond */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            margin: '32px 0 20px 0',
            width: '60%',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, height: 1, background: GOLD, opacity: 0.6 }} />
          <div style={{ width: 8, height: 8, background: GOLD, transform: 'rotate(45deg)', opacity: 0.85 }} />
          <div style={{ flex: 1, height: 1, background: GOLD, opacity: 0.6 }} />
        </div>

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 30,
            color: 'rgba(255, 235, 200, 0.9)',
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          Selamat Ulang Tahun
        </div>

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: nameSize,
            fontWeight: 600,
            color: '#FFFFFF',
            marginTop: 14,
            lineHeight: 1.3,
            width: '100%',
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flexShrink: 0,
            paddingBottom: 6,
          }}
        >
          {fullName}
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 28,
            color: 'rgba(255, 235, 200, 0.9)',
            marginTop: 16,
            fontStyle: 'italic',
            lineHeight: 1.3,
            flexShrink: 0,
          }}
        >
          Kini menginjak usia {jamaah.age} tahun
        </div>

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'italic',
            fontSize: 24,
            color: 'rgba(255, 235, 200, 0.78)',
            marginTop: 26,
            maxWidth: '85%',
            lineHeight: 1.5,
            flexShrink: 0,
          }}
        >
          Semoga panjang umur, sehat selalu, dan dimudahkan menuju Baitullah.
        </div>
      </div>

      <CardFooter
        agentName={agentName}
        agentPhone={agentPhone}
        agentPhoto={agentPhoto}
        ringColor="#065f46"
        topBorder={`1px solid ${GOLD}55`}
      />
    </CanvasFrame>
  );
}

export function BirthdayCard({ template, jamaah, agentName, agentSlug, agentPhoto, agentPhone }: CardProps) {
  const inner = template === 'classic'
    ? <Classic jamaah={jamaah} agentName={agentName} agentSlug={agentSlug} agentPhoto={agentPhoto} agentPhone={agentPhone} />
    : <Islamic jamaah={jamaah} agentName={agentName} agentSlug={agentSlug} agentPhoto={agentPhoto} agentPhone={agentPhone} />;
  return inner;
}

export function BirthdayCardThumb({
  template,
  jamaah,
  agentName,
  agentSlug,
  agentPhoto,
  agentPhone,
  width,
}: CardProps & { width: number }) {
  const scale = width / CARD_W;
  const height = width * (CARD_H / CARD_W);
  return (
    <div style={{ width, height, overflow: 'hidden', position: 'relative' }}>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: CARD_W,
          height: CARD_H,
        }}
      >
        <BirthdayCard
          template={template}
          jamaah={jamaah}
          agentName={agentName}
          agentSlug={agentSlug}
          agentPhoto={agentPhoto}
          agentPhone={agentPhone}
        />
      </div>
    </div>
  );
}

export const TEMPLATE_LABELS: Record<CardTemplate, string> = {
  classic: 'Klasik',
  islamic: 'Islami',
};
