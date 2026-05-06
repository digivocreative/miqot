// Detect coarse pointer (touch-primary device): phones, tablets.
// Desktop with mouse → false, even on Chrome where navigator.share exists.
export function isTouchPrimary(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

// True only when native share with files is genuinely usable on this device.
// On desktop browsers we always prefer plain download.
export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  if (!isTouchPrimary()) return false;
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
