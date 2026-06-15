-- Retirada do tanque: foto do horímetro do equipamento abastecido
-- Execute no SQL Editor do Supabase (projeto remoto).

alter table public.movimentacoes
  add column if not exists retirada_horimetro_foto_storage_path text;

-- Bucket privado para foto do horímetro na retirada do tanque
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'retirada_horimetro',
  'retirada_horimetro',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/jpg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_retirada_horimetro_select_own_or_admin on storage.objects;
create policy storage_retirada_horimetro_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'retirada_horimetro'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_retirada_horimetro_insert_own on storage.objects;
create policy storage_retirada_horimetro_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'retirada_horimetro'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_retirada_horimetro_update_own on storage.objects;
create policy storage_retirada_horimetro_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'retirada_horimetro'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'retirada_horimetro'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_retirada_horimetro_delete_own on storage.objects;
create policy storage_retirada_horimetro_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'retirada_horimetro'
  and (storage.foldername(name))[1] = auth.uid()::text
);
