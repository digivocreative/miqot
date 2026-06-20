import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'public', 'og');
const outputPath = path.join(outputDir, 'top-partner.png');
const logoPath = path.join(root, 'src', 'logo-alhijaz-white.png');

const W = 1200;
const H = 630;

function card({ x, y, name, initials, delay = 0 }) {
  const opacity = 0.96 - delay * 0.06;
  return `
    <g opacity="${opacity}">
      <rect x="${x}" y="${y}" width="360" height="94" rx="24" fill="rgba(255,255,255,0.94)" stroke="rgba(255,255,255,0.7)"/>
      <rect x="${x + 22}" y="${y + 18}" width="58" height="58" rx="16" fill="#FFF1F2"/>
      <text x="${x + 51}" y="${y + 54}" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="#8A1E22" text-anchor="middle">${initials}</text>
      <text x="${x + 98}" y="${y + 42}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" fill="#111827">${name}</text>
      <rect x="${x + 98}" y="${y + 56}" width="122" height="24" rx="12" fill="#ECFDF5"/>
      <text x="${x + 116}" y="${y + 73}" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800" fill="#047857">WhatsApp</text>
      <circle cx="${x + 248}" cy="${y + 68}" r="14" fill="#1D9BF0"/>
      <path d="M${x + 241} ${y + 68}l5 5 10-12" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  `;
}

const bgSvg = Buffer.from(`
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#120207"/>
      <stop offset="38%" stop-color="#2B050B"/>
      <stop offset="72%" stop-color="#621018"/>
      <stop offset="100%" stop-color="#961F24"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="18%" r="70%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.34"/>
      <stop offset="42%" stop-color="#F43F5E" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <pattern id="pattern" width="132" height="132" patternUnits="userSpaceOnUse">
      <path d="M66 14 77 52 118 66 77 80 66 118 55 80 14 66 55 52Z" fill="none" stroke="#FDE68A" stroke-width="1.4" opacity="0.22"/>
      <path d="M20 118c0-26 20-46 46-46s46 20 46 46" fill="none" stroke="#FDE68A" stroke-width="1.4" opacity="0.14"/>
    </pattern>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#pattern)"/>
  <circle cx="1040" cy="70" r="230" fill="#F59E0B" opacity="0.10"/>
  <circle cx="1130" cy="520" r="250" fill="#FB7185" opacity="0.14"/>

  <g transform="translate(78 72)">
    <rect x="0" y="0" width="168" height="52" rx="26" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.18)"/>
  </g>

  <g transform="translate(78 196)">
    <rect x="0" y="0" width="170" height="42" rx="21" fill="#F59E0B"/>
    <text x="85" y="28" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900" fill="#3A070B" text-anchor="middle">TOP 20</text>
    <text x="0" y="100" font-family="Inter, Arial, sans-serif" font-size="68" font-weight="900" fill="#FFFFFF">Partner Pilihan</text>
    <text x="0" y="176" font-family="Inter, Arial, sans-serif" font-size="68" font-weight="900" fill="#FFFFFF">Alhijaz</text>
    <text x="2" y="224" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="700" fill="#FFE4E6">Partner resmi yang responsif.</text>
    <text x="2" y="260" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="700" fill="#FFE4E6">Mudah dihubungi calon jamaah.</text>
    <g transform="translate(0 286)">
      <text x="0" y="0" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="900" fill="#FEF3C7">Fast Response</text>
      <circle cx="184" cy="-7" r="4" fill="#FEF3C7"/>
      <text x="204" y="0" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="900" fill="#FEF3C7">Verified Partner</text>
    </g>
  </g>

  <g filter="url(#soft)">
    ${card({ x: 744, y: 130, name: 'Partner Resmi', initials: 'AH' })}
    ${card({ x: 700, y: 254, name: 'Fast Response', initials: 'FR', delay: 1 })}
    ${card({ x: 744, y: 378, name: 'Mudah Dihubungi', initials: 'WA', delay: 2 })}
  </g>
</svg>
`);

fs.mkdirSync(outputDir, { recursive: true });

const logo = await sharp(logoPath)
  .resize({ width: 148 })
  .png()
  .toBuffer();

await sharp(bgSvg)
  .composite([{ input: logo, left: 98, top: 83 }])
  .png({ quality: 92 })
  .toFile(outputPath);

console.log(`Generated ${path.relative(root, outputPath)}`);
