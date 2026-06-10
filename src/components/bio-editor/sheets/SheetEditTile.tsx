import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Save, Loader2 } from 'lucide-react';
import SheetBase from './SheetBase';
import type { BioAgentPublic, BioTile, FeaturedPaketPreview } from '../../bio/types';
import { getAuthHeaders } from '../../LoginPage';
import PaketPicker from './PaketPicker';
import PhotoUploadField from './PhotoUploadField';
import LinkIconPicker from './LinkIconPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  tile: BioTile | null;
  agent: BioAgentPublic;
  waLinkPreview: string | null;
  onUpdateConfig: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onSave: () => void | Promise<void>;
}

export default function SheetEditTile(props: Props) {
  const { open, onClose, tile, agent, onUpdateConfig, onDelete, onSave, waLinkPreview } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  if (!tile) {
    return <SheetBase open={open} onClose={onClose} title="Edit Bagian"><div /></SheetBase>;
  }

  const c = tile.config as Record<string, any>;
  const isSystem = tile.type === 'umroh' || tile.type === 'umroh_landing' || tile.type === 'haji';

  const titleByType: Record<BioTile['type'], string> = {
    umroh: 'Jadwal Umroh',
    umroh_landing: 'Umroh',
    haji: 'Haji Plus',
    wa: 'Tombol WhatsApp',
    featured: 'Featured Paket',
    link: 'Custom Link',
    text: 'Teks',
    photo: 'Foto',
    testi: 'Testimoni',
  };

  const handleDelete = () => {
    onDelete(tile.id);
    setConfirmDelete(false);
    onClose();
  };

  const saveButton = (
    <button
      type="button"
      onClick={() => { void handleSave(); }}
      disabled={saving}
      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
    >
      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2.4} />} {saving ? 'Menyimpan…' : 'Simpan'}
    </button>
  );

  const footer = confirmDelete ? (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setConfirmDelete(false)}
        className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
      >
        Batal
      </button>
      <button
        type="button"
        onClick={handleDelete}
        className="flex-1 py-2 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors active:scale-95"
      >
        Ya, Hapus Bagian
      </button>
    </div>
  ) : (
    <div className="flex gap-2">
      {!isSystem && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label="Hapus bagian"
          className="shrink-0 px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      )}
      {saveButton}
    </div>
  );

  return (
    <SheetBase open={open} onClose={onClose} title={`Edit ${titleByType[tile.type]}`} footer={footer}>
      <TileFields
        tile={tile}
        c={c}
        agent={agent}
        waLinkPreview={waLinkPreview}
        onUpdateConfig={(patch) => onUpdateConfig(tile.id, patch)}
      />
    </SheetBase>
  );
}

function TileFields({
  tile, c, agent, waLinkPreview, onUpdateConfig,
}: {
  tile: BioTile;
  c: Record<string, any>;
  agent: BioAgentPublic;
  waLinkPreview: string | null;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  switch (tile.type) {
    case 'text':
      return <TextFields c={c} onUpdate={onUpdateConfig} />;
    case 'wa':
      return <WaFields c={c} onUpdate={onUpdateConfig} agent={agent} waLinkPreview={waLinkPreview} />;
    case 'featured':
      return <FeaturedFields c={c} onUpdate={onUpdateConfig} agent={agent} orphaned={!!tile.orphaned} />;
    case 'umroh':
    case 'umroh_landing':
    case 'haji':
      return <ProductFields c={c} onUpdate={onUpdateConfig} variant={tile.type} />;
    case 'photo':
      return <PhotoFields c={c} onUpdate={onUpdateConfig} agent={agent} />;
    case 'link':
      return <LinkFields c={c} onUpdate={onUpdateConfig} />;
    case 'testi':
      return <TestiFields c={c} onUpdate={onUpdateConfig} />;
    default:
      return null;
  }
}

// ── Text ─────────────────────────────────────────
function TextFields({ c, onUpdate }: { c: Record<string, any>; onUpdate: (p: Record<string, unknown>) => void }) {
  const content = typeof c.content === 'string' ? c.content : '';
  return (
    <section>
      <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Teks</label>
      <textarea
        value={content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        placeholder="Contoh: Assalamualaikum 🌙 Selamat datang"
        maxLength={200}
        rows={4}
        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
      />
      <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">{content.length}/200 karakter</p>
      {!content.trim() && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Teks tidak boleh kosong.</p>
      )}
    </section>
  );
}

// ── WA ───────────────────────────────────────────
function WaFields({
  c, onUpdate, agent, waLinkPreview,
}: {
  c: Record<string, any>;
  onUpdate: (p: Record<string, unknown>) => void;
  agent: BioAgentPublic;
  waLinkPreview: string | null;
}) {
  const title = typeof c.title === 'string' ? c.title : '';
  const subtitle = typeof c.subtitle === 'string' ? c.subtitle : '';
  const template = typeof c.message_template === 'string'
    ? c.message_template
    : 'Assalamualaikum Kak {name}, saya tertarik dengan paket yang ditawarkan{paket}';
  const preview = template
    .replace(/\{name\}/g, agent.name || 'Kak')
    .replace(/\{paket\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <div className="space-y-4">
      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Judul</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Chat WhatsApp Langsung"
          maxLength={80}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Sub-judul</label>
        <input
          type="text"
          value={subtitle}
          onChange={(e) => onUpdate({ subtitle: e.target.value })}
          placeholder="Respon cepat · Biasa balas < 10 menit"
          maxLength={120}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Template Pesan</label>
        <textarea
          value={template}
          onChange={(e) => onUpdate({ message_template: e.target.value })}
          rows={3}
          maxLength={500}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
        />
        <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">
          Token: <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{name}'}</code> nama Anda ·{' '}
          <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{paket}'}</code> nama Featured Paket (jika aktif)
        </p>
      </section>

      <section className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
        <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">Preview</p>
        <p className="text-sm text-gray-800 dark:text-white">"{preview}"</p>
        {!agent.phone && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
            ⚠ Nomor HP belum diisi di profil — tile WA tidak akan tampil.
          </p>
        )}
        {waLinkPreview && (
          <a
            href={waLinkPreview}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 underline"
          >
            Coba link WhatsApp →
          </a>
        )}
      </section>
    </div>
  );
}

// ── Featured ─────────────────────────────────────
function FeaturedFields({
  c, onUpdate, agent, orphaned,
}: {
  c: Record<string, any>;
  onUpdate: (p: Record<string, unknown>) => void;
  agent: BioAgentPublic;
  orphaned: boolean;
}) {
  const jadwalId = typeof c.jadwal_id === 'string' ? c.jadwal_id : '';
  const badge = typeof c.badge === 'string' ? c.badge : '';
  const cta = typeof c.cta === 'string' ? c.cta : '';
  const [preview, setPreview] = useState<FeaturedPaketPreview | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Refetch preview when jadwal_id changes
  useEffect(() => {
    if (!jadwalId) {
      setPreview(null);
      return;
    }
    let alive = true;
    setLoadingPreview(true);
    fetch(`/api/bio/${encodeURIComponent(agent.slug)}/featured-paket-preview?jadwal_id=${encodeURIComponent(jadwalId)}`)
      .then(r => r.json())
      .then(d => { if (alive) setPreview(d.success ? d.data : null); })
      .catch(() => { if (alive) setPreview(null); })
      .finally(() => { if (alive) setLoadingPreview(false); });
    return () => { alive = false; };
  }, [jadwalId, agent.slug]);

  return (
    <div className="space-y-4">
      {orphaned && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Paket tidak tersedia</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              Paket yang dipilih sudah tidak ada di sistem. Pilih paket lain atau hapus bagian ini.
            </p>
          </div>
        </div>
      )}

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Paket</label>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors active:scale-[0.99]"
        >
          {jadwalId ? (
            loadingPreview ? (
              <span className="text-sm text-gray-500 dark:text-slate-400">Memuat info paket…</span>
            ) : preview ? (
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">{preview.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  {preview.berangkat_tgl} · {preview.maskapai}
                </p>
              </div>
            ) : (
              <span className="text-sm text-gray-500 dark:text-slate-400">ID: {jadwalId}</span>
            )
          ) : (
            <span className="text-sm text-gray-500 dark:text-slate-400">Tap untuk pilih paket…</span>
          )}
        </button>
        {!jadwalId && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Pilih paket terlebih dahulu.</p>
        )}
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Label Badge</label>
        <input
          type="text"
          value={badge}
          onChange={(e) => onUpdate({ badge: e.target.value })}
          placeholder="⭐ Paket Unggulan"
          maxLength={40}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Teks Tombol (CTA)</label>
        <input
          type="text"
          value={cta}
          onChange={(e) => onUpdate({ cta: e.target.value })}
          placeholder="Lihat Detail"
          maxLength={80}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </section>

      <PaketPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => {
          onUpdate({ jadwal_id: p.jadwal_id });
          setPreview(p);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

// ── Product (umroh / umroh_landing / haji) ───────
const PRODUCT_VARIANT_COPY: Record<'umroh' | 'umroh_landing' | 'haji', { destLabel: string; ctaPlaceholder: string }> = {
  umroh:         { destLabel: 'Jadwal Paket Umroh', ctaPlaceholder: 'Lihat Jadwal Umroh' },
  umroh_landing: { destLabel: 'Umroh', ctaPlaceholder: 'Landing Page Umroh' },
  haji:          { destLabel: 'Haji Plus',          ctaPlaceholder: 'Landing Page Haji' },
};

function ProductFields({
  c, onUpdate, variant,
}: {
  c: Record<string, any>;
  onUpdate: (p: Record<string, unknown>) => void;
  variant: 'umroh' | 'umroh_landing' | 'haji';
}) {
  const cta = typeof c.cta === 'string' ? c.cta : '';
  const copy = PRODUCT_VARIANT_COPY[variant];
  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-3">
        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1">Bagian Sistem</p>
        <p className="text-xs text-emerald-800 dark:text-emerald-200">
          Bagian ini otomatis link ke {copy.destLabel} Anda. Tidak bisa dihapus — matikan visibility kalau mau sembunyikan.
        </p>
      </div>
      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Teks Tombol (CTA)</label>
        <input
          type="text"
          value={cta}
          onChange={(e) => onUpdate({ cta: e.target.value })}
          placeholder={copy.ctaPlaceholder}
          maxLength={80}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">Kosongkan untuk pakai default.</p>
      </section>
    </div>
  );
}

// ── Photo ────────────────────────────────────────
function PhotoFields({
  c, onUpdate, agent,
}: {
  c: Record<string, any>;
  onUpdate: (p: Record<string, unknown>) => void;
  agent: BioAgentPublic;
}) {
  const imageUrl = typeof c.image_url === 'string' ? c.image_url : '';
  const caption = typeof c.caption === 'string' ? c.caption : '';

  return (
    <div className="space-y-4">
      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Foto</label>
        <PhotoUploadField
          currentUrl={imageUrl}
          slug={agent.slug}
          onUploaded={(url) => onUpdate({ image_url: url })}
          onRemove={() => onUpdate({ image_url: '' })}
          uploadUrl={`/api/bio/${encodeURIComponent(agent.slug)}/photo-upload`}
          authHeaders={getAuthHeaders}
        />
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Caption</label>
        <textarea
          value={caption}
          onChange={(e) => onUpdate({ caption: e.target.value })}
          placeholder="Dokumentasi jamaah"
          maxLength={160}
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
        />
        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">{caption.length}/160</p>
      </section>
    </div>
  );
}

// ── Link ─────────────────────────────────────────
function LinkFields({ c, onUpdate }: { c: Record<string, any>; onUpdate: (p: Record<string, unknown>) => void }) {
  const title = typeof c.title === 'string' ? c.title : '';
  const url = typeof c.url === 'string' ? c.url : '';
  const icon = typeof c.icon === 'string' ? c.icon : 'Link2';

  // Render `https://` as a non-editable prefix and only let the user type the
  // rest. We strip any protocol the user pastes and persist a normalized
  // `https://…` URL — matches the @ prefix pattern used for social handles.
  const urlBody = url.replace(/^https?:\/\//i, '');

  return (
    <div className="space-y-4">
      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Judul</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Brosur Lengkap"
          maxLength={80}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
        {!title.trim() && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Judul tidak boleh kosong.</p>
        )}
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">URL</label>
        <div className="flex items-stretch rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500 overflow-hidden">
          <span className="shrink-0 flex items-center pl-3 pr-1 text-sm text-gray-500 dark:text-slate-400 select-none border-r border-gray-100 dark:border-slate-700/60 mr-2">
            https://
          </span>
          <input
            type="text"
            inputMode="url"
            value={urlBody}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/^https?:\/\//i, '').trim();
              onUpdate({ url: cleaned ? `https://${cleaned}` : '' });
            }}
            placeholder="example.com"
            className="flex-1 min-w-0 pl-0 pr-3 py-2 text-sm bg-transparent text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none"
          />
        </div>
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Ikon</label>
        <LinkIconPicker value={icon} onChange={(v) => onUpdate({ icon: v })} />
      </section>
    </div>
  );
}

// ── Testimonial ──────────────────────────────────
function TestiFields({ c, onUpdate }: { c: Record<string, any>; onUpdate: (p: Record<string, unknown>) => void }) {
  const quote = typeof c.quote === 'string' ? c.quote : '';
  const authorName = typeof c.author_name === 'string' ? c.author_name : '';
  const authorMeta = typeof c.author_meta === 'string' ? c.author_meta : '';

  return (
    <div className="space-y-4">
      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Kutipan</label>
        <textarea
          value={quote}
          onChange={(e) => onUpdate({ quote: e.target.value })}
          placeholder="Pelayanan Kak X sangat sabar dan detail, Alhamdulillah Umroh lancar"
          rows={3}
          maxLength={300}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
        />
        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">{quote.length}/300</p>
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Nama Jamaah</label>
        <input
          type="text"
          value={authorName}
          onChange={(e) => onUpdate({ author_name: e.target.value })}
          placeholder="Ibu Aminah"
          maxLength={80}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </section>

      <section>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Keterangan (opsional)</label>
        <input
          type="text"
          value={authorMeta}
          onChange={(e) => onUpdate({ author_meta: e.target.value })}
          placeholder="Jamaah Umroh · Jakarta"
          maxLength={80}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </section>
    </div>
  );
}
