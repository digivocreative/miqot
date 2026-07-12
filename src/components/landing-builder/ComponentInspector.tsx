import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, EyeOff, FileText, Image as ImageIcon, Link2, Lock,
  Monitor, Palette, RefreshCcw, SlidersHorizontal, Smartphone, Tablet,
} from 'lucide-react';
import FilterDropdown from '../FilterDropdown';
import SegmentedControl from '../common/SegmentedControl';
import { getAuthHeaders } from '../LoginPage';
import PhotoUploadField from '../bio-editor/sheets/PhotoUploadField';
import type {
  LandingAdvancedStyle,
  LandingBreakpoint,
  LandingBuilderDocument,
  LandingBuilderType,
  LandingComponentOverride,
  LandingContentItem,
  LandingEditorTab,
  LandingTargetOverride,
  LandingTargetStyle,
  LandingWidgetSettings,
} from './types';

interface Props {
  type: LandingBuilderType;
  agent: { slug: string };
  document: LandingBuilderDocument;
  item: LandingContentItem;
  onBack: () => void;
  updateDocument: (updater: (current: LandingBuilderDocument) => LandingBuilderDocument) => void;
}

const TAB_OPTIONS = [
  { value: 'content' as const, label: 'Konten', icon: FileText },
  { value: 'style' as const, label: 'Gaya', icon: Palette },
  { value: 'advanced' as const, label: 'Lanjutan', icon: SlidersHorizontal },
];

const BREAKPOINT_OPTIONS = [
  { value: 'base' as const, label: 'Desktop', icon: Monitor },
  { value: 'tablet' as const, label: 'Tablet', icon: Tablet },
  { value: 'mobile' as const, label: 'Mobile', icon: Smartphone },
];

const FONT_OPTIONS = [
  { value: 'inherit', label: 'Mengikuti template' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
];

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Kiri' },
  { value: 'center', label: 'Tengah' },
  { value: 'right', label: 'Kanan' },
  { value: 'justify', label: 'Rata kiri-kanan' },
];

const BORDER_OPTIONS = [
  { value: 'none', label: 'Tanpa garis' },
  { value: 'solid', label: 'Solid' },
  { value: 'double', label: 'Double' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashed', label: 'Dashed' },
];

const WEIGHT_OPTIONS = [
  { value: '100', label: 'Thin · 100' },
  { value: '300', label: 'Light · 300' },
  { value: '400', label: 'Regular · 400' },
  { value: '500', label: 'Medium · 500' },
  { value: '600', label: 'Semibold · 600' },
  { value: '700', label: 'Bold · 700' },
  { value: '800', label: 'Extra Bold · 800' },
  { value: '900', label: 'Black · 900' },
];

const FIT_OPTIONS = [
  { value: 'fill', label: 'Fill' },
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'none', label: 'Ukuran asli' },
];

const ANIMATION_OPTIONS = [
  { value: 'none', label: 'Tanpa animasi' },
  { value: 'fade-in', label: 'Fade In' },
  { value: 'fade-up', label: 'Fade Up' },
  { value: 'fade-down', label: 'Fade Down' },
  { value: 'slide-left', label: 'Slide dari kanan' },
  { value: 'slide-right', label: 'Slide dari kiri' },
  { value: 'zoom-in', label: 'Zoom In' },
];

const ICON_OPTIONS = [
  { value: 'original', label: 'Ikon asli template' },
  { value: 'check', label: 'Centang' },
  { value: 'star', label: 'Bintang' },
  { value: 'users', label: 'Jamaah / Pengguna' },
  { value: 'building', label: 'Gedung / Hotel' },
  { value: 'plane', label: 'Pesawat' },
  { value: 'calendar', label: 'Kalender' },
  { value: 'shield', label: 'Perisai / Aman' },
  { value: 'award', label: 'Penghargaan' },
  { value: 'kaaba', label: 'Kaaba' },
  { value: 'heart', label: 'Hati' },
  { value: 'message', label: 'Pesan / Konsultasi' },
];

const COLOR_PRESETS = ['#111827', '#ffffff', '#9a000c', '#10b981', '#2563eb', '#d97706'];
const inputClass = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50';

export default function ComponentInspector({ type, agent, document, item, onBack, updateDocument }: Props) {
  const [tab, setTab] = useState<LandingEditorTab>('content');
  const [breakpoint, setBreakpoint] = useState<LandingBreakpoint>('base');

  useEffect(() => {
    setTab(item.capabilities.content || item.locked ? 'content' : item.capabilities.style ? 'style' : 'advanced');
  }, [item.key, item.capabilities.content, item.capabilities.style]);

  const component = document.component_overrides[item.element_id] || {};
  const target = component.targets?.[item.target_key] || {};
  const targetStyle = target[breakpoint] || {};
  const advancedStyle = component[breakpoint] || {};
  const contentChanged = Object.prototype.hasOwnProperty.call(document.content_overrides, item.key);
  const componentChanged = Boolean(document.component_overrides[item.element_id]);
  const changed = contentChanged || componentChanged;

  const updateComponent = (updater: (current: LandingComponentOverride) => LandingComponentOverride) => {
    updateDocument((current) => {
      const componentOverrides = { ...current.component_overrides };
      const next = pruneObject(updater(componentOverrides[item.element_id] || { widget_type: item.widget_type })) as LandingComponentOverride;
      if (Object.keys(next).length > 1 || (Object.keys(next).length === 1 && !next.widget_type)) componentOverrides[item.element_id] = next;
      else delete componentOverrides[item.element_id];
      return { ...current, component_overrides: componentOverrides };
    });
  };

  const updateTarget = (patch: Partial<LandingTargetOverride>) => {
    updateComponent((current) => ({
      ...current,
      widget_type: item.widget_type,
      targets: {
        ...(current.targets || {}),
        [item.target_key]: { ...(current.targets?.[item.target_key] || {}), ...patch },
      },
    }));
  };

  const updateTargetStyle = (key: keyof LandingTargetStyle, value: LandingTargetStyle[keyof LandingTargetStyle] | undefined, responsiveBreakpoint = breakpoint) => {
    const existing = target[responsiveBreakpoint] || {};
    updateTarget({ [responsiveBreakpoint]: { ...existing, [key]: value } });
  };

  const updateAdvancedStyle = (key: keyof LandingAdvancedStyle, value: LandingAdvancedStyle[keyof LandingAdvancedStyle] | undefined) => {
    updateComponent((current) => ({
      ...current,
      widget_type: item.widget_type,
      [breakpoint]: { ...(current[breakpoint] || {}), [key]: value },
    }));
  };

  const updateContent = (value: string) => {
    updateDocument((current) => ({
      ...current,
      content_overrides: { ...current.content_overrides, [item.key]: value },
    }));
  };

  const resetElement = () => {
    updateDocument((current) => {
      const contentOverrides = { ...current.content_overrides };
      for (const key of Object.keys(contentOverrides)) {
        if (key.startsWith(`${item.element_id}:`)) delete contentOverrides[key];
      }
      const componentOverrides = { ...current.component_overrides };
      delete componentOverrides[item.element_id];
      return { ...current, content_overrides: contentOverrides, component_overrides: componentOverrides };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          aria-label="Kembali ke semua komponen"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-900/20">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{item.section_label} · {widgetLabel(item.widget_type)}</p>
            {changed && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Diubah</span>}
            {item.locked && <Lock size={12} className="text-amber-500" />}
          </div>
          <p className="mt-1 break-words text-sm font-semibold text-gray-800 dark:text-white">{item.label}</p>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 py-1 backdrop-blur dark:bg-slate-900/95">
        <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} accent="emerald" />
      </div>

      {tab === 'content' && (
        <ContentTab
          type={type}
          agent={agent}
          item={item}
          value={contentChanged ? document.content_overrides[item.key] : item.value}
          target={target}
          component={component}
          onContentChange={updateContent}
          onTargetChange={updateTarget}
          onSettingsChange={(patch) => updateComponent((current) => ({ ...current, widget_type: item.widget_type, settings: { ...(current.settings || {}), ...patch } }))}
          onResetContent={() => {
            updateDocument((current) => {
              const contentOverrides = { ...current.content_overrides };
              delete contentOverrides[item.key];
              return { ...current, content_overrides: contentOverrides };
            });
          }}
        />
      )}

      {tab === 'style' && (
        <StyleTab
          item={item}
          target={target}
          component={component}
          breakpoint={breakpoint}
          style={targetStyle}
          onBreakpoint={setBreakpoint}
          onChange={updateTargetStyle}
          onHoverChange={(key, value) => updateTarget({ hover: { ...(target.hover || {}), [key]: value } })}
          onSettingsChange={(patch) => updateComponent((current) => ({ ...current, widget_type: item.widget_type, settings: { ...(current.settings || {}), ...patch } }))}
        />
      )}

      {tab === 'advanced' && (
        <AdvancedTab
          item={item}
          component={component}
          breakpoint={breakpoint}
          style={advancedStyle}
          onBreakpoint={setBreakpoint}
          onStyleChange={updateAdvancedStyle}
          onComponentChange={(patch) => updateComponent((current) => ({ ...current, widget_type: item.widget_type, ...patch }))}
        />
      )}

      {changed && (
        <button
          type="button"
          onClick={resetElement}
          className="flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <RefreshCcw size={13} /> Kembalikan seluruh pengaturan elemen
        </button>
      )}
    </div>
  );
}

function ContentTab({
  type,
  agent,
  item,
  value,
  target,
  component,
  onContentChange,
  onTargetChange,
  onSettingsChange,
  onResetContent,
}: {
  type: LandingBuilderType;
  agent: { slug: string };
  item: LandingContentItem;
  value: string;
  target: LandingTargetOverride;
  component: LandingComponentOverride;
  onContentChange: (value: string) => void;
  onTargetChange: (patch: Partial<LandingTargetOverride>) => void;
  onSettingsChange: (patch: Partial<LandingWidgetSettings>) => void;
  onResetContent: () => void;
}) {
  const linkValue = target.link_url !== undefined ? target.link_url : item.link_url;
  const altValue = target.alt_text !== undefined ? target.alt_text : item.alt_text;
  const [linkDraft, setLinkDraft] = useState(linkValue);
  useEffect(() => setLinkDraft(linkValue), [item.key, linkValue]);
  const linkValid = isValidActionUrl(linkDraft);

  return (
    <div className="space-y-4">
      {item.lock_reason && <InspectorNotice tone={item.locked ? 'warning' : 'info'}>{item.lock_reason}</InspectorNotice>}

      {item.capabilities.content && item.kind === 'image' && (
        <InspectorField label="GAMBAR">
          <PhotoUploadField
            currentUrl={value}
            slug={agent.slug}
            uploadUrl={`/api/landing-builder/${type}/hero-image`}
            authHeaders={getAuthHeaders}
            onUploaded={onContentChange}
            onRemove={onResetContent}
          />
        </InspectorField>
      )}

      {item.capabilities.content && item.kind !== 'image' && (
        <InspectorField label={contentFieldLabel(item)} count={`${value.length}/4000`}>
          {item.kind === 'text' ? (
            <input value={value} maxLength={4000} onChange={(event) => onContentChange(event.target.value)} className={inputClass} />
          ) : (
            <textarea value={value} maxLength={4000} rows={Math.min(9, Math.max(3, value.split(/\r?\n/).length + 2))} onChange={(event) => onContentChange(event.target.value)} className={inputClass} />
          )}
        </InspectorField>
      )}

      {item.widget_type === 'heading' && item.capabilities.content && (
        <DropdownControl
          label="TAG HTML"
          value={component.settings?.heading_tag || (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'].includes(item.html_tag) ? item.html_tag : 'h2')}
          options={[
            { value: 'h1', label: 'H1 · Judul utama' },
            { value: 'h2', label: 'H2 · Judul section' },
            { value: 'h3', label: 'H3 · Subjudul' },
            { value: 'h4', label: 'H4' },
            { value: 'h5', label: 'H5' },
            { value: 'h6', label: 'H6' },
            { value: 'p', label: 'Paragraf' },
          ]}
          onChange={(heading_tag) => onSettingsChange({ heading_tag: heading_tag as LandingWidgetSettings['heading_tag'] })}
        />
      )}

      {!item.capabilities.content && !item.lock_reason && (
        <InspectorNotice tone="info">Komponen ini tidak memiliki teks atau media langsung. Gunakan tab Gaya dan Lanjutan untuk mengatur tampilannya.</InspectorNotice>
      )}

      {item.capabilities.icon && (
        <DropdownControl
          label="PILIH IKON"
          value={target.icon_name || item.icon_name || 'original'}
          options={ICON_OPTIONS}
          onChange={(icon_name) => onTargetChange({ icon_name: icon_name as LandingTargetOverride['icon_name'] })}
        />
      )}

      {item.capabilities.alt && (
        <InspectorField label="ALT TEXT" count={`${altValue.length}/180`}>
          <input value={altValue} maxLength={180} onChange={(event) => onTargetChange({ alt_text: event.target.value })} placeholder="Jelaskan isi gambar untuk aksesibilitas" className={inputClass} />
        </InspectorField>
      )}

      {item.capabilities.link && (
        <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-slate-700">
          <InspectorField label="TAUTAN / ACTION">
            <div className="relative">
              <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={linkDraft}
                maxLength={2048}
                onChange={(event) => setLinkDraft(event.target.value)}
                onBlur={() => { if (linkValid) onTargetChange({ link_url: linkDraft.trim() }); }}
                placeholder="https://…, /halaman, atau #bagian"
                aria-invalid={!linkValid}
                className={`${inputClass} pl-9 ${!linkValid ? 'border-red-300 focus:border-red-500 focus:ring-red-500 dark:border-red-600' : ''}`}
              />
            </div>
            {!linkValid && <span className="mt-1 block text-[11px] font-medium text-red-600 dark:text-red-400">Gunakan HTTPS, /halaman, #bagian, tel:, atau mailto:.</span>}
          </InspectorField>
          <ToggleRow label="Buka di tab baru" checked={target.link_new_tab ?? item.link_new_tab} onChange={(checked) => onTargetChange({ link_new_tab: checked })} />
          <ToggleRow label="Tandai nofollow" checked={target.link_nofollow ?? item.link_nofollow} onChange={(checked) => onTargetChange({ link_nofollow: checked })} />
        </div>
      )}

      {item.capabilities.whatsapp_message && (
        <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-slate-700">
          <InspectorNotice tone="info">Nomor WhatsApp tetap mengikuti profil agent. Pesan pembuka tombol ini boleh disesuaikan.</InspectorNotice>
          <InspectorField label="PESAN WHATSAPP" count={`${(target.whatsapp_message ?? item.whatsapp_message).length}/500`}>
            <textarea
              value={target.whatsapp_message ?? item.whatsapp_message}
              maxLength={500}
              rows={4}
              onChange={(event) => onTargetChange({ whatsapp_message: event.target.value })}
              className={inputClass}
            />
          </InspectorField>
        </div>
      )}
    </div>
  );
}

function StyleTab({ item, target, component, breakpoint, style, onBreakpoint, onChange, onHoverChange, onSettingsChange }: {
  item: LandingContentItem;
  target: LandingTargetOverride;
  component: LandingComponentOverride;
  breakpoint: LandingBreakpoint;
  style: LandingTargetStyle;
  onBreakpoint: (value: LandingBreakpoint) => void;
  onChange: (key: keyof LandingTargetStyle, value: LandingTargetStyle[keyof LandingTargetStyle] | undefined) => void;
  onHoverChange: (key: keyof LandingTargetStyle, value: LandingTargetStyle[keyof LandingTargetStyle] | undefined) => void;
  onSettingsChange: (patch: Partial<LandingWidgetSettings>) => void;
}) {
  if (!item.capabilities.style) return <InspectorNotice tone="warning">Gaya elemen ini dikunci untuk menjaga informasi legal dan identitas perusahaan.</InspectorNotice>;
  const isText = ['text', 'textarea'].includes(item.kind);
  const isButton = item.field === 'button' || item.field === 'html_text';
  const isImage = item.kind === 'image';
  const isIcon = item.kind === 'icon';
  const isDivider = item.field === 'divider_text';
  const settings = component.settings || {};

  return (
    <div className="space-y-5">
      <BreakpointControl value={breakpoint} onChange={onBreakpoint} />

      {item.widget_type === 'image-carousel' && (
        <ControlSection title="Pengaturan Carousel">
          <div className="grid grid-cols-2 gap-2">
            <NumberControl
              label="Slide terlihat"
              value={breakpoint === 'mobile' ? settings.carousel_slides_mobile : breakpoint === 'tablet' ? settings.carousel_slides_tablet : settings.carousel_slides}
              min={1}
              max={breakpoint === 'mobile' ? 4 : 8}
              onChange={(value) => onSettingsChange({ [breakpoint === 'mobile' ? 'carousel_slides_mobile' : breakpoint === 'tablet' ? 'carousel_slides_tablet' : 'carousel_slides']: value })}
            />
            <NumberControl
              label="Jarak"
              value={breakpoint === 'mobile' ? settings.carousel_gap_mobile : breakpoint === 'tablet' ? settings.carousel_gap_tablet : settings.carousel_gap}
              min={0}
              max={120}
              unit="px"
              onChange={(value) => onSettingsChange({ [breakpoint === 'mobile' ? 'carousel_gap_mobile' : breakpoint === 'tablet' ? 'carousel_gap_tablet' : 'carousel_gap']: value })}
            />
          </div>
          <ToggleRow label="Autoplay" checked={settings.carousel_autoplay !== false} onChange={(carousel_autoplay) => onSettingsChange({ carousel_autoplay })} />
          <ToggleRow label="Berulang tanpa henti" checked={settings.carousel_loop !== false} onChange={(carousel_loop) => onSettingsChange({ carousel_loop })} />
          <ToggleRow label="Jeda saat disentuh / hover" checked={settings.carousel_pause_on_hover !== false} onChange={(carousel_pause_on_hover) => onSettingsChange({ carousel_pause_on_hover })} />
          {settings.carousel_autoplay !== false && <NumberControl label="Interval autoplay" value={settings.carousel_autoplay_speed} min={500} max={20000} step={100} unit="ms" onChange={(carousel_autoplay_speed) => onSettingsChange({ carousel_autoplay_speed })} />}
        </ControlSection>
      )}

      {item.widget_type === 'gallery' && (
        <ControlSection title="Pengaturan Galeri">
          <div className="grid grid-cols-2 gap-2">
            <NumberControl
              label="Kolom"
              value={breakpoint === 'mobile' ? settings.gallery_columns_mobile : breakpoint === 'tablet' ? settings.gallery_columns_tablet : settings.gallery_columns}
              min={1}
              max={breakpoint === 'mobile' ? 4 : breakpoint === 'tablet' ? 8 : 12}
              onChange={(value) => onSettingsChange({ [breakpoint === 'mobile' ? 'gallery_columns_mobile' : breakpoint === 'tablet' ? 'gallery_columns_tablet' : 'gallery_columns']: value })}
            />
            <NumberControl
              label="Jarak"
              value={breakpoint === 'mobile' ? settings.gallery_gap_mobile : breakpoint === 'tablet' ? settings.gallery_gap_tablet : settings.gallery_gap}
              min={0}
              max={120}
              unit="px"
              onChange={(value) => onSettingsChange({ [breakpoint === 'mobile' ? 'gallery_gap_mobile' : breakpoint === 'tablet' ? 'gallery_gap_tablet' : 'gallery_gap']: value })}
            />
          </div>
          <DropdownControl
            label="Rasio gambar"
            value={settings.gallery_aspect_ratio || '3:2'}
            options={['1:1', '3:2', '4:3', '16:9', '9:16'].map((value) => ({ value, label: value }))}
            onChange={(gallery_aspect_ratio) => onSettingsChange({ gallery_aspect_ratio: gallery_aspect_ratio as LandingWidgetSettings['gallery_aspect_ratio'] })}
          />
          <ToggleRow label="Buka lightbox" checked={settings.gallery_lightbox !== false} onChange={(gallery_lightbox) => onSettingsChange({ gallery_lightbox })} />
        </ControlSection>
      )}

      {(isText || isButton || isIcon) && (
        <ControlSection title="Warna">
          <ColorControl label="Warna utama" value={style.color} fallback="#111827" onChange={(value) => onChange('color', value)} />
          {(isButton || isIcon) && <ColorControl label="Latar belakang" value={style.background_color} fallback="#10b981" onChange={(value) => onChange('background_color', value)} />}
        </ControlSection>
      )}

      {(isText || isButton || isDivider) && (
        <ControlSection title="Tipografi">
          <DropdownControl label="Font" value={style.font_family || 'inherit'} options={FONT_OPTIONS} onChange={(value) => onChange('font_family', value)} />
          <div className="grid grid-cols-2 gap-2">
            <NumberControl label="Ukuran" value={style.font_size} min={6} max={160} unit="px" onChange={(value) => onChange('font_size', value)} />
            <DropdownControl label="Ketebalan" value={String(style.font_weight || 400)} options={WEIGHT_OPTIONS} onChange={(value) => onChange('font_weight', Number(value))} />
            <NumberControl label="Line height" value={style.line_height} min={0.7} max={4} step={0.05} unit="×" onChange={(value) => onChange('line_height', value)} />
            <NumberControl label="Jarak huruf" value={style.letter_spacing} min={-10} max={40} step={0.1} unit="px" onChange={(value) => onChange('letter_spacing', value)} />
          </div>
          <DropdownControl label="Alignment" value={style.text_align || 'left'} options={ALIGN_OPTIONS} onChange={(value) => onChange('text_align', value as LandingTargetStyle['text_align'])} />
          <div className="grid grid-cols-2 gap-2">
            <ToggleRow compact label="Italic" checked={style.font_style === 'italic'} onChange={(checked) => onChange('font_style', checked ? 'italic' : 'normal')} />
            <ToggleRow compact label="Underline" checked={style.text_decoration === 'underline'} onChange={(checked) => onChange('text_decoration', checked ? 'underline' : 'none')} />
          </div>
        </ControlSection>
      )}

      {(isImage || item.kind === 'lottie') && (
        <ControlSection title="Ukuran & Media">
          <div className="grid grid-cols-2 gap-2">
            <NumberControl label="Lebar" value={style.width} min={1} max={100} unit="%" onChange={(value) => onChange('width', value)} />
            <NumberControl label="Maks. lebar" value={style.max_width} min={1} max={100} unit="%" onChange={(value) => onChange('max_width', value)} />
            <NumberControl label="Tinggi" value={style.height} min={16} max={1600} unit="px" onChange={(value) => onChange('height', value)} />
            <NumberControl label="Opacity" value={style.opacity} min={0} max={100} unit="%" onChange={(value) => onChange('opacity', value)} />
          </div>
          {isImage && <DropdownControl label="Object fit" value={style.object_fit || 'cover'} options={FIT_OPTIONS} onChange={(value) => onChange('object_fit', value as LandingTargetStyle['object_fit'])} />}
          <DropdownControl label="Alignment" value={style.text_align || 'center'} options={ALIGN_OPTIONS} onChange={(value) => onChange('text_align', value as LandingTargetStyle['text_align'])} />
        </ControlSection>
      )}

      {isIcon && (
        <ControlSection title="Ukuran Ikon">
          <NumberControl label="Ukuran" value={style.font_size} min={6} max={160} unit="px" onChange={(value) => onChange('font_size', value)} />
          <DropdownControl label="Alignment" value={style.text_align || 'center'} options={ALIGN_OPTIONS} onChange={(value) => onChange('text_align', value as LandingTargetStyle['text_align'])} />
          <PaddingGrid value={style} onChange={onChange} />
        </ControlSection>
      )}

      {isDivider && (
        <ControlSection title="Garis Pemisah">
          <ColorControl label="Warna garis" value={style.divider_color} fallback="#9a000c" onChange={(value) => onChange('divider_color', value)} />
          <div className="grid grid-cols-2 gap-2">
            <NumberControl label="Lebar" value={style.divider_width} min={1} max={100} unit="%" onChange={(value) => onChange('divider_width', value)} />
            <NumberControl label="Ketebalan" value={style.divider_thickness} min={1} max={24} unit="px" onChange={(value) => onChange('divider_thickness', value)} />
          </div>
        </ControlSection>
      )}

      {(isButton || isImage || isIcon) && (
        <ControlSection title="Border & Bayangan">
          <DropdownControl label="Tipe border" value={style.border_style || 'none'} options={BORDER_OPTIONS} onChange={(value) => onChange('border_style', value as LandingTargetStyle['border_style'])} />
          <ColorControl label="Warna border" value={style.border_color} fallback="#d1d5db" onChange={(value) => onChange('border_color', value)} />
          <div className="grid grid-cols-2 gap-2">
            <NumberControl label="Tebal border" value={style.border_width} min={0} max={24} unit="px" onChange={(value) => onChange('border_width', value)} />
            <NumberControl label="Radius" value={style.border_radius} min={0} max={400} unit="px" onChange={(value) => onChange('border_radius', value)} />
          </div>
          <ShadowControls style={style} onChange={onChange} />
        </ControlSection>
      )}

      {isButton && (
        <ControlSection title="Tombol">
          <NumberControl label="Lebar tombol" value={style.width} min={1} max={100} unit="%" onChange={(value) => onChange('width', value)} />
          <PaddingGrid value={style} onChange={onChange} />
          <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Saat hover</p>
          <ColorControl label="Warna teks" value={target.hover?.color} fallback="#ffffff" onChange={(value) => onHoverChange('color', value)} />
          <ColorControl label="Warna latar" value={target.hover?.background_color} fallback="#059669" onChange={(value) => onHoverChange('background_color', value)} />
        </ControlSection>
      )}
    </div>
  );
}

function AdvancedTab({ item, component, breakpoint, style, onBreakpoint, onStyleChange, onComponentChange }: {
  item: LandingContentItem;
  component: LandingComponentOverride;
  breakpoint: LandingBreakpoint;
  style: LandingAdvancedStyle;
  onBreakpoint: (value: LandingBreakpoint) => void;
  onStyleChange: (key: keyof LandingAdvancedStyle, value: LandingAdvancedStyle[keyof LandingAdvancedStyle] | undefined) => void;
  onComponentChange: (patch: Partial<LandingComponentOverride>) => void;
}) {
  if (!item.capabilities.advanced) return <InspectorNotice tone="warning">Pengaturan lanjutan dikunci untuk elemen ini.</InspectorNotice>;
  return (
    <div className="space-y-5">
      <BreakpointControl value={breakpoint} onChange={onBreakpoint} />
      <InspectorNotice tone="info">Pengaturan Lanjutan berlaku pada seluruh widget {widgetLabel(item.widget_type)}, bukan hanya teks yang dipilih.</InspectorNotice>

      <ControlSection title="Spacing">
        <SpacingGrid prefix="margin" label="Margin" value={style} onChange={onStyleChange} min={-400} max={800} />
        <SpacingGrid prefix="padding" label="Padding" value={style} onChange={onStyleChange} min={0} max={800} />
      </ControlSection>

      <ControlSection title="Layout">
        <ColorControl label="Warna latar widget" value={style.background_color} fallback="#ffffff" onChange={(value) => onStyleChange('background_color', value)} />
        <div className="grid grid-cols-2 gap-2">
          <NumberControl label="Lebar" value={style.width} min={1} max={100} unit="%" onChange={(value) => onStyleChange('width', value)} />
          <NumberControl label="Maks. lebar" value={style.max_width} min={1} max={100} unit="%" onChange={(value) => onStyleChange('max_width', value)} />
          <NumberControl label="Min. tinggi" value={style.min_height} min={0} max={1600} unit="px" onChange={(value) => onStyleChange('min_height', value)} />
          <NumberControl label="Z-index" value={style.z_index} min={-10} max={999} onChange={(value) => onStyleChange('z_index', value)} />
        </div>
      </ControlSection>

      <ControlSection title="Border & Bayangan Widget">
        <DropdownControl label="Tipe border" value={style.border_style || 'none'} options={BORDER_OPTIONS} onChange={(value) => onStyleChange('border_style', value as LandingAdvancedStyle['border_style'])} />
        <ColorControl label="Warna border" value={style.border_color} fallback="#d1d5db" onChange={(value) => onStyleChange('border_color', value)} />
        <div className="grid grid-cols-2 gap-2">
          <NumberControl label="Tebal border" value={style.border_width} min={0} max={24} unit="px" onChange={(value) => onStyleChange('border_width', value)} />
          <NumberControl label="Radius" value={style.border_radius} min={0} max={400} unit="px" onChange={(value) => onStyleChange('border_radius', value)} />
        </div>
        <ShadowControls style={style} onChange={onStyleChange} />
      </ControlSection>

      <ControlSection title="Visibilitas Responsif">
        <ToggleRow label="Sembunyikan di desktop" checked={component.hide_desktop === true} icon={Monitor} onChange={(checked) => onComponentChange({ hide_desktop: checked })} />
        <ToggleRow label="Sembunyikan di tablet" checked={component.hide_tablet === true} icon={Tablet} onChange={(checked) => onComponentChange({ hide_tablet: checked })} />
        <ToggleRow label="Sembunyikan di mobile" checked={component.hide_mobile === true} icon={Smartphone} onChange={(checked) => onComponentChange({ hide_mobile: checked })} />
      </ControlSection>

      <ControlSection title="Animasi Masuk">
        <DropdownControl label="Efek" value={component.entrance_animation || 'none'} options={ANIMATION_OPTIONS} onChange={(value) => onComponentChange({ entrance_animation: value as LandingComponentOverride['entrance_animation'] })} />
        {component.entrance_animation && component.entrance_animation !== 'none' && (
          <NumberControl label="Durasi" value={component.animation_duration} min={100} max={3000} step={50} unit="ms" onChange={(value) => onComponentChange({ animation_duration: value })} />
        )}
      </ControlSection>
    </div>
  );
}

function BreakpointControl({ value, onChange }: { value: LandingBreakpoint; onChange: (value: LandingBreakpoint) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Edit untuk perangkat</p>
      <SegmentedControl options={BREAKPOINT_OPTIONS} value={value} onChange={onChange} accent="teal" />
    </div>
  );
}

function ControlSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-gray-100 pb-5 last:border-0 dark:border-slate-700">
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">{title}</h3>
      {children}
    </section>
  );
}

function InspectorField({ label, count, children }: { label: string; count?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
        <span>{label}</span>
        {count && <span className="text-[10px] font-medium normal-case tracking-normal text-gray-400 dark:text-slate-500">{count}</span>}
      </span>
      {children}
    </label>
  );
}

function InspectorNotice({ tone, children }: { tone: 'info' | 'warning'; children: React.ReactNode }) {
  const classes = tone === 'warning'
    ? 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300'
    : 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300';
  return <div className={`rounded-xl border p-3 text-[11px] leading-relaxed ${classes}`}>{children}</div>;
}

function DropdownControl({ label, value, options, onChange }: { label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</p>
      <FilterDropdown value={value} options={options} onChange={onChange} ariaLabel={label} variant="default" inputSkin portal portalZClass="z-[9700]" />
    </div>
  );
}

function NumberControl({ label, value, min, max, step = 1, unit, onChange }: { label: string; value?: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number | undefined) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</span>
      <span className="relative block">
        <input
          type="number"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            if (!event.target.value) return onChange(undefined);
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className={`${inputClass} ${unit ? 'pr-10' : ''}`}
        />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400">{unit}</span>}
      </span>
    </label>
  );
}

function ColorControl({ label, value, fallback, onChange }: { label: string; value?: string; fallback: string; onChange: (value: string | undefined) => void }) {
  const current = value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</p>
        {value && <button type="button" onClick={() => onChange(undefined)} className="text-[10px] font-semibold text-red-500">Reset</button>}
      </div>
      <div className="flex items-center gap-1.5">
        <label className="relative h-9 w-11 shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700" title="Pilih warna">
          <input type="color" value={current.slice(0, 7)} onChange={(event) => onChange(event.target.value)} className="absolute -inset-2 h-14 w-16 cursor-pointer border-0 p-0" />
        </label>
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={`h-8 w-8 rounded-lg border-2 transition-transform active:scale-95 ${current.toLowerCase() === preset ? 'border-emerald-500' : 'border-white shadow-sm ring-1 ring-gray-200 dark:border-slate-800 dark:ring-slate-700'}`}
            style={{ backgroundColor: preset }}
            aria-label={`Pilih warna ${preset}`}
          />
        ))}
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, icon: Icon = EyeOff, compact = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon?: React.ElementType; compact?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-2.5 rounded-xl border border-gray-200 text-left dark:border-slate-700 ${compact ? 'min-h-10 px-2.5 py-2' : 'min-h-11 px-3 py-2.5'}`}
    >
      <Icon size={14} className="shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 text-xs font-semibold text-gray-700 dark:text-slate-200">{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

function SpacingGrid({ prefix, label, value, onChange, min, max }: { prefix: 'margin' | 'padding'; label: string; value: LandingAdvancedStyle; onChange: (key: keyof LandingAdvancedStyle, value: number | undefined) => void; min: number; max: number }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
          const key = `${prefix}_${side}` as keyof LandingAdvancedStyle;
          return <NumberControl key={side} label={{ top: 'Atas', right: 'Kanan', bottom: 'Bawah', left: 'Kiri' }[side]} value={value[key] as number | undefined} min={min} max={max} unit="px" onChange={(next) => onChange(key, next)} />;
        })}
      </div>
    </div>
  );
}

function PaddingGrid({ value, onChange }: { value: LandingTargetStyle; onChange: (key: keyof LandingTargetStyle, value: LandingTargetStyle[keyof LandingTargetStyle] | undefined) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Padding</p>
      <div className="grid grid-cols-4 gap-1.5">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
          const key = `padding_${side}` as keyof LandingTargetStyle;
          return <NumberControl key={side} label={{ top: 'Atas', right: 'Kanan', bottom: 'Bawah', left: 'Kiri' }[side]} value={value[key] as number | undefined} min={0} max={200} unit="px" onChange={(next) => onChange(key, next)} />;
        })}
      </div>
    </div>
  );
}

function ShadowControls<T extends LandingTargetStyle | LandingAdvancedStyle>({ style, onChange }: { style: T; onChange: (key: keyof T, value: T[keyof T] | undefined) => void }) {
  return (
    <div className="space-y-2">
      <ColorControl label="Warna bayangan" value={style.shadow_color} fallback="#111827" onChange={(value) => onChange('shadow_color' as keyof T, value as T[keyof T])} />
      {style.shadow_color && (
        <div className="grid grid-cols-4 gap-1.5">
          <NumberControl label="X" value={style.shadow_x} min={-200} max={200} unit="px" onChange={(value) => onChange('shadow_x' as keyof T, value as T[keyof T])} />
          <NumberControl label="Y" value={style.shadow_y} min={-200} max={200} unit="px" onChange={(value) => onChange('shadow_y' as keyof T, value as T[keyof T])} />
          <NumberControl label="Blur" value={style.shadow_blur} min={0} max={300} unit="px" onChange={(value) => onChange('shadow_blur' as keyof T, value as T[keyof T])} />
          <NumberControl label="Spread" value={style.shadow_spread} min={0} max={200} unit="px" onChange={(value) => onChange('shadow_spread' as keyof T, value as T[keyof T])} />
        </div>
      )}
    </div>
  );
}

function contentFieldLabel(item: LandingContentItem) {
  if (item.kind === 'image') return 'GAMBAR';
  if (item.field === 'button' || item.field === 'html_text') return 'TEKS TOMBOL';
  if (item.field === 'heading') return 'JUDUL / HEADING';
  if (item.field === 'icon_list') return 'ITEM DAFTAR';
  if (item.field === 'divider_text') return 'TEKS PEMISAH';
  if (item.field.includes('description') || item.field === 'text_editor') return 'DESKRIPSI / PARAGRAF';
  return 'TEKS KONTEN';
}

export function widgetLabel(type: string) {
  return ({
    heading: 'Heading',
    button: 'Tombol',
    image: 'Gambar',
    'image-carousel': 'Carousel',
    gallery: 'Galeri',
    icon: 'Ikon',
    'icon-list': 'Daftar Ikon',
    'icon-box': 'Kartu Ikon',
    'image-box': 'Kartu Gambar',
    divider: 'Pemisah',
    html: 'CTA Khusus',
    lottie: 'Animasi',
    'text-editor': 'Teks',
  } as Record<string, string>)[type] || 'Komponen';
}

function pruneObject(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    const next = pruneObject(child);
    if (next && typeof next === 'object' && !Array.isArray(next) && Object.keys(next as Record<string, unknown>).length === 0) continue;
    output[key] = next;
  }
  return output;
}

function isValidActionUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^#[a-z][a-z0-9_-]{0,63}$/i.test(trimmed)) return true;
  if (/^\/(?!\/)[a-z0-9/_.,~:@?&=+%#-]*$/i.test(trimmed)) return true;
  if (/^tel:\+?[0-9][0-9 -]{5,20}$/i.test(trimmed)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
