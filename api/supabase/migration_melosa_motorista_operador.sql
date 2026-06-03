-- Melosa: motorista + foto equipamento com operador/motorista
-- Execute no SQL Editor do Supabase (após migration_melosa_horimetro_equipamento_abastecido.sql).

alter table public.melosa_movimentacoes
  add column if not exists melosa_motorista_equipamento_abastecido text;

alter table public.melosa_movimentacoes
  add column if not exists melosa_equipamento_operador_storage_path text;

alter table public.movimentacoes
  add column if not exists melosa_motorista_equipamento_abastecido text;

alter table public.movimentacoes
  add column if not exists melosa_equipamento_operador_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'melosa_equipamento_operador',
  'melosa_equipamento_operador',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/jpg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_melosa_equipamento_operador_select_own_or_admin on storage.objects;
create policy storage_melosa_equipamento_operador_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_equipamento_operador'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
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
