import { useState, useEffect, useCallback, useRef } from 'react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import {
  Search, Plus, X, User, Globe, Phone as PhoneIcon, Mail, Lock,
  Shield, Building2, Eye, EyeOff, Loader2, ChevronRight, Check,
  Trash2, AlertTriangle, Link as LinkIcon, AlertCircle,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import PhotoCropModal from './PhotoCropModal';
import FilterDropdown from './FilterDropdown';
import { validateName, validatePhone, validateEmail, validateWebsite, validateSlug, validatePassword, cleanPhone, cleanWebsite } from '../utils/validation';

// ── Types ──
interface AgentItem {
  slug: string;
  name: string;
  website: string;
  phone: string;
  email: string;
  photo: string;
  role: string;
  jamaah_username: string;
  jamaah_password: string;
  jamaah_kantor: string;
  status?: string;
  registered_at?: string;
  last_jamaah_sync_at?: string | null;
  sync_health?: 'ok' | 'stale' | 'pending' | 'disconnected' | 'no_credentials';
  sync_age_hours?: number | null;
}

// Compact "time since last sync" label, e.g. "29 hari" / "13 jam".
function fmtSyncAge(hours?: number | null): string {
  if (hours == null || !isFinite(hours)) return '—';
  if (hours >= 48) return `${Math.floor(hours / 24)} hari`;
  if (hours >= 1) return `${Math.floor(hours)} jam`;
  return '<1 jam';
}

interface FormData {
  name: string;
  slug: string;
  email: string;
  phone: string;
  website: string;
  password: string;
  role: string;
  jamaah_username: string;
  jamaah_password: string;
  jamaah_kantor: string;
}

const EMPTY_FORM: FormData = {
  name: '', slug: '', email: '', phone: '', website: '',
  password: '', role: 'agent',
  jamaah_username: '', jamaah_password: '', jamaah_kantor: '2',
};

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Reusable WhatsApp inline SVG icon ──
function WaIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .612.616l4.556-1.473A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.94 9.94 0 0 1-5.39-1.583l-.386-.232-3.007.973.998-2.927-.256-.406A9.935 9.935 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
  );
}

// ── Main Component ──
export default function AgentManagementPage() {
  // List state
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'rejected'>('all');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null);
  const [modalClosing, setModalClosing] = useState(false);

  // Form state
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [initialForm, setInitialForm] = useState<FormData>({ ...EMPTY_FORM });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<string | null>(null); // base64
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null); // objectURL for crop modal
  const [showPw, setShowPw] = useState(false);
  const [showJamaahPw, setShowJamaahPw] = useState(false);
  const [slugManual, setSlugManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteClosing, setDeleteClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Unsaved changes confirm
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_agents'); mountTracked.current = true; } }, []);

  // ── Fetch agents ──
  const fetchAgents = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/agents', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAgents(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  // ── Approve / Reject handlers ──
  const [approving, setApproving] = useState<string | null>(null);

  const handleApprove = async (slug: string) => {
    setApproving(slug);
    try {
      const res = await fetch(`/api/admin/agents/${slug}/approve`, { method: 'PUT', headers: getAuthHeaders() });
      if (res.ok) fetchAgents();
    } catch { /* ignore */ }
    setApproving(null);
  };

  const handleReject = async (slug: string) => {
    if (!confirm(`Tolak pendaftaran ${slug}?`)) return;
    setApproving(slug);
    try {
      const res = await fetch(`/api/admin/agents/${slug}/reject`, { method: 'PUT', headers: getAuthHeaders() });
      if (res.ok) fetchAgents();
    } catch { /* ignore */ }
    setApproving(null);
  };

  // ── Counts ──
  const pendingCount = agents.filter(a => a.status === 'pending').length;

  // ── Sync watchlist: active agents whose jamaah sync has silently stopped ──
  // 'stale' = credentials saved but rejected upstream; 'disconnected' = creds
  // removed but the agent had been syncing (data going stale). Computed from the
  // FULL list, not the filtered view, so it stays visible under any filter.
  const stuckAgents = agents
    .filter(a => (a.sync_health === 'stale' || a.sync_health === 'disconnected') && (!a.status || a.status === 'active'))
    .sort((x, y) => (y.sync_age_hours ?? 0) - (x.sync_age_hours ?? 0));

  // ── Filtered list ──
  const statusFiltered = statusFilter === 'all'
    ? agents
    : agents.filter(a => {
        if (statusFilter === 'active') return !a.status || a.status === 'active';
        return a.status === statusFilter;
      });

  const filtered = searchQuery.trim()
    ? statusFiltered.filter(a => {
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q)
          || a.slug.toLowerCase().includes(q)
          || (a.phone || '').includes(q)
          || (a.email || '').toLowerCase().includes(q);
      })
    : statusFiltered;

  // ── Dirty check ──
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm) || !!photoFile;

  // ── Open modal ──
  const openCreate = () => {
    const f = { ...EMPTY_FORM };
    setForm(f);
    setInitialForm(f);
    setPhotoPreview(null);
    setPhotoFile(null);
    if (cropImageUrl) { URL.revokeObjectURL(cropImageUrl); setCropImageUrl(null); }
    setSlugManual(false);
    setShowPw(false);
    setShowJamaahPw(false);
    setServerError('');
    setFieldErrors({});
    setModalMode('create');
    setEditingAgent(null);
    setModalOpen(true);
  };

  const openEdit = (agent: AgentItem) => {
    const f: FormData = {
      name: agent.name || '',
      slug: agent.slug || '',
      email: agent.email || '',
      phone: agent.phone || '',
      website: agent.website || '',
      password: '',
      role: agent.role || 'agent',
      jamaah_username: agent.jamaah_username || '',
      jamaah_password: '',
      jamaah_kantor: agent.jamaah_kantor || '2',
    };
    setForm(f);
    setInitialForm(f);
    setPhotoPreview(agent.photo || null);
    setPhotoFile(null);
    if (cropImageUrl) { URL.revokeObjectURL(cropImageUrl); setCropImageUrl(null); }
    setSlugManual(true);
    setShowPw(false);
    setShowJamaahPw(false);
    setServerError('');
    setFieldErrors({});
    setModalMode('edit');
    setEditingAgent(agent);
    setModalOpen(true);
  };

  // ── Close modal (with animation) ──
  const closeModal = useCallback(() => {
    setModalClosing(true);
    setTimeout(() => {
      setModalOpen(false);
      setModalClosing(false);
    }, 200);
  }, []);

  const tryCloseModal = () => {
    if (isDirty) { setShowUnsavedConfirm(true); return; }
    closeModal();
  };

  // ── Photo picker ──
  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setServerError('Format foto harus JPG atau PNG');
      e.target.value = '';
      return;
    }
    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setServerError('Ukuran foto maksimal 5MB');
      e.target.value = '';
      return;
    }
    setCropImageUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleCropComplete = (croppedBase64: string) => {
    if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
    setCropImageUrl(null);
    setPhotoPreview(croppedBase64);
    setPhotoFile(croppedBase64);
  };

  const handleCropClose = () => {
    if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
    setCropImageUrl(null);
  };

  // ── Form field updater with auto-fix ──
  const setField = (key: keyof FormData, value: string) => {
    let v = value;
    // Auto-fix on change
    if (key === 'phone') v = cleanPhone(v);
    if (key === 'website') v = cleanWebsite(v);
    setForm(prev => {
      const next = { ...prev, [key]: v };
      // Auto-generate slug from name (only in create mode and if slug hasn't been manually edited)
      if (key === 'name' && modalMode === 'create' && !slugManual) {
        next.slug = slugify(v);
      }
      return next;
    });
    // Clear field error
    if (fieldErrors[key]) setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  // ── onBlur per-field validation ──
  const handleFieldBlur = (key: string, value: string) => {
    let err: string | null = null;
    if (key === 'name') err = validateName(value);
    else if (key === 'phone') err = validatePhone(value);
    else if (key === 'email') err = validateEmail(value);
    else if (key === 'website') err = validateWebsite(value);
    else if (key === 'slug') err = validateSlug(value);
    else if (key === 'password') err = validatePassword(value, modalMode === 'create');
    if (err) setFieldErrors(prev => ({ ...prev, [key]: err! }));
    else if (fieldErrors[key]) setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  // ── Client-side validation ──
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const nameErr = validateName(form.name); if (nameErr) errs.name = nameErr;
    const slugErr = validateSlug(form.slug); if (slugErr) errs.slug = slugErr;
    const phoneErr = validatePhone(form.phone); if (phoneErr) errs.phone = phoneErr;
    const emailErr = validateEmail(form.email); if (emailErr) errs.email = emailErr;
    const websiteErr = validateWebsite(form.website); if (websiteErr) errs.website = websiteErr;
    const pwErr = validatePassword(form.password, modalMode === 'create'); if (pwErr) errs.password = pwErr;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save ──
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setServerError('');

    try {
      const isCreate = modalMode === 'create';
      const url = isCreate ? '/api/admin/agents' : `/api/admin/agents/${editingAgent!.slug}`;
      const method = isCreate ? 'POST' : 'PUT';

      // Build body — only include changed/non-empty fields for edit
      const body: Record<string, string> = {};
      if (isCreate) {
        body.slug = form.slug;
        body.name = form.name;
        body.password = form.password;
        if (form.phone) body.phone = form.phone;
        if (form.email) body.email = form.email;
        if (form.website) body.website = form.website;
        if (form.role) body.role = form.role;
        if (form.jamaah_username) body.jamaah_username = form.jamaah_username;
        if (form.jamaah_password) body.jamaah_password = form.jamaah_password;
        if (form.jamaah_kantor) body.jamaah_kantor = form.jamaah_kantor;
      } else {
        // Edit: send all fields so admin can clear them
        body.name = form.name;
        body.phone = form.phone;
        body.email = form.email;
        body.website = form.website;
        body.role = form.role;
        body.jamaah_username = form.jamaah_username;
        body.jamaah_kantor = form.jamaah_kantor;
        if (form.password) body.password = form.password;
        if (form.jamaah_password) body.jamaah_password = form.jamaah_password;
      }

      const resp = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) {
        setServerError(result.error || 'Gagal menyimpan');
        setSaving(false);
        return;
      }

      // Upload photo if changed
      const targetSlug = isCreate ? form.slug : editingAgent!.slug;
      if (photoFile) {
        await fetch('/api/admin/photo', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: photoFile, slug: targetSlug }),
        });
      }

      closeModal();
      fetchAgents();
    } catch {
      setServerError('Terjadi kesalahan jaringan');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!editingAgent) return;
    setDeleting(true);
    try {
      const resp = await fetch(`/api/admin/agents/${editingAgent.slug}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) {
        setServerError(result.error || 'Gagal menghapus');
        setDeleting(false);
        setShowDeleteConfirm(false);
        return;
      }
      setShowDeleteConfirm(false);
      closeModal();
      fetchAgents();
    } catch {
      setServerError('Terjadi kesalahan jaringan');
    } finally {
      setDeleting(false);
    }
  };

  const closeDelete = () => {
    setDeleteClosing(true);
    setTimeout(() => { setShowDeleteConfirm(false); setDeleteClosing(false); }, 200);
  };

  // ── Render: Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Input helper ──
  const inputBase = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border rounded-xl text-sm focus:ring-2 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500';
  const inputCls = (key?: string) => `${inputBase} ${
    key && fieldErrors[key]
      ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-200 dark:border-slate-700 focus:ring-emerald-500 focus:border-emerald-500'
  }`;
  const labelCls = 'flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide';
  const errCls = 'text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          Agent ({filtered.length})
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors active:scale-95 shadow-sm shadow-emerald-500/20"
        >
          <Plus size={14} /> Tambah
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden mb-3">
        <div className="flex items-center gap-2 px-3 py-2">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Cari agent..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-white placeholder-gray-300 dark:placeholder-slate-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-gray-300 hover:text-gray-500 transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto">
        {([
          { key: 'all', label: 'Semua' },
          { key: 'pending', label: 'Pending', count: pendingCount },
          { key: 'active', label: 'Active' },
          { key: 'rejected', label: 'Ditolak' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              statusFilter === tab.key
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            {tab.label}
            {'count' in tab && tab.count > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sync watchlist — agents whose jamaah sync has frozen (need re-login) */}
      {stuckAgents.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-900/15 overflow-hidden mb-3">
          <div className="flex items-start gap-2.5 px-3.5 py-3 border-b border-amber-100 dark:border-amber-800/30">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-amber-800 dark:text-amber-300">
                {stuckAgents.length} agen berhenti sinkronisasi
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70 leading-snug">
                Kredensial ditolak atau terhapus dari sistem internal — pendaftaran & pembayaran jamaah mereka tidak masuk. Perlu login ulang dari dashboard masing-masing.
              </p>
            </div>
          </div>
          <div className="divide-y divide-amber-100/70 dark:divide-amber-800/20">
            {stuckAgents.map(a => (
              <button
                key={a.slug}
                onClick={() => openEdit(a)}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[12px] font-semibold text-amber-900 dark:text-amber-200 truncate">{a.name}</span>
                {a.jamaah_username && (
                  <span className="text-[11px] text-amber-700/60 dark:text-amber-400/50 shrink-0">{a.jamaah_username}</span>
                )}
                <span className="ml-auto text-[11px] font-medium text-amber-600 dark:text-amber-400/80 shrink-0 whitespace-nowrap">
                  {a.sync_health === 'disconnected' ? 'terputus' : 'login ditolak'} · {fmtSyncAge(a.sync_age_hours)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Agent List */}
      {filtered.map(a => (
        <button
          key={a.slug}
          onClick={() => openEdit(a)}
          className="w-full bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700 shadow-sm flex items-center gap-3 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98]"
        >
          <img
            src={a.photo}
            alt={a.name}
            className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-sm shrink-0"
            onError={e => handleAgentPhotoError(e.currentTarget, a.name)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{a.name}</p>
              {a.role === 'admin' && (
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 shrink-0">
                  ADMIN
                </span>
              )}
              {a.status === 'pending' && (
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800/40 shrink-0">
                  PENDING
                </span>
              )}
              {a.status === 'rejected' && (
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40 shrink-0">
                  DITOLAK
                </span>
              )}
              {(!a.status || a.status === 'active') && (a.sync_health === 'stale' || a.sync_health === 'disconnected') && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 shrink-0">
                  <AlertTriangle size={9} /> {a.sync_health === 'disconnected' ? 'TERPUTUS' : 'MACET'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{a.slug} · {a.phone}</p>
          </div>
          {a.status === 'pending' ? (
            <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              <button
                onClick={(e) => { e.stopPropagation(); handleApprove(a.slug); }}
                disabled={approving === a.slug}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors active:scale-95 disabled:opacity-50"
              >
                {approving === a.slug ? '...' : 'Approve'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleReject(a.slug); }}
                disabled={approving === a.slug}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors active:scale-95 disabled:opacity-50"
              >
                Tolak
              </button>
            </div>
          ) : (
            <ChevronRight size={16} className="text-gray-300 dark:text-slate-600 shrink-0" />
          )}
        </button>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-gray-400 dark:text-slate-500">
            {searchQuery ? 'Tidak ada agent yang cocok' : 'Belum ada agent'}
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoPick} />

      {/* Photo Crop Modal */}
      <PhotoCropModal
        isOpen={!!cropImageUrl}
        imageUrl={cropImageUrl || ''}
        onClose={handleCropClose}
        onCropComplete={handleCropComplete}
      />

      {/* ── Slide-up Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 ${modalClosing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' } as React.CSSProperties}
            onClick={tryCloseModal}
          />
          {/* Panel */}
          <div
            className="absolute inset-x-0 bottom-0 max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 shadow-2xl flex flex-col max-h-[90vh]"
            style={{
              animation: modalClosing
                ? 'slideDown 200ms ease-in forwards'
                : 'slideUp 250ms ease-out forwards',
            }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between flex-shrink-0">
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {modalMode === 'create' ? 'Tambah Agent Baru' : 'Edit Agent'}
              </p>
              <button
                onClick={tryCloseModal}
                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Photo */}
              <div className="flex flex-col items-center">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-gray-100 dark:border-slate-700 shadow-sm" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-50 dark:bg-slate-700 flex items-center justify-center border-2 border-gray-100 dark:border-slate-600">
                    <User size={28} className="text-gray-300 dark:text-slate-500" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 mt-2"
                >
                  {modalMode === 'edit' ? 'Ganti Foto' : 'Upload Foto'}
                </button>
              </div>

              {/* Section 2: Basic Info */}
              <div className="space-y-3">
                {/* Name */}
                <div>
                  <label className={labelCls}><User size={12} /> Nama Lengkap</label>
                  <input className={inputCls('name')} placeholder="Masukkan nama agent" value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    onBlur={() => handleFieldBlur('name', form.name)} />
                  {fieldErrors.name && <p className={errCls}><AlertCircle size={10} />{fieldErrors.name}</p>}
                </div>

                {/* Slug */}
                <div>
                  <label className={labelCls}><LinkIcon size={12} /> Slug (URL)</label>
                  <input
                    className={`${inputCls('slug')} lowercase`}
                    placeholder="nama-agent"
                    value={form.slug}
                    onChange={e => { setSlugManual(true); setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
                    onBlur={() => handleFieldBlur('slug', form.slug)}
                    disabled={modalMode === 'edit'}
                  />
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                    alhijaz.co/{form.slug || '...'} — hanya huruf kecil, angka, dan strip
                  </p>
                  {fieldErrors.slug && <p className={errCls}><AlertCircle size={10} />{fieldErrors.slug}</p>}
                </div>

                {/* Email */}
                <div>
                  <label className={labelCls}><Mail size={12} /> Email</label>
                  <input className={inputCls('email')} type="email" placeholder="agent@email.com" value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    onBlur={() => handleFieldBlur('email', form.email)} />
                  {fieldErrors.email && <p className={errCls}><AlertCircle size={10} />{fieldErrors.email}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label className={labelCls}><WaIcon size={12} /> No. WhatsApp</label>
                  <input className={inputCls('phone')} placeholder="628xxxxxxxxxx" value={form.phone}
                    onChange={e => setField('phone', e.target.value)}
                    onBlur={() => handleFieldBlur('phone', form.phone)} />
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">Format: 628xxx tanpa + atau spasi</p>
                  {fieldErrors.phone && <p className={errCls}><AlertCircle size={10} />{fieldErrors.phone}</p>}
                </div>

                {/* Website */}
                <div>
                  <label className={labelCls}><Globe size={12} /> Website</label>
                  <input className={inputCls('website')} placeholder="alhijazindonesia.com" value={form.website}
                    onChange={e => setField('website', e.target.value)}
                    onBlur={() => handleFieldBlur('website', form.website)} />
                  {fieldErrors.website && <p className={errCls}><AlertCircle size={10} />{fieldErrors.website}</p>}
                </div>
              </div>

              {/* Section 3: Account & Security */}
              <div className="border-t border-gray-100 dark:border-slate-700/50 pt-4">
                <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">AKUN & KEAMANAN</p>

                {/* Password */}
                <div className="mb-3">
                  <label className={labelCls}><Lock size={12} /> {modalMode === 'create' ? 'Password' : 'Reset Password'}</label>
                  <div className="relative">
                    <input
                      className={`${inputCls('password')} pr-10`}
                      type={showPw ? 'text' : 'password'}
                      placeholder={modalMode === 'create' ? 'Minimal 6 karakter' : 'Kosongkan jika tidak ingin mengubah'}
                      value={form.password}
                      onChange={e => setField('password', e.target.value)}
                      onBlur={() => handleFieldBlur('password', form.password)}
                    />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className={errCls}><AlertCircle size={10} />{fieldErrors.password}</p>}
                </div>

                {/* Role */}
                <div>
                  <label className={labelCls}><Shield size={12} /> Role</label>
                  <div className="flex gap-2">
                    {['agent', 'admin'].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setField('role', r)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold text-center transition-all ${
                          form.role === r
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                            : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
                        }`}
                      >
                        {r === 'agent' ? 'Agent' : 'Admin'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 4: Internal System */}
              <div className="border-t border-gray-100 dark:border-slate-700/50 pt-4">
                <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">KONEKSI SISTEM INTERNAL</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mb-3">Credentials untuk login ke sistem jamaah internal Alhijaz</p>

                {/* Username Internal */}
                <div className="mb-3">
                  <label className={labelCls}><Building2 size={12} /> Username</label>
                  <input className={inputCls()} placeholder="Username sistem internal" value={form.jamaah_username}
                    onChange={e => setField('jamaah_username', e.target.value)} />
                </div>

                {/* Password Internal */}
                <div className="mb-3">
                  <label className={labelCls}><Lock size={12} /> Password</label>
                  <div className="relative">
                    <input
                      className={`${inputCls()} pr-10`}
                      type={showJamaahPw ? 'text' : 'password'}
                      placeholder="Password sistem internal"
                      value={form.jamaah_password}
                      onChange={e => setField('jamaah_password', e.target.value)}
                    />
                    <button type="button" onClick={() => setShowJamaahPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showJamaahPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Kantor */}
                <div>
                  <label className={labelCls}><Building2 size={12} /> Kode Kantor</label>
                  <FilterDropdown
                    variant="default"
                    value={form.jamaah_kantor}
                    onChange={v => setField('jamaah_kantor', v)}
                    options={[{ value: '1', label: 'Pusat' }, { value: '2', label: 'Cabang' }]}
                    ariaLabel="Kode Kantor"
                    widthClass="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Server Error */}
            {serverError && (
              <div className="mx-4 mb-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium text-center">
                {serverError}
              </div>
            )}

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700/50 flex-shrink-0">
              {modalMode === 'create' ? (
                <div className="flex gap-2">
                  <button onClick={tryCloseModal}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95">
                    Batal
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-1.5">
                    {saving ? <><Loader2 size={16} className="animate-spin" /> Menyimpan...</> : <><Check size={16} /> Simpan Agent</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button onClick={() => setShowDeleteConfirm(true)}
                      className="py-2.5 px-4 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors active:scale-95 flex items-center gap-1.5">
                      <Trash2 size={14} /> Hapus
                    </button>
                    <button onClick={handleSave} disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-1.5">
                      {saving ? <><Loader2 size={16} className="animate-spin" /> Menyimpan...</> : 'Simpan Perubahan'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Slide-up/down keyframes injected once */}
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to   { transform: translateY(0); }
            }
            @keyframes slideDown {
              from { transform: translateY(0); }
              to   { transform: translateY(100%); }
            }
          `}</style>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          onClick={closeDelete}
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' } as React.CSSProperties}>
          <div
            className={`w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl p-5 ${deleteClosing ? 'dc-card-exit' : 'dc-card-enter'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-white text-center mt-3">Hapus Agent?</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 text-center mt-1.5 leading-relaxed">
              Agent <span className="font-semibold">{editingAgent?.name}</span> akan dihapus permanen. Data jamaah dan konfigurasi CAPI juga akan terhapus.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={closeDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95">
                Batal
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-1.5">
                {deleting ? <Loader2 size={16} className="animate-spin" /> : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unsaved Changes Confirm ── */}
      {showUnsavedConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' } as React.CSSProperties}
          onClick={() => setShowUnsavedConfirm(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl p-5 dc-card-enter"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800 dark:text-white text-center">Perubahan Belum Disimpan</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 text-center mt-1.5 leading-relaxed">
              Yakin ingin keluar? Perubahan yang belum disimpan akan hilang.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowUnsavedConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95">
                Kembali
              </button>
              <button onClick={() => { setShowUnsavedConfirm(false); closeModal(); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 transition-all active:scale-95">
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
