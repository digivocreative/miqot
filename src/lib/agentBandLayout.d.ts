/**
 * Deklarasi tipe untuk src/lib/agentBandLayout.js — tata letak blok identitas
 * agent di dalam kotak kontak brosur.
 */

import type { ContactSlot } from './brochureContactSlot';

/** Penggaris lebar teks. Kanvas memakai ctx.measureText; tes memakai penggaris palsu. */
export type MeasureText = (text: string, fontSize: number, weight: number) => number;

export interface AgentBandInput {
  slot: ContactSlot;
  name: string;
  landing: string;
  /** Nomor SIAP TAMPIL, mis. "0812-3456-7890". */
  phone: string;
  measure: MeasureText;
}

export interface AgentTextPiece {
  x: number;
  /** Tepi ATAS baris — penggambar memakai textBaseline 'top'. */
  y: number;
  fontSize: number;
  lineHeight: number;
  text: string;
}

export interface AgentBandLayout {
  contentHeight: number;
  top: number;
  photo: { x: number; y: number; size: number; ringWidth: number };
  name: AgentTextPiece | null;
  landing: AgentTextPiece | null;
  wa: {
    iconX: number;
    iconY: number;
    iconSize: number;
    textX: number;
    /** Sumbu tengah vertikal nomor — penggambar memakai textBaseline 'middle'. */
    midY: number;
    fontSize: number;
    text: string;
  } | null;
}

export declare const AGENT_BLOCK: {
  readonly widthCapRatio: number;
  readonly padXRatio: number;
  readonly photoRatio: number;
  readonly photoRingRatio: number;
  readonly photoGapRatio: number;
  readonly nameRatio: number;
  readonly landingRatio: number;
  readonly nameLineRatio: number;
  readonly landingLineRatio: number;
  readonly waIconRatio: number;
  readonly waGapRatio: number;
  readonly columnGapRatio: number;
  readonly nameShrinkFloor: number;
  readonly waMaxShareOfRow: number;
  readonly minHeight: number;
  readonly fontFamily: string;
  readonly colors: {
    readonly name: string;
    readonly landing: string;
    readonly phone: string;
    readonly waIcon: string;
    readonly photoRing: string;
  };
};

export declare function ellipsize(
  text: string,
  maxWidth: number,
  measureAt: (text: string) => number,
): string;

export declare function layoutAgentBlock(input: AgentBandInput): AgentBandLayout | null;
