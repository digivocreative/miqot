import { useEffect, useState, type ReactNode } from 'react';
import { aiwGateStatus } from '../../lib/aiw-account.js';
import { getAuthHeaders, getStoredSession, updateStoredUser } from '../lib/authSession';

// Lewat dari ini halaman dibuka saja: status yang gagal dibaca tidak mengunci siapa pun.
const CHECK_TIMEOUT_MS = 4000;

/**
 * Penjaga halaman /:slug, Kalkulasi, dan Compare untuk agent yang sedang login.
 * Agent yang pasti belum punya Akun AIW dialihkan ke form di menu Jamaah.
 *
 * Status tersimpan hanya menentukan apakah halaman boleh tampil sambil menunggu:
 * status "belum punya" tetap dipastikan ke server dulu, karena agent bisa saja sudah
 * login Akun AIW dari perangkat lain.
 */
export default function AiwAccountGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [ready, setReady] = useState(() => aiwGateStatus(getStoredSession()?.user) === 'open');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    fetch('/api/auth/me', { headers: getAuthHeaders(), signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then(user => {
        if (user) updateStoredUser(user);
        // Halaman yang sudah tampil tidak direbut; status baru berlaku di kunjungan berikutnya.
        if (!ready && aiwGateStatus(user) === 'locked') window.location.replace('/dashboard/jamaah');
        else setReady(true);
      })
      .catch(() => setReady(true))
      .finally(() => window.clearTimeout(timer));
    // Cukup sekali per muat halaman.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{ready ? children : fallback}</>;
}
