const ROOM_PRIORITY = ['Quard', 'Triple', 'Double']; // Infant intentionally excluded

function tierPrice(tier) {
  if (!tier || typeof tier !== 'object') return null;
  for (const room of ROOM_PRIORITY) {
    const v = Number(tier[room]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

export function pickBrochurePrice(paket_harga) {
  if (!paket_harga || typeof paket_harga !== 'object') return null;
  let min = null;
  for (const tier of Object.values(paket_harga)) {
    const p = tierPrice(tier);
    if (p === null) continue;
    if (min === null || p < min) min = p;
  }
  return min;
}
