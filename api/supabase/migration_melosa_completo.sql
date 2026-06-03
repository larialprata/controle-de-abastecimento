-- =============================================================================
-- MELOSA — SQL COMPLETO (tabela + colunas + buckets + policies)
-- Execute TUDO no SQL Editor do Supabase (projeto remoto), uma vez.
-- Depois: reinicie a API e teste um registro novo no app.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabela melosa_movimentacoes (se ainda não existir)
-- -----------------------------------------------------------------------------
create table if not exists public.melosa_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  usuario_id uuid not null,
  tipo public.movimentacao_tipo not null default 'RETIRADA_MELOSA',
  obra_codigo int not null references public.obras(codigo),
  data_hora timestamptz not null default now(),
  litros numeric(12,3) not null check (litros >= 0),
  melosa_km_registro numeric(12,3),
  melosa_litros_registro numeric(12,3),
  melosa_combustivel_tipo_registro text,
  melosa_comprovante_storage_path text,
  melosa_medidor_acumulado_inicial_numero text,
  melosa_medidor_acumulado_inicial_storage_path text,
  melosa_lacre_numero text,
  melosa_lacre_storage_path text,
  melosa_medidor_acumulado_final_numero text,
  melosa_medidor_acumulado_final_storage_path text,
  melosa_horimetro_equipamento_abastecido_numero text,
  melosa_horimetro_equipamento_abastecido_storage_path text,
  melosa_motorista_equipamento_abastecido text,
  melosa_equipamento_operador_storage_path text,
  melosa_km_retirada numeric(12,3),
  melosa_combustivel_tipo_retirada text,
  melosa_tanque_storage_path text,
  placa_texto text,
  fornecedor_texto text,
  tanque_numero smallint,
  local_latitude double precision,
  local_longitude double precision,
  local_address text,
  obs text,
  created_at timestamptz not null default now()
);

-- Colunas (idempotente — roda mesmo se a tabela já existir)
alter table public.melosa_movimentacoes add column if not exists melosa_km_registro numeric(12,3);
alter table public.melosa_movimentacoes add column if not exists melosa_litros_registro numeric(12,3);
alter table public.melosa_movimentacoes add column if not exists melosa_combustivel_tipo_registro text;
alter table public.melosa_movimentacoes add column if not exists melosa_comprovante_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_inicial_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_inicial_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_lacre_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_lacre_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_final_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_final_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_horimetro_equipamento_abastecido_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_horimetro_equipamento_abastecido_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_motorista_equipamento_abastecido text;
alter table public.melosa_movimentacoes add column if not exists melosa_equipamento_operador_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_km_retirada numeric(12,3);
alter table public.melosa_movimentacoes add column if not exists melosa_combustivel_tipo_retirada text;
alter table public.melosa_movimentacoes add column if not exists melosa_tanque_storage_path text;
alter table public.melosa_movimentacoes add column if not exists placa_texto text;
alter table public.melosa_movimentacoes add column if not exists fornecedor_texto text;
alter table public.melosa_movimentacoes add column if not exists tanque_numero smallint;
alter table public.melosa_movimentacoes add column if not exists local_latitude double precision;
alter table public.melosa_movimentacoes add column if not exists local_longitude double precision;
alter table public.melosa_movimentacoes add column if not exists local_address text;
alter table public.melosa_movimentacoes add column if not exists obs text;

alter table public.melosa_movimentacoes drop constraint if exists melosa_movimentacoes_tanque_numero_check;
alter table public.melosa_movimentacoes
  add constraint melosa_movimentacoes_tanque_numero_check
  check (tanque_numero is null or tanque_numero in (1, 2));

-- Legado em movimentacoes (opcional)
alter table public.movimentacoes add column if not exists melosa_medidor_acumulado_inicial_numero text;
alter table public.movimentacoes add column if not exists melosa_medidor_acumulado_inicial_storage_path text;
alter table public.movimentacoes add column if not exists melosa_lacre_numero text;
alter table public.movimentacoes add column if not exists melosa_lacre_storage_path text;
alter table public.movimentacoes add column if not exists melosa_medidor_acumulado_final_numero text;
alter table public.movimentacoes add column if not exists melosa_medidor_acumulado_final_storage_path text;
alter table public.movimentacoes add column if not exists melosa_horimetro_equipamento_abastecido_numero text;
alter table public.movimentacoes add column if not exists melosa_horimetro_equipamento_abastecido_storage_path text;
alter table public.movimentacoes add column if not exists melosa_motorista_equipamento_abastecido text;
alter table public.movimentacoes add column if not exists melosa_equipamento_operador_storage_path text;

-- RLS melosa_movimentacoes
alter table public.melosa_movimentacoes enable row level security;

drop policy if exists melosa_movimentacoes_select_own_or_admin on public.melosa_movimentacoes;
create policy melosa_movimentacoes_select_own_or_admin
on public.melosa_movimentacoes for select to authenticated
using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists melosa_movimentacoes_insert_own on public.melosa_movimentacoes;
create policy melosa_movimentacoes_insert_own
on public.melosa_movimentacoes for insert to authenticated
with check (usuario_id = auth.uid());

grant select, insert on public.melosa_movimentacoes to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Buckets Storage (fotos Melosa)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('melosa_medidor_acumulado', 'melosa_medidor_acumulado', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_horimetro_equipamento_abastecido', 'melosa_horimetro_equipamento_abastecido', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_equipamento_operador', 'melosa_equipamento_operador', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_lacre', 'melosa_lacre', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 3) Policies — melosa_medidor_acumulado (inicial + final)
-- -----------------------------------------------------------------------------
drop policy if exists storage_melosa_medidor_select_own_or_admin on storage.objects;
create policy storage_melosa_medidor_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_medidor_acumulado'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists storage_melosa_medidor_insert_own on storage.objects;
create policy storage_melosa_medidor_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'melosa_medidor_acumulado'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_medidor_update_own on storage.objects;
create policy storage_melosa_medidor_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'melosa_medidor_acumulado'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'melosa_medidor_acumulado'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_medidor_delete_own on storage.objects;
create policy storage_melosa_medidor_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'melosa_medidor_acumulado'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- -----------------------------------------------------------------------------
-- 4) Policies — melosa_horimetro_equipamento_abastecido
-- -----------------------------------------------------------------------------
drop policy if exists storage_melosa_horimetro_select_own_or_admin on storage.objects;
create policy storage_melosa_horimetro_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_horimetro_equipamento_abastecido'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists storage_melosa_horimetro_insert_own on storage.objects;
create policy storage_melosa_horimetro_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'melosa_horimetro_equipamento_abastecido'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_horimetro_update_own on storage.objects;
create policy storage_melosa_horimetro_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'melosa_horimetro_equipamento_abastecido'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'melosa_horimetro_equipamento_abastecido'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_horimetro_delete_own on storage.objects;
create policy storage_melosa_horimetro_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'melosa_horimetro_equipamento_abastecido'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- -----------------------------------------------------------------------------
-- 5) Policies — melosa_equipamento_operador
-- -----------------------------------------------------------------------------
drop policy if exists storage_melosa_equipamento_operador_select_own_or_admin on storage.objects;
create policy storage_melosa_equipamento_operador_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_equipamento_operador'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists storage_melosa_equipamento_operador_insert_own on storage.objects;
create policy storage_melosa_equipamento_operador_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'melosa_equipamento_operador'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_equipamento_operador_update_own on storage.objects;
create policy storage_melosa_equipamento_operador_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'melosa_equipamento_operador'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'melosa_equipamento_operador'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_equipamento_operador_delete_own on storage.objects;
create policy storage_melosa_equipamento_operador_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'melosa_equipamento_operador'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- -----------------------------------------------------------------------------
-- 6) Policies — melosa_lacre
-- -----------------------------------------------------------------------------
drop policy if exists storage_melosa_lacre_select_own_or_admin on storage.objects;
create policy storage_melosa_lacre_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_lacre'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists storage_melosa_lacre_insert_own on storage.objects;
create policy storage_melosa_lacre_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'melosa_lacre'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_lacre_update_own on storage.objects;
create policy storage_melosa_lacre_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'melosa_lacre'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'melosa_lacre'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_lacre_delete_own on storage.objects;
create policy storage_melosa_lacre_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'melosa_lacre'
  and (storage.foldername(name))[1] = auth.uid()::text
);
