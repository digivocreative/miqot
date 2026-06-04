export type KontenTab = 'caption' | 'faq' | 'tourleader';

export type KontenRoute =
  | { kind: 'list'; tab: KontenTab }
  | { kind: 'entry-new'; tab: KontenTab }
  | { kind: 'entry-edit'; tab: KontenTab; id: string }
  | { kind: 'cat-list'; tab: KontenTab }
  | { kind: 'cat-new'; tab: KontenTab }
  | { kind: 'cat-edit'; tab: KontenTab; value: string }
  | { kind: 'cat-delete'; tab: KontenTab; value: string };

export interface ParsedKontenPath {
  route: KontenRoute;
  canonical: boolean;
}

export function parseKontenPath(pathname: string): ParsedKontenPath;
export function kontenPath(route: KontenRoute): string;
export function kontenParentPath(route: KontenRoute): string | null;
