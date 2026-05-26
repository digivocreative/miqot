function hasText(value) {
  return String(value || '').trim().length > 0;
}

function hasObjectEntries(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function pickText(existingValue, rowValue) {
  if (hasText(existingValue)) return existingValue;
  if (hasText(rowValue)) return rowValue;
  return null;
}

function pickObject(existingValue, rowValue) {
  if (hasObjectEntries(existingValue)) return existingValue;
  if (hasObjectEntries(rowValue)) return rowValue;
  return {};
}

export function preserveUmrohPhase1Enrichment(row, existing) {
  const next = { ...(row || {}) };

  next.wa = pickText(existing?.wa, next.wa);
  next.tgl_lahir = pickText(existing?.tgl_lahir, next.tgl_lahir);
  next.perlengkapan = pickObject(existing?.perlengkapan, next.perlengkapan);
  next.dokumen = pickObject(existing?.dokumen, next.dokumen);
  next.no_paspor = pickText(existing?.no_paspor, next.no_paspor);
  next.paspor_expired = pickText(existing?.paspor_expired, next.paspor_expired);

  if (!hasText(next.hijriah_year)) {
    next.hijriah_year = hasText(existing?.hijriah_year) ? existing.hijriah_year : '1447';
  }

  return next;
}
