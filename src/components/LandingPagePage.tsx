import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plane, Compass, Save, Upload, RotateCcw,
  Loader2, AlertCircle, CheckCircle2, ImageIcon, UserCircle, Globe, X,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import PhotoCropModal from './PhotoCropModal';
import BioEditorPage from './bio-editor/BioEditorPage';
import UrlCard from './bio-editor/UrlCard';
import CustomDomainTrigger from './CustomDomainTrigger';
import { useCustomDomain } from '../hooks/useCustomDomain';
import { getAgentPublicUrl } from '../lib/agentUrls';
import { isCustomDomainEnabledForAgent } from '../lib/customDomainAccess';

const TITLE_LIMIT = 60;
const DESC_LIMIT = 160;
const OG_MAX_BYTES = 5 * 1024 * 1024;
const OG_IDEAL_W = 1200;
const OG_IDEAL_H = 630;

type LandingType = 'umroh' | 'haji';
type ActiveTab = LandingType | 'bio';

/** Parse `/dashboard/ai-tools/landing-page/{tab}` → ActiveTab. Defaults to 'umroh'. */
function getLandingTabFromPath(): ActiveTab {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // expected shape: ['dashboard', 'ai-tools', 'landing-page', '<tab>']
  if (segments.length >= 4 && segments[2] === 'landing-page') {
    const sub = segments[3];
    if (sub === 'umroh' || sub === 'haji' || sub === 'bio') return sub;
  }
  return 'umroh';
}

interface FieldDraft {
  title: string;
  description: string;
  og_image_url: string | null;
}

interface ConfigState {
  umroh: FieldDraft;
  haji: FieldDraft;
}

interface Defaults {
  title: string;
  description: string | null;
}

interface DefaultsState {
  umroh: Defaults;
  haji: Defaults;
}

interface CurrentMetaState {
  umroh: { currentDescription: string };
  haji: { currentDescription: string };
}

function buildDraft(rawPerType: any): FieldDraft {
  return {
    title: (rawPerType?.title ?? '') as string,
    description: (rawPerType?.description ?? '') as string,
    og_image_url: (rawPerType?.og_image_url ?? null) as string | null,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function counterColor(len: number, max: number): string {
  if (len > max) return 'text-red-500';
  if (len >= max * 0.9) return 'text-amber-500 dark:text-amber-400';
  return 'text-gray-400 dark:text-slate-500';
}

interface Props {
  agent: { slug: string; name: string; photo: string; phone?: string; role?: string };
}

export default function LandingPagePage({ agent }: Props) {
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_landing_page'); mountTracked.current = true; } }, []);

  const customDomainEnabled = isCustomDomainEnabledForAgent(agent.slug);
  const { config: customDomainConfig, loading: customDomainLoading } = useCustomDomain({ enabled: customDomainEnabled });
  const agentForUrl = useMemo(() => ({
    slug: agent.slug,
    custom_domain: customDomainConfig?.domain ?? null,
    custom_domain_status: customDomainConfig?.status ?? null,
  }), [agent.slug, customDomainConfig?.domain, customDomainConfig?.status]);

  const [showCustomDomainAlert, setShowCustomDomainAlert] = useState(false);
  const [customDomainAlertClosing, setCustomDomainAlertClosing] = useState(false);

  const closeCustomDomainAlert = useCallback(() => {
    setCustomDomainAlertClosing(true);
    setTimeout(() => {
      setShowCustomDomainAlert(false);
      setCustomDomainAlertClosing(false);
    }, 200);
  }, []);

  const goToCustomDomain = useCallback(() => {
    if (!customDomainEnabled) {
      setCustomDomainAlertClosing(false);
      setShowCustomDomainAlert(true);
      return;
    }
    window.history.pushState({}, '', '/dashboard/ai-tools/landing-page/custom-domain');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [customDomainEnabled]);

  useEffect(() => {
    if (!showCustomDomainAlert) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCustomDomainAlert();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCustomDomainAlert, showCustomDomainAlert]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<ConfigState | null>(null);
  const [draft, setDraft] = useState<ConfigState | null>(null);
  const [defaults, setDefaults] = useState<DefaultsState | null>(null);
  const [currentMeta, setCurrentMeta] = useState<CurrentMetaState | null>(null);
  const [activeType, setActiveType] = useState<ActiveTab>(getLandingTabFromPath);

  // Push state on tab change so reload/back keeps the user on the active tab
  const switchTab = useCallback((tab: ActiveTab) => {
    setActiveType(tab);
    const newPath = `/dashboard/ai-tools/landing-page/${tab}`;
    if (typeof window !== 'undefined' && window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
  }, []);

  // Sync activeType when user navigates with browser back/forward
  useEffect(() => {
    const onPopState = () => setActiveType(getLandingTabFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Backfill URL on first mount when path doesn't yet have an explicit tab segment
  useEffect(() => {
    const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    const hasTabSegment = segments.length >= 4 && segments[2] === 'landing-page';
    if (!hasTabSegment) {
      window.history.replaceState({}, '', `/dashboard/ai-tools/landing-page/${activeType}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<LandingType | null>(null);
  const [cropTarget, setCropTarget] = useState<{ type: LandingType; dataUrl: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/landing-config', { headers: getAuthHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal memuat');
      const raw = json.data || {};
      const state: ConfigState = {
        umroh: buildDraft(raw.umroh),
        haji: buildDraft(raw.haji),
      };
      setLoaded(state);
      setDraft({ umroh: { ...state.umroh }, haji: { ...state.haji } });
      setDefaults(json.defaults);
      setCurrentMeta(json.currentMeta);
    } catch (err: any) {
      setLoadError(err.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const textDirty = useMemo(() => {
    if (!loaded || !draft) return false;
    return (
      draft.umroh.title !== loaded.umroh.title ||
      draft.umroh.description !== loaded.umroh.description ||
      draft.haji.title !== loaded.haji.title ||
      draft.haji.description !== loaded.haji.description
    );
  }, [loaded, draft]);

  const hasValidationError = useMemo(() => {
    if (!draft) return false;
    return (
      draft.umroh.title.length > TITLE_LIMIT ||
      draft.umroh.description.length > DESC_LIMIT ||
      draft.haji.title.length > TITLE_LIMIT ||
      draft.haji.description.length > DESC_LIMIT
    );
  }, [draft]);

  const updateField = (type: LandingType, key: 'title' | 'description', value: string) => {
    setDraft(prev => prev ? { ...prev, [type]: { ...prev[type], [key]: value } } : prev);
  };

  const handleSave = async () => {
    if (!draft || hasValidationError || !textDirty) return;
    setSaving(true);
    try {
      const res = await fetch('/api/landing-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          umroh: { title: draft.umroh.title, description: draft.umroh.description },
          haji: { title: draft.haji.title, description: draft.haji.description },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal menyimpan');
      const serverData = json.data || {};
      const nextLoaded: ConfigState = {
        umroh: { ...draft.umroh, title: serverData.umroh?.title ?? '', description: serverData.umroh?.description ?? '' },
        haji: { ...draft.haji, title: serverData.haji?.title ?? '', description: serverData.haji?.description ?? '' },
      };
      setLoaded(nextLoaded);
      setDraft({ umroh: { ...nextLoaded.umroh }, haji: { ...nextLoaded.haji } });
      showToast('Perubahan tersimpan', 'success');
      trackEvent('feature', 'landing_config_saved');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Step 1: user picks a file → open crop modal (no server upload yet)
  const handleOgFilePick = async (type: LandingType, file: File) => {
    if (!draft) return;
    if (file.size > OG_MAX_BYTES) {
      showToast('Ukuran file maksimal 5MB', 'error');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Format harus JPG, PNG, atau WebP', 'error');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setCropTarget({ type, dataUrl });
    } catch {
      showToast('Gagal membaca file', 'error');
    }
  };

  // Step 2: user confirms crop → upload cropped base64 to server
  const handleCropConfirm = async (croppedBase64: string) => {
    if (!cropTarget) return;
    const type = cropTarget.type;
    setCropTarget(null);
    setUploading(type);
    try {
      const res = await fetch('/api/landing-config/og-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ landing_type: type, image_data: croppedBase64 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload gagal');
      setLoaded(prev => prev ? { ...prev, [type]: { ...prev[type], og_image_url: json.og_image_url } } : prev);
      setDraft(prev => prev ? { ...prev, [type]: { ...prev[type], og_image_url: json.og_image_url } } : prev);
      showToast('Gambar berhasil diunggah', 'success');
    } catch (err: any) {
      showToast(err.message || 'Upload gagal', 'error');
    } finally {
      setUploading(null);
    }
  };

  const handleOgReset = async (type: LandingType) => {
    if (!draft) return;
    setUploading(type);
    try {
      const res = await fetch('/api/landing-config/og-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ landing_type: type }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal');
      setLoaded(prev => prev ? { ...prev, [type]: { ...prev[type], og_image_url: null } } : prev);
      setDraft(prev => prev ? { ...prev, [type]: { ...prev[type], og_image_url: null } } : prev);
      showToast('Gambar dikembalikan ke default', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal', 'error');
    } finally {
      setUploading(null);
    }
  };

  const handleCardReset = async (type: LandingType) => {
    if (!draft) return;
    const confirmed = window.confirm('Reset semua field di kartu ini ke default?');
    if (!confirmed) return;
    try {
      const wasCustomOg = !!draft[type].og_image_url;
      const putRes = await fetch('/api/landing-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ [type]: { title: '', description: '' } }),
      });
      const putJson = await putRes.json();
      if (!putRes.ok || !putJson.success) throw new Error(putJson.error || 'Reset gagal');

      if (wasCustomOg) {
        await fetch('/api/landing-config/og-image', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ landing_type: type }),
        });
      }
      await fetchConfig();
      showToast('Kembali ke default', 'success');
    } catch (err: any) {
      showToast(err.message || 'Reset gagal', 'error');
    }
  };

  if (loading) {
    return <LandingPageSkeleton activeType={activeType} />;
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 text-center">
        <AlertCircle size={36} className="mx-auto text-red-500 mb-3" />
        <p className="text-sm text-gray-600 dark:text-slate-300">{loadError}</p>
        <button
          onClick={fetchConfig}
          className="mt-4 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (!draft || !defaults || !currentMeta || !loaded) return null;

  return (
    <div className="max-w-lg mx-auto pt-4">
      {/* Custom Domain trigger — shown above tabs so it's visible across Umroh/Haji/Bio */}
      <div className="px-4 mb-3">
        <CustomDomainTrigger
          config={customDomainConfig}
          loading={customDomainEnabled && customDomainLoading}
          onClick={goToCustomDomain}
        />
      </div>

      {/* Segmented control: Umroh / Haji Plus / Bio — same px-4 inset for all tabs */}
      <div className="px-4 mb-4">
        <div className="bg-gray-100 dark:bg-slate-800 rounded-xl p-1 flex gap-1 w-full">
          <SegmentedTab
            active={activeType === 'umroh'}
            accent="emerald"
            icon={Plane}
            label="Umroh"
            onClick={() => switchTab('umroh')}
          />
          <SegmentedTab
            active={activeType === 'haji'}
            accent="amber"
            icon={Compass}
            label="Haji"
            onClick={() => switchTab('haji')}
          />
          <SegmentedTab
            active={activeType === 'bio'}
            accent="teal"
            icon={UserCircle}
            label="Bio"
            onClick={() => switchTab('bio')}
          />
        </div>
      </div>

      {activeType === 'bio' ? (
        <BioEditorPage agent={{ slug: agent.slug, name: agent.name, photo: agent.photo, phone: agent.phone }} />
      ) : activeType === 'umroh' ? (
        <div className="px-4 pb-28 flex flex-col gap-3">
          <UrlCard
            label="LANDING PAGE UMROH"
            url={getAgentPublicUrl(agentForUrl, '/umroh')}
            copyAriaLabel="Salin link umroh"
          />
          <LandingCard
            type="umroh"
            accent="emerald"
            draft={draft.umroh}
            loaded={loaded.umroh}
            defaults={defaults.umroh}
            currentDescription={currentMeta.umroh.currentDescription}
            uploading={uploading === 'umroh'}
            onChangeTitle={(v) => updateField('umroh', 'title', v)}
            onChangeDesc={(v) => updateField('umroh', 'description', v)}
            onUploadOg={(file) => handleOgFilePick('umroh', file)}
            onResetOg={() => handleOgReset('umroh')}
            onResetAll={() => handleCardReset('umroh')}
            agentPhoto={agent.photo}
            agentName={agent.name}
            agentSlug={agent.slug}
          />
        </div>
      ) : (
        <div className="px-4 pb-28 flex flex-col gap-3">
          <UrlCard
            label="LANDING PAGE HAJI"
            url={getAgentPublicUrl(agentForUrl, '/haji')}
            copyAriaLabel="Salin link haji"
          />
          <LandingCard
            type="haji"
            accent="amber"
            draft={draft.haji}
            loaded={loaded.haji}
            defaults={defaults.haji}
            currentDescription={currentMeta.haji.currentDescription}
            uploading={uploading === 'haji'}
            onChangeTitle={(v) => updateField('haji', 'title', v)}
            onChangeDesc={(v) => updateField('haji', 'description', v)}
            onUploadOg={(file) => handleOgFilePick('haji', file)}
            onResetOg={() => handleOgReset('haji')}
            onResetAll={() => handleCardReset('haji')}
            agentPhoto={agent.photo}
            agentName={agent.name}
            agentSlug={agent.slug}
          />
        </div>
      )}

      {/* Sticky save bar — hidden on Bio tab (Bio has its own auto-save) */}
      {textDirty && activeType !== 'bio' && (
        <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
          <div className="max-w-lg mx-auto px-4 pb-4 pointer-events-auto">
            <div className="backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-700 rounded-2xl shadow-lg p-2">
              <button
                onClick={handleSave}
                disabled={hasValidationError || saving}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] ${
                  (hasValidationError || saving)
                    ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                }`}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop modal */}
      <PhotoCropModal
        isOpen={!!cropTarget}
        imageUrl={cropTarget?.dataUrl || ''}
        onClose={() => setCropTarget(null)}
        onCropComplete={handleCropConfirm}
        aspect={OG_IDEAL_W / OG_IDEAL_H}
        cropShape="rect"
        outputWidth={OG_IDEAL_W}
        outputHeight={OG_IDEAL_H}
        title="Crop Gambar Pratinjau"
        hint={`Disarankan ${OG_IDEAL_W} × ${OG_IDEAL_H} px`}
        confirmLabel="Gunakan Gambar"
        quality={0.9}
      />

      {showCustomDomainAlert && (
        <CustomDomainComingSoonAlert
          closing={customDomainAlertClosing}
          onClose={closeCustomDomainAlert}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 bottom-24 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-md text-[11.5px] font-medium max-w-[90vw] whitespace-nowrap animate-[fadeIn_150ms_ease-out] ${
            toast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-200'
          }`}
        >
          {toast.type === 'success'
            ? <CheckCircle2 size={13} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
            : <AlertCircle size={13} className="text-red-500 dark:text-red-400 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

function CustomDomainComingSoonAlert({
  closing,
  onClose,
}: { closing: boolean; onClose: () => void }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 ${closing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl overflow-hidden ${closing ? 'dc-card-exit' : 'dc-card-enter'}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-domain-alert-title"
      >
        <div className="px-5 pt-5 pb-3 text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors active:scale-95"
            aria-label="Tutup popup"
          >
            <X size={15} strokeWidth={2.4} />
          </button>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center mx-auto mb-3">
            <Globe size={22} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
          </div>
          <h3 id="custom-domain-alert-title" className="text-sm font-bold text-gray-800 dark:text-white">
            Custom Domain Hampir Siap
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            Mohon bersabar sebentar lagi ya 😇
          </p>
        </div>
        <div className="px-5 pb-5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95"
          >
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`bg-gray-200 dark:bg-slate-700 animate-pulse ${className}`} />;
}

function LandingPageSkeleton({ activeType }: { activeType: ActiveTab }) {
  return (
    <div className="max-w-lg mx-auto pt-4">
      <div className="px-4 mb-3">
        <SkeletonBlock className="h-14 rounded-2xl" />
      </div>
      <div className="px-4 mb-4">
        <div className="bg-gray-100 dark:bg-slate-800 rounded-xl p-1 flex gap-1 w-full">
          <SkeletonBlock className="h-9 flex-1 rounded-lg" />
          <SkeletonBlock className="h-9 flex-1 rounded-lg" />
          <SkeletonBlock className="h-9 flex-1 rounded-lg" />
        </div>
      </div>

      {activeType === 'bio' ? (
        <BioTabSkeleton />
      ) : (
        <LandingTabSkeleton />
      )}
    </div>
  );
}

function LandingTabSkeleton() {
  return (
    <div className="px-4 pb-28 space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <SkeletonBlock className="w-10 h-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-3 w-24 rounded-full" />
              <SkeletonBlock className="h-4 w-3/4 rounded-full" />
            </div>
          </div>
          <SkeletonBlock className="h-8 w-20 rounded-xl shrink-0" />
        </div>
        <SkeletonBlock className="aspect-[1.91/1] w-full rounded-xl mb-5" />
        <div className="space-y-3">
          <SkeletonBlock className="h-11 w-full rounded-xl" />
          <SkeletonBlock className="h-24 w-full rounded-xl" />
          <SkeletonBlock className="h-10 w-full rounded-xl" />
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4 space-y-3">
        <SkeletonBlock className="h-4 w-32 rounded-full" />
        <SkeletonBlock className="h-10 w-full rounded-xl" />
        <SkeletonBlock className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

function BioTabSkeleton() {
  return (
    <div className="px-4 pb-24 flex flex-col gap-3">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="w-8 h-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-3 w-28 rounded-full" />
            <SkeletonBlock className="h-4 w-48 rounded-full" />
          </div>
          <SkeletonBlock className="h-8 w-20 rounded-lg shrink-0" />
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 space-y-3">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="w-9 h-9 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-24 rounded-full" />
            <SkeletonBlock className="h-3 w-44 rounded-full" />
          </div>
          <SkeletonBlock className="w-12 h-7 rounded-full shrink-0" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SkeletonBlock className="h-10 rounded-xl" />
          <SkeletonBlock className="h-10 rounded-xl" />
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
        <SkeletonBlock className="h-3 w-16 rounded-full mb-3" />
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3].map(i => <SkeletonBlock key={i} className="w-16 h-24 rounded-xl shrink-0" />)}
        </div>
      </div>
      <SkeletonBlock className="h-16 rounded-2xl" />
      <div className="space-y-2">
        <div className="flex justify-between px-1">
          <SkeletonBlock className="h-3 w-12 rounded-full" />
          <SkeletonBlock className="h-3 w-28 rounded-full" />
        </div>
        {[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-16 rounded-2xl" />)}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Segmented tab
// ──────────────────────────────────────────────

interface SegmentedTabProps {
  active: boolean;
  accent: 'emerald' | 'amber' | 'teal';
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function SegmentedTab({ active, accent, icon: Icon, label, onClick, disabled }: SegmentedTabProps) {
  const activeText = accent === 'emerald'
    ? 'text-emerald-500 dark:text-emerald-400'
    : accent === 'amber'
    ? 'text-amber-500 dark:text-amber-400'
    : 'text-teal-500 dark:text-teal-400';

  // Disabled tabs are still clickable so the parent can show a "coming soon" toast,
  // but visually look muted and don't take the active background.
  const visualState = active
    ? `bg-white dark:bg-slate-700 shadow-sm font-semibold ${activeText}`
    : disabled
    ? 'bg-transparent text-gray-300 dark:text-slate-600 font-medium opacity-70'
    : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium active:opacity-70';

  // We don't use `disabled` or `aria-disabled` because the tab is intentionally still
  // clickable for non-admins — it triggers a "coming soon" toast instead of switching.
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 ${visualState}`}
    >
      <Icon size={14} strokeWidth={active ? 2.4 : 2} />
      <span className="text-[13px]">{label}</span>
    </button>
  );
}

// ──────────────────────────────────────────────
// LandingCard
// ──────────────────────────────────────────────

interface CardProps {
  type: LandingType;
  accent: 'emerald' | 'amber';
  draft: FieldDraft;
  loaded: FieldDraft;
  defaults: Defaults;
  currentDescription: string;
  uploading: boolean;
  onChangeTitle: (v: string) => void;
  onChangeDesc: (v: string) => void;
  onUploadOg: (file: File) => void;
  onResetOg: () => void;
  onResetAll: () => void;
  agentPhoto: string;
  agentName: string;
  agentSlug: string;
}

const ACCENTS: Record<'emerald' | 'amber', {
  dot: string; focusBorder: string; focusRing: string; gradient: string;
}> = {
  emerald: {
    dot: 'bg-emerald-500',
    focusBorder: 'focus:border-emerald-500',
    focusRing: 'focus:ring-emerald-500/20',
    gradient: 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-800',
  },
  amber: {
    dot: 'bg-amber-500',
    focusBorder: 'focus:border-amber-500',
    focusRing: 'focus:ring-amber-500/20',
    gradient: 'bg-gradient-to-br from-amber-600 via-orange-600 to-rose-700',
  },
};

function LandingCard({
  type, accent,
  draft, loaded, defaults, currentDescription, uploading,
  onChangeTitle, onChangeDesc, onUploadOg, onResetOg, onResetAll,
  agentPhoto, agentName, agentSlug,
}: CardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const a = ACCENTS[accent];

  const titleLen = draft.title.length;
  const descLen = draft.description.length;
  const titleOver = titleLen > TITLE_LIMIT;
  const descOver = descLen > DESC_LIMIT;

  const effectiveTitle = draft.title.trim() || defaults.title;
  const effectiveDesc = draft.description.trim() || currentDescription;

  const showDefaultOgBtn = !!draft.og_image_url;
  const hasAnyCustom = !!(loaded.title || loaded.description || loaded.og_image_url);

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm">
      <div className="p-4">
        {/* OG Image — primary visual, clickable upload */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
              Gambar Pratinjau
            </label>
            <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">1200 × 630 px</span>
          </div>
          <div className="relative group">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={`relative w-full aspect-[1200/630] rounded-xl overflow-hidden border-2 border-dashed transition-all ${
                uploading
                  ? 'border-gray-200 dark:border-slate-700 cursor-wait'
                  : draft.og_image_url
                    ? 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 cursor-pointer'
                    : 'border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500 cursor-pointer'
              }`}
            >
              {draft.og_image_url ? (
                <img src={draft.og_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <DefaultOgPreview gradient={a.gradient} agentPhoto={agentPhoto} agentName={agentName} agentSlug={agentSlug} landingType={type} />
              )}
              {/* Hover / upload overlay */}
              <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                uploading ? 'bg-black/50 opacity-100' : 'bg-black/0 opacity-0 group-hover:bg-black/35 group-hover:opacity-100'
              }`}>
                {uploading ? (
                  <div className="flex items-center gap-2 text-white">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-xs font-semibold">Mengunggah…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-white">
                    <Upload size={18} />
                    <span className="text-xs font-semibold">Ganti Gambar</span>
                  </div>
                )}
              </div>
            </button>
            {showDefaultOgBtn && !uploading && (
              <button
                onClick={(e) => { e.stopPropagation(); onResetOg(); }}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white/95 dark:bg-slate-900/95 text-gray-700 dark:text-slate-200 shadow-sm hover:bg-white dark:hover:bg-slate-900 active:scale-95 transition-all"
                title="Kembali ke default"
              >
                <RotateCcw size={11} />
                Default
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadOg(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* Title */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
              Judul
            </label>
            <span className={`text-[10px] font-mono font-medium ${counterColor(titleLen, TITLE_LIMIT)}`}>
              {titleLen}/{TITLE_LIMIT}
            </span>
          </div>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onChangeTitle(e.target.value)}
            placeholder={defaults.title}
            className={`w-full px-3 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none transition-all focus:ring-2 ${
              titleOver
                ? 'border-red-400 dark:border-red-500 focus:ring-red-500/20 focus:border-red-500'
                : `border-gray-200 dark:border-slate-700 ${a.focusBorder} ${a.focusRing}`
            }`}
          />
          {!draft.title && (
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 pl-0.5">
              Kosong → pakai default
            </p>
          )}
        </div>

        {/* Description */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
              Deskripsi
            </label>
            <span className={`text-[10px] font-mono font-medium ${counterColor(descLen, DESC_LIMIT)}`}>
              {descLen}/{DESC_LIMIT}
            </span>
          </div>
          <textarea
            value={draft.description}
            onChange={(e) => onChangeDesc(e.target.value)}
            placeholder={currentDescription || 'Deskripsi singkat yang muncul di link preview…'}
            rows={3}
            className={`w-full px-3 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border resize-none min-h-[72px] text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none transition-all focus:ring-2 ${
              descOver
                ? 'border-red-400 dark:border-red-500 focus:ring-red-500/20 focus:border-red-500'
                : `border-gray-200 dark:border-slate-700 ${a.focusBorder} ${a.focusRing}`
            }`}
          />
          {!draft.description && (
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 pl-0.5">
              Kosong → pakai deskripsi Alhijaz default
            </p>
          )}
        </div>

        {/* WhatsApp preview — compact, as confirmation */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              Pratinjau WhatsApp
            </span>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700/50 p-2 flex gap-2.5">
            <div className="w-[72px] h-[72px] rounded-lg overflow-hidden bg-gray-200 dark:bg-slate-700 shrink-0">
              {draft.og_image_url ? (
                <img src={draft.og_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full ${a.gradient} flex items-center justify-center`}>
                  {agentPhoto ? (
                    <img src={agentPhoto} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-white/60" />
                  ) : (
                    <ImageIcon size={20} className="text-white/70" />
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-center">
              <div className="text-[9px] text-gray-400 dark:text-slate-500 uppercase tracking-wide">alhijaz.co</div>
              <div className="text-[13px] font-semibold text-gray-800 dark:text-white leading-tight mt-0.5 line-clamp-2">
                {effectiveTitle}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug mt-0.5 line-clamp-2">
                {effectiveDesc}
              </div>
            </div>
          </div>
        </div>

        {/* Reset all */}
        {hasAnyCustom && (
          <div className="flex justify-end mt-3">
            <button
              onClick={onResetAll}
              className="text-[11px] font-medium text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Reset semua ke default
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Default OG preview — branded generated fallback
// ──────────────────────────────────────────────

function DefaultOgPreview({
  gradient, agentPhoto, agentName, agentSlug, landingType,
}: {
  gradient: string;
  agentPhoto: string;
  agentName: string;
  agentSlug: string;
  landingType: LandingType;
}) {
  const [useFallback, setUseFallback] = useState(false);
  const realOgUrl = `/og/${agentSlug}.png`;

  if (!useFallback) {
    return (
      <img
        src={realOgUrl}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setUseFallback(true)}
      />
    );
  }

  // Synthetic fallback — when /og/{slug}.png doesn't exist yet
  const badgeLabel = landingType === 'umroh' ? 'JADWAL UMROH' : 'HAJI PLUS RAHMAH & UHUD';
  return (
    <div className={`relative w-full h-full ${gradient} flex flex-col items-center justify-center text-center px-4`}>
      <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
      {agentPhoto && (
        <div className="relative mb-2">
          <img
            src={agentPhoto}
            alt=""
            className="w-16 h-16 rounded-full object-cover border-[3px] border-white/80 shadow-lg"
          />
        </div>
      )}
      <div className="relative">
        <div className="inline-block text-[8px] font-bold text-white uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm">
          {badgeLabel}
        </div>
        <div className="text-white font-bold text-sm mt-1.5">{agentName}</div>
        <div className="text-white/70 text-[9px] font-semibold tracking-wider uppercase mt-0.5">Alhijaz Indowisata</div>
      </div>
    </div>
  );
}
