export function buildNotifierPackagesUrl(baseUrl, yearCode) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/api/schedules/${encodeURIComponent(yearCode)}`;
}
