// ── Shared validation helpers ──
// Used by DashboardProfile and AgentManagement forms

// --- Validators (return error string or null) ---

export function validateName(value: string): string | null {
  if (!value || !value.trim()) return 'Nama wajib diisi';
  if (value.trim().length < 2) return 'Nama minimal 2 karakter';
  return null;
}

export function validatePhone(value: string): string | null {
  if (!value || !value.trim()) return 'Nomor HP wajib diisi';
  const cleaned = value.replace(/\D/g, '');
  if (!cleaned.startsWith('62')) return 'Nomor harus diawali 62';
  if (cleaned.length < 10) return 'Nomor minimal 10 digit';
  if (cleaned.length > 15) return 'Nomor maksimal 15 digit';
  return null;
}

export function validateEmail(value: string): string | null {
  if (!value || !value.trim()) return null; // opsional
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Format email tidak valid';
  return null;
}

export function validateWebsite(value: string): string | null {
  if (!value || !value.trim()) return null; // opsional
  const cleaned = value.trim().replace(/^https?:\/\//, '');
  if (!/^[^\s]+\.[^\s]+$/.test(cleaned)) return 'Format website tidak valid (contoh: alhijaz.co)';
  return null;
}

export function validateSlug(value: string): string | null {
  if (!value || !value.trim()) return 'Slug wajib diisi';
  if (value.trim().length < 2) return 'Slug minimal 2 karakter';
  if (!/^[a-z0-9-]+$/.test(value.trim())) return 'Hanya huruf kecil, angka, dan strip';
  return null;
}

export function validatePassword(value: string, required = false): string | null {
  if (!value) return required ? 'Password wajib diisi' : null;
  if (value.length < 6) return 'Password minimal 6 karakter';
  return null;
}

// --- Cleaners (auto-fix input values) ---

export function cleanPhone(value: string): string {
  let cleaned = value.replace(/\D/g, '');
  if (cleaned.startsWith('08')) cleaned = '62' + cleaned.substring(1);
  return cleaned;
}

export function cleanWebsite(value: string): string {
  return value.replace(/^https?:\/\//, '');
}
