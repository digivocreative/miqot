-- DRAFT ONLY. Do not execute any UPDATE section without explicit owner approval.
-- Intended order after 2B is deployed:
-- 1) Let AWAPI full sync run for AWAPI-enabled agents.
-- 2) Run the SELECT checks below.
-- 3) Only if edge cases remain, fill the commented UPDATE template manually.

-- A. Invariant: AWAPI-owned payment raw must not keep legacy bayar_gross.
select count(*) as awapi_rows_with_legacy_bayar_gross
from public.jamaah
where raw_data->>'payment_source' = 'awapi'
  and raw_data ? 'bayar_gross';

-- B. Original anomaly check: no row should have bayar above legacy bayar_gross
-- once AWAPI-owned rows have had legacy raw payment stripped.
select count(*) as bayar_above_legacy_gross
from public.jamaah
where raw_data ? 'bayar_gross'
  and (raw_data->>'bayar_gross') ~ '^[0-9]+$'
  and bayar > (raw_data->>'bayar_gross')::bigint;

-- C. SITI verification: expected payment_source='awapi' after re-sync, and
-- bayar/sisa should match the live AWAPI values and remain stable across cycles.
select
  a.slug,
  a.awapi_code,
  j.id_umroh,
  j.jm_id,
  j.nama,
  j.bayar,
  j.sisa,
  j.raw_data->>'payment_source' as payment_source,
  j.raw_data->>'payment_synced_at' as payment_synced_at,
  j.raw_data->>'bayar' as raw_awapi_bayar,
  j.raw_data->>'bayar_sisa' as raw_awapi_sisa,
  j.raw_data ? 'bayar_gross' as has_legacy_bayar_gross
from public.jamaah j
join public.agents a on a.id = j.agent_id
where j.id_umroh = 'AIW0028864'
  and j.jm_id = 'JM999999990000062962';

-- D. Dewi/UHUD spot check after re-sync.
select
  a.slug,
  a.awapi_code,
  j.id_umroh,
  j.jm_id,
  j.nama,
  j.bayar,
  j.sisa,
  j.raw_data->>'payment_source' as payment_source,
  j.raw_data->>'payment_synced_at' as payment_synced_at,
  j.raw_data->>'bayar' as raw_awapi_bayar,
  j.raw_data->>'bayar_sisa' as raw_awapi_sisa,
  j.raw_data ? 'bayar_gross' as has_legacy_bayar_gross
from public.jamaah j
join public.agents a on a.id = j.agent_id
where j.id_umroh = 'AIW0026379'
  and j.jm_id in (
    'JM999999990000056152',
    'JM999999990000056153',
    'JM999999990000056154',
    'JM999999990000056155'
  )
order by j.jm_id;

-- E. Coverage: rows under AWAPI-enabled agents that AWAPI did not claim yet.
-- These remain legacy-owned by design; review, do not auto-correct.
select count(*) as awapi_agent_rows_not_claimed_by_awapi
from public.jamaah j
join public.agents a on a.id = j.agent_id
where a.awapi_key is not null
  and coalesce(j.raw_data->>'payment_source', '') <> 'awapi';

select
  a.slug,
  a.awapi_code,
  j.id_umroh,
  j.jm_id,
  j.nama,
  j.bayar,
  j.sisa,
  j.raw_data->>'payment_source' as payment_source,
  j.raw_data->>'source' as legacy_source,
  j.synced_at
from public.jamaah j
join public.agents a on a.id = j.agent_id
where a.awapi_key is not null
  and coalesce(j.raw_data->>'payment_source', '') <> 'awapi'
order by a.slug, j.id_umroh, j.jm_id;

-- F. Manual correction template for unresolved edge cases only.
-- Fill values from confirmed AWAPI payload and run only after explicit approval.
--
-- update public.jamaah
-- set
--   bayar = :awapi_bayar,
--   sisa = :awapi_sisa,
--   diskon_kantor = :awapi_diskon_kantor,
--   diskon_marketing = :awapi_diskon_marketing,
--   raw_data = (
--     coalesce(raw_data, '{}'::jsonb)
--     - 'bayar_gross'
--     - 'harga_paket'
--     - 'status_bayar'
--     - 'source'
--   ) || jsonb_build_object(
--     'bayar', :awapi_raw_bayar,
--     'bayar_sisa', :awapi_raw_bayar_sisa,
--     'payment_source', 'awapi',
--     'payment_synced_at', now()
--   ),
--   synced_at = now()
-- where agent_id = :agent_id
--   and id_umroh = :id_umroh
--   and jm_id = :jm_id
--   and raw_data->>'payment_source' is distinct from 'awapi';
