-- Storage (Supabase) — buckets + RLS para CNH, notas (tanque obra) e Melosa
-- Execute no SQL Editor do projeto (após schema.sql / tabelas já existirem).
-- Nomes alinhados com: mobile App.tsx, api config (CNH_BUCKET, NOTAS_BUCKET), web storageNota/storageMelosa.

-- Buckets privados (API com service_role ignora RLS; app usa usuário autenticado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cnh', 'cnh', false, 5242880, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('notas', 'notas', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_comprovantes', 'melosa_comprovantes', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_tanques', 'melosa_tanques', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_medidor_acumulado', 'melosa_medidor_acumulado', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_horimetro_equipamento_abastecido', 'melosa_horimetro_equipamento_abastecido', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_equipamento_operador', 'melosa_equipamento_operador', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('melosa_lacre', 'melosa_lacre', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('lacre_tanque', 'lacre_tanque', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('lacre_melosa', 'lacre_melosa', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('medidor_tanque', 'medidor_tanque', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[]),
  ('confirmacao_abastecimento', 'confirmacao_abastecimento', false, 10485760, array['image/jpeg', 'image/png', 'image/jpg']::text[])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Helpers: primeiro segmento do path = auth.uid() (ex.: <uuid>/cnh.jpg, <uuid>/notas/....jpg)
-- Políticas por bucket (idempotente)

-- cnh
drop policy if exists storage_cnh_select_own_or_admin on storage.objects;
create policy storage_cnh_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'cnh'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_cnh_insert_own on storage.objects;
create policy storage_cnh_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'cnh'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_cnh_update_own on storage.objects;
create policy storage_cnh_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'cnh'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'cnh'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_cnh_delete_own on storage.objects;
create policy storage_cnh_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'cnh'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- notas (entrada / retirada tanque obra — mesma foto da nota)
drop policy if exists storage_notas_select_own_or_admin on storage.objects;
create policy storage_notas_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'notas'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_notas_insert_own on storage.objects;
create policy storage_notas_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'notas'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_notas_update_own on storage.objects;
create policy storage_notas_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'notas'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'notas'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_notas_delete_own on storage.objects;
create policy storage_notas_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'notas'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- melosa — comprovante
drop policy if exists storage_melosa_comp_select_own_or_admin on storage.objects;
create policy storage_melosa_comp_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_comprovantes'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_melosa_comp_insert_own on storage.objects;
create policy storage_melosa_comp_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'melosa_comprovantes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_comp_update_own on storage.objects;
create policy storage_melosa_comp_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'melosa_comprovantes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'melosa_comprovantes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_comp_delete_own on storage.objects;
create policy storage_melosa_comp_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'melosa_comprovantes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- melosa — foto do tanque
drop policy if exists storage_melosa_tanque_select_own_or_admin on storage.objects;
create policy storage_melosa_tanque_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_tanques'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_melosa_tanque_insert_own on storage.objects;
create policy storage_melosa_tanque_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'melosa_tanques'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_tanque_update_own on storage.objects;
create policy storage_melosa_tanque_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'melosa_tanques'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'melosa_tanques'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_melosa_tanque_delete_own on storage.objects;
create policy storage_melosa_tanque_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'melosa_tanques'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- melosa — medidor acumulado inicial
drop policy if exists storage_melosa_medidor_select_own_or_admin on storage.objects;
create policy storage_melosa_medidor_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'melosa_medidor_acumulado'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
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

-- melosa — horímetro do equipamento abastecido
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

-- melosa — equipamento com operador/motorista
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

-- melosa — lacre (opcional)
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

-- lacre_tanque
drop policy if exists storage_lacre_tanque_select_own_or_admin on storage.objects;
create policy storage_lacre_tanque_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'lacre_tanque'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_lacre_tanque_insert_own on storage.objects;
create policy storage_lacre_tanque_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'lacre_tanque'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_lacre_tanque_update_own on storage.objects;
create policy storage_lacre_tanque_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'lacre_tanque'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'lacre_tanque'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_lacre_tanque_delete_own on storage.objects;
create policy storage_lacre_tanque_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'lacre_tanque'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- lacre_melosa
drop policy if exists storage_lacre_melosa_select_own_or_admin on storage.objects;
create policy storage_lacre_melosa_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'lacre_melosa'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_lacre_melosa_insert_own on storage.objects;
create policy storage_lacre_melosa_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'lacre_melosa'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_lacre_melosa_update_own on storage.objects;
create policy storage_lacre_melosa_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'lacre_melosa'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'lacre_melosa'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_lacre_melosa_delete_own on storage.objects;
create policy storage_lacre_melosa_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'lacre_melosa'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- medidor_tanque
drop policy if exists storage_medidor_tanque_select_own_or_admin on storage.objects;
create policy storage_medidor_tanque_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'medidor_tanque'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_medidor_tanque_insert_own on storage.objects;
create policy storage_medidor_tanque_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'medidor_tanque'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_medidor_tanque_update_own on storage.objects;
create policy storage_medidor_tanque_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'medidor_tanque'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'medidor_tanque'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_medidor_tanque_delete_own on storage.objects;
create policy storage_medidor_tanque_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'medidor_tanque'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- confirmacao_abastecimento
drop policy if exists storage_confirmacao_abastecimento_select_own_or_admin on storage.objects;
create policy storage_confirmacao_abastecimento_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'confirmacao_abastecimento'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists storage_confirmacao_abastecimento_insert_own on storage.objects;
create policy storage_confirmacao_abastecimento_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'confirmacao_abastecimento'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_confirmacao_abastecimento_update_own on storage.objects;
create policy storage_confirmacao_abastecimento_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'confirmacao_abastecimento'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'confirmacao_abastecimento'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_confirmacao_abastecimento_delete_own on storage.objects;
create policy storage_confirmacao_abastecimento_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'confirmacao_abastecimento'
  and (storage.foldername(name))[1] = auth.uid()::text
);
