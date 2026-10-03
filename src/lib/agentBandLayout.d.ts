/**
 * Deklarasi tipe untuk src/lib/agentBandLayout.js — tata letak nama + nomor
 * WhatsApp agent di dalam kotak kontak brosur: satu baris, atau ditumpuk dua
 * baris di kotak sempit kalau itu membuat hurufnya jauh lebih besar.
 */

import type { ContactSlot } from './brochureContactSlot';

/** Penggaris lebar teks. Kanvas memakai ctx.measureText; tes memakai penggaris palsu. */
export type MeasureText = (text: string, fontSize: number, weight: number) => number;

export interface AgentBandInput {
  slot: ContactSlot;
  name: string;
  /** Nomor SIAP TAMPIL, mis. "0812-3456-7890". */
  phone: string;
  measure: MeasureText;
}

export interface AgentBandLayout {
  contentHeight: number;
  /** Satu ukuran untuk nama DAN nomor. */
  fontSize: number;
  /** Sumbu tengah vertikal blok — tiap baris membawa midY-nya sendiri. */
  midY: number;
  /** true = nama di atas, nomor di bawah; false = sebaris. */
  stacked: boolean;
  name: { x: number; midY: number; text: string } | null;
  wa: {
    iconX: number;
    iconY: number;
    iconSize: number;
    textX: number;
    midY: number;
    text: string;
  } | null;
}

export declare const AGENT_BLOCK: {
  readonly widthCapRatio: number;
  readonly padXRatio: number;
  readonly singleLineRatio: number;
  readonly fontFloorRatio: number;
  readonly waIconRatio: number;
  readonly waGapRatio: number;
  readonly columnGapRatio: number;
  readonly minHeight: number;
  readonly stackGapRatio: number;
  readonly stackFillRatio: number;
  readonly stackMinGain: number;
  readonly stackNameShrink: number;
  readonly darkFillLuma: number;
  readonly fontFamily: string;
  readonly colors: {
    readonly name: string;
    readonly phone: string;
    readonly waIcon: string;
  };
};

export declare function ellipsize(
  text: string,
  maxWidth: number,
  measureAt: (text: string) => number,
): string;

export declare function fillTone(fill: readonly number[] | undefined): 'light' | 'dark';

export declare function layoutAgentBlock(input: AgentBandInput): AgentBandLayout | null;
