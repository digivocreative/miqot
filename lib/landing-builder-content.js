import { load } from 'cheerio';

const CONTENT_FIELDS = {
  heading: { selector: '.elementor-heading-title', kind: 'textarea', label: 'Teks heading' },
  button: { selector: '.elementor-button-text', kind: 'text', label: 'Teks tombol' },
  icon_list: { selector: '.elementor-icon-list-text', kind: 'textarea', label: 'Item daftar' },
  list_icon: { selector: '.elementor-icon-list-icon', kind: 'icon', label: 'Ikon daftar', allowEmpty: true },
  icon_title: { selector: '.elementor-icon-box-title', kind: 'text', label: 'Judul kartu' },
  icon_description: { selector: '.elementor-icon-box-description', kind: 'textarea', label: 'Deskripsi kartu' },
  image_title: { selector: '.elementor-image-box-title', kind: 'text', label: 'Judul gambar' },
  image_description: { selector: '.elementor-image-box-description', kind: 'textarea', label: 'Deskripsi gambar' },
  text_editor: { selector: '.elementor-widget-text-editor > .elementor-widget-container', kind: 'textarea', label: 'Paragraf' },
  image: { selector: 'img', kind: 'image', label: 'Gambar' },
  gallery_image: { selector: '.e-gallery-image[data-thumbnail]', kind: 'image', label: 'Gambar galeri', imageAttribute: 'data-thumbnail' },
  divider_text: { selector: '.elementor-divider__text', kind: 'text', label: 'Teks pemisah' },
  html_text: { selector: '.elementor-widget-container a span, .elementor-widget-container button span', kind: 'text', label: 'Label komponen' },
  icon: { selector: '.elementor-icon', kind: 'icon', label: 'Ikon', allowEmpty: true },
  lottie: { selector: '.e-lottie__container', kind: 'lottie', label: 'Animasi Lottie', allowEmpty: true },
};

const WIDGET_FIELDS = {
  heading: ['heading'],
  button: ['button'],
  'icon-list': ['list_icon', 'icon_list'],
  'icon-box': ['icon', 'icon_title', 'icon_description'],
  'image-box': ['image', 'image_title', 'image_description'],
  'text-editor': ['text_editor'],
  image: ['image'],
  'image-carousel': ['image'],
  gallery: ['gallery_image'],
  icon: ['icon'],
  divider: ['divider_text'],
  html: ['html_text'],
  lottie: ['lottie'],
};

const PROTECTED_SECTION_IDS = new Set(['26b2a887', '14608478']);
const PROTECTED_WIDGET_IDS = new Set(['58a04b4c', '1fd42544']);
const BOUND_CONTENT_KEYS = new Set([
  '25901017:heading:0',
  '796244f7:button:0',
  '1bbf918:heading:0',
  '4626bd8:heading:0',
  '74e35c9:button:0',
  '95fb921:image:0',
]);
const LINKABLE_KINDS = new Set(['text', 'textarea', 'image', 'icon']);
const SAFE_KEY = /^([a-z0-9_-]{1,64}):(heading|button|icon_list|list_icon|icon_title|icon_description|image_title|image_description|text_editor|image|gallery_image|divider_text|html_text|icon|lottie):(\d{1,3})$/i;
const SAFE_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const BREAKPOINT_MEDIA = {
  tablet: '@media (min-width:768px) and (max-width:1024px)',
  mobile: '@media (max-width:767px)',
};
const ICON_SVGS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2.5 2.93 5.94 6.55.95-4.74 4.62 1.12 6.52L12 17.45l-5.86 3.08 1.12-6.52-4.74-4.62 6.55-.95L12 2.5Z"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></g></svg>',
  building: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 21h18M6 21V4h12v17M9 8h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2"/></g></svg>',
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22 2 9.7 9.2 4.8 7.5 2 9l5 3-2.5 4.5L6 18l4.8-3 3 5 1.5-2.8-1.5-4.9L22 2Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></g></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path fill="none" stroke="currentColor" stroke-width="2" d="m9 12 2 2 4-4"/></svg>',
  award: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="m8.2 13-1.2 9 5-3 5 3-1.2-9"/></g></svg>',
  kaaba: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="m4 7 8-3 8 3v12l-8 2-8-2V7Z"/><path fill="none" stroke="currentColor" stroke-width="2" d="M4 10h16M12 4v17"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>',
  message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/></svg>',
};

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function textWithBreaks($, $target) {
  const $clone = $target.clone();
  $clone.find('br').replaceWith('\n');
  return $clone.text()
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter((line, index, lines) => line || (index > 0 && index < lines.length - 1))
    .join('\n')
    .trim();
}

function widgetType($widget) {
  const canonical = String($widget.attr('data-widget_type') || '').split('.')[0].trim();
  if (canonical) return canonical;
  const match = String($widget.attr('class') || '').match(/(?:^|\s)elementor-widget-([a-z-]+)(?:\s|$)/);
  return match?.[1] || null;
}

function contentKey(elementId, field, index) {
  return `${elementId}:${field}:${index}`;
}

function targetKey(field, index) {
  return `${field}:${index}`;
}

function imageValue($target, spec) {
  return String($target.attr(spec.imageAttribute || 'src') || '').trim();
}

function imageLabel($target, index) {
  const alt = compactText($target.attr('alt') || $target.attr('title') || $target.attr('data-elementor-lightbox-title'));
  return alt ? `Gambar · ${alt.slice(0, 48)}` : `Gambar ${index + 1}`;
}

function textLabel(value, fallback) {
  const compact = compactText(value);
  return compact ? compact.slice(0, 58) : fallback;
}

function sectionLabel($, $section, index) {
  const primary = compactText($section.find('h1, h2').first().text());
  if (primary) return primary.slice(0, 72);
  const secondary = compactText($section.find('h3, h4').first().text());
  return secondary ? secondary.slice(0, 72) : `Bagian ${index + 1}`;
}

function findLink($, $widget, $target, field) {
  let $link = $target.is('a') ? $target : $target.closest('a');
  if (!$link.length) $link = $target.find('a').first();
  if (!$link.length && field === 'button') $link = $widget.find('a.elementor-button').first();
  if (!$link.length && field === 'icon_list') $link = $target.closest('.elementor-icon-list-item').find('a').first();
  return $link;
}

function isManagedWhatsAppLink(value) {
  return /(?:wa\.me|api\.whatsapp\.com|whatsapp:)/i.test(String(value || ''));
}

function itemCapabilities({ key, kind, sectionId, elementId, linkUrl }) {
  const fullyProtected = PROTECTED_SECTION_IDS.has(sectionId) || PROTECTED_WIDGET_IDS.has(elementId);
  const contentBound = BOUND_CONTENT_KEYS.has(key);
  return {
    content: !fullyProtected && !contentBound && ['text', 'textarea', 'image'].includes(kind),
    style: !fullyProtected,
    advanced: !fullyProtected,
    link: !fullyProtected && LINKABLE_KINDS.has(kind) && !isManagedWhatsAppLink(linkUrl),
    whatsapp_message: !fullyProtected && isManagedWhatsAppLink(linkUrl),
    icon: !fullyProtected && kind === 'icon',
    alt: !fullyProtected && kind === 'image',
  };
}

function whatsappMessage(linkUrl) {
  if (!isManagedWhatsAppLink(linkUrl)) return '';
  try {
    return new URL(linkUrl).searchParams.get('text') || '';
  } catch {
    return '';
  }
}

function currentIconName($target) {
  const classes = String($target.find('[class*="fa-"]').first().attr('class') || '');
  const name = classes.match(/(?:^|\s)fa-([a-z-]+)/)?.[1] || '';
  const aliases = { 'check-circle': 'check', 'calendar-alt': 'calendar', 'plane-departure': 'plane', 'comments': 'message', 'comment': 'message' };
  const normalized = aliases[name] || name;
  return Object.prototype.hasOwnProperty.call(ICON_SVGS, normalized) ? normalized : 'original';
}

function candidateItems($, $widget, sectionId, sectionName) {
  const elementId = String($widget.attr('data-id') || '').trim();
  const type = widgetType($widget);
  if (!elementId || !type || !WIDGET_FIELDS[type]) return [];

  const items = [];
  for (const field of WIDGET_FIELDS[type]) {
    const spec = CONTENT_FIELDS[field];
    $widget.find(spec.selector).each((index, target) => {
      const $target = $(target);
      const value = spec.kind === 'image' ? imageValue($target, spec) : textWithBreaks($, $target);
      if (!value && !spec.allowEmpty && !['text', 'textarea'].includes(spec.kind)) return;
      const key = contentKey(elementId, field, index);
      const $link = findLink($, $widget, $target, field);
      const linkUrl = String($link.attr('href') || '');
      const capabilities = itemCapabilities({ key, kind: spec.kind, sectionId, elementId, linkUrl });
      const fullyProtected = !capabilities.content && !capabilities.style && !capabilities.advanced;
      items.push({
        key,
        element_id: elementId,
        field,
        target_key: targetKey(field, index),
        index,
        kind: spec.kind,
        widget_type: type,
        label: spec.kind === 'image'
          ? imageLabel($target, index)
          : spec.kind === 'icon'
            ? `Ikon ${index + 1}`
            : spec.kind === 'lottie'
              ? 'Animasi Lottie'
              : textLabel(value, spec.label),
        value,
        link_url: linkUrl,
        whatsapp_message: whatsappMessage(linkUrl),
        link_new_tab: String($link.attr('target') || '').toLowerCase() === '_blank',
        link_nofollow: /(?:^|\s)nofollow(?:\s|$)/i.test(String($link.attr('rel') || '')),
        alt_text: spec.kind === 'image' ? String($target.attr('alt') || '') : '',
        icon_name: spec.kind === 'icon' ? currentIconName($target) : '',
        html_tag: String($target.get(0)?.name || ''),
        capabilities,
        locked: fullyProtected,
        lock_reason: fullyProtected
          ? 'Informasi legal dan perusahaan dikelola oleh Alhijaz.'
          : !capabilities.content && BOUND_CONTENT_KEYS.has(key)
            ? 'Isi komponen ini diatur melalui menu Promo Utama.'
            : null,
        section_id: sectionId,
        section_label: sectionName,
      });
    });
  }
  return items;
}

export function extractLandingContentManifest(html) {
  const $ = load(String(html || ''), { decodeEntities: false });
  const groups = [];
  const seen = new Set();

  $('.elementor-top-section[data-id]').each((sectionIndex, section) => {
    const $section = $(section);
    const sectionId = String($section.attr('data-id') || `section-${sectionIndex}`);
    const name = sectionLabel($, $section, sectionIndex);
    const items = [];

    $section.find('[data-id][data-widget_type], [data-id][class*="elementor-widget-"]').each((_, widget) => {
      for (const item of candidateItems($, $(widget), sectionId, name)) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        items.push(item);
      }
    });

    if (items.length) groups.push({ id: sectionId, label: name, items });
  });

  return { groups, total: groups.reduce((sum, group) => sum + group.items.length, 0) };
}

export function validateLandingOverrideCapabilities(html, document) {
  const manifest = extractLandingContentManifest(html);
  const items = manifest.groups.flatMap((group) => group.items);
  const byKey = new Map(items.map((item) => [item.key, item]));
  const byElement = new Map();
  for (const item of items) {
    if (!byElement.has(item.element_id)) byElement.set(item.element_id, []);
    byElement.get(item.element_id).push(item);
  }

  for (const key of Object.keys(document?.content_overrides || {})) {
    const item = byKey.get(key);
    if (!item) return 'Target konten tidak ditemukan pada template aktif';
    if (!item.capabilities.content) return item.lock_reason || 'Konten ini tidak dapat diubah';
  }

  for (const [elementId, component] of Object.entries(document?.component_overrides || {})) {
    const componentItems = byElement.get(elementId) || [];
    if (!componentItems.length) return 'Komponen tidak ditemukan pada template aktif';
    const actualType = componentItems[0].widget_type;
    if (component.widget_type && component.widget_type !== actualType) return 'Tipe komponen tidak cocok dengan template aktif';
    const itemsByTarget = new Map(componentItems.map((item) => [item.target_key, item]));
    for (const [targetKey, target] of Object.entries(component.targets || {})) {
      const item = itemsByTarget.get(targetKey);
      if (!item) return 'Target komponen tidak ditemukan pada template aktif';
      if ((target.base || target.tablet || target.mobile || target.hover) && !item.capabilities.style) return 'Gaya komponen ini dikunci';
      if (target.link_url !== undefined && !item.capabilities.link) return 'Tautan komponen ini dikelola sistem';
      if (target.whatsapp_message !== undefined && !item.capabilities.whatsapp_message) return 'Pesan WhatsApp tidak tersedia untuk komponen ini';
      if (target.icon_name !== undefined && !item.capabilities.icon) return 'Ikon komponen ini dikunci';
      if (target.alt_text !== undefined && !item.capabilities.alt) return 'Alt text hanya tersedia untuk gambar';
    }
    if ((component.base || component.tablet || component.mobile || component.hide_desktop || component.hide_tablet || component.hide_mobile || component.entrance_animation) && !componentItems.some((item) => item.capabilities.advanced)) {
      return 'Pengaturan lanjutan komponen ini dikunci';
    }
    const settingKeys = Object.keys(component.settings || {});
    if (settingKeys.length && !componentItems.some((item) => item.capabilities.content)) return 'Pengaturan isi komponen ini dikunci';
    if (settingKeys.some((key) => key.startsWith('heading_')) && actualType !== 'heading') return 'Pengaturan heading tidak cocok dengan komponen';
    if (settingKeys.some((key) => key.startsWith('carousel_')) && actualType !== 'image-carousel') return 'Pengaturan carousel tidak cocok dengan komponen';
    if (settingKeys.some((key) => key.startsWith('gallery_')) && actualType !== 'gallery') return 'Pengaturan galeri tidak cocok dengan komponen';
  }
  return null;
}

function parseContentKey(key) {
  const match = String(key || '').match(SAFE_KEY);
  if (!match) return null;
  return { elementId: match[1], field: match[2], index: Number(match[3]), targetKey: targetKey(match[2], Number(match[3])) };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCssString(value) {
  return String(value || '').replace(/["'\\\n\r<>]/g, '');
}

function setPlainText($target, value) {
  $target.html(String(value ?? '').split(/\r?\n/).map(escapeHtml).join('<br>'));
}

function locateTarget($, item) {
  const spec = CONTENT_FIELDS[item.field];
  const $widget = $(`[data-id="${item.element_id}"]`).first();
  const $target = spec ? $widget.find(spec.selector).eq(item.index) : $([]);
  return { spec, $widget, $target };
}

function setImage($target, spec, value) {
  if (spec.imageAttribute === 'data-thumbnail') {
    const safeValue = String(value).replace(/["'\\<>\r\n]/g, '');
    $target.attr('data-thumbnail', value).attr('style', `background-image:url("${safeValue}")`);
    const $link = $target.closest('a.e-gallery-item');
    if ($link.length) $link.attr('href', value);
    return;
  }
  $target
    .attr('src', value)
    .removeAttr('srcset')
    .removeAttr('sizes')
    .removeAttr('data-src')
    .removeAttr('data-srcset')
    .removeAttr('width')
    .removeAttr('height');
}

function visualTarget($, item, $widget, $target) {
  if (item.field === 'button') {
    const $button = $target.closest('.elementor-button');
    if ($button.length) return $button;
  }
  if (item.field === 'icon_list') {
    const $listItem = $target.closest('.elementor-icon-list-item');
    if ($listItem.length) return $listItem;
  }
  if (item.field === 'divider_text') {
    const $divider = $target.closest('.elementor-divider');
    if ($divider.length) return $divider;
  }
  if (item.field === 'html_text') {
    const $action = $target.closest('a, button');
    if ($action.length) return $action;
  }
  return $target.length ? $target : $widget;
}

function ensureLink($, $widget, $target, item, settings) {
  if (!item.capabilities.link || settings.link_url === undefined) return;
  let $link = findLink($, $widget, $target, item.field);
  if (!$link.length && settings.link_url) {
    if (item.kind === 'image' || item.kind === 'icon') {
      $target.wrap(`<a href="${escapeHtml(settings.link_url)}"></a>`);
      $link = $target.parent('a');
    } else {
      $target.wrapInner(`<a href="${escapeHtml(settings.link_url)}"></a>`);
      $link = $target.find('a').first();
    }
  }
  if (!$link.length) return;
  if (settings.link_url) $link.attr('href', settings.link_url);
  else $link.removeAttr('href');
  if (settings.link_new_tab) $link.attr('target', '_blank');
  else $link.removeAttr('target');
  const rel = [];
  if (settings.link_new_tab) rel.push('noopener', 'noreferrer');
  if (settings.link_nofollow) rel.push('nofollow');
  if (rel.length) $link.attr('rel', [...new Set(rel)].join(' '));
  else $link.removeAttr('rel');
}

function applyWhatsAppMessage($, $widget, $target, item, settings) {
  if (!item.capabilities.whatsapp_message || typeof settings.whatsapp_message !== 'string') return;
  const $link = findLink($, $widget, $target, item.field);
  if (!$link.length) return;
  try {
    const url = new URL(String($link.attr('href') || ''));
    url.searchParams.set('text', settings.whatsapp_message.slice(0, 500));
    $link.attr('href', url.href);
  } catch {
    // Existing managed links are absolute; malformed legacy links are left intact.
  }
}

function applyIconChoice($target, item, settings) {
  if (!item.capabilities.icon || settings.icon_name === undefined || settings.icon_name === 'original') return;
  const svg = ICON_SVGS[settings.icon_name];
  if (svg) $target.html(svg);
}

function numeric(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function safeColor(value) {
  return value === 'transparent' || SAFE_COLOR.test(String(value || '')) ? String(value).toLowerCase() : null;
}

function shadowValue(style) {
  const color = safeColor(style.shadow_color);
  if (!color) return null;
  const x = numeric(style.shadow_x ?? 0, -200, 200);
  const y = numeric(style.shadow_y ?? 2, -200, 200);
  const blur = numeric(style.shadow_blur ?? 12, 0, 300);
  const spread = numeric(style.shadow_spread ?? 0, 0, 200);
  return x === null || y === null || blur === null || spread === null ? null : `${x}px ${y}px ${blur}px ${spread}px ${color}`;
}

function targetDeclarations(style = {}, item) {
  const declarations = [];
  const color = safeColor(style.color);
  const background = safeColor(style.background_color);
  const borderColor = safeColor(style.border_color);
  if (color) declarations.push(`color:${color}!important`);
  if (background) declarations.push(`background-color:${background}!important`);
  if (['inherit', 'Inter', 'Montserrat', 'Arial', 'Georgia', 'Times New Roman'].includes(style.font_family)) {
    declarations.push(style.font_family === 'inherit'
      ? 'font-family:inherit!important'
      : `font-family:"${escapeCssString(style.font_family)}",sans-serif!important`);
  }
  const fontSize = numeric(style.font_size, 6, 160);
  if (fontSize !== null) declarations.push(`font-size:${fontSize}px!important`);
  if ([100, 200, 300, 400, 500, 600, 700, 800, 900].includes(style.font_weight)) declarations.push(`font-weight:${style.font_weight}!important`);
  if (['normal', 'italic'].includes(style.font_style)) declarations.push(`font-style:${style.font_style}!important`);
  if (['none', 'uppercase', 'lowercase', 'capitalize'].includes(style.text_transform)) declarations.push(`text-transform:${style.text_transform}!important`);
  if (['none', 'underline', 'line-through'].includes(style.text_decoration)) declarations.push(`text-decoration:${style.text_decoration}!important`);
  const lineHeight = numeric(style.line_height, 0.7, 4);
  if (lineHeight !== null) declarations.push(`line-height:${lineHeight}!important`);
  const letterSpacing = numeric(style.letter_spacing, -10, 40);
  if (letterSpacing !== null) declarations.push(`letter-spacing:${letterSpacing}px!important`);
  if (['left', 'center', 'right', 'justify'].includes(style.text_align)) declarations.push(`text-align:${style.text_align}!important`);
  const width = numeric(style.width, 1, 100);
  if (width !== null) declarations.push(`width:${width}%!important`);
  const maxWidth = numeric(style.max_width, 1, 100);
  if (maxWidth !== null) declarations.push(`max-width:${maxWidth}%!important`);
  const height = numeric(style.height, 16, 1600);
  if (height !== null) declarations.push(`height:${height}px!important`);
  if (['fill', 'cover', 'contain', 'none'].includes(style.object_fit)) declarations.push(`object-fit:${style.object_fit}!important`);
  const opacity = numeric(style.opacity, 0, 100);
  if (opacity !== null) declarations.push(`opacity:${opacity / 100}!important`);
  if (['none', 'solid', 'double', 'dotted', 'dashed'].includes(style.border_style)) declarations.push(`border-style:${style.border_style}!important`);
  if (borderColor) declarations.push(`border-color:${borderColor}!important`);
  const borderWidth = numeric(style.border_width, 0, 24);
  if (borderWidth !== null) declarations.push(`border-width:${borderWidth}px!important`);
  const radius = numeric(style.border_radius, 0, 400);
  if (radius !== null) declarations.push(`border-radius:${radius}px!important`);
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const padding = numeric(style[`padding_${side}`], 0, 200);
    if (padding !== null) declarations.push(`padding-${side}:${padding}px!important`);
  }
  const shadow = shadowValue(style);
  if (shadow) declarations.push(`box-shadow:${shadow}!important`);
  if (item.kind === 'icon' && fontSize !== null) declarations.push(`--alhijaz-icon-size:${fontSize}px`);
  return declarations.join(';');
}

function advancedDeclarations(style = {}) {
  const declarations = [];
  const background = safeColor(style.background_color);
  const borderColor = safeColor(style.border_color);
  if (background) declarations.push(`background-color:${background}!important`);
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const margin = numeric(style[`margin_${side}`], -400, 800);
    const padding = numeric(style[`padding_${side}`], 0, 800);
    if (margin !== null) declarations.push(`margin-${side}:${margin}px!important`);
    if (padding !== null) declarations.push(`padding-${side}:${padding}px!important`);
  }
  const width = numeric(style.width, 1, 100);
  const maxWidth = numeric(style.max_width, 1, 100);
  const minHeight = numeric(style.min_height, 0, 1600);
  const zIndex = numeric(style.z_index, -10, 999);
  if (width !== null) declarations.push(`width:${width}%!important`);
  if (maxWidth !== null) declarations.push(`max-width:${maxWidth}%!important`);
  if (minHeight !== null) declarations.push(`min-height:${minHeight}px!important`);
  if (zIndex !== null) declarations.push(`z-index:${zIndex}!important`);
  if (['none', 'solid', 'double', 'dotted', 'dashed'].includes(style.border_style)) declarations.push(`border-style:${style.border_style}!important`);
  if (borderColor) declarations.push(`border-color:${borderColor}!important`);
  const borderWidth = numeric(style.border_width, 0, 24);
  if (borderWidth !== null) declarations.push(`border-width:${borderWidth}px!important`);
  const radius = numeric(style.border_radius, 0, 400);
  if (radius !== null) declarations.push(`border-radius:${radius}px!important`);
  const shadow = shadowValue(style);
  if (shadow) declarations.push(`box-shadow:${shadow}!important`);
  return declarations.join(';');
}

function scopedRule(selector, declarations) {
  return declarations ? `${selector}{${declarations}}` : '';
}

function targetStyleRules(item, settings, styleClass) {
  const selector = `.${styleClass}`;
  const rules = [];
  const base = targetDeclarations(settings.base, item);
  if (base) rules.push(scopedRule(selector, base));
  for (const breakpoint of ['tablet', 'mobile']) {
    const declarations = targetDeclarations(settings[breakpoint], item);
    if (declarations) rules.push(`${BREAKPOINT_MEDIA[breakpoint]}{${scopedRule(selector, declarations)}}`);
  }
  if (['image', 'icon'].includes(item.kind) || item.field === 'button' || item.field === 'html_text') {
    for (const breakpoint of ['base', 'tablet', 'mobile']) {
      const align = settings[breakpoint]?.text_align;
      if (!['left', 'center', 'right', 'justify'].includes(align)) continue;
      const rule = scopedRule(`.elementor-element-${item.element_id} .elementor-widget-container`, `text-align:${align}!important`);
      rules.push(breakpoint === 'base' ? rule : `${BREAKPOINT_MEDIA[breakpoint]}{${rule}}`);
    }
  }
  const hover = targetDeclarations(settings.hover, item);
  if (hover) rules.push(scopedRule(`${selector}:hover`, hover));
  if (item.kind === 'icon') rules.push(`${selector} svg{width:var(--alhijaz-icon-size,1em)!important;height:var(--alhijaz-icon-size,1em)!important}`);
  if (item.field === 'divider_text') {
    for (const breakpoint of ['base', 'tablet', 'mobile']) {
      const style = settings[breakpoint] || {};
      const divider = [];
      const color = safeColor(style.divider_color);
      const width = numeric(style.divider_width, 1, 100);
      const thickness = numeric(style.divider_thickness, 1, 24);
      if (color) divider.push(`border-top-color:${color}!important`);
      if (width !== null) divider.push(`width:${width}%!important`);
      if (thickness !== null) divider.push(`border-top-width:${thickness}px!important`);
      if (!divider.length) continue;
      const rule = scopedRule(`${selector} .elementor-divider-separator`, divider.join(';'));
      rules.push(breakpoint === 'base' ? rule : `${BREAKPOINT_MEDIA[breakpoint]}{${rule}}`);
    }
  }
  return rules.join('');
}

function readElementorSettings($widget) {
  try {
    const value = JSON.parse(String($widget.attr('data-settings') || '{}'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function responsiveSize(unit, value) {
  return { unit, size: value, sizes: [] };
}

function applyWidgetSettings($, $widget, type, settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
  if (type === 'heading' && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'].includes(settings.heading_tag)) {
    const node = $widget.find('.elementor-heading-title').first().get(0);
    if (node) node.name = settings.heading_tag;
  }
  if (type === 'image-carousel') {
    const data = readElementorSettings($widget);
    const mapping = [
      ['carousel_slides', 'slides_to_show'],
      ['carousel_slides_tablet', 'slides_to_show_tablet'],
      ['carousel_slides_mobile', 'slides_to_show_mobile'],
    ];
    for (const [source, target] of mapping) {
      const value = numeric(settings[source], 1, source.endsWith('_mobile') ? 4 : 8);
      if (value !== null) data[target] = String(value);
    }
    for (const [source, target] of [
      ['carousel_gap', 'image_spacing_custom'],
      ['carousel_gap_tablet', 'image_spacing_custom_tablet'],
      ['carousel_gap_mobile', 'image_spacing_custom_mobile'],
    ]) {
      const value = numeric(settings[source], 0, 120);
      if (value !== null) data[target] = responsiveSize('px', value);
    }
    if (typeof settings.carousel_autoplay === 'boolean') data.autoplay = settings.carousel_autoplay ? 'yes' : 'no';
    if (typeof settings.carousel_loop === 'boolean') data.infinite = settings.carousel_loop ? 'yes' : 'no';
    if (typeof settings.carousel_pause_on_hover === 'boolean') data.pause_on_hover = settings.carousel_pause_on_hover ? 'yes' : 'no';
    const speed = numeric(settings.carousel_autoplay_speed, 500, 20_000);
    if (speed !== null) data.autoplay_speed = speed;
    $widget.attr('data-settings', JSON.stringify(data));
  }
  if (type === 'gallery') {
    const data = readElementorSettings($widget);
    for (const [source, target, max] of [
      ['gallery_columns', 'columns', 12],
      ['gallery_columns_tablet', 'columns_tablet', 8],
      ['gallery_columns_mobile', 'columns_mobile', 4],
    ]) {
      const value = numeric(settings[source], 1, max);
      if (value !== null) data[target] = value;
    }
    for (const [source, target] of [
      ['gallery_gap', 'gap'],
      ['gallery_gap_tablet', 'gap_tablet'],
      ['gallery_gap_mobile', 'gap_mobile'],
    ]) {
      const value = numeric(settings[source], 0, 120);
      if (value !== null) data[target] = responsiveSize('px', value);
    }
    if (['1:1', '3:2', '4:3', '16:9', '9:16'].includes(settings.gallery_aspect_ratio)) data.aspect_ratio = settings.gallery_aspect_ratio;
    if (typeof settings.gallery_lightbox === 'boolean') {
      data.link_to = settings.gallery_lightbox ? 'file' : 'none';
      $widget.find('a.e-gallery-item').attr('data-elementor-open-lightbox', settings.gallery_lightbox ? 'yes' : 'no');
    }
    $widget.attr('data-settings', JSON.stringify(data));
  }
}

function componentRules(elementId, settings) {
  const selector = `.elementor-element-${elementId}`;
  const rules = [];
  const base = advancedDeclarations(settings.base);
  if (base) rules.push(scopedRule(selector, base));
  for (const breakpoint of ['tablet', 'mobile']) {
    const declarations = advancedDeclarations(settings[breakpoint]);
    if (declarations) rules.push(`${BREAKPOINT_MEDIA[breakpoint]}{${scopedRule(selector, declarations)}}`);
  }
  if (settings.hide_desktop) rules.push(`@media (min-width:1025px){${selector}{display:none!important}}`);
  if (settings.hide_tablet) rules.push(`@media (min-width:768px) and (max-width:1024px){${selector}{display:none!important}}`);
  if (settings.hide_mobile) rules.push(`@media (max-width:767px){${selector}{display:none!important}}`);
  const duration = numeric(settings.animation_duration ?? 500, 100, 3000) ?? 500;
  const animation = {
    'fade-in': 'alhijazFadeIn',
    'fade-up': 'alhijazFadeUp',
    'fade-down': 'alhijazFadeDown',
    'slide-left': 'alhijazSlideLeft',
    'slide-right': 'alhijazSlideRight',
    'zoom-in': 'alhijazZoomIn',
  }[settings.entrance_animation];
  if (animation) rules.push(`${selector}{animation:${animation} ${duration}ms ease both!important}`);
  return rules.join('');
}

function injectStyles($, css) {
  if (!css) return;
  $('head').append(`<style id="alhijaz-component-overrides">${css}</style>`);
}

export function applyLandingContentOverrides(html, contentOverrides, componentOverrides = {}, options = {}) {
  if (componentOverrides && typeof componentOverrides === 'object' && 'preview' in componentOverrides && !('targets' in componentOverrides)) {
    options = componentOverrides;
    componentOverrides = {};
  }
  const preview = options.preview === true;
  const source = String(html || '');
  const contentEntries = contentOverrides && typeof contentOverrides === 'object' ? Object.entries(contentOverrides) : [];
  const componentEntries = componentOverrides && typeof componentOverrides === 'object' ? Object.entries(componentOverrides) : [];
  if (!preview && contentEntries.length === 0 && componentEntries.length === 0) return source;

  const $ = load(source, { decodeEntities: false });
  const manifest = extractLandingContentManifest(source);
  const items = manifest.groups.flatMap((group) => group.items);
  const itemsByKey = new Map(items.map((item) => [item.key, item]));
  const itemsByElement = new Map();
  for (const item of items) {
    if (!itemsByElement.has(item.element_id)) itemsByElement.set(item.element_id, []);
    itemsByElement.get(item.element_id).push(item);
  }

  for (const [key, value] of contentEntries) {
    const parsed = parseContentKey(key);
    const item = parsed ? itemsByKey.get(key) : null;
    if (!parsed || !item?.capabilities.content || typeof value !== 'string') continue;
    const { spec, $target } = locateTarget($, item);
    if (!spec || !$target.length) continue;
    if (spec.kind === 'image') setImage($target, spec, value);
    else setPlainText($target, value);
  }

  let css = '';
  for (const [elementId, component] of componentEntries) {
    if (!/^[a-z0-9_-]{1,64}$/i.test(elementId) || !component || typeof component !== 'object' || Array.isArray(component)) continue;
    const componentItems = itemsByElement.get(elementId) || [];
    if (!componentItems.length) continue;
    const actualType = componentItems[0].widget_type;
    if (component.widget_type && component.widget_type !== actualType) continue;
    const $widget = $(`[data-id="${elementId}"]`).first();
    if (componentItems.some((item) => item.capabilities.content)) applyWidgetSettings($, $widget, actualType, component.settings);
    if (componentItems.some((item) => item.capabilities.advanced)) css += componentRules(elementId, component);

    const targets = component.targets && typeof component.targets === 'object' ? component.targets : {};
    for (const item of componentItems) {
      const settings = targets[item.target_key];
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) continue;
      const { $widget, $target } = locateTarget($, item);
      if (!$target.length) continue;
      if (item.capabilities.alt && typeof settings.alt_text === 'string') $target.attr('alt', settings.alt_text.slice(0, 180));
      ensureLink($, $widget, $target, item, settings);
      applyWhatsAppMessage($, $widget, $target, item, settings);
      applyIconChoice($target, item, settings);
      if (item.capabilities.style) {
        const className = `alhijaz-style-${elementId}-${item.field}-${item.index}`.replace(/[^a-z0-9_-]/gi, '-');
        visualTarget($, item, $widget, $target).addClass(className);
        css += targetStyleRules(item, settings, className);
      }
    }
  }

  css += '@keyframes alhijazFadeIn{from{opacity:0}to{opacity:1}}@keyframes alhijazFadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes alhijazFadeDown{from{opacity:0;transform:translateY(-24px)}to{opacity:1;transform:none}}@keyframes alhijazSlideLeft{from{opacity:0;transform:translateX(36px)}to{opacity:1;transform:none}}@keyframes alhijazSlideRight{from{opacity:0;transform:translateX(-36px)}to{opacity:1;transform:none}}@keyframes alhijazZoomIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}';
  injectStyles($, css);

  if (preview) {
    for (const item of items) {
      const { $target } = locateTarget($, item);
      if ($target.length) $target.attr('data-landing-builder-content-key', item.key);
    }
    $('head').append('<style id="alhijaz-landing-content-preview">.alhijaz-builder-preview [data-landing-builder-content-key]{cursor:pointer;transition:outline .15s,outline-offset .15s}.alhijaz-builder-preview [data-landing-builder-content-key]:hover{outline:2px dashed #10b981!important;outline-offset:3px}.alhijaz-builder-preview [data-landing-builder-content-key][data-landing-builder-selected="true"]{outline:3px solid #10b981!important;outline-offset:3px}</style>');
  }

  return $.html();
}
