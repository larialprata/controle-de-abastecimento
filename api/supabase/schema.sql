-- Controle de abastecimento (Supabase) - Schema + Seed
-- Execute no Supabase SQL Editor.

-- Para gen_random_uuid()
create extension if not exists pgcrypto;

-- Obras (pré-cadastradas)
create table if not exists public.obras (
  codigo int primary key,
  nome text not null
);

-- Seed das obras informadas
insert into public.obras (codigo, nome) values
  (229, 'ECO Barreira'),
  (232, 'LimpaRio'),
  (242, 'ATA'),
  (243, 'ATA'),
  (244, 'ATA'),
  (245, 'ATA'),
  (246, 'ATA'),
  (247, 'ATA'),
  (248, 'ATA'),
  (249, 'ATA')
on conflict (codigo) do update
set nome = excluded.nome;

-- Tipo de movimentação (MVP)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'movimentacao_tipo') then
    create type public.movimentacao_tipo as enum (
      'ENTRADA_TANQUE_OBRA',
      'RETIRADA_TANQUE',
      'RETIRADA_MELOSA'
    );
  end if;
end $$;

-- Movimentações (histórico)
create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  -- Idempotência: mesma operação não deve gerar duplicata
  operation_id uuid not null unique,

  -- Supabase Auth: a linha pertence ao usuário que inseriu
  usuario_id uuid not null,

  tipo public.movimentacao_tipo not null,
  obra_codigo int not null references public.obras(codigo),
  data_hora timestamptz not null default now(),
  litros numeric(12,3) not null check (litros >= 0),

  -- Tanque livre
  tanque_texto text,

  -- Tanque da obra (dados da nota)
  combustivel_tipo text,
  nota_numero text,
  placa_caminhao text,
  valor_unitario numeric(12,3) check (valor_unitario >= 0),
  nota_storage_path text,
  lacre_tanque_numero text,
  lacre_tanque_storage_path text,
  lacre_melosa_numero text,
  lacre_melosa_storage_path text,
  medidor_tanque_numero_inicial text,
  medidor_tanque_foto_inicial_storage_path text,
  medidor_tanque_numero_final text,
  medidor_tanque_foto_final_storage_path text,
  confirmacao_abastecimento_foto_storage_path text,

  -- Melosa (fluxo 2 etapas)
  melosa_litros_registro numeric(12,3) check (melosa_litros_registro >= 0),
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

-- Idempotência: caso a tabela já exista, garante colunas novas
alter table public.movimentacoes add column if not exists combustivel_tipo text;
alter table public.movimentacoes add column if not exists nota_numero text;
alter table public.movimentacoes add column if not exists placa_caminhao text;
alter table public.movimentacoes add column if not exists valor_unitario numeric(12,3);
alter table public.movimentacoes add column if not exists nota_storage_path text;
alter table public.movimentacoes add column if not exists lacre_tanque_numero text;
alter table public.movimentacoes add column if not exists lacre_tanque_storage_path text;
alter table public.movimentacoes add column if not exists lacre_melosa_numero text;
alter table public.movimentacoes add column if not exists lacre_melosa_storage_path text;
alter table public.movimentacoes add column if not exists medidor_tanque_numero_inicial text;
alter table public.movimentacoes add column if not exists medidor_tanque_foto_inicial_storage_path text;
alter table public.movimentacoes add column if not exists medidor_tanque_numero_final text;
alter table public.movimentacoes add column if not exists medidor_tanque_foto_final_storage_path text;
alter table public.movimentacoes add column if not exists confirmacao_abastecimento_foto_storage_path text;
alter table public.movimentacoes add column if not exists melosa_litros_registro numeric(12,3);
alter table public.movimentacoes add column if not exists melosa_combustivel_tipo_registro text;
alter table public.movimentacoes add column if not exists melosa_comprovante_storage_path text;
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
alter table public.movimentacoes add column if not exists melosa_combustivel_tipo_retirada text;
alter table public.movimentacoes add column if not exists melosa_tanque_storage_path text;
alter table public.movimentacoes add column if not exists placa_texto text;
alter table public.movimentacoes add column if not exists fornecedor_texto text;
alter table public.movimentacoes add column if not exists tanque_numero smallint;

alter table public.movimentacoes drop constraint if exists movimentacoes_tanque_numero_check;
alter table public.movimentacoes
  add constraint movimentacoes_tanque_numero_check
  check (tanque_numero is null or tanque_numero in (1, 2));

create index if not exists movimentacoes_usuario_id_idx on public.movimentacoes(usuario_id);
create index if not exists movimentacoes_obra_codigo_data_idx on public.movimentacoes(obra_codigo, data_hora desc);

-- Perfis (cadastro + papel admin/user; substitui user_roles)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  cpf text not null unique,
  address text not null,
  phone text not null,
  email text,
  cnh_storage_path text,
  role text not null default 'user' check (role in ('admin', 'user')),
  active boolean not null default false,
  is_melosa boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists role text;
update public.profiles set role = 'user' where role is null;
alter table public.profiles alter column role set default 'user';
do $$
begin
  alter table public.profiles alter column role set not null;
exception
  when others then null;
end $$;

alter table public.profiles add column if not exists active boolean;
update public.profiles set active = false where active is null;
alter table public.profiles alter column active set default false;
do $$
begin
  alter table public.profiles alter column active set not null;
exception
  when others then null;
end $$;

alter table public.profiles add column if not exists is_melosa boolean;
update public.profiles set is_melosa = false where is_melosa is null;
alter table public.profiles alter column is_melosa set default false;
do $$
begin
  alter table public.profiles alter column is_melosa set not null;
exception
  when others then null;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user'));

do $$
begin
  alter table public.profiles alter column cnh_storage_path drop not null;
exception
  when others then null;
end $$;

-- Migra papel antigo de user_roles -> profiles (antes de dropar a tabela)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_roles')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    update public.profiles p set role = r.role from public.user_roles r where p.user_id = r.user_id;
  end if;
end $$;

-- Remove user_roles (políticas somem em cascade)
drop table if exists public.user_roles cascade;

-- Evita recursão na RLS de profiles ao checar admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to anon;

-- Atualiza updated_at automaticamente
create or replace function public.profiles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.profiles_set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid() and role = 'user');

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (
  (user_id = auth.uid() and role = 'user')
  or public.is_admin()
);

-- RLS
alter table public.obras enable row level security;
alter table public.movimentacoes enable row level security;

drop policy if exists obras_select_authenticated on public.obras;
create policy obras_select_authenticated
on public.obras
for select
to authenticated
using (true);

drop policy if exists movimentacoes_insert_own on public.movimentacoes;
create policy movimentacoes_insert_own
on public.movimentacoes
for insert
to authenticated
with check (usuario_id = auth.uid());

drop policy if exists movimentacoes_select_own_or_admin on public.movimentacoes;
create policy movimentacoes_select_own_or_admin
on public.movimentacoes
for select
to authenticated
using (usuario_id = auth.uid() or public.is_admin());

grant select on public.obras to authenticated;
grant select, insert on public.movimentacoes to authenticated;

-- Movimentações da Melosa (fluxo separado)
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
  melosa_categoria text,

  melosa_km_retirada numeric(12,3),
  melosa_combustivel_tipo_retirada text,
  melosa_tanque_storage_path text,

  ativo_melosa_texto text,
  ativo_equipamento_texto text,
  tanque_numero smallint,
  local_latitude double precision,
  local_longitude double precision,
  local_address text,

  obs text,
  created_at timestamptz not null default now()
);

alter table public.melosa_movimentacoes add column if not exists ativo_melosa_texto text;
alter table public.melosa_movimentacoes add column if not exists ativo_equipamento_texto text;
alter table public.melosa_movimentacoes add column if not exists tanque_numero smallint;

alter table public.melosa_movimentacoes drop constraint if exists melosa_movimentacoes_tanque_numero_check;
alter table public.melosa_movimentacoes
  add constraint melosa_movimentacoes_tanque_numero_check
  check (tanque_numero is null or tanque_numero in (1, 2));

alter table public.melosa_movimentacoes add column if not exists melosa_km_registro numeric(12,3);
alter table public.melosa_movimentacoes add column if not exists melosa_km_retirada numeric(12,3);
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_inicial_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_inicial_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_horimetro_equipamento_abastecido_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_horimetro_equipamento_abastecido_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_motorista_equipamento_abastecido text;
alter table public.melosa_movimentacoes add column if not exists melosa_equipamento_operador_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_lacre_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_lacre_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_final_numero text;
alter table public.melosa_movimentacoes add column if not exists melosa_medidor_acumulado_final_storage_path text;
alter table public.melosa_movimentacoes add column if not exists melosa_categoria text;

alter table public.melosa_movimentacoes drop constraint if exists melosa_movimentacoes_categoria_check;
alter table public.melosa_movimentacoes
  add constraint melosa_movimentacoes_categoria_check
  check (melosa_categoria is null or melosa_categoria in ('ESTACIONARIA', 'MOVEL'));

alter table public.melosa_movimentacoes enable row level security;

drop policy if exists melosa_movimentacoes_select_own_or_admin on public.melosa_movimentacoes;
create policy melosa_movimentacoes_select_own_or_admin
on public.melosa_movimentacoes
for select
to authenticated
using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists melosa_movimentacoes_insert_own on public.melosa_movimentacoes;
create policy melosa_movimentacoes_insert_own
on public.melosa_movimentacoes
for insert
to authenticated
with check (usuario_id = auth.uid());

create index if not exists melosa_movimentacoes_usuario_id_idx on public.melosa_movimentacoes(usuario_id);
create index if not exists melosa_movimentacoes_obra_codigo_data_idx on public.melosa_movimentacoes(obra_codigo, data_hora desc);

grant select, insert on public.melosa_movimentacoes to authenticated;

grant select, insert, update on public.profiles to authenticated;

-- Buckets de Storage
insert into storage.buckets (id, name, public) values
  ('cnh', 'cnh', false),
  ('notas', 'notas', false),
  ('melosa_comprovantes', 'melosa_comprovantes', false),
  ('melosa_tanques', 'melosa_tanques', false),
  ('melosa_medidor_acumulado', 'melosa_medidor_acumulado', false),
  ('melosa_horimetro_equipamento_abastecido', 'melosa_horimetro_equipamento_abastecido', false),
  ('melosa_equipamento_operador', 'melosa_equipamento_operador', false),
  ('melosa_lacre', 'melosa_lacre', false),
  ('lacre_tanque', 'lacre_tanque', false),
  ('lacre_melosa', 'lacre_melosa', false),
  ('medidor_tanque', 'medidor_tanque', false),
  ('confirmacao_abastecimento', 'confirmacao_abastecimento', false)
on conflict (id) do nothing;

-- Policies de Storage: cada usuário só mexe nos próprios arquivos (prefixo = auth.uid())
drop policy if exists storage_objects_select_own on storage.objects;
create policy storage_objects_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id in ('cnh', 'notas', 'melosa_comprovantes', 'melosa_tanques', 'melosa_medidor_acumulado', 'melosa_horimetro_equipamento_abastecido', 'melosa_equipamento_operador', 'melosa_lacre', 'lacre_tanque', 'lacre_melosa', 'medidor_tanque', 'confirmacao_abastecimento')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_objects_insert_own on storage.objects;
create policy storage_objects_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('cnh', 'notas', 'melosa_comprovantes', 'melosa_tanques', 'melosa_medidor_acumulado', 'melosa_horimetro_equipamento_abastecido', 'melosa_equipamento_operador', 'melosa_lacre', 'lacre_tanque', 'lacre_melosa', 'medidor_tanque', 'confirmacao_abastecimento')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_objects_update_own on storage.objects;
create policy storage_objects_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id in ('cnh', 'notas', 'melosa_comprovantes', 'melosa_tanques', 'melosa_medidor_acumulado', 'melosa_horimetro_equipamento_abastecido', 'melosa_equipamento_operador', 'melosa_lacre', 'lacre_tanque', 'lacre_melosa', 'medidor_tanque', 'confirmacao_abastecimento')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('cnh', 'notas', 'melosa_comprovantes', 'melosa_tanques', 'melosa_medidor_acumulado', 'melosa_horimetro_equipamento_abastecido', 'melosa_equipamento_operador', 'melosa_lacre', 'lacre_tanque', 'lacre_melosa', 'medidor_tanque', 'confirmacao_abastecimento')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_objects_delete_own on storage.objects;
create policy storage_objects_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('cnh', 'notas', 'melosa_comprovantes', 'melosa_tanques', 'melosa_medidor_acumulado', 'melosa_horimetro_equipamento_abastecido', 'melosa_equipamento_operador', 'melosa_lacre', 'lacre_tanque', 'lacre_melosa', 'medidor_tanque', 'confirmacao_abastecimento')
  and (storage.foldername(name))[1] = auth.uid()::text
);

