-- Melosa: substitui medidor acumulado inicial/final por quantidade abastecida + foto
-- Bucket: foto_quantidade_abastecida (ex-melosa_medidor_acumulado)

-- 0) Empresa do equipamento (Dimensional / Terceirizado)
alter table public.melosa_movimentacoes
  add column if not exists ativo_equipamento_empresa text null;

comment on column public.melosa_movimentacoes.ativo_equipamento_empresa is
  'Empresa do equipamento abastecido (DIMENSIONAL ou TERCEIRIZADO).';

-- 1) Novas colunas
alter table public.melosa_movimentacoes
  add column if not exists melosa_quantidade_abastecida text,
  add column if not exists melosa_quantidade_abastecida_storage_path text;

alter table public.movimentacoes
  add column if not exists melosa_quantidade_abastecida text,
  add column if not exists melosa_quantidade_abastecida_storage_path text;

-- 2) Backfill legado (litros = final − inicial; foto = inicial)
update public.melosa_movimentacoes
set melosa_quantidade_abastecida = coalesce(
  nullif(btrim(melosa_quantidade_abastecida), ''),
  case
    when melosa_medidor_acumulado_inicial_numero is not null
      and melosa_medidor_acumulado_final_numero is not null
      and btrim(melosa_medidor_acumulado_inicial_numero) <> ''
      and btrim(melosa_medidor_acumulado_final_numero) <> ''
    then trim(to_char(
      nullif(replace(replace(trim(melosa_medidor_acumulado_final_numero), ' ', ''), ',', '.'), '')::numeric
      - nullif(replace(replace(trim(melosa_medidor_acumulado_inicial_numero), ' ', ''), ',', '.'), '')::numeric,
      'FM999999990.999'
    ))
    else null
  end
)
where melosa_quantidade_abastecida is null or btrim(melosa_quantidade_abastecida) = '';

update public.melosa_movimentacoes
set melosa_quantidade_abastecida_storage_path = coalesce(
  nullif(btrim(melosa_quantidade_abastecida_storage_path), ''),
  nullif(btrim(melosa_medidor_acumulado_inicial_storage_path), ''),
  nullif(btrim(melosa_medidor_acumulado_final_storage_path), '')
)
where melosa_quantidade_abastecida_storage_path is null or btrim(melosa_quantidade_abastecida_storage_path) = '';

-- 3) Remove colunas antigas
alter table public.melosa_movimentacoes
  drop column if exists melosa_medidor_acumulado_inicial_numero,
  drop column if exists melosa_medidor_acumulado_inicial_storage_path,
  drop column if exists melosa_medidor_acumulado_final_numero,
  drop column if exists melosa_medidor_acumulado_final_storage_path,
  drop column if exists medidor_final_anterior,
  drop column if exists medidor_desvio_litros,
  drop column if exists medidor_continuidade_status;

alter table public.movimentacoes
  drop column if exists melosa_medidor_acumulado_inicial_numero,
  drop column if exists melosa_medidor_acumulado_inicial_storage_path,
  drop column if exists melosa_medidor_acumulado_final_numero,
  drop column if exists melosa_medidor_acumulado_final_storage_path;

-- 4) Bucket novo (nome exibido: Foto Quantidade Abastecida)
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
