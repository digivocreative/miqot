function asText(value) {
  return value == null ? '' : String(value);
}

export function sanitizeBunnyPathPart(value) {
  return asText(value).trim().replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildTopPartnerBunnyPath(photoFile, version) {
  const fileName = sanitizeBunnyPathPart(photoFile);
  if (!fileName) return '';
  const cleanVersion = sanitizeBunnyPathPart(version);
  return cleanVersion ? `top-partner/v${cleanVersion}/${fileName}` : `top-partner/${fileName}`;
}

export function buildTopPartnerCdnUrl(cdnHostname, photoFile, version) {
  const host = asText(cdnHostname).trim();
  const path = buildTopPartnerBunnyPath(photoFile, version);
  return host && path ? `https://${host}/${path}` : '';
}

export function normalizeBunnyDownloadUrl(url) {
  return asText(url).replace(/^http:\/\//i, 'https://');
}

export async function mirrorTopPartnerPhoto(partner, deps = {}) {
  const enabled = typeof deps.enabled === 'function' ? deps.enabled() : deps.enabled;
  const path = buildTopPartnerBunnyPath(partner?.photoFile);
  const cdnUrl = buildTopPartnerCdnUrl(deps.cdnHostname, partner?.photoFile);

  if (!partner?.photo || !path || !cdnUrl || !enabled) return partner;
  if (!deps.fileExists || !deps.downloadFile || !deps.uploadFile) return partner;

  try {
    let photoUrl = cdnUrl;
    if (!(await deps.fileExists(path))) {
      const file = await deps.downloadFile(partner.photo);
      const version = file.bytes || file.buffer?.length;
      const versionedPath = buildTopPartnerBunnyPath(partner?.photoFile, version);
      const targetPath = versionedPath || path;
      photoUrl = buildTopPartnerCdnUrl(deps.cdnHostname, partner?.photoFile, version) || cdnUrl;

      if (!(await deps.fileExists(targetPath))) {
        await deps.uploadFile(targetPath, file.buffer, file.contentType);
      }
    }
    return { ...partner, photo: photoUrl };
  } catch (err) {
    deps.logger?.warn?.(`[TopPartner] Foto ${partner.photoFile} gagal mirror ke Bunny: ${err.message}`);
    return partner;
  }
}

export async function mirrorTopPartnerPhotos(partners, deps = {}) {
  const result = [];
  for (const partner of Array.isArray(partners) ? partners : []) {
    result.push(await mirrorTopPartnerPhoto(partner, deps));
  }
  return result;
}
