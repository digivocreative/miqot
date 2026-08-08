-- Kode magic link Portal Jamaah 6-char wajib unik GLOBAL (lintas agent) karena
-- link pendek /j/{kode} mencari baris token dari kodenya saja, tanpa slug.
-- Index parsial: hanya menjaga kode 6-char (format baru). Token 5-char legacy
-- (unik per agent saja) dibiarkan di luar index — mereka tidak pernah
-- dibagikan lewat /j/ dan boleh saling bertabrakan antar agent, sehingga
-- pembuatan index ini tidak mungkin gagal karena data lama.
create unique index if not exists jamaah_portal_tokens_global_code_key
  on jamaah_portal_tokens ((split_part(token, ':', 2)))
  where length(split_part(token, ':', 2)) = 6;
