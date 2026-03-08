import { useState, useEffect } from 'react';
import { Eye, EyeOff, LogIn, Loader2, User, Lock, LogOut, Search, Calendar, Building2, Trash2, KeyRound } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

type ViewState = 'loading' | 'login' | 'connecting' | 'connected';

export default function JamaahPage() {
  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [kantor, setKantor] = useState('2'); // Default: Cabang
  const [showPassword, setShowPassword] = useState(false);

  // Session state
  const [view, setView] = useState<ViewState>('loading');
  const [error, setError] = useState('');
  const [connectedUser, setConnectedUser] = useState('');
  const [connectedKantor, setConnectedKantor] = useState('2');

  // Saved credentials state
  const [hasSavedCreds, setHasSavedCreds] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [deletingCreds, setDeletingCreds] = useState(false);

  // Filter state
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [tglAwal, setTglAwal] = useState(firstOfMonth);
  const [tglAkhir, setTglAkhir] = useState(today);

  // Data state
  const [fetching, setFetching] = useState(false);
  const [laporanHtml, setLaporanHtml] = useState('');

  // ── On mount: check for saved credentials ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/jamaah-creds', { headers: { ...getAuthHeaders() } });
        const data = await res.json();
        if (data.saved) {
          setHasSavedCreds(true);
          // Try auto-login
          const loginRes = await fetch('/api/jamaah-creds/auto-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          });
          const loginData = await loginRes.json();
          if (loginRes.ok && loginData.success) {
            setConnectedUser(loginData.username);
            setConnectedKantor(loginData.kantor || '2');
            setView('connected');
            return;
          }
        }
      } catch { /* ignore — fall through to login form */ }
      setView('login');
    })();
  }, []);

  // ── Login handler ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Username dan password wajib diisi');
      return;
    }

    setView('connecting');

    try {
      const res = await fetch('/api/laporan/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ username, password, kantor }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal login');
        setView('login');
        return;
      }

      // Always save credentials for auto-login
      setSavingCreds(true);
      try {
        await fetch('/api/jamaah-creds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ username, password, kantor }),
        });
        setHasSavedCreds(true);
      } catch { /* ignore save error */ }
      setSavingCreds(false);

      setConnectedUser(username);
      setConnectedKantor(kantor);
      setPassword(''); // Clear password from memory
      setView('connected');
    } catch {
      setError('Gagal menghubungi server');
      setView('login');
    }
  };

  // ── Fetch laporan handler ──
  const handleFetch = async () => {
    if (!connectedUser) return;
    setError('');
    setFetching(true);

    try {
      const params = new URLSearchParams({
        username: connectedUser,
        kantor: connectedKantor,
        agentId: connectedUser,
        tglAwal,
        tglAkhir,
      });

      const res = await fetch(`/api/laporan/fetch?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.error?.includes('kedaluwarsa') || data.error?.includes('login ulang')) {
          setView('login');
          setConnectedUser('');
          setLaporanHtml('');
          setError('Session kedaluwarsa, silakan login ulang');
        } else {
          setError(data.error || 'Gagal mengambil data');
        }
        setFetching(false);
        return;
      }

      setLaporanHtml(data.html || '');
    } catch {
      setError('Gagal menghubungi server');
    }
    setFetching(false);
  };

  // ── Disconnect handler (only clears in-memory session) ──
  const handleDisconnect = async () => {
    try {
      await fetch('/api/laporan/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ username: connectedUser }),
      });
    } catch { /* ignore */ }
    setView('login');
    setConnectedUser('');
    setConnectedKantor('2');
    setLaporanHtml('');
    setError('');
    setUsername('');
  };

  // ── Delete saved credentials ──
  const handleDeleteCreds = async () => {
    setDeletingCreds(true);
    try {
      await fetch('/api/jamaah-creds', {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      setHasSavedCreds(false);
    } catch { /* ignore */ }
    setDeletingCreds(false);
  };

  // ── Loading state ──
  if (view === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-emerald-500" />
        <span className="ml-2 text-sm text-gray-500 dark:text-slate-400">Memeriksa credentials...</span>
      </div>
    );
  }

  // ── Connected View ──
  if (view === 'connected') {
    return (
      <div className="px-4 pt-4 pb-8 space-y-4">
        {/* Session bar */}
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Terhubung sebagai {connectedUser}
            </span>
          </div>
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={12} /> Disconnect
          </button>
        </div>

        {/* Filter form */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50">
            <h3 className="text-xs font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <Calendar size={12} /> Filter Laporan
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">
                  Tanggal Awal
                </label>
                <input
                  type="date"
                  value={tglAwal}
                  onChange={e => setTglAwal(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">
                  Tanggal Akhir
                </label>
                <input
                  type="date"
                  value={tglAkhir}
                  onChange={e => setTglAkhir(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white"
                />
              </div>
            </div>
            <button
              onClick={handleFetch}
              disabled={fetching}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
            >
              {fetching ? (
                <><Loader2 size={16} className="animate-spin" /> Mengambil data...</>
              ) : (
                <><Search size={16} /> Tampilkan Laporan</>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium text-center">
            {error}
          </div>
        )}

        {/* Laporan HTML result */}
        {laporanHtml && !fetching && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50">
              <h3 className="text-xs font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wide">
                Hasil Laporan
              </h3>
            </div>
            <div className="overflow-x-auto">
              <div
                className="laporan-content p-4 text-sm text-gray-800 dark:text-slate-200"
                dangerouslySetInnerHTML={{ __html: laporanHtml }}
              />
            </div>
          </div>
        )}

        {/* No data yet */}
        {!laporanHtml && !fetching && !error && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400 dark:text-slate-500">Pilih tanggal lalu klik &quot;Tampilkan Laporan&quot;</p>
          </div>
        )}
      </div>
    );
  }

  // ── Login Form ──
  return (
    <div className="px-4 pt-4 pb-8">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Header info */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-slate-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center border border-amber-100 dark:border-amber-800/40">
              <Calendar size={14} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800 dark:text-white">Laporan Data Jamaah</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500">Sistem Internal Alhijaz</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
            Masukkan kredensial untuk mengakses laporan data jamaah.
          </p>
        </div>

        <form onSubmit={handleLogin} className="p-5 space-y-4">
          {/* Kantor */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Building2 size={12} /> Kantor
            </label>
            <select
              value="2"
              disabled
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white disabled:opacity-50"
            >
              <option value="1">Pusat</option>
              <option value="2">Cabang</option>
            </select>
          </div>

          {/* Username */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <User size={12} /> Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="SMxxxx"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={view === 'connecting'}
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50"
            />
          </div>

          {/* Password */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Lock size={12} /> Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Masukkan password"
                disabled={view === 'connecting'}
                className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>


          {/* Error */}
          {error && (
            <div className="flex items-center justify-center gap-1.5 py-2">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-xs font-medium text-red-500">{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={view === 'connecting' || savingCreds}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
          >
            {view === 'connecting' ? (
              <><Loader2 size={16} className="animate-spin" /> Menghubungkan...</>
            ) : (
              <><LogIn size={16} /> Login</>
            )}
          </button>

          {/* Connecting info */}
          {view === 'connecting' && (
            <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center">
              Sedang login ke sistem internal, mohon tunggu...
            </p>
          )}
        </form>

        {/* Saved credentials info + delete button */}
        {hasSavedCreds && view === 'login' && (
          <div className="px-5 pb-5 -mt-1">
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/30 rounded-xl">
              <div className="flex items-center gap-1.5">
                <KeyRound size={12} className="text-blue-500 dark:text-blue-400" />
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  Credentials tersimpan
                </span>
              </div>
              <button
                onClick={handleDeleteCreds}
                disabled={deletingCreds}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
              >
                {deletingCreds ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                Hapus
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
