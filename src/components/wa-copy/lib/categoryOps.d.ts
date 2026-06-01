export interface CategoryRecord {
  value: string;
  label: string;
  iconName: string;
  tip: string;
  order: number;
}

export interface CategoryDraftInput {
  label: string;
  iconName: string;
  tip: string;
}

export function slugifyCategory(label: string): string;
export function uniqueCategoryValue(base: string, taken: Iterable<string>): string;
export function appendCategory<T extends CategoryRecord>(list: T[], draft: CategoryDraftInput): T[];
export function patchCategory<T extends CategoryRecord>(
  list: T[],
  value: string,
  patch: Partial<CategoryDraftInput>,
): T[];
export function reorderCategory<T extends CategoryRecord>(list: T[], value: string, dir: 'up' | 'down'): T[];
export function deleteCategoryAndReassign<C extends CategoryRecord, T extends Record<string, unknown>>(
  list: C[],
  items: T[],
  field: string,
  value: string,
  reassignTo: string,
): { categories: C[]; items: T[] } | null;
