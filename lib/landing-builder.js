const BUILDER_VERSION = 2;

const DEFAULTS = {
  umroh: {
    version: BUILDER_VERSION,
    hero: {
      eyebrow: 'Travel Umroh Akreditasi "A"',
      headline: 'Umroh Pasti Berangkat\nHanya 30 JUTA (ALL-IN)',
      description: 'Situs Resmi PT Alhijaz Indowisata (Pusat)',
      cta_label: 'Konsultasi via WhatsApp',
      cta_message: 'Assalamualaikum, Saya mau tanya Paket Umroh di Alhijaz',
      image_url: null,
    },
    featured_package: null,
    featured_haji_package: null,
    content_overrides: {},
    component_overrides: {},
    // The active Umroh renderer currently hides the legacy voucher section.
    // Keep that behavior until an agent explicitly enables it in the editor.
    optional_program_visible: false,
  },
  haji: {
    version: BUILDER_VERSION,
    hero: {
      eyebrow: '',
      headline: 'Semakin Menunda, Masa Tunggu Haji Plus semakin Panjang',
      description: 'Masa Tunggu Haji Plus Lebih Singkat, Pelayanan Terbaik, dan Fasilitas Eksklusif untuk Ibadah Haji Plus Anda.',
      cta_label: 'Konsultasi di WhatsApp',
      cta_message: 'Assalamualaikum, Saya mau tanya Paket Haji Khusus di Alhijaz',
      image_url: null,
    },
    featured_package: null,
    featured_haji_package: null,
    content_overrides: {},
    component_overrides: {},
    optional_program_visible: true,
  },
};

const LIMITS = {
  eyebrow: 80,
  headline: 140,
  description: 280,
  cta_label: 48,
  cta_message: 280,
  package_name: 120,
  package_airline: 80,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, fallback, max) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/\r\n?/g, '\n').trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

function cleanNullableUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 2048);
  if (/[\u0000-\u001f\u007f<>"'()\\]/.test(trimmed)) return null;
  if (/^\/(?!\/)[a-z0-9/_.,~:@?&=+%-]+$/i.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function cleanFeaturedPackage(value) {
  if (!value || typeof value !== 'object') return null;
  const jadwalId = cleanText(value.jadwal_id, '', 80);
  const name = cleanText(value.name, '', LIMITS.package_name);
  if (!jadwalId || !name) return null;
  const price = value.price === null || value.price === undefined ? NaN : Number(value.price);
  const seats = value.seat_remaining === null || value.seat_remaining === undefined
    ? NaN
    : Number(value.seat_remaining);
  return {
    jadwal_id: jadwalId,
    year_code: cleanText(value.year_code, '', 8),
    name,
    departure_date: cleanText(value.departure_date, '', 32),
    airline: cleanText(value.airline, '', LIMITS.package_airline),
    price: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
    seat_remaining: Number.isFinite(seats) && seats >= 0 ? Math.round(seats) : null,
    image_url: cleanNullableUrl(value.image_url),
  };
}

const CONTENT_OVERRIDE_KEY = /^[a-z0-9_-]{1,64}:(heading|button|icon_list|list_icon|icon_title|icon_description|image_title|image_description|text_editor|image|gallery_image|divider_text|html_text|icon|lottie):\d{1,3}$/i;
const COMPONENT_ID = /^[a-z0-9_-]{1,64}$/i;
const COMPONENT_TARGET_KEY = /^(heading|button|icon_list|list_icon|icon_title|icon_description|image_title|image_description|text_editor|image|gallery_image|divider_text|html_text|icon|lottie):\d{1,3}$/i;
const HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const STYLE_ENUMS = {
  font_family: ['inherit', 'Inter', 'Montserrat', 'Arial', 'Georgia', 'Times New Roman'],
  font_weight: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  font_style: ['normal', 'italic'],
  text_transform: ['none', 'uppercase', 'lowercase', 'capitalize'],
  text_decoration: ['none', 'underline', 'line-through'],
  text_align: ['left', 'center', 'right', 'justify'],
  object_fit: ['fill', 'cover', 'contain', 'none'],
  border_style: ['none', 'solid', 'double', 'dotted', 'dashed'],
};
const STYLE_NUMBERS = {
  font_size: [6, 160],
  line_height: [0.7, 4],
  letter_spacing: [-10, 40],
  width: [1, 100],
  max_width: [1, 100],
  height: [16, 1600],
  opacity: [0, 100],
  border_width: [0, 24],
  border_radius: [0, 400],
  padding_top: [0, 200],
  padding_right: [0, 200],
  padding_bottom: [0, 200],
  padding_left: [0, 200],
  shadow_x: [-200, 200],
  shadow_y: [-200, 200],
  shadow_blur: [0, 300],
  shadow_spread: [0, 200],
  divider_width: [1, 100],
  divider_thickness: [1, 24],
};
const ADVANCED_NUMBERS = {
  margin_top: [-400, 800],
  margin_right: [-400, 800],
  margin_bottom: [-400, 800],
  margin_left: [-400, 800],
  padding_top: [0, 800],
  padding_right: [0, 800],
  padding_bottom: [0, 800],
  padding_left: [0, 800],
  width: [1, 100],
  max_width: [1, 100],
  min_height: [0, 1600],
  z_index: [-10, 999],
  border_width: [0, 24],
  border_radius: [0, 400],
  shadow_x: [-200, 200],
  shadow_y: [-200, 200],
  shadow_blur: [0, 300],
  shadow_spread: [0, 200],
};
const COLOR_FIELDS = new Set(['color', 'background_color', 'border_color', 'shadow_color', 'divider_color']);
const COMPONENT_BREAKPOINTS = ['base', 'tablet', 'mobile'];
const WIDGET_SETTING_NUMBERS = {
  carousel_slides: [1, 8],
  carousel_slides_tablet: [1, 8],
  carousel_slides_mobile: [1, 4],
  carousel_gap: [0, 120],
  carousel_gap_tablet: [0, 120],
  carousel_gap_mobile: [0, 120],
  carousel_autoplay_speed: [500, 20_000],
  gallery_columns: [1, 12],
  gallery_columns_tablet: [1, 8],
  gallery_columns_mobile: [1, 4],
  gallery_gap: [0, 120],
  gallery_gap_tablet: [0, 120],
  gallery_gap_mobile: [0, 120],
};
const WIDGET_SETTING_BOOLEANS = new Set(['carousel_autoplay', 'carousel_loop', 'carousel_pause_on_hover', 'gallery_lightbox']);
const WIDGET_SETTING_ENUMS = {
  heading_tag: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'],
  gallery_aspect_ratio: ['1:1', '3:2', '4:3', '16:9', '9:16'],
};
const ICON_NAMES = ['original', 'check', 'star', 'users', 'building', 'plane', 'calendar', 'shield', 'award', 'kaaba', 'heart', 'message'];

function cleanContentOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cleaned = {};
  let totalLength = 0;
  for (const [key, raw] of Object.entries(value).slice(0, 300)) {
    if (!CONTENT_OVERRIDE_KEY.test(key) || typeof raw !== 'string') continue;
    const isImage = /:(?:image|gallery_image):/.test(key);
    const next = isImage ? cleanNullableUrl(raw) : raw.replace(/\r\n?/g, '\n').slice(0, 4000);
    if (next === null) continue;
    totalLength += next.length;
    if (totalLength > 120_000) break;
    cleaned[key] = next;
  }
  return cleaned;
}

function cleanActionUrl(value) {
  if (value === '') return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 2048);
  if (!trimmed || /[\u0000-\u001f\u007f\u202a-\u202e<>'"`\\]/.test(trimmed)) return null;
  if (/^#[a-z][a-z0-9_-]{0,63}$/i.test(trimmed)) return trimmed;
  if (/^\/(?!\/)[a-z0-9/_.,~:@?&=+%#-]*$/i.test(trimmed)) return trimmed;
  if (/^tel:\+?[0-9][0-9 -]{5,20}$/i.test(trimmed)) return trimmed.replace(/ /g, '');
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function cleanBoundedNumber(value, bounds) {
  const next = Number(value);
  if (!Number.isFinite(next) || next < bounds[0] || next > bounds[1]) return undefined;
  return Math.round(next * 100) / 100;
}

function cleanStyleObject(value, numberSchema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const cleaned = {};
  for (const [key, raw] of Object.entries(value)) {
    if (COLOR_FIELDS.has(key)) {
      if (typeof raw === 'string' && (HEX_COLOR.test(raw) || raw === 'transparent')) cleaned[key] = raw.toLowerCase();
      continue;
    }
    if (STYLE_ENUMS[key]) {
      if (STYLE_ENUMS[key].includes(raw)) cleaned[key] = raw;
      continue;
    }
    if (numberSchema[key]) {
      const next = cleanBoundedNumber(raw, numberSchema[key]);
      if (next !== undefined) cleaned[key] = next;
    }
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function cleanTargetOverride(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const cleaned = {};
  if (value.link_url !== undefined) {
    const link = cleanActionUrl(value.link_url);
    if (link !== null) cleaned.link_url = link;
  }
  if (typeof value.whatsapp_message === 'string') cleaned.whatsapp_message = value.whatsapp_message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500);
  if (ICON_NAMES.includes(value.icon_name)) cleaned.icon_name = value.icon_name;
  if (typeof value.link_new_tab === 'boolean') cleaned.link_new_tab = value.link_new_tab;
  if (typeof value.link_nofollow === 'boolean') cleaned.link_nofollow = value.link_nofollow;
  if (typeof value.alt_text === 'string') cleaned.alt_text = value.alt_text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180);
  for (const breakpoint of COMPONENT_BREAKPOINTS) {
    const style = cleanStyleObject(value[breakpoint], STYLE_NUMBERS);
    if (style) cleaned[breakpoint] = style;
  }
  const hover = cleanStyleObject(value.hover, STYLE_NUMBERS);
  if (hover) cleaned.hover = hover;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function cleanWidgetSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const cleaned = {};
  for (const [key, raw] of Object.entries(value)) {
    if (WIDGET_SETTING_NUMBERS[key]) {
      const next = cleanBoundedNumber(raw, WIDGET_SETTING_NUMBERS[key]);
      if (next !== undefined) cleaned[key] = next;
    } else if (WIDGET_SETTING_BOOLEANS.has(key)) {
      if (typeof raw === 'boolean') cleaned[key] = raw;
    } else if (WIDGET_SETTING_ENUMS[key]?.includes(raw)) {
      cleaned[key] = raw;
    }
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function cleanComponentOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cleaned = {};
  for (const [elementId, raw] of Object.entries(value).slice(0, 400)) {
    if (!COMPONENT_ID.test(elementId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const component = {};
    if (typeof raw.widget_type === 'string' && /^[a-z][a-z0-9-]{0,39}$/i.test(raw.widget_type)) {
      component.widget_type = raw.widget_type.toLowerCase();
    }
    if (raw.targets && typeof raw.targets === 'object' && !Array.isArray(raw.targets)) {
      const targets = {};
      for (const [targetKey, targetValue] of Object.entries(raw.targets).slice(0, 80)) {
        if (!COMPONENT_TARGET_KEY.test(targetKey)) continue;
        const target = cleanTargetOverride(targetValue);
        if (target) targets[targetKey] = target;
      }
      if (Object.keys(targets).length) component.targets = targets;
    }
    const settings = cleanWidgetSettings(raw.settings);
    if (settings) component.settings = settings;
    for (const breakpoint of COMPONENT_BREAKPOINTS) {
      const style = cleanStyleObject(raw[breakpoint], ADVANCED_NUMBERS);
      if (style) component[breakpoint] = style;
    }
    for (const key of ['hide_desktop', 'hide_tablet', 'hide_mobile']) {
      if (typeof raw[key] === 'boolean') component[key] = raw[key];
    }
    if (['none', 'fade-in', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom-in'].includes(raw.entrance_animation)) {
      component.entrance_animation = raw.entrance_animation;
    }
    const duration = cleanBoundedNumber(raw.animation_duration, [100, 3000]);
    if (duration !== undefined) component.animation_duration = duration;
    if (Object.keys(component).length) cleaned[elementId] = component;
  }
  return cleaned;
}

function validateStyleObject(value, numberSchema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const [key, raw] of Object.entries(value)) {
    if (COLOR_FIELDS.has(key)) {
      if (typeof raw !== 'string' || (!HEX_COLOR.test(raw) && raw !== 'transparent')) return false;
    } else if (STYLE_ENUMS[key]) {
      if (!STYLE_ENUMS[key].includes(raw)) return false;
    } else if (numberSchema[key]) {
      if (cleanBoundedNumber(raw, numberSchema[key]) === undefined) return false;
    } else {
      return false;
    }
  }
  return true;
}

function validateComponentOverrides(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Pengaturan komponen tidak valid';
  if (Object.keys(value).length > 400) return 'Maksimal 400 komponen dapat diubah';
  if (JSON.stringify(value).length > 180_000) return 'Total pengaturan komponen terlalu besar';
  for (const [elementId, raw] of Object.entries(value)) {
    if (!COMPONENT_ID.test(elementId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return 'ID komponen tidak valid';
    const allowedComponentKeys = new Set(['widget_type', 'targets', 'settings', ...COMPONENT_BREAKPOINTS, 'hide_desktop', 'hide_tablet', 'hide_mobile', 'entrance_animation', 'animation_duration']);
    if (Object.keys(raw).some((key) => !allowedComponentKeys.has(key))) return 'Properti komponen tidak didukung';
    if (raw.widget_type !== undefined && (typeof raw.widget_type !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/i.test(raw.widget_type))) return 'Tipe komponen tidak valid';
    if (raw.targets !== undefined) {
      if (!raw.targets || typeof raw.targets !== 'object' || Array.isArray(raw.targets) || Object.keys(raw.targets).length > 80) return 'Target komponen tidak valid';
      for (const [targetKey, target] of Object.entries(raw.targets)) {
        if (!COMPONENT_TARGET_KEY.test(targetKey) || !target || typeof target !== 'object' || Array.isArray(target)) return 'Target komponen tidak valid';
        const allowedTargetKeys = new Set(['link_url', 'whatsapp_message', 'icon_name', 'link_new_tab', 'link_nofollow', 'alt_text', ...COMPONENT_BREAKPOINTS, 'hover']);
        if (Object.keys(target).some((key) => !allowedTargetKeys.has(key))) return 'Properti target tidak didukung';
        if (target.link_url !== undefined && cleanActionUrl(target.link_url) === null) return 'URL komponen tidak valid';
        if (target.whatsapp_message !== undefined && (typeof target.whatsapp_message !== 'string' || target.whatsapp_message.length > 500)) return 'Pesan WhatsApp maksimal 500 karakter';
        if (target.icon_name !== undefined && !ICON_NAMES.includes(target.icon_name)) return 'Pilihan ikon tidak valid';
        if (target.link_new_tab !== undefined && typeof target.link_new_tab !== 'boolean') return 'Target tab baru tidak valid';
        if (target.link_nofollow !== undefined && typeof target.link_nofollow !== 'boolean') return 'Atribut tautan tidak valid';
        if (target.alt_text !== undefined && (typeof target.alt_text !== 'string' || target.alt_text.length > 180)) return 'Teks alternatif maksimal 180 karakter';
        for (const breakpoint of [...COMPONENT_BREAKPOINTS, 'hover']) {
          if (target[breakpoint] !== undefined && !validateStyleObject(target[breakpoint], STYLE_NUMBERS)) return 'Gaya target tidak valid';
        }
      }
    }
    if (raw.settings !== undefined) {
      if (!raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings)) return 'Pengaturan widget tidak valid';
      for (const [key, setting] of Object.entries(raw.settings)) {
        if (WIDGET_SETTING_NUMBERS[key]) {
          if (cleanBoundedNumber(setting, WIDGET_SETTING_NUMBERS[key]) === undefined) return 'Nilai pengaturan widget tidak valid';
        } else if (WIDGET_SETTING_BOOLEANS.has(key)) {
          if (typeof setting !== 'boolean') return 'Nilai pengaturan widget tidak valid';
        } else if (WIDGET_SETTING_ENUMS[key]) {
          if (!WIDGET_SETTING_ENUMS[key].includes(setting)) return 'Nilai pengaturan widget tidak valid';
        } else {
          return 'Pengaturan widget tidak didukung';
        }
      }
    }
    for (const breakpoint of COMPONENT_BREAKPOINTS) {
      if (raw[breakpoint] !== undefined && !validateStyleObject(raw[breakpoint], ADVANCED_NUMBERS)) return 'Gaya lanjutan tidak valid';
    }
    for (const key of ['hide_desktop', 'hide_tablet', 'hide_mobile']) {
      if (raw[key] !== undefined && typeof raw[key] !== 'boolean') return 'Visibilitas komponen tidak valid';
    }
    if (raw.entrance_animation !== undefined && !['none', 'fade-in', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom-in'].includes(raw.entrance_animation)) return 'Animasi komponen tidak valid';
    if (raw.animation_duration !== undefined && cleanBoundedNumber(raw.animation_duration, [100, 3000]) === undefined) return 'Durasi animasi tidak valid';
  }
  return null;
}

export function getLandingBuilderDefaults(type) {
  return clone(DEFAULTS[type] || DEFAULTS.umroh);
}

export function normalizeLandingBuilderDocument(type, input) {
  const defaults = getLandingBuilderDefaults(type);
  const source = input && typeof input === 'object' ? input : {};
  const hero = source.hero && typeof source.hero === 'object' ? source.hero : {};
  return {
    version: BUILDER_VERSION,
    hero: {
      // Trust/legal copy is centrally managed and must not be overridden by a
      // hand-crafted API request.
      eyebrow: defaults.hero.eyebrow,
      headline: cleanText(hero.headline, defaults.hero.headline, LIMITS.headline),
      description: type === 'haji'
        ? cleanText(hero.description, defaults.hero.description, LIMITS.description)
        : defaults.hero.description,
      cta_label: cleanText(hero.cta_label, defaults.hero.cta_label, LIMITS.cta_label),
      cta_message: cleanText(hero.cta_message, defaults.hero.cta_message, LIMITS.cta_message),
      image_url: cleanNullableUrl(hero.image_url),
    },
    featured_package: type === 'umroh' ? cleanFeaturedPackage(source.featured_package) : null,
    featured_haji_package: type === 'haji' && ['uhud', 'rahmah'].includes(source.featured_haji_package)
      ? source.featured_haji_package
      : null,
    content_overrides: cleanContentOverrides(source.content_overrides),
    component_overrides: cleanComponentOverrides(source.component_overrides),
    optional_program_visible: source.optional_program_visible === undefined
      ? defaults.optional_program_visible
      : source.optional_program_visible !== false,
  };
}

export function validateLandingBuilderDocument(type, input) {
  if (!['umroh', 'haji'].includes(type)) return { ok: false, error: 'Jenis landing page tidak valid' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Dokumen landing page tidak valid' };
  }
  const hero = input.hero;
  if (!hero || typeof hero !== 'object' || Array.isArray(hero)) {
    return { ok: false, error: 'Konfigurasi hero tidak valid' };
  }
  if (input.optional_program_visible !== undefined && typeof input.optional_program_visible !== 'boolean') {
    return { ok: false, error: 'Status section opsional tidak valid' };
  }
  if (
    type === 'haji'
    && input.featured_haji_package !== undefined
    && input.featured_haji_package !== null
    && !['uhud', 'rahmah'].includes(input.featured_haji_package)
  ) {
    return { ok: false, error: 'Paket Haji pilihan tidak valid' };
  }
  if (
    type === 'umroh'
    && input.featured_package !== undefined
    && input.featured_package !== null
    && (typeof input.featured_package !== 'object' || Array.isArray(input.featured_package))
  ) {
    return { ok: false, error: 'Paket unggulan tidak valid' };
  }
  if (input.content_overrides !== undefined) {
    if (!input.content_overrides || typeof input.content_overrides !== 'object' || Array.isArray(input.content_overrides)) {
      return { ok: false, error: 'Override konten tidak valid' };
    }
    if (Object.keys(input.content_overrides).length > 300) {
      return { ok: false, error: 'Maksimal 300 konten dapat diubah' };
    }
    let totalLength = 0;
    for (const [key, value] of Object.entries(input.content_overrides)) {
      if (!CONTENT_OVERRIDE_KEY.test(key) || typeof value !== 'string') {
        return { ok: false, error: 'Format override konten tidak valid' };
      }
      const isImageOverride = /:(?:image|gallery_image):/.test(key);
      if (isImageOverride && !cleanNullableUrl(value)) {
        return { ok: false, error: 'URL gambar konten tidak valid' };
      }
      if (!isImageOverride && value.length > 4000) {
        return { ok: false, error: 'Teks konten maksimal 4000 karakter' };
      }
      totalLength += value.length;
    }
    if (totalLength > 120_000) return { ok: false, error: 'Total perubahan konten terlalu besar' };
  }
  const componentOverrideError = validateComponentOverrides(input.component_overrides);
  if (componentOverrideError) return { ok: false, error: componentOverrideError };
  for (const [key, max] of Object.entries({
    eyebrow: LIMITS.eyebrow,
    headline: LIMITS.headline,
    description: LIMITS.description,
    cta_label: LIMITS.cta_label,
    cta_message: LIMITS.cta_message,
  })) {
    if (hero[key] !== undefined && (typeof hero[key] !== 'string' || hero[key].trim().length > max)) {
      return { ok: false, error: `${key} maksimal ${max} karakter` };
    }
  }
  const requiredFields = type === 'haji'
    ? ['headline', 'description', 'cta_label', 'cta_message']
    : ['headline', 'cta_label', 'cta_message'];
  for (const key of requiredFields) {
    if (hero[key] !== undefined && typeof hero[key] === 'string' && !hero[key].trim()) {
      return { ok: false, error: `${key} wajib diisi` };
    }
  }
  if (hero.image_url && !cleanNullableUrl(hero.image_url)) {
    return { ok: false, error: 'URL gambar hero tidak valid' };
  }
  return { ok: true, data: normalizeLandingBuilderDocument(type, input) };
}

export function getLandingBuilderState(type, storedBuilder) {
  const raw = storedBuilder && typeof storedBuilder === 'object' ? storedBuilder : {};
  const published = normalizeLandingBuilderDocument(type, raw.published);
  const draft = normalizeLandingBuilderDocument(type, raw.draft || published);
  return {
    schema_version: BUILDER_VERSION,
    draft,
    published,
    draft_updated_at: typeof raw.draft_updated_at === 'string' ? raw.draft_updated_at : null,
    draft_client_updated_at: Number.isFinite(Number(raw.draft_client_updated_at))
      ? Number(raw.draft_client_updated_at)
      : 0,
    published_at: typeof raw.published_at === 'string' ? raw.published_at : null,
    has_unpublished_changes: JSON.stringify(draft) !== JSON.stringify(published),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCssUrl(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f"'()\\<>]/g, (char) => {
    return `\\${char.codePointAt(0).toString(16)} `;
  });
}

function replaceContentInElement(html, elementId, tagName, content) {
  const marker = `data-id="${elementId}"`;
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) return html;
  const openAt = html.indexOf(`<${tagName}`, markerAt);
  if (openAt < 0 || openAt - markerAt > 1800) return html;
  const contentAt = html.indexOf('>', openAt);
  const closeAt = html.indexOf(`</${tagName}>`, contentAt);
  if (contentAt < 0 || closeAt < 0 || closeAt - contentAt > 2400) return html;
  return html.slice(0, contentAt + 1) + content + html.slice(closeAt);
}

function replaceButtonText(html, elementId, text) {
  const markerAt = html.indexOf(`data-id="${elementId}"`);
  if (markerAt < 0) return html;
  const classAt = html.indexOf('class="elementor-button-text"', markerAt);
  if (classAt < 0 || classAt - markerAt > 2200) return html;
  const contentAt = html.indexOf('>', classAt);
  const closeAt = html.indexOf('</span>', contentAt);
  if (contentAt < 0 || closeAt < 0) return html;
  return html.slice(0, contentAt + 1) + escapeHtml(text) + html.slice(closeAt);
}

function replaceLinkHref(html, elementId, href) {
  const markerAt = html.indexOf(`data-id="${elementId}"`);
  if (markerAt < 0) return html;
  const linkAt = html.indexOf('<a ', markerAt);
  if (linkAt < 0 || linkAt - markerAt > 1800) return html;
  const linkEnd = html.indexOf('>', linkAt);
  if (linkEnd < 0) return html;
  const opening = html.slice(linkAt, linkEnd + 1);
  const next = /href="[^"]*"/.test(opening)
    ? opening.replace(/href="[^"]*"/, `href="${escapeHtml(href)}"`)
    : opening.replace('<a ', `<a href="${escapeHtml(href)}" `);
  return html.slice(0, linkAt) + next + html.slice(linkEnd + 1);
}

function replaceImageSrc(html, elementId, url) {
  const markerAt = html.indexOf(`data-id="${elementId}"`);
  if (markerAt < 0) return html;
  const imageAt = html.indexOf('<img ', markerAt);
  if (imageAt < 0 || imageAt - markerAt > 1500) return html;
  const imageEnd = html.indexOf('>', imageAt);
  if (imageEnd < 0) return html;
  const opening = html.slice(imageAt, imageEnd + 1);
  const next = opening.replace(/src="[^"]*"/, `src="${escapeHtml(url)}"`);
  return html.slice(0, imageAt) + next + html.slice(imageEnd + 1);
}

function insertBeforeElement(html, elementId, markup) {
  const markerAt = html.indexOf(`data-id="${elementId}"`);
  if (markerAt < 0) return html;
  const openAt = html.lastIndexOf('<', markerAt);
  if (openAt < 0) return html;
  return html.slice(0, openAt) + markup + html.slice(openAt);
}

function markElement(html, elementId, sectionName) {
  const marker = `data-id="${elementId}"`;
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) return html;
  const openAt = html.lastIndexOf('<', markerAt);
  const openEnd = html.indexOf('>', markerAt);
  if (openAt < 0 || openEnd < 0) return html;
  const opening = html.slice(openAt, openEnd + 1);
  if (opening.includes('data-landing-builder-section=')) return html;
  const next = opening.slice(0, -1) + ` data-landing-builder-section="${sectionName}">`;
  return html.slice(0, openAt) + next + html.slice(openEnd + 1);
}

function formatRupiah(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  return 'Rp ' + Math.round(value).toLocaleString('id-ID');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}

function renderFeaturedPackage(pkg, waUrl) {
  const image = pkg.image_url
    ? `<img src="${escapeHtml(pkg.image_url)}" alt="${escapeHtml(pkg.name)}" loading="lazy">`
    : '<div class="alhijaz-featured-package__placeholder">✦</div>';
  const meta = [formatDate(pkg.departure_date), pkg.airline, pkg.seat_remaining === null ? '' : `Sisa ${pkg.seat_remaining} seat`]
    .filter(Boolean)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join('');
  const price = formatRupiah(pkg.price);
  return `<section class="alhijaz-featured-package" data-landing-builder-section="featured"><div class="alhijaz-featured-package__inner">${image}<div class="alhijaz-featured-package__copy"><p class="alhijaz-featured-package__eyebrow">PAKET PILIHAN AGENT</p><h2>${escapeHtml(pkg.name)}</h2><div class="alhijaz-featured-package__meta">${meta}</div>${price ? `<strong>${escapeHtml(price)}</strong>` : ''}<a href="${escapeHtml(waUrl)}">Tanya Paket Ini</a></div></div></section>`;
}

function injectBuilderStyles(html, styles) {
  if (!styles) return html;
  return html.replace('</head>', `<style id="alhijaz-landing-builder">${styles}</style></head>`);
}

export function applyLandingBuilderToHtml(html, type, input, options = {}) {
  const doc = normalizeLandingBuilderDocument(type, input);
  const defaults = getLandingBuilderDefaults(type);
  const phone = String(options.phone || '').replace(/\D/g, '');
  const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(doc.hero.cta_message)}`;
  const headline = escapeHtml(doc.hero.headline).replace(/\n/g, '<br>');
  let output = html;
  let styles = '';

  if (type === 'haji') {
    if (doc.hero.headline !== defaults.hero.headline) {
      output = replaceContentInElement(output, '1bbf918', 'h1', headline);
    }
    if (doc.hero.description !== defaults.hero.description) {
      output = replaceContentInElement(output, '4626bd8', 'p', escapeHtml(doc.hero.description));
    }
    if (doc.hero.cta_label !== defaults.hero.cta_label) {
      output = replaceButtonText(output, '74e35c9', doc.hero.cta_label);
    }
    if (doc.hero.cta_message !== defaults.hero.cta_message) {
      output = replaceLinkHref(output, '74e35c9', waUrl);
    }
    if (doc.hero.image_url) {
      output = replaceImageSrc(output, '95fb921', doc.hero.image_url);
      output = insertBeforeElement(
        output,
        '74e35c9',
        `<div class="alhijaz-builder-haji-mobile-image"><img src="${escapeHtml(doc.hero.image_url)}" alt="" loading="eager"></div>`,
      );
      styles += '.alhijaz-builder-haji-mobile-image{display:none}@media(max-width:767px){.alhijaz-builder-haji-mobile-image{display:block;margin:10px 0 16px}.alhijaz-builder-haji-mobile-image img{display:block;width:100%;height:auto;max-height:320px;object-fit:cover;border-radius:18px}}';
    }
    if (!doc.optional_program_visible) styles += '.elementor-element-9526a6e{display:none!important}';
    if (doc.featured_haji_package) {
      const selected = doc.featured_haji_package === 'uhud' ? '8e390c1' : 'edbe605';
      styles += `.elementor-element-${selected}{position:relative!important}.elementor-element-${selected}::before{content:"PILIHAN AGENT";position:absolute;z-index:5;top:10px;right:10px;padding:6px 10px;border-radius:999px;background:#9a000c;color:#fff;font-family:Inter,sans-serif;font-size:10px;font-weight:800;letter-spacing:.06em;box-shadow:0 4px 12px rgba(154,0,12,.25)}`;
    }
    output = markElement(output, 'f55e3ca', 'hero');
    output = markElement(output, 'bac4f12', 'featured');
    output = markElement(output, '9526a6e', 'program');
  } else {
    if (doc.hero.headline !== defaults.hero.headline) {
      output = replaceContentInElement(output, '25901017', 'h1', headline);
    }
    // Official-site/legal copy is intentionally not agent-editable.
    if (doc.hero.cta_label !== defaults.hero.cta_label) {
      output = replaceButtonText(output, '796244f7', doc.hero.cta_label);
    }
    if (doc.hero.cta_message !== defaults.hero.cta_message) {
      output = replaceLinkHref(output, '796244f7', waUrl);
    }
    if (doc.hero.image_url) {
      styles += `.elementor-element-64c34f3d{background-image:url("${escapeCssUrl(doc.hero.image_url)}")!important}`;
    }
    if (!doc.optional_program_visible) styles += '.elementor-element-defd89e{display:none!important}';
    if (doc.featured_package) {
      const marker = '<section class="elementor-section elementor-top-section elementor-element elementor-element-2df301db';
      const at = output.indexOf(marker);
      const packageMessage = `${doc.hero.cta_message}\n\nPaket yang saya minati: ${doc.featured_package.name} (${doc.featured_package.jadwal_id})`;
      const packageWaUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(packageMessage)}`;
      if (at >= 0) output = output.slice(0, at) + renderFeaturedPackage(doc.featured_package, packageWaUrl) + output.slice(at);
      styles += '.alhijaz-featured-package{padding:28px 16px;background:#fff}.alhijaz-featured-package__inner{max-width:980px;margin:auto;display:flex;gap:22px;align-items:center;border:1px solid #e5e7eb;border-radius:24px;padding:16px;box-shadow:0 8px 30px rgba(15,23,42,.08)}.alhijaz-featured-package img,.alhijaz-featured-package__placeholder{width:180px;height:130px;object-fit:cover;border-radius:16px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:32px;color:#9a000c}.alhijaz-featured-package__copy{flex:1;font-family:Inter,sans-serif}.alhijaz-featured-package__eyebrow{margin:0 0 5px;color:#9a000c;font-size:12px;font-weight:800;letter-spacing:.08em}.alhijaz-featured-package h2{margin:0;color:#111827;font-size:25px}.alhijaz-featured-package__meta{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0;color:#6b7280;font-size:13px}.alhijaz-featured-package strong{display:block;color:#9a000c;font-size:20px;margin-bottom:10px}.alhijaz-featured-package a{display:inline-flex;padding:10px 18px;border-radius:999px;background:#28b83c;border:2px solid #149626;color:#fff;text-decoration:none;font-weight:700}@media(max-width:640px){.alhijaz-featured-package__inner{align-items:stretch;flex-direction:column}.alhijaz-featured-package img,.alhijaz-featured-package__placeholder{width:100%;height:170px}.alhijaz-featured-package h2{font-size:21px}}';
    }
    output = markElement(output, '64c34f3d', 'hero');
    output = markElement(output, 'defd89e', 'program');
  }

  if (options.preview) {
    output = output.replace(/<body([^>]*)>/i, (match, attrs) => {
      if (/\bclass=["']/i.test(attrs)) {
        return `<body${attrs.replace(/\bclass=(["'])/i, 'class=$1alhijaz-builder-preview ') }>`;
      }
      return `<body${attrs} class="alhijaz-builder-preview">`;
    });
    styles += '.alhijaz-builder-preview [data-landing-builder-section]{cursor:pointer;transition:outline .15s,outline-offset .15s}.alhijaz-builder-preview [data-landing-builder-section]:hover{outline:3px solid #34d399!important;outline-offset:-3px}.alhijaz-builder-preview [data-landing-builder-selected="true"]{outline:4px solid #10b981!important;outline-offset:-4px}.alhijaz-builder-preview a{pointer-events:none!important}';
  }

  return injectBuilderStyles(output, styles);
}
