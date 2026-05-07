// Smoke-test the kurs image generator without touching Telegram.
// Usage: node scripts/test-kurs-image.mjs
import { writeFile } from 'fs/promises';
import { generateKursImageBuffer, closeKursBrowser } from '../lib/kurs-image-generator.mjs';

const sampleKurs = { usd: 17500, updatedAt: 'Rabu, 7 Mei 2026' };

const sampleAgents = [
  { slug: 'nina', name: 'Nina Nasution', phone: '081234567890', photo: '', website: 'alhijazumrahtours.com' },
  { slug: 'long-name', name: 'Muhammad Abdurrahman Al-Hafidz Indonesia', phone: '08987654321', photo: '', website: '' },
];

console.time('total');
for (const agent of sampleAgents) {
  console.time(agent.slug);
  const buf = await generateKursImageBuffer({ kurs: sampleKurs, agent });
  console.timeEnd(agent.slug);
  const out = `/tmp/kurs-${agent.slug}.jpg`;
  await writeFile(out, buf);
  console.log(`Wrote ${out} — ${(buf.length / 1024).toFixed(1)} KB`);
}
console.timeEnd('total');

await closeKursBrowser();
