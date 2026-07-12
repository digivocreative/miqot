import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, CalendarDays, Check, ChevronRight, Eye,
  ExternalLink, FileText, Image as ImageIcon, Loader2, Lock, Megaphone,
  MessageCircle, Monitor, Package, PanelLeft, Redo2, RefreshCcw, Rocket,
  Search, Smartphone, Sparkles, Tablet, Type, Undo2, UserCheck, X,
} from 'lucide-react';
import { getAuthHeaders } from '../LoginPage';
import FilterDropdown from '../FilterDropdown';
import type { FeaturedPaketPreview } from '../bio/types';
import PaketPicker from '../bio-editor/sheets/PaketPicker';
import PhotoUploadField from '../bio-editor/sheets/PhotoUploadField';
import SheetBase from '../bio-editor/sheets/SheetBase';
import ComponentInspector, { widgetLabel } from './ComponentInspector';
import { useLandingBuilder } from './useLandingBuilder';
import type {
  LandingBuilderDocument,
  LandingBuilderSection,
  LandingBuilderType,
  LandingContentItem,
  LandingContentManifest,
  LandingFeaturedPackage,
} from './types';

interface Props {
  type: LandingBuilderType;
  agent: { slug: string; name: string; phone?: string; photo?: string };
  onNavigate: (path: string, options?: { replace?: boolean; state?: Record<string, unknown> }) => void;
}

interface SectionDefinition {
  id: LandingBuilderSection;
  label: string;
  description: string;
  icon: React.ElementType;
  locked?: boolean;
}

type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

const SECTION_DEFINITIONS: Record<LandingBuilderType, SectionDefinition[]> = {
  umroh: [
    { id: 'hero', label: 'Promo Utama', description: 'Judul, foto, dan CTA', icon: Megaphone },
    { id: 'content', label: 'Seluruh Konten', description: 'Teks, tombol, daftar, dan gambar', icon: FileText },
    { id: 'featured', label: 'Paket Unggulan', description: 'Pilih dari jadwal aktif', icon: CalendarDays },
    { id: 'program', label: 'Promo / Voucher', description: 'Opsional', icon: BadgeCheck },
    { id: 'contact', label: 'Kontak & WhatsApp', description: 'Otomatis dari profil', icon: MessageCircle, locked: true },
  ],
  haji: [
    { id: 'hero', label: 'Promo Utama', description: 'Judul, foto, dan CTA', icon: Megaphone },
    { id: 'content', label: 'Seluruh Konten', description: 'Teks, tombol, daftar, dan gambar', icon: FileText },
    { id: 'featured', label: 'Paket Pilihan', description: 'Uhud atau Rahmah', icon: Package },
    { id: 'program', label: 'Program Pembiayaan', description: 'Konten dari pusat', icon: Sparkles },
    { id: 'contact', label: 'Kontak & WhatsApp', description: 'Otomatis dari profil', icon: MessageCircle, locked: true },
  ],
};

export default function LandingPageEditorPage({ type, agent, onNavigate }: Props) {
  const builder = useLandingBuilder(type);
  const [selected, setSelected] = useState<LandingBuilderSection>('hero');
  const [selectedContentKey, setSelectedContentKey] = useState<string | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [packagePickerOpen, setPackagePickerOpen] = useState(false);
  const [publishNotice, setPublishNotice] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewScrollRef = useRef(0);
  const parentPath = `/dashboard/ai-tools/landing-page/${type}`;

  const selectSection = useCallback((section: LandingBuilderSection, openOnMobile = true) => {
    setSelected(section);
    if (section !== 'content') setSelectedContentKey(null);
    setSectionsOpen(false);
    if (openOnMobile && window.innerWidth < 1024) setPropertiesOpen(true);
  }, []);

  const wirePreview = useCallback(() => {
    const previewDocument = iframeRef.current?.contentDocument;
    const previewWindow = iframeRef.current?.contentWindow;
    if (!previewDocument) return;
    if (previewWindow) {
      previewWindow.onscroll = () => { previewScrollRef.current = previewWindow.scrollY; };
    }
    previewDocument.querySelectorAll<HTMLElement>('[data-landing-builder-content-key]').forEach((node) => {
      const contentKey = node.dataset.landingBuilderContentKey;
      if (!contentKey) return;
      node.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedContentKey(contentKey);
        selectSection('content');
      };
    });
    previewDocument.querySelectorAll<HTMLElement>('[data-landing-builder-section]').forEach((node) => {
      const section = node.dataset.landingBuilderSection as LandingBuilderSection | undefined;
      if (!section || !['hero', 'featured', 'program'].includes(section)) return;
      node.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectSection(section);
      };
    });
    previewDocument.querySelectorAll<HTMLElement>('[data-landing-builder-selected]').forEach((node) => {
      node.removeAttribute('data-landing-builder-selected');
    });
    if (selected === 'content' && selectedContentKey) {
      previewDocument.querySelectorAll<HTMLElement>('[data-landing-builder-content-key]').forEach((node) => {
        if (node.dataset.landingBuilderContentKey === selectedContentKey) {
          node.setAttribute('data-landing-builder-selected', 'true');
        }
      });
    } else {
      previewDocument.querySelectorAll<HTMLElement>(`[data-landing-builder-section="${selected}"]`).forEach((node) => {
        node.setAttribute('data-landing-builder-selected', 'true');
      });
    }
  }, [selectSection, selected, selectedContentKey]);

  useEffect(() => { wirePreview(); }, [wirePreview, builder.previewHtml]);

  const handlePreviewLoad = useCallback(() => {
    wirePreview();
    const previewWindow = iframeRef.current?.contentWindow;
    if (!previewWindow || previewScrollRef.current <= 0) return;
    requestAnimationFrame(() => previewWindow.scrollTo({ top: previewScrollRef.current }));
  }, [wirePreview]);

  const handleBack = async () => {
    if (leaving || builder.publishing) return;
    setLeaving(true);
    const saved = await builder.flushDraft();
    if (!saved) {
      setLeaving(false);
      return;
    }
    const state = window.history.state as { landingEditorParent?: string } | null;
    if (state?.landingEditorParent === parentPath && window.history.length > 1) {
      window.history.back();
      return;
    }
    onNavigate(parentPath, { replace: true });
  };

  const handlePublish = async () => {
    const ok = await builder.publish();
    if (!ok) return;
    setPublishNotice(true);
    setTimeout(() => setPublishNotice(false), 2600);
  };

  const publicUrl = `${window.location.origin}/${agent.slug}/${type}?v=${encodeURIComponent(builder.publishedAt || '')}`;
  const activeDefinition = SECTION_DEFINITIONS[type].find((section) => section.id === selected)!;
  const ActiveSectionIcon = activeDefinition.icon;
  const requiredFieldsMissing = !!builder.document && (
    !builder.document.hero.headline.trim()
    || !builder.document.hero.cta_label.trim()
    || !builder.document.hero.cta_message.trim()
    || (type === 'haji' && !builder.document.hero.description.trim())
  );
  const restorePublished = () => {
    if (!builder.hasUnpublishedChanges || builder.publishing) return;
    if (window.confirm('Batalkan seluruh perubahan draft dan kembali ke versi aktif?')) {
      builder.restorePublished();
    }
  };

  return (
    <div className="fixed inset-0 z-[8000] flex flex-col bg-gray-100 dark:bg-slate-950 text-gray-800 dark:text-white">
      <header className="h-16 shrink-0 border-b border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center gap-2 px-3 sm:px-4">
        <button
          type="button"
          onClick={handleBack}
          disabled={leaving || builder.publishing}
          className="w-9 h-9 shrink-0 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 flex items-center justify-center active:scale-95"
          aria-label="Kembali ke Landing Page"
        >
          <ArrowLeft size={18} strokeWidth={2.4} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold truncate">Editor Landing Page {type === 'umroh' ? 'Umroh' : 'Haji'}</h1>
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 dark:text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full ${builder.saveStatus === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <span>{saveStatusLabel(builder.saveStatus)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSectionsOpen(true)}
          className="lg:hidden w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 flex items-center justify-center"
          aria-label="Pilih bagian"
        >
          <PanelLeft size={17} />
        </button>
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex h-9 items-center gap-1.5 px-3 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          <ExternalLink size={14} /> Lihat Aktif
        </a>
        <button
          type="button"
          onClick={handlePublish}
          disabled={builder.loading || builder.publishing || leaving || !builder.document || requiredFieldsMissing}
          className="h-9 px-3 sm:px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 disabled:opacity-60 active:scale-95"
        >
          {builder.publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
          <span>{builder.publishing ? 'Publish…' : 'Publish'}</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="hidden lg:flex min-h-0 flex-col border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">Bagian halaman</p>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">Klik bagian atau langsung klik preview.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            <SectionList type={type} selected={selected} contentCount={builder.contentManifest.total} onSelect={selectSection} />
          </div>
          <div className="m-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800 text-[10px] leading-relaxed text-gray-500 dark:text-slate-400 flex gap-2">
            <Eye size={14} className="shrink-0 mt-0.5" />
            Klik teks atau gambar di preview untuk mengedit konten halaman aktif.
          </div>
        </aside>

        <main className="relative min-h-0 flex flex-col bg-gray-200 dark:bg-slate-950">
          <div className="min-h-11 shrink-0 border-b border-gray-200 bg-gray-50 px-2 text-[10px] text-gray-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 sm:px-3">
            <div className="flex min-h-11 items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Eye size={13} /> <span className="hidden xl:inline">Preview draft · klik elemen untuk mengedit</span>
            </div>
            <div className="ml-auto flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800">
              <ToolbarButton label="Undo" disabled={!builder.canUndo} onClick={builder.undo}><Undo2 size={13} /></ToolbarButton>
              <ToolbarButton label="Redo" disabled={!builder.canRedo} onClick={builder.redo}><Redo2 size={13} /></ToolbarButton>
              <span className="mx-0.5 h-5 w-px bg-gray-200 dark:bg-slate-700" />
              <DeviceButton label="Desktop" active={previewDevice === 'desktop'} onClick={() => setPreviewDevice('desktop')}><Monitor size={13} /></DeviceButton>
              <DeviceButton label="Tablet" active={previewDevice === 'tablet'} onClick={() => setPreviewDevice('tablet')}><Tablet size={13} /></DeviceButton>
              <DeviceButton label="Mobile" active={previewDevice === 'mobile'} onClick={() => setPreviewDevice('mobile')}><Smartphone size={13} /></DeviceButton>
            </div>
            {builder.hasUnpublishedChanges ? (
              <span className="hidden rounded-full bg-amber-50 px-2 py-1 font-bold text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 sm:inline">Belum dipublish</span>
            ) : (
              <span className="hidden rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 sm:inline">Sama dengan publik</span>
            )}
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-5 flex justify-center">
            {builder.loading ? (
              <div className="w-full max-w-4xl h-full min-h-[460px] rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center shadow-sm">
                <Loader2 size={24} className="animate-spin text-emerald-500" />
              </div>
            ) : builder.previewHtml ? (
              <div
                className="relative min-h-[620px] h-full max-w-full shrink-0 rounded-2xl overflow-hidden bg-white shadow-xl transition-[width] duration-200"
                style={{ width: previewDevice === 'mobile' ? 390 : previewDevice === 'tablet' ? 768 : '100%' }}
              >
                <iframe
                  ref={iframeRef}
                  title={`Preview landing page ${type}`}
                  srcDoc={builder.previewHtml}
                  sandbox="allow-same-origin"
                  onLoad={handlePreviewLoad}
                  className="w-full h-full min-h-[620px] bg-white"
                />
                {builder.previewLoading && (
                  <div className="absolute top-3 right-3 rounded-full bg-gray-900/80 text-white px-3 py-1.5 text-[10px] font-semibold flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" /> Memperbarui preview
                  </div>
                )}
              </div>
            ) : (
              <PreviewError message={builder.previewError || builder.loadError} onRetry={builder.reload} />
            )}
          </div>
          <div className="lg:hidden shrink-0 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => setSectionsOpen(true)}
              className="flex-1 h-11 rounded-xl bg-gray-100 dark:bg-slate-800 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <PanelLeft size={16} /> Bagian
            </button>
            <button
              type="button"
              onClick={() => setPropertiesOpen(true)}
              className={`flex-[1.4] h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${activeDefinition.locked ? 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200' : 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'}`}
            >
              <ActiveSectionIcon size={16} /> {activeDefinition.locked ? 'Lihat' : 'Edit'} {activeDefinition.label}
            </button>
          </div>
        </main>

        <aside className="hidden lg:flex min-h-0 flex-col border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800">
            <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Bagian dipilih</p>
            <h2 className="text-base font-bold mt-0.5">{activeDefinition.label}</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {builder.document && (
              <PropertiesPanel
                type={type}
                section={selected}
                document={builder.document}
                agent={agent}
                contentManifest={builder.contentManifest}
                selectedContentKey={selectedContentKey}
                onSelectContent={setSelectedContentKey}
                updateDocument={builder.updateDocument}
                onPickPackage={() => setPackagePickerOpen(true)}
              />
            )}
          </div>
          <div className="border-t border-gray-100 dark:border-slate-800 p-3 flex items-center justify-between gap-2">
            <button type="button" onClick={restorePublished} disabled={!builder.hasUnpublishedChanges || builder.publishing} className="h-10 px-3 rounded-xl text-xs font-semibold text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40">
              <RefreshCcw size={13} /> Batalkan perubahan
            </button>
            <span className="text-[10px] text-gray-400 dark:text-slate-500">Autosave aktif</span>
          </div>
        </aside>
      </div>

      <SheetBase open={sectionsOpen} onClose={() => setSectionsOpen(false)} title="Pilih Bagian">
        <SectionList type={type} selected={selected} contentCount={builder.contentManifest.total} onSelect={selectSection} />
      </SheetBase>

      <SheetBase
        open={propertiesOpen}
        onClose={() => setPropertiesOpen(false)}
        title={`Edit ${activeDefinition.label}`}
        footer={(
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={restorePublished} disabled={!builder.hasUnpublishedChanges || builder.publishing} className="h-9 px-2 rounded-xl text-[11px] font-semibold text-gray-500 dark:text-slate-400 disabled:opacity-40 flex items-center gap-1.5">
              <RefreshCcw size={12} /> Batalkan draft
            </button>
            <p className="text-right text-[10px] font-medium text-gray-500 dark:text-slate-400">Tersimpan otomatis</p>
          </div>
        )}
      >
        {builder.document && (
          <PropertiesPanel
            type={type}
            section={selected}
            document={builder.document}
            agent={agent}
            contentManifest={builder.contentManifest}
            selectedContentKey={selectedContentKey}
            onSelectContent={setSelectedContentKey}
            updateDocument={builder.updateDocument}
            onPickPackage={() => {
              setPropertiesOpen(false);
              setPackagePickerOpen(true);
            }}
          />
        )}
      </SheetBase>

      <PaketPicker
        open={packagePickerOpen}
        onClose={() => setPackagePickerOpen(false)}
        onPick={(pkg) => {
          builder.updateDocument((current) => ({ ...current, featured_package: packagePreviewToBuilder(pkg) }));
          setPackagePickerOpen(false);
        }}
      />

      {builder.publishing && <div className="fixed inset-x-0 top-16 bottom-0 z-[9200] cursor-wait" aria-hidden="true" />}

      {(builder.error || publishNotice) && (
        <div className={`fixed z-[9500] left-1/2 -translate-x-1/2 bottom-5 px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 ${
          builder.error ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {builder.error ? <X size={14} /> : <Check size={14} />}
          {builder.error || 'Landing page berhasil dipublish'}
        </div>
      )}
    </div>
  );
}

function SectionList({
  type,
  selected,
  contentCount,
  onSelect,
}: {
  type: LandingBuilderType;
  selected: LandingBuilderSection;
  contentCount: number;
  onSelect: (section: LandingBuilderSection) => void;
}) {
  return (
    <div className="space-y-1.5">
      {SECTION_DEFINITIONS[type].map((section) => {
        const Icon = section.icon;
        const active = section.id === selected;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            className={`w-full min-h-14 rounded-xl border px-2.5 py-2 flex items-center gap-2.5 text-left transition-colors ${
              active
                ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/15'
                : 'border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-slate-800'}`}>
              <Icon size={15} className={active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold truncate ${active ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-800 dark:text-white'}`}>{section.label}</p>
              <p className="text-[10px] text-gray-500 dark:text-slate-400 truncate">
                {section.id === 'content' && contentCount > 0 ? `${contentCount} elemen dari halaman aktif` : section.description}
              </p>
            </div>
            {section.locked ? <Lock size={13} className="text-gray-400" /> : <ChevronRight size={14} className={active ? 'text-emerald-500' : 'text-gray-400'} />}
          </button>
        );
      })}
    </div>
  );
}

function PropertiesPanel({
  type,
  section,
  document,
  agent,
  contentManifest,
  selectedContentKey,
  onSelectContent,
  updateDocument,
  onPickPackage,
}: {
  type: LandingBuilderType;
  section: LandingBuilderSection;
  document: LandingBuilderDocument;
  agent: Props['agent'];
  contentManifest: LandingContentManifest;
  selectedContentKey: string | null;
  onSelectContent: (key: string | null) => void;
  updateDocument: (updater: (current: LandingBuilderDocument) => LandingBuilderDocument) => void;
  onPickPackage: () => void;
}) {
  const updateHero = (patch: Partial<LandingBuilderDocument['hero']>) => {
    updateDocument((current) => ({ ...current, hero: { ...current.hero, ...patch } }));
  };

  if (section === 'content') {
    return (
      <ContentEditor
        type={type}
        agent={agent}
        document={document}
        manifest={contentManifest}
        selectedKey={selectedContentKey}
        onSelect={onSelectContent}
        updateDocument={updateDocument}
      />
    );
  }

  if (section === 'hero') {
    return (
      <div className="space-y-4">
        <InfoBox>
          Halaman publik tidak berubah sampai tombol <strong>Publish</strong> ditekan.
        </InfoBox>
        <EditorField label="JUDUL UTAMA" required count={`${document.hero.headline.length}/140`} error={!document.hero.headline.trim() ? 'Judul utama wajib diisi.' : undefined}>
          <textarea
            value={document.hero.headline}
            maxLength={140}
            rows={3}
            onChange={(event) => updateHero({ headline: event.target.value })}
            required
            aria-invalid={!document.hero.headline.trim()}
            className={fieldInputClass(!document.hero.headline.trim())}
          />
        </EditorField>
        {type === 'haji' && (
          <EditorField label="DESKRIPSI" required count={`${document.hero.description.length}/280`} error={!document.hero.description.trim() ? 'Deskripsi wajib diisi.' : undefined}>
            <textarea
              value={document.hero.description}
              maxLength={280}
              rows={4}
              onChange={(event) => updateHero({ description: event.target.value })}
              required
              aria-invalid={!document.hero.description.trim()}
              className={fieldInputClass(!document.hero.description.trim())}
            />
          </EditorField>
        )}
        <EditorField label="FOTO HERO">
          <PhotoUploadField
            currentUrl={document.hero.image_url || ''}
            slug={agent.slug}
            uploadUrl={`/api/landing-builder/${type}/hero-image`}
            authHeaders={getAuthHeaders}
            onUploaded={(url) => updateHero({ image_url: url })}
            onRemove={() => updateHero({ image_url: null })}
          />
        </EditorField>
        <div className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-4">
          <EditorField label="TEKS TOMBOL" required count={`${document.hero.cta_label.length}/48`} error={!document.hero.cta_label.trim() ? 'Teks tombol wajib diisi.' : undefined}>
            <input
              value={document.hero.cta_label}
              maxLength={48}
              onChange={(event) => updateHero({ cta_label: event.target.value })}
              required
              aria-invalid={!document.hero.cta_label.trim()}
              className={fieldInputClass(!document.hero.cta_label.trim())}
            />
          </EditorField>
          <EditorField label="PESAN WHATSAPP" required count={`${document.hero.cta_message.length}/280`} error={!document.hero.cta_message.trim() ? 'Pesan WhatsApp wajib diisi.' : undefined}>
            <textarea
              value={document.hero.cta_message}
              maxLength={280}
              rows={3}
              onChange={(event) => updateHero({ cta_message: event.target.value })}
              required
              aria-invalid={!document.hero.cta_message.trim()}
              className={fieldInputClass(!document.hero.cta_message.trim())}
            />
          </EditorField>
        </div>
      </div>
    );
  }

  if (section === 'featured') {
    if (type === 'haji') {
      return (
        <div className="space-y-3">
          <InfoBox>Pilih paket yang ingin ditonjolkan. Teks dan gambar lain tetap dapat diedit melalui menu <strong>Seluruh Konten</strong>.</InfoBox>
          {(['uhud', 'rahmah'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => updateDocument((current) => ({ ...current, featured_haji_package: value }))}
              className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 ${document.featured_haji_package === value ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-slate-700'}`}
            >
              <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center"><Package size={16} /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Paket {value === 'uhud' ? 'Uhud' : 'Rahmah'}</p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">Hotel Bintang {value === 'uhud' ? '4' : '5'}</p>
              </div>
              {document.featured_haji_package === value && <Check size={16} className="text-emerald-500" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => updateDocument((current) => ({ ...current, featured_haji_package: null }))}
            className="w-full py-2 text-xs font-semibold text-gray-500 dark:text-slate-400"
          >
            Tidak menonjolkan paket tertentu
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <InfoBox>Harga, tanggal, maskapai, dan sisa seat berasal dari jadwal sistem.</InfoBox>
        {document.featured_package ? (
          <FeaturedPackageCard package={document.featured_package} onChange={onPickPackage} onRemove={() => updateDocument((current) => ({ ...current, featured_package: null }))} />
        ) : (
          <button
            type="button"
            onClick={onPickPackage}
            className="w-full py-8 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 flex flex-col items-center gap-2"
          >
            <CalendarDays size={22} />
            <span className="text-sm font-semibold">Pilih Paket Unggulan</span>
            <span className="text-[11px]">Hanya paket aktif dengan seat tersedia</span>
          </button>
        )}
      </div>
    );
  }

  if (section === 'program') {
    const title = type === 'umroh' ? 'Tampilkan voucher promo' : 'Tampilkan program pembiayaan';
    return (
      <div className="space-y-3">
        <InfoBox>Atur tampil atau sembunyikan section di sini. Untuk mengubah teks dan gambarnya, gunakan menu <strong>Seluruh Konten</strong>.</InfoBox>
        <button
          type="button"
          role="switch"
          aria-checked={document.optional_program_visible}
          onClick={() => updateDocument((current) => ({ ...current, optional_program_visible: !current.optional_program_visible }))}
          className="w-full rounded-xl border border-gray-200 dark:border-slate-700 p-3 flex items-center gap-3 text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            {type === 'umroh' ? <BadgeCheck size={17} /> : <Sparkles size={17} />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">{document.optional_program_visible ? 'Sedang ditampilkan' : 'Sedang disembunyikan'}</p>
          </div>
          <span className={`relative w-11 h-6 rounded-full transition-colors ${document.optional_program_visible ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${document.optional_program_visible ? 'translate-x-6' : 'translate-x-1'}`} />
          </span>
        </button>
      </div>
    );
  }

  if (section === 'contact') {
    return (
      <div className="space-y-3">
        <InfoBox>Nomor WhatsApp diambil otomatis dari profil agent agar seluruh CTA selalu konsisten.</InfoBox>
        <LockedField label="NAMA AGENT" value={agent.name} icon={UserCheck} />
        <LockedField label="NOMOR WHATSAPP" value={agent.phone || 'Belum diatur'} icon={MessageCircle} />
      </div>
    );
  }

  return null;
}

function ContentEditor({
  type,
  agent,
  document,
  manifest,
  selectedKey,
  onSelect,
  updateDocument,
}: {
  type: LandingBuilderType;
  agent: Props['agent'];
  document: LandingBuilderDocument;
  manifest: LandingContentManifest;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  updateDocument: (updater: (current: LandingBuilderDocument) => LandingBuilderDocument) => void;
}) {
  const item = manifest.groups.flatMap((group) => group.items).find((entry) => entry.key === selectedKey);

  if (!item) {
    return <ContentNavigator manifest={manifest} document={document} onSelect={onSelect} />;
  }
  return (
    <ComponentInspector
      type={type}
      agent={agent}
      document={document}
      item={item}
      onBack={() => onSelect(null)}
      updateDocument={updateDocument}
    />
  );
}

function ContentNavigator({ manifest, document, onSelect }: { manifest: LandingContentManifest; document: LandingBuilderDocument; onSelect: (key: string) => void }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(manifest.groups.slice(0, 1).map((group) => group.id)));
  const normalizedQuery = query.trim().toLocaleLowerCase('id-ID');
  const widgetTypes = [...new Set(manifest.groups.flatMap((group) => group.items.map((item) => item.widget_type)))].sort();
  const isChanged = (item: LandingContentItem) => Object.prototype.hasOwnProperty.call(document.content_overrides, item.key) || Boolean(document.component_overrides[item.element_id]);
  const groups = manifest.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (
        (!normalizedQuery || `${item.label} ${group.label} ${widgetLabel(item.widget_type)}`.toLocaleLowerCase('id-ID').includes(normalizedQuery))
        && (typeFilter === 'all' || item.widget_type === typeFilter)
        && (!onlyChanged || isChanged(item))
      )),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      <InfoBox>Klik elemen di preview atau pilih dari daftar. Seluruh teks, tombol, daftar, dan gambar yang terdeteksi dari halaman aktif dapat diedit.</InfoBox>

      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Cari ${manifest.total} elemen konten`}
          className={`${inputClass} pl-9`}
        />
      </label>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <FilterDropdown
          value={typeFilter}
          onChange={setTypeFilter}
          options={[{ value: 'all', label: 'Semua tipe komponen' }, ...widgetTypes.map((value) => ({ value, label: widgetLabel(value) }))]}
          ariaLabel="Filter tipe komponen"
          variant="compact"
          inputSkin
          portal
          portalZClass="z-[9700]"
        />
        <button
          type="button"
          aria-pressed={onlyChanged}
          onClick={() => setOnlyChanged((value) => !value)}
          className={`h-9 rounded-lg border px-3 text-[10px] font-bold transition-colors ${onlyChanged ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400' : 'border-gray-200 bg-white text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}
        >
          Diubah
        </button>
      </div>

      {groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.id}>
              <button
                type="button"
                onClick={() => setExpandedGroups((current) => {
                  const next = new Set(current);
                  if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                  return next;
                })}
                className="mb-1.5 flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-1 text-left hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <h3 className="min-w-0 truncate text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">{group.label}</h3>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold text-gray-500 dark:bg-slate-800 dark:text-slate-400">{group.items.length}</span>
              </button>
              {(normalizedQuery || typeFilter !== 'all' || onlyChanged || expandedGroups.has(group.id)) && <div className="space-y-1.5">
                {group.items.map((item) => (
                  <ContentItemButton key={item.key} item={item} changed={isChanged(item)} onClick={() => onSelect(item.key)} />
                ))}
              </div>}
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">Konten tidak ditemukan</p>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">Coba kata kunci lain atau klik langsung pada preview.</p>
        </div>
      )}
    </div>
  );
}

function ContentItemButton({ item, changed, onClick }: { item: LandingContentItem; changed: boolean; onClick: () => void }) {
  const Icon = item.kind === 'image' ? ImageIcon : item.field === 'button' ? FileText : Type;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-2.5 py-2 text-left transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400">
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-800 dark:text-white">{item.label}</span>
          {changed && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Sudah diubah" />}
          {item.locked && <Lock size={11} className="shrink-0 text-amber-500" />}
        </span>
        <span className="block text-[10px] text-gray-400 dark:text-slate-500">{widgetLabel(item.widget_type)} · {contentFieldLabel(item)}</span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-gray-400" />
    </button>
  );
}

function contentFieldLabel(item: LandingContentItem) {
  if (item.kind === 'image') return 'Gambar';
  if (item.kind === 'icon') return 'Ikon';
  if (item.kind === 'lottie') return 'Animasi';
  if (item.field === 'button') return 'Teks tombol';
  if (item.field === 'html_text') return 'Label CTA';
  if (item.field === 'heading') return 'Judul / heading';
  if (item.field === 'icon_list') return 'Item daftar';
  if (item.field === 'divider_text') return 'Teks pemisah';
  if (item.field.includes('description') || item.field === 'text_editor') return 'Deskripsi / paragraf';
  return 'Teks konten';
}

const inputClass = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';

function fieldInputClass(invalid: boolean) {
  return `${inputClass} ${invalid ? 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500' : ''}`;
}

function EditorField({ label, count, required = false, error, children }: { label: string; count?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
        <span>{label}{required && <span className="text-red-500"> *</span>}</span>
        {count && <span className="text-[10px] font-medium normal-case tracking-normal text-gray-400 dark:text-slate-500">{count}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] font-medium text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-blue-100 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 p-3 text-[11px] leading-relaxed text-blue-700 dark:text-blue-300">{children}</div>;
}

function LockedField({ label, value, icon: Icon = Lock }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">{label}</p>
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2.5 flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
        <Icon size={14} className="shrink-0 text-gray-400" />
        <span className="min-w-0 break-words">{value}</span>
      </div>
    </div>
  );
}

function FeaturedPackageCard({ package: pkg, onChange, onRemove }: { package: LandingFeaturedPackage; onChange: () => void; onRemove: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
      {pkg.image_url ? (
        <img src={pkg.image_url} alt="" className="w-full aspect-[16/8] object-cover" />
      ) : (
        <div className="w-full aspect-[16/7] bg-gray-100 dark:bg-slate-700 flex items-center justify-center"><ImageIcon size={24} className="text-gray-400" /></div>
      )}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-white">{pkg.name}</p>
        <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400 space-y-0.5">
          {pkg.departure_date && <p>{formatDate(pkg.departure_date)}</p>}
          {pkg.airline && <p>{pkg.airline}</p>}
          {pkg.seat_remaining !== null && <p>Sisa {pkg.seat_remaining} seat</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onChange} className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold">Ganti Paket</button>
          <button type="button" onClick={onRemove} className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center" aria-label="Hapus paket unggulan"><X size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

function DeviceButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={`Preview ${label}`}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${active ? 'bg-white text-emerald-500 shadow-sm dark:bg-slate-700 dark:text-emerald-400' : 'text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300'}`}
    >
      {children}
    </button>
  );
}

function PreviewError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="w-full max-w-xl self-center rounded-2xl border border-red-200 dark:border-red-800/50 bg-white dark:bg-slate-900 p-6 text-center">
      <p className="text-sm font-semibold text-gray-800 dark:text-white">Preview tidak dapat dimuat</p>
      <p className="mt-1 text-xs text-red-500 dark:text-red-400">{message || 'Silakan coba lagi.'}</p>
      <button type="button" onClick={onRetry} className="mt-4 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold">Coba Lagi</button>
    </div>
  );
}

function packagePreviewToBuilder(pkg: FeaturedPaketPreview): LandingFeaturedPackage {
  return {
    jadwal_id: pkg.jadwal_id,
    year_code: pkg.year_code,
    name: pkg.name,
    departure_date: pkg.berangkat_tgl,
    airline: pkg.maskapai,
    price: pkg.anchor_price,
    seat_remaining: pkg.seat_sisa,
    image_url: pkg.image_url,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function saveStatusLabel(status: ReturnType<typeof useLandingBuilder>['saveStatus']) {
  if (status === 'saving') return 'Menyimpan draft…';
  if (status === 'saved') return 'Draft tersimpan';
  if (status === 'error') return 'Gagal menyimpan';
  return 'Autosave aktif';
}
