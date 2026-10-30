export async function readResponseBuffer(response, maxBytes) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Upstream response exceeds size limit');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('Upstream response exceeds size limit');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    reader.releaseLock();
  }
}
