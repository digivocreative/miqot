export type LandingBuilderType = 'umroh' | 'haji';

export interface LandingBuilderHero {
  eyebrow: string;
  headline: string;
  description: string;
  cta_label: string;
  cta_message: string;
  image_url: string | null;
}

export interface LandingFeaturedPackage {
  jadwal_id: string;
  year_code: string;
  name: string;
  departure_date: string;
  airline: string;
  price: number | null;
  seat_remaining: number | null;
  image_url: string | null;
}

export interface LandingBuilderDocument {
  version: number;
  hero: LandingBuilderHero;
  featured_package: LandingFeaturedPackage | null;
  featured_haji_package: 'uhud' | 'rahmah' | null;
  optional_program_visible: boolean;
  content_overrides: Record<string, string>;
  component_overrides: Record<string, LandingComponentOverride>;
}

export type LandingContentKind = 'text' | 'textarea' | 'image' | 'icon' | 'divider' | 'lottie';
export type LandingEditorTab = 'content' | 'style' | 'advanced';
export type LandingBreakpoint = 'base' | 'tablet' | 'mobile';

export interface LandingTargetStyle {
  color?: string;
  background_color?: string;
  font_family?: string;
  font_size?: number;
  font_weight?: number;
  font_style?: 'normal' | 'italic';
  text_transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  text_decoration?: 'none' | 'underline' | 'line-through';
  line_height?: number;
  letter_spacing?: number;
  text_align?: 'left' | 'center' | 'right' | 'justify';
  width?: number;
  max_width?: number;
  height?: number;
  object_fit?: 'fill' | 'cover' | 'contain' | 'none';
  opacity?: number;
  border_style?: 'none' | 'solid' | 'double' | 'dotted' | 'dashed';
  border_color?: string;
  border_width?: number;
  border_radius?: number;
  padding_top?: number;
  padding_right?: number;
  padding_bottom?: number;
  padding_left?: number;
  shadow_color?: string;
  shadow_x?: number;
  shadow_y?: number;
  shadow_blur?: number;
  shadow_spread?: number;
  divider_color?: string;
  divider_width?: number;
  divider_thickness?: number;
}

export interface LandingAdvancedStyle {
  background_color?: string;
  margin_top?: number;
  margin_right?: number;
  margin_bottom?: number;
  margin_left?: number;
  padding_top?: number;
  padding_right?: number;
  padding_bottom?: number;
  padding_left?: number;
  width?: number;
  max_width?: number;
  min_height?: number;
  z_index?: number;
  border_style?: 'none' | 'solid' | 'double' | 'dotted' | 'dashed';
  border_color?: string;
  border_width?: number;
  border_radius?: number;
  shadow_color?: string;
  shadow_x?: number;
  shadow_y?: number;
  shadow_blur?: number;
  shadow_spread?: number;
}

export interface LandingTargetOverride {
  link_url?: string;
  whatsapp_message?: string;
  icon_name?: 'original' | 'check' | 'star' | 'users' | 'building' | 'plane' | 'calendar' | 'shield' | 'award' | 'kaaba' | 'heart' | 'message';
  link_new_tab?: boolean;
  link_nofollow?: boolean;
  alt_text?: string;
  base?: LandingTargetStyle;
  tablet?: LandingTargetStyle;
  mobile?: LandingTargetStyle;
  hover?: LandingTargetStyle;
}

export interface LandingWidgetSettings {
  heading_tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';
  carousel_slides?: number;
  carousel_slides_tablet?: number;
  carousel_slides_mobile?: number;
  carousel_gap?: number;
  carousel_gap_tablet?: number;
  carousel_gap_mobile?: number;
  carousel_autoplay?: boolean;
  carousel_autoplay_speed?: number;
  carousel_loop?: boolean;
  carousel_pause_on_hover?: boolean;
  gallery_columns?: number;
  gallery_columns_tablet?: number;
  gallery_columns_mobile?: number;
  gallery_gap?: number;
  gallery_gap_tablet?: number;
  gallery_gap_mobile?: number;
  gallery_aspect_ratio?: '1:1' | '3:2' | '4:3' | '16:9' | '9:16';
  gallery_lightbox?: boolean;
}

export interface LandingComponentOverride {
  widget_type?: string;
  targets?: Record<string, LandingTargetOverride>;
  settings?: LandingWidgetSettings;
  base?: LandingAdvancedStyle;
  tablet?: LandingAdvancedStyle;
  mobile?: LandingAdvancedStyle;
  hide_desktop?: boolean;
  hide_tablet?: boolean;
  hide_mobile?: boolean;
  entrance_animation?: 'none' | 'fade-in' | 'fade-up' | 'fade-down' | 'slide-left' | 'slide-right' | 'zoom-in';
  animation_duration?: number;
}

export interface LandingContentCapabilities {
  content: boolean;
  style: boolean;
  advanced: boolean;
  link: boolean;
  whatsapp_message: boolean;
  icon: boolean;
  alt: boolean;
}

export interface LandingContentItem {
  key: string;
  element_id: string;
  field: string;
  target_key: string;
  index: number;
  kind: LandingContentKind;
  widget_type: string;
  label: string;
  value: string;
  link_url: string;
  whatsapp_message: string;
  link_new_tab: boolean;
  link_nofollow: boolean;
  alt_text: string;
  icon_name: string;
  html_tag: string;
  capabilities: LandingContentCapabilities;
  locked: boolean;
  lock_reason: string | null;
  section_id: string;
  section_label: string;
}

export interface LandingContentGroup {
  id: string;
  label: string;
  items: LandingContentItem[];
}

export interface LandingContentManifest {
  groups: LandingContentGroup[];
  total: number;
}

export interface LandingBuilderState {
  schema_version: number;
  draft: LandingBuilderDocument;
  published: LandingBuilderDocument;
  draft_updated_at: string | null;
  draft_client_updated_at: number;
  published_at: string | null;
  has_unpublished_changes: boolean;
}

export type LandingBuilderSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type LandingBuilderSection = 'hero' | 'content' | 'featured' | 'program' | 'contact';
