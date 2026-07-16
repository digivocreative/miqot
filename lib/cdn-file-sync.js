const FILE_FIELDS = {
  brosur: {
    sourceUrl: 'brosur',
    cdnUrl: 'brosur_cdn',
    sha256: 'brosur_source_sha256',
    bytes: 'brosur_source_bytes',
    contentType: 'brosur_source_content_type',
    syncedAt: 'brosur_cdn_synced_at',
  },
  itinerary: {
    sourceUrl: 'itinerary',
    cdnUrl: 'itinerary_cdn',
    sha256: 'itinerary_source_sha256',
    bytes: 'itinerary_source_bytes',
    contentType: 'itinerary_source_content_type',
    syncedAt: 'itinerary_cdn_synced_at',
  },
};

const SCHEDULE_DIRECT_ORIGIN = 'http://115.124.86.220';
const SCHEDULE_ORIGIN_HOSTS = new Set([
  'jadwal.alhijaz.co',
  'jadwal.miqot.com',
  '115.124.86.220',
]);

function pushUnique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

/**
 * Build server-side download candidates for files returned by the schedule API.
 *
 * The public jadwal hostname is intermittently served through a Cloudflare path
 * that returns 522 for brochure/itinerary downloads, while the direct origin is
 * still healthy. Prefer that fixed origin for known schedule URLs, then retain
 * HTTPS as a fallback. Unrelated HTTP URLs keep the previous HTTPS-upgrade
 * behaviour.
 */
export function buildSourceDownloadCandidates(value) {
  const rawUrl = value == null ? '' : String(value).trim();
  if (!rawUrl) return [];

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return [rawUrl.replace(/^http:\/\//i, 'https://')];
  }

  const candidates = [];
  if (SCHEDULE_ORIGIN_HOSTS.has(parsed.hostname.toLowerCase())) {
    const directUrl = new URL(parsed.pathname + parsed.search, SCHEDULE_DIRECT_ORIGIN);
    pushUnique(candidates, directUrl.toString());

    if (parsed.hostname !== '115.124.86.220') {
      const secureUrl = new URL(parsed);
      secureUrl.protocol = 'https:';
      secureUrl.port = '';
      pushUnique(candidates, secureUrl.toString());
    }
    return candidates;
  }

  if (parsed.protocol === 'http:') parsed.protocol = 'https:';
  pushUnique(candidates, parsed.toString());
  return candidates;
}

export function getCdnFileFields(kind) {
  const fields = FILE_FIELDS[kind];
  if (!fields) throw new Error(`Unknown CDN file kind: ${kind}`);
  return fields;
}

export function getCdnFileDecision(row, kind, fileMeta) {
  const fields = getCdnFileFields(kind);
  if (!row?.[fields.sourceUrl]) return { action: 'skip', reason: 'missing_source_url' };
  if (!fileMeta?.sha256 || !Number.isFinite(Number(fileMeta.bytes))) {
    return { action: 'skip', reason: 'missing_fingerprint' };
  }
  if (!row[fields.cdnUrl]) return { action: 'upload', reason: 'missing_cdn' };
  if (!row[fields.sha256] || !Number.isFinite(Number(row[fields.bytes]))) {
    return { action: 'verify_cdn', reason: 'missing_metadata' };
  }
  if (row[fields.sha256] !== fileMeta.sha256 || Number(row[fields.bytes]) !== Number(fileMeta.bytes)) {
    return { action: 'upload', reason: 'source_changed' };
  }
  return { action: 'skip', reason: 'unchanged' };
}

export function buildCdnMetadataUpdate(kind, cdnUrl, fileMeta, syncedAt = new Date().toISOString()) {
  const fields = getCdnFileFields(kind);
  return {
    [fields.cdnUrl]: cdnUrl,
    [fields.sha256]: fileMeta.sha256,
    [fields.bytes]: Number(fileMeta.bytes),
    [fields.contentType]: fileMeta.contentType || null,
    [fields.syncedAt]: syncedAt,
  };
}
