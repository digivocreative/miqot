export function formatRupiah(amount?: number | null): string {
  const safeAmount = Number(amount || 0);

  if (!Number.isFinite(safeAmount)) return 'Rp 0';
  if (Math.abs(safeAmount) >= 1_000_000) {
    const value = safeAmount / 1_000_000;
    const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace('.', ',');
    return `Rp ${formatted}jt`;
  }
  if (Math.abs(safeAmount) >= 1_000) {
    return `Rp ${(safeAmount / 1_000).toFixed(0)}rb`;
  }

  return `Rp ${safeAmount.toLocaleString('id-ID')}`;
}

export function formatRupiahFull(amount?: number | null): string {
  const safeAmount = Number(amount || 0);
  if (!Number.isFinite(safeAmount)) return 'Rp 0';
  return `Rp ${safeAmount.toLocaleString('id-ID')}`;
}
