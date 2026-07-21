-- Perluas set reaksi Teras dari 3 -> 7 nilai (picker emoji ala WhatsApp).
-- Enum hanya bertambah; baris lama ('suka'/'selamat'/'aamiin') tetap valid.
-- JALANKAN DI SUPABASE SQL EDITOR SEBELUM DEPLOY KODE.
-- Catatan: constraint inline auto-bernama community_post_reactions_reaction_check.
-- Jika di dashboard namanya berbeda, sesuaikan nama pada DROP CONSTRAINT.
ALTER TABLE community_post_reactions
  DROP CONSTRAINT community_post_reactions_reaction_check,
  ADD CONSTRAINT community_post_reactions_reaction_check
    CHECK (reaction IN ('suka','selamat','aamiin','cinta','senang','masyaallah','semangat'));
