import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function createCredentialCipher(encodedKey) {
  const key = encodedKey ? Buffer.from(encodedKey, 'base64') : null;
  if (key && key.length !== 32) throw new Error('CAPI_ENCRYPTION_KEY must encode exactly 32 bytes');
  return {
    encrypt(text) {
      if (!text) return text;
      if (!key) throw new Error('CAPI_ENCRYPTION_KEY is required to store credentials');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
    },
    decrypt(data) {
      if (!data) return data;
      // Old plaintext rows remain readable for compatibility. Never interpret
      // an authenticated ciphertext that failed to decrypt as a usable secret.
      if (!/^[a-f0-9]{24}:/i.test(data)) return data;
      if (!key || !/^[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})*$/i.test(data)) return '';
      try {
        const [iv, tag, encrypted] = data.split(':');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8');
      } catch {
        return '';
      }
    },
  };
}
