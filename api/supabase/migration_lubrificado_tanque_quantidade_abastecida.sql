-- Melosa: campo opcional "Lubrificado" na retirada
-- Tanque: substitui medidor inicial/final + foto junto ao tanque por quantidade abastecida + foto

-- =============================================================================
-- 1) Melosa — lubrificado (opcional)
-- =============================================================================
alter table public.melosa_movimentacoes
  add column if not exists melosa_lubrificado boolean;

comment on column public.melosa_movimentacoes.melosa_lubrificado is
  'Indica se o equipamento foi lubrificado na retirada (opcional; marcado no app).';

-- =============================================================================
-- 2) Tanque — quantidade abastecida + foto (mesmo bucket da melosa)
-- =============================================================================
alter table public.movimentacoes
  add column if not exists tanque_quantidade_abastecida text,
  add column if not exists tanque_quantidade_abastecida_storage_path text;

comment on column public.movimentacoes.tanque_quantidade_abastecida is
  'Quantidade abastecida em litros (texto informado no app na retirada do tanque).';

comment on column public.movimentacoes.tanque_quantidade_abastecida_storage_path is
  'Storage path da foto do medidor de abastecimento (bucket foto_quantidade_abastecida).';

-- Backfill legado: litros = final − inicial; foto = inicial ou final
update public.movimentacoes
set tanque_quantidade_abastecida = coalesce(
  nullif(btrim(tanque_quantidade_abastecida), ''),
  case
    when medidor_tanque_numero_inicial is not null
      and medidor_tanque_numero_final is not null
      and btrim(medidor_tanque_numero_inicial) <> ''
      and btrim(medidor_tanque_numero_final) <> ''
    then trim(to_char(
      nullif(replace(replace(trim(medidor_tanque_numero_final), ' ', ''), ',', '.'), '')::numeric
      - nullif(replace(replace(trim(medidor_tanque_numero_inicial), ' ', ''), ',', '.'), '')::numeric,
      'FM999999990.999'
    ))
    else null
  end
)
where tipo = 'RETIRADA_TANQUE'
  and (tanque_quantidade_abastecida is null or btrim(tanque_quantidade_abastecida) = '');

update public.movimentacoes
set tanque_quantidade_abastecida_storage_path = coalesce(
  nullif(btrim(tanque_quantidade_abastecida_storage_path), ''),
  nullif(btrim(medidor_tanque_foto_inicial_storage_path), ''),
  nullif(btrim(medidor_tanque_foto_final_storage_path), ''),
  nullif(btrim(confirmacao_abastecimento_foto_storage_path), '')
)
where tipo = 'RETIRADA_TANQUE'
  and (tanque_quantidade_abastecida_storage_path is null or btrim(tanque_quantidade_abastecida_storage_path) = '');

-- Remove colunas antigas da retirada do tanque
alter table public.movimentacoes
  drop column if exists medidor_tanque_numero_inicial,
  drop column if exists medidor_tanque_foto_inicial_storage_path,
  drop column if exists medidor_tanque_numero_final,
  drop column if exists medidor_tanque_foto_final_storage_path,
  drop column if exists confirmacao_abastecimento_foto_storage_path;

-- Bucket foto_quantidade_abastecida (reutilizado pela melosa e pelo tanque)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'foto_quantidade_abastecida',
  'Foto Quantidade Abastecida',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/jpg']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_foto_quantidade_abastecida_select_own_or_admin on storage.objects;
create policy storage_foto_quantidade_abastecida_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'foto_quantidade_abastecida'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_foto_quantidade_abastecida_insert_own on storage.objects;
create policy storage_foto_quantidade_abastecida_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'foto_quantidade_abastecida'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_foto_quantidade_abastecida_update_own on storage.objects;
create policy storage_foto_quantidade_abastecida_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'foto_quantidade_abastecida'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'foto_quantidade_abastecida'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_foto_quantidade_abastecida_delete_own on storage.objects;
create policy storage_foto_quantidade_abastecida_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'foto_quantidade_abastecida'
  and (storage.foldername(name))[1] = auth.uid()::text
);
