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
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  if (digits.startsWith('62')) {
    const rest = digits.slice(2);
    const a = rest.slice(0, 3);
    const b = rest.slice(3, 7);
    const c = rest.slice(7);
    return `+62 ${[a, b, c].filter(Boolean).join('-')}`;
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
        style={{ height: 36, opacity: 0.85, filter: 'brightness(0) invert(1)', flexShrink: 0, marginLeft: 16 }}
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

function Classic({ jamaah, agentName, agentPhoto, agentPhone }: Omit<CardProps, 'template'>) {
  return (
    <CanvasFrame background="linear-gradient(135deg, #831843 0%, #be185d 100%)">
      <div style={{ position: 'absolute', top: 50, left: 50, fontSize: 110, opacity: 0.18 }}>🌹</div>
      <div style={{ position: 'absolute', top: 50, right: 50, fontSize: 110, opacity: 0.18 }}>🌹</div>
      <div style={{ position: 'absolute', bottom: 220, left: 50, fontSize: 80, opacity: 0.14 }}>🌹</div>
      <div style={{ position: 'absolute', bottom: 220, right: 50, fontSize: 80, opacity: 0.14 }}>🌹</div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100% - 180px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 80px',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 110, lineHeight: 1, marginBottom: 16 }}>💐</div>

        <div
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 88,
            color: '#FFFFFF',
            lineHeight: 1.05,
          }}
        >
          Selamat
        </div>
        <div
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontStyle: 'italic',
            fontSize: 88,
            color: '#FFFFFF',
            lineHeight: 1.05,
          }}
        >
          Ulang Tahun
        </div>

        <div
          style={{
            width: 110,
            height: 2,
            background: 'rgba(255,255,255,0.4)',
            margin: '32px 0 24px 0',
          }}
        />

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 40,
            fontWeight: 600,
            color: '#FFFFFF',
            lineHeight: 1.2,
            maxWidth: '90%',
          }}
        >
          {jamaah.salutation} {jamaah.nama}
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 26,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 10,
          }}
        >
          Genap usia ke-{jamaah.age} tahun
        </div>
      </div>

      <CardFooter
        agentName={agentName}
        agentPhone={agentPhone}
        agentPhoto={agentPhoto}
        ringColor="#9d174d"
        topBorder="1px solid rgba(255,255,255,0.18)"
      />
    </CanvasFrame>
  );
}

function Islamic({ jamaah, agentName, agentPhoto, agentPhone }: Omit<CardProps, 'template'>) {
  return (
    <CanvasFrame background="linear-gradient(135deg, #064e3b 0%, #047857 100%)">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: ISLAMIC_PATTERN,
          backgroundRepeat: 'repeat',
          opacity: 0.5,
        }}
      />

      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYEnd meet"
        style={{
          position: 'absolute',
          bottom: 200,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 600,
          height: 280,
          opacity: 0.16,
          fill: '#FFFFFF',
        }}
      >
        <path d="M40 200V120c0-12 8-22 20-22V70l-12-8 12-12 12 12-12 8v28c12 0 20 10 20 22v80H40zM160 200V100c0-30 18-54 40-54s40 24 40 54v100H160zM200 46v-22m-10 6h20M320 200v-80c0-12 8-22 20-22V70l-12-8 12-12 12 12-12 8v28c12 0 20 10 20 22v80h-40z" />
        <path d="M0 200h400" stroke="#FFFFFF" strokeWidth="2" />
      </svg>

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100% - 180px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '90px 80px 0 80px',
          textAlign: 'center',
          zIndex: 1,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontFamily: '"Amiri", serif',
            fontSize: 50,
            color: 'rgba(255,255,255,0.7)',
            lineHeight: 1,
          }}
        >
          بِسْمِ اللَّهِ
        </div>

        <div style={{ marginTop: 28 }}>
          <div
            style={{
              fontFamily: '"Amiri", serif',
              fontSize: 96,
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
              color: '#FFFFFF',
              lineHeight: 1,
              marginTop: 6,
            }}
          >
            fii Umrik
          </div>
        </div>

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 26,
            color: 'rgba(255,255,255,0.85)',
            marginTop: 36,
            letterSpacing: '0.04em',
          }}
        >
          Selamat Ulang Tahun
        </div>

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 38,
            fontWeight: 600,
            color: '#FFFFFF',
            marginTop: 18,
            lineHeight: 1.2,
            maxWidth: '90%',
          }}
        >
          {jamaah.salutation} {jamaah.nama}
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 22,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 6,
          }}
        >
          Genap usia ke-{jamaah.age} tahun
        </div>

        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'italic',
            fontSize: 20,
            color: 'rgba(255,255,255,0.75)',
            marginTop: 28,
            maxWidth: '78%',
            lineHeight: 1.5,
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
        topBorder="1px solid rgba(255,255,255,0.18)"
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
