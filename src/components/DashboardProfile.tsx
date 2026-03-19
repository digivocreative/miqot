import { useState, useRef, useEffect } from 'react';
import { Save, Loader2, CheckCircle2, User, Globe, Phone, Mail, X, Pencil, Lock, Eye, EyeOff, ChevronRight, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import PhotoCropModal from './PhotoCropModal';
import { validateName, validatePhone, validateEmail, validateWebsite, cleanPhone, cleanWebsite } from '../utils/validation';

interface AgentProfile {
  slug: string;
  name: string;
  website: string;
  phone: string;
  email: string;
  photo: string;
  role: string;
}



// ── Password Change Modal ──
function PasswordModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwError, setPwError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);

  // Scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const reset = () => {
    setPw(''); setConfirmPw(''); setShowPw(false); setShowConfirm(false);
    setPwError(''); setConfirmError(''); setServerError('');
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      reset();
      onClose();
    }, 150);
  };

  const handleSave = async () => {
    setPwError(''); setConfirmError(''); setServerError('');
    let valid = true;
    if (!pw) { setPwError('Password wajib diisi'); valid = false; }
    else if (pw.length < 6) { setPwError('Password minimal 6 karakter'); valid = false; }
    if (!confirmPw) { setConfirmError('Konfirmasi password wajib diisi'); valid = false; }
    else if (pw !== confirmPw) { setConfirmError('Password tidak cocok'); valid = false; }
    if (!valid) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setServerError(data.error || 'Gagal mengubah password');
        setSaving(false);
        return;
      }
      setSaving(false);
      reset();
      onClose();
      onSuccess();
    } catch {
      setServerError('Gagal menghubungi server');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const animStyle = closing
    ? { animation: 'pwModalOut 0.15s ease forwards' }
    : { animation: 'pwModalIn 0.15s ease' };
  const overlayAnim = closing
    ? { animation: 'pwOverlayOut 0.15s ease forwards' }
    : { animation: 'pwOverlayIn 0.15s ease' };

  return (
    <>
      <style>{`
        @keyframes pwOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pwOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes pwModalIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes pwModalOut { from { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } }
      `}</style>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        style={overlayAnim}
        onClick={handleClose}
      />
      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl"
        style={{ ...animStyle, transform: 'translate(-50%, -50%)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-1">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400 mx-auto mb-2">
            <Lock size={20} />
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-white text-center">Ubah Password</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center mt-1">Masukkan password baru kamu</p>
        </div>

        {/* Form */}
        <div className="px-5 pt-4 space-y-3">
          {/* Password Baru */}
          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 block">Password Baru</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={pw}
                onChange={e => { setPw(e.target.value); setPwError(''); }}
                placeholder="Minimal 6 karakter"
                autoFocus
                className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pwError && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">{pwError}</p>}
          </div>

          {/* Konfirmasi Password */}
          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 block">Konfirmasi Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setConfirmError(''); }}
                placeholder="Ketik ulang password baru"
                className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmError && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">{confirmError}</p>}
          </div>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="mx-5 mt-3 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium text-center">
            {serverError}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pt-4 pb-5 flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Menyimpan...</>
            ) : (
              <><Save size={16} /> Simpan</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Profile Component ──
export default function DashboardProfile({ agent, onUpdated }: { agent: AgentProfile; onUpdated: () => void }) {
  const [name, setName] = useState(agent.name);
  const [website, setWebsite] = useState(agent.website);
  const [phone, setPhone] = useState(agent.phone);
  const [email, setEmail] = useState(agent.email || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(agent.photo);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [slugValue, setSlugValue] = useState(agent.slug);
  const [showSlugEdit, setShowSlugEdit] = useState(false);
  const [closingSlugEdit, setClosingSlugEdit] = useState(false);
  const [slugInput, setSlugInput] = useState(agent.slug);
  const [savingSlug, setSavingSlug] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Field error helpers ──
  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleBlur = (key: string, value: string) => {
    let err: string | null = null;
    if (key === 'name') err = validateName(value);
    else if (key === 'phone') err = validatePhone(value);
    else if (key === 'email') err = validateEmail(value);
    else if (key === 'website') err = validateWebsite(value);
    if (err) setFieldErrors(prev => ({ ...prev, [key]: err! }));
    else clearFieldError(key);
  };

  const validateAll = (): boolean => {
    const errs: Record<string, string> = {};
    const nameErr = validateName(name); if (nameErr) errs.name = nameErr;
    const phoneErr = validatePhone(phone); if (phoneErr) errs.phone = phoneErr;
    const emailErr = validateEmail(email); if (emailErr) errs.email = emailErr;
    const websiteErr = validateWebsite(website); if (websiteErr) errs.website = websiteErr;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Input class with error state ──
  const inputCls = (key: string) =>
    `w-full px-3 py-2.5 bg-white dark:bg-slate-900 border ${
      fieldErrors[key]
        ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500'
        : 'border-gray-200 dark:border-slate-700 focus:ring-emerald-500 focus:border-emerald-500'
    } rounded-xl text-sm focus:ring-2 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500`;

  const handleSave = async () => {
    setError('');
    if (!validateAll()) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { name, website, phone, email };
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal menyimpan');
        setSaving(false);
        return;
      }
      setSaving(false);
      setSaved(true);
      setSavedMessage('Profil disimpan.');
      onUpdated();
      setTimeout(() => { setSaved(false); setSavedMessage(''); }, 2500);
    } catch {
      setError('Gagal menghubungi server');
      setSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Format foto harus JPG atau PNG');
      e.target.value = '';
      return;
    }
    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran foto maksimal 5MB');
      e.target.value = '';
      return;
    }
    setCropImage(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleCropSave = async (croppedBase64: string) => {
    // Cleanup object URL
    if (cropImage) URL.revokeObjectURL(cropImage);
    setCropImage(null);
    setUploadingPhoto(true);
    try {
      const res = await fetch('/api/admin/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ image: croppedBase64 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPhotoUrl(data.photo);
        onUpdated();
      } else {
        setError(data.error || 'Gagal upload foto');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setUploadingPhoto(false);
  };

  const handleCropClose = () => {
    if (cropImage) URL.revokeObjectURL(cropImage);
    setCropImage(null);
  };

  const handleSlugSave = async () => {
    const newSlug = slugInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!newSlug || newSlug === slugValue) {
      setShowSlugEdit(false);
      return;
    }
    setSavingSlug(true);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ slug: newSlug }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Server returns new JWT when slug changes — update stored session
        if (data.newToken && data.user) {
          const session = { token: data.newToken, user: data.user };
          const storage = localStorage.getItem('auth_session') ? localStorage : sessionStorage;
          storage.setItem('auth_session', JSON.stringify(session));
        }
        setSlugValue(newSlug);
        onUpdated();
      } else {
        setError(data.error || 'Gagal mengubah slug');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setSavingSlug(false);
    setShowSlugEdit(false);
  };

  const closeSlugEdit = () => {
    setClosingSlugEdit(true);
    setTimeout(() => {
      setShowSlugEdit(false);
      setClosingSlugEdit(false);
    }, 200);
  };

  const hasChanges = name !== agent.name || website !== agent.website || phone !== agent.phone || email !== (agent.email || '');
  const requiredMissing = !name.trim() || !phone.trim();
  const hasErrors = Object.keys(fieldErrors).length > 0;

  return (
    <div className="space-y-4">
      {/* Crop Modal */}
      <PhotoCropModal
        isOpen={!!cropImage}
        imageUrl={cropImage || ''}
        onClose={handleCropClose}
        onCropComplete={handleCropSave}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Avatar + Info Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm !mt-0">
        <div className="flex flex-col items-center mb-6">
          {/* Photo with edit button */}
          <div className="relative inline-block mb-3">
            {uploadingPhoto && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-full">
                <Loader2 size={24} className="animate-spin text-white" />
              </div>
            )}
            <img
              src={photoUrl}
              alt={agent.name}
              className="w-[90px] h-[90px] rounded-full object-cover"
              style={{ border: '3px solid #e5e7eb' }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(agent.name)}&background=random&size=180`;
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-[30px] h-[30px] rounded-full flex items-center justify-center cursor-pointer"
              style={{
                background: '#065f46',
                border: '3px solid #ffffff',
                padding: 0,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#064e3b')}
              onMouseLeave={e => (e.currentTarget.style.background = '#065f46')}
              title="Ganti Foto"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ffffff" strokeWidth="2">
                <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/>
                <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/>
              </svg>
            </button>
          </div>
          {/* Name only */}
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{agent.name}</h2>
          {/* URL + edit slug */}
          <div className="flex items-center justify-center mt-2">
            <button
              type="button"
              onClick={() => { setSlugInput(slugValue); setShowSlugEdit(true); }}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors cursor-pointer"
              title="Edit slug"
            >
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">alhijaz.co/{slugValue}</span>
              <Pencil size={11} className="text-emerald-500 dark:text-emerald-400" />
            </button>
          </div>
        </div>

        {/* Slug Edit Modal */}
        {showSlugEdit && (
          <>
            <style>{`
              @keyframes slugOverlayIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes slugOverlayOut { from { opacity: 1; } to { opacity: 0; } }
              @keyframes slugModalIn { from { opacity: 0; transform: scale(0.92) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
              @keyframes slugModalOut { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(0.92) translateY(12px); } }
            `}</style>
            <div
              className="fixed inset-0 z-50 flex items-center justify-center px-4"
              style={{
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                animation: closingSlugEdit ? 'slugOverlayOut 0.2s ease forwards' : 'slugOverlayIn 0.25s ease',
              }}
              onClick={e => { if (e.target === e.currentTarget) closeSlugEdit(); }}
            >
              <div
                className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden"
                style={{
                  animation: closingSlugEdit ? 'slugModalOut 0.2s ease forwards' : 'slugModalIn 0.3s cubic-bezier(0.16,1,0.3,1)',
                }}
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white">Edit URL Slug</h3>
                  <button
                    onClick={closeSlugEdit}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="px-5 py-4">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Slug</label>
                  <div className="flex items-center gap-0 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
                    <span className="pl-3 text-sm text-gray-400 dark:text-slate-500 whitespace-nowrap">alhijaz.co/</span>
                    <input
                      type="text"
                      value={slugInput}
                      onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      autoFocus
                      className="flex-1 px-1 py-2.5 bg-transparent text-sm text-gray-800 dark:text-white outline-none"
                      onKeyDown={e => { if (e.key === 'Enter') handleSlugSave(); }}
                    />
                  </div>
                </div>
                <div className="flex gap-3 px-5 py-3 border-t border-gray-100 dark:border-slate-700">
                  <button
                    onClick={closeSlugEdit}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSlugSave}
                    disabled={savingSlug}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors active:scale-95 disabled:opacity-60"
                  >
                    {savingSlug ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <User size={12} /> Nama Lengkap
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); clearFieldError('name'); }}
              onBlur={() => handleBlur('name', name)}
              className={inputCls('name')}
            />
            {fieldErrors.name && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors.name}</p>}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Globe size={12} /> Website
            </label>
            <input
              type="text"
              value={website}
              onChange={e => { setWebsite(cleanWebsite(e.target.value)); clearFieldError('website'); }}
              onBlur={() => handleBlur('website', website)}
              placeholder="contoh: alhijaz.co/nikita"
              className={inputCls('website')}
            />
            {fieldErrors.website && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors.website}</p>}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Phone size={12} /> Nomor HP
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => { setPhone(cleanPhone(e.target.value)); clearFieldError('phone'); }}
              onBlur={() => handleBlur('phone', phone)}
              placeholder="628xxxxxxxxxx"
              className={inputCls('phone')}
            />
            {fieldErrors.phone && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors.phone}</p>}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Mail size={12} /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearFieldError('email'); }}
              onBlur={() => handleBlur('email', email)}
              placeholder="agent@email.com"
              className={inputCls('email')}
            />
            {fieldErrors.email && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors.email}</p>}
          </div>

        {/* Separator + Password Section */}
        <div className="border-t border-gray-100 dark:border-slate-700/50 pt-4 mt-4">
          <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">KATA SANDI</p>
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="flex items-center justify-between w-full px-3 py-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-gray-500 dark:text-slate-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-slate-200">Ubah Password</span>
            </div>
            <ChevronRight size={16} className="text-gray-400 dark:text-slate-500" />
          </button>
        </div>

        {/* Password Change Modal */}
        <PasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => {
            setSaved(true);
            setSavedMessage('Password berhasil diubah.');
            setTimeout(() => { setSaved(false); setSavedMessage(''); }, 2500);
          }}
        />
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        {/* Saved toast message */}
        {saved && savedMessage && (
          <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {savedMessage}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || saved || !hasChanges || requiredMissing || hasErrors}
          className={`mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 active:scale-95 ${
            saved
              ? 'bg-emerald-500 text-white'
              : hasChanges && !requiredMissing && !hasErrors
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {saving ? (
            <><Loader2 size={18} className="animate-spin" /> Menyimpan...</>
          ) : saved ? (
            <><CheckCircle2 size={18} /> Tersimpan!</>
          ) : (
            <><Save size={18} /> Simpan Perubahan</>
          )}
        </button>
      </div>
    </div>
  );
}
