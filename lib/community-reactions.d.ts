export type ReactionType =
  | 'suka' | 'cinta' | 'aamiin' | 'selamat' | 'senang' | 'masyaallah' | 'semangat';

export interface CommunityReaction {
  key: ReactionType;
  emoji: string;
  label: string;
}

export type ReactionCounts = Record<ReactionType, number>;

export const COMMUNITY_REACTIONS: CommunityReaction[];
export const COMMUNITY_REACTION_TYPES: ReactionType[];
export const REACTION_EMOJI: Record<ReactionType, string>;
export const REACTION_LABEL: Record<ReactionType, string>;
export function emptyReactionCounts(): ReactionCounts;
export function sumReactions(counts: ReactionCounts | null | undefined): number;
export function topReactionEmojis(counts: ReactionCounts | null | undefined, limit?: number): string[];
