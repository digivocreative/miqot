import { useState, useRef, useEffect } from 'react';
import { Save, Loader2, CheckCircle2, User, Globe, Phone, Mail, X, Pencil } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import PhotoCropModal from './PhotoCropModal';

interface AgentProfile {
  slug: string;
  name: string;
  website: string;
  phone: string;
  email: string;
  photo: string;
  role: string;
}


// ── Main Profile Component ──
export default function DashboardProfile({ agent, onUpdated }: { agent: AgentProfile; onUpdated: () => void }) {
  const [name, setName] = useState(agent.name);
  const [website, setWebsite] = useState(agent.website);
  const [phone, setPhone] = useState(agent.phone);
  const [email, setEmail] = useState(agent.email || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [photoUrl, setPhotoUrl] = useState(agent.photo);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [slugValue, setSlugValue] = useState(agent.slug);
  const [showSlugEdit, setShowSlugEdit] = useState(false);
  const [closingSlugEdit, setClosingSlugEdit] = useState(false);
  const [slugInput, setSlugInput] = useState(agent.slug);
  const [savingSlug, setSavingSlug] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name, website, phone, email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal menyimpan');
        setSaving(false);
        return;
      }
      setSaving(false);
      setSaved(true);
      onUpdated();
      setTimeout(() => setSaved(false), 2000);
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
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Globe size={12} /> Website
            </label>
            <input
              type="text"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="contoh: alhijaz.co/nikita"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Phone size={12} /> Nomor HP
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="628xxxxxxxxxx"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Mail size={12} /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="agent@email.com"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || saved || !hasChanges}
          className={`mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 active:scale-95 ${
            saved
              ? 'bg-emerald-500 text-white'
              : hasChanges
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
