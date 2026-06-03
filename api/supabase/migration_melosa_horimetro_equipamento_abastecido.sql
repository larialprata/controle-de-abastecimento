-- Melosa: horímetro do equipamento abastecido (número + foto)
-- Execute no SQL Editor do Supabase (projeto remoto).

-- Colunas em melosa_movimentacoes (tabela principal do fluxo Melosa)
alter table public.melosa_movimentacoes
  add column if not exists melosa_horimetro_equipamento_abastecido_numero text;

alter table public.melosa_movimentacoes
  add column if not exists melosa_horimetro_equipamento_abastecido_storage_path text;

-- Colunas legadas em movimentacoes (se ainda usadas em relatórios)
alter table public.movimentacoes
  add column if not exists melosa_horimetro_equipamento_abastecido_numero text;

alter table public.movimentacoes
  add column if not exists melosa_horimetro_equipamento_abastecido_storage_path text;

-- Bucket privado para foto do horímetro
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'melosa_horimetro_equipamento_abastecido',
  'melosa_horimetro_equipamento_abastecido',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/jpg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policies storage (prefixo do path = auth.uid())
drop policy if exists storage_melosa_horimetro_select_own_or_admin on storage.objects;
create policy storage_melosa_horimetro_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_horimetro_equipamento_abastecido'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
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
