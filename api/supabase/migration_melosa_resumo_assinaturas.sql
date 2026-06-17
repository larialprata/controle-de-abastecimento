-- Resumo / assinaturas na retirada melosa (última etapa do app).

alter table public.melosa_movimentacoes
  add column if not exists ativo_equipamento_nome text,
  add column if not exists melosa_operador_nome text,
  add column if not exists melosa_assinatura_operador_storage_path text,
  add column if not exists melosa_assinatura_motorista_storage_path text;

comment on column public.melosa_movimentacoes.ativo_equipamento_nome is
  'Nome/descrição do equipamento abastecido (do cadastro ou QR).';
comment on column public.melosa_movimentacoes.melosa_operador_nome is
  'Nome do operador da melosa no momento do abastecimento.';
comment on column public.melosa_movimentacoes.melosa_assinatura_operador_storage_path is
  'Assinatura PNG do operador da melosa.';
comment on column public.melosa_movimentacoes.melosa_assinatura_motorista_storage_path is
  'Assinatura PNG do motorista do equipamento abastecido.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'melosa_assinaturas',
  'melosa_assinaturas',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg']::text[]
)
on conflict (id) do nothing;

drop policy if exists storage_melosa_assinaturas_select_own on storage.objects;
create policy storage_melosa_assinaturas_select_own
on storage.objects for select to authenticated
using (bucket_id = 'melosa_assinaturas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_melosa_assinaturas_insert_own on storage.objects;
create policy storage_melosa_assinaturas_insert_own
on storage.objects for insert to authenticated
with check (bucket_id = 'melosa_assinaturas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_melosa_assinaturas_update_own on storage.objects;
create policy storage_melosa_assinaturas_update_own
on storage.objects for update to authenticated
using (bucket_id = 'melosa_assinaturas' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'melosa_assinaturas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_melosa_assinaturas_delete_own on storage.objects;
create policy storage_melosa_assinaturas_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'melosa_assinaturas' and (storage.foldername(name))[1] = auth.uid()::text);
