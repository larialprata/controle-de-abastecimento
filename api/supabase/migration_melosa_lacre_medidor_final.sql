-- Melosa: lacre (opcional) + medidor acumulado final
-- Execute no SQL Editor do Supabase.

alter table public.melosa_movimentacoes add column if not exists melosa_lacre_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_lacre_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_final_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_final_storage_path text;

alter table public.movimentacoes add column if not exists melosa_lacre_numero text;
alter table public.movimentacoes add column if not exists melosa_lacre_storage_path text;
alter table public.movimentacoes add column if not exists melosa_medidor_acumulado_final_numero text;
alter table public.movimentacoes add column if not exists melosa_medidor_acumulado_final_storage_path text;

-- Foto final usa o bucket melosa_medidor_acumulado (já existente).
-- Bucket novo só para foto do lacre.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'melosa_lacre',
  'melosa_lacre',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/jpg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_melosa_lacre_select_own_or_admin on storage.objects;
create policy storage_melosa_lacre_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_lacre'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
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
