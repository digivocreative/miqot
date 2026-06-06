export interface WaSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  mono: boolean;
}

export type WaLineKind = 'text' | 'bullet' | 'number' | 'quote';

export interface WaLine {
  kind: WaLineKind;
  number?: number;
  spans: WaSpan[];
}

export function parseWaLine(line: string): WaSpan[];
export function parseWaText(text: string): WaLine[];
