// Ornamen banner Share Cuaca (mockup C2/C3): pola khatam (bintang-8 dari dua
// persegi) yang memudar dari kanan atas + roset bunga yang sama dengan banner
// Kurs. SVG inline — tidak ada berkas gambar, identik di pratinjau & server.
import type { ReactNode } from 'react';
import { CUACA_SHARE_H, CUACA_SHARE_W } from '../../../lib/cuaca-share-data.js';

const GOLD = '#F8DFA1';
const MINT = '#D1FAE5';

function khatamPaths(tile: number, radius: number) {
  const c = tile / 2;
  const s = +(radius / Math.SQRT2).toFixed(2);
  return {
    links: `M${c} ${c - radius}V0M${c + radius} ${c}H${tile}M${c} ${c + radius}V${tile}M${c - radius} ${c}H0`
      + `M${c - s} ${c - s}L0 0M${c + s} ${c - s}L${tile} 0M${c + s} ${c + s}L${tile} ${tile}M${c - s} ${c + s}L0 ${tile}`,
    star: `M${c - s} ${c - s}H${c + s}V${c + s}H${c - s}Z`
      + `M${c} ${c - radius}L${c + radius} ${c}L${c} ${c + radius}L${c - radius} ${c}Z`,
    c,
  };
}

function KhatamPattern({ id, tile, radius, offset }: { id: string; tile: number; radius: number; offset: [number, number] }) {
  const p = khatamPaths(tile, radius);
  return (
    <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse" x={offset[0]} y={offset[1]}>
      <path d={p.links} stroke={MINT} strokeWidth={1.8} fill="none" />
      <path d={p.star} stroke={GOLD} strokeWidth={2} fill="none" />
      <circle cx={p.c} cy={p.c} r={tile / 17} stroke={GOLD} strokeWidth={1.4} fill="none" />
    </pattern>
  );
}

function Rosette() {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 -260C62 -192 62 -88 0 -18C-62 -88 -62 -192 0 -260Z M0 260C62 192 62 88 0 18C-62 88 -62 192 0 260Z M-260 0C-192 -62 -88 -62 -18 0C-88 62 -192 62 -260 0Z M260 0C192 -62 88 -62 18 0C88 62 192 62 260 0Z" stroke={GOLD} strokeWidth={4} />
      <path d="M-184 -184C-92 -180 -28 -108 -18 -18C-108 -28 -180 -92 -184 -184Z M184 -184C180 -92 108 -28 18 -18C28 -108 92 -180 184 -184Z M184 184C92 180 28 108 18 18C108 28 180 92 184 184Z M-184 184C-180 92 -108 28 -18 18C-28 108 -92 180 -184 184Z" stroke={MINT} strokeWidth={3} />
      <path d="M0 -18C38 -62 38 -122 0 -166C-38 -122 -38 -62 0 -18Z M0 18C38 62 38 122 0 166C-38 122 -38 62 0 18Z M-18 0C-62 -38 -122 -38 -166 0C-122 38 -62 38 -18 0Z M18 0C62 -38 122 -38 166 0C122 38 62 38 18 0Z" stroke={MINT} strokeWidth={2.2} opacity={0.85} />
      <path d="M-130 -42C-76 -86 -30 -84 0 0C30 -84 76 -86 130 -42 M-130 42C-76 86 -30 84 0 0C30 84 76 86 130 42 M-42 -130C-86 -76 -84 -30 0 0C-84 30 -86 76 -42 130 M42 -130C86 -76 84 -30 0 0C84 30 86 76 42 130" stroke={GOLD} strokeWidth={2.4} opacity={0.85} />
      <circle r={34} stroke={GOLD} strokeWidth={3} />
      <circle r={12} stroke={MINT} strokeWidth={2} />
    </g>
  );
}

/** Lapisan latar seluruh banner (di bawah konten). */
export function CuacaOrnament() {
  const W = CUACA_SHARE_W;
  const H = CUACA_SHARE_H;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <KhatamPattern id="cuaca-khatam" tile={120} radius={46} offset={[-20, -20]} />
        <radialGradient id="cuaca-khatam-fade" cx="0.92" cy="0.06" r="1.05">
          <stop offset="0" stopColor="#fff" stopOpacity={1} />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0.45} />
          <stop offset="0.85" stopColor="#fff" stopOpacity={0.08} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id="cuaca-khatam-mask">
          <rect width={W} height={H} fill="url(#cuaca-khatam-fade)" />
        </mask>
      </defs>
      <rect width={W} height={H} fill="url(#cuaca-khatam)" mask="url(#cuaca-khatam-mask)" opacity={0.26} />
      <g transform="translate(1000 760) scale(1.25)" opacity={0.16}><Rosette /></g>
      <g transform="translate(70 1240) scale(0.7)" opacity={0.1}><Rosette /></g>
    </svg>
  );
}

/** Pengganti foto untuk kota tanpa foto (mockup C3). `children` = ikon cuaca besar. */
export function KhatamPanel({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width="100%" height="100%" viewBox="0 0 952 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="cuaca-panel-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0E6A53" />
            <stop offset="1" stopColor="#05261D" />
          </linearGradient>
          <KhatamPattern id="cuaca-panel-khatam" tile={96} radius={37} offset={[-12, -28]} />
          <radialGradient id="cuaca-panel-glow" cx="0.78" cy="0.42" r="0.55">
            <stop offset="0" stopColor={GOLD} stopOpacity={0.22} />
            <stop offset="1" stopColor={GOLD} stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width="952" height="400" fill="url(#cuaca-panel-bg)" />
        <rect width="952" height="400" fill="url(#cuaca-panel-khatam)" opacity={0.22} />
        <rect width="952" height="400" fill="url(#cuaca-panel-glow)" />
      </svg>
      <div style={{ position: 'absolute', right: 40, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}
