export type LinkifySegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

export function linkifySegments(text: string): LinkifySegment[];
export function firstUrl(text: string | null | undefined): string | null;
export function stripUrlFromBody(body: string, url: string | null | undefined): string;
