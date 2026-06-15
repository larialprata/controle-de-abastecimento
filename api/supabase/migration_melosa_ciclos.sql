-- Ciclos de abastecimento da melosa (cada RETIRADA_TANQUE abre um ciclo com ID global)
-- Execute no SQL Editor do Supabase.

-- Capacidade máxima da melosa (litros)
alter table public.equipamentos
  add column if not exists capacidade_litros numeric(12, 3) check (capacidade_litros is null or capacidade_litros > 0);

comment on column public.equipamentos.capacidade_litros is
  'Capacidade máxima em litros (principalmente para melosas).';

-- ID global sequencial dos ciclos (independente do ativo)
create sequence if not exists public.melosa_ciclo_numero_seq start with 1 increment by 1;

create table if not exists public.melosa_ciclos (
  id uuid primary key default gen_random_uuid(),
  ciclo_numero int not null unique default nextval('public.melosa_ciclo_numero_seq'),
  ativo_melosa_texto text not null,
  obra_codigo int references public.obras (codigo),
  retirada_operation_id uuid not null unique,
  ciclo_anterior_id uuid references public.melosa_ciclos (id),
  ciclo_anterior_numero int,
  data_hora timestamptz not null default now(),
  litros_retirada numeric(12, 3) not null check (litros_retirada >= 0),
  litros_sobra_anterior numeric(12, 3) not null default 0,
  litros_abastecidos numeric(12, 3) not null default 0,
  litros_devolvidos numeric(12, 3) not null default 0,
  capacidade_litros numeric(12, 3),
  volume_excedente numeric(12, 3) not null default 0,
  status text not null default 'ok' check (status in ('ok', 'suspeito')),
  created_at timestamptz not null default now()
);

create index if not exists melosa_ciclos_ativo_idx on public.melosa_ciclos (ativo_melosa_texto, data_hora desc);
create index if not exists melosa_ciclos_status_idx on public.melosa_ciclos (status) where status = 'suspeito';

alter table public.movimentacoes
  add column if not exists ciclo_id uuid references public.melosa_ciclos (id);

alter table public.melosa_movimentacoes
  add column if not exists ciclo_id uuid references public.melosa_ciclos (id);

create index if not exists movimentacoes_ciclo_id_idx on public.movimentacoes (ciclo_id);
create index if not exists melosa_movimentacoes_ciclo_id_idx on public.melosa_movimentacoes (ciclo_id);

create or replace function public.next_melosa_ciclo_numero()
returns int
language sql
security definer
set search_path = public
as $$
  select nextval('public.melosa_ciclo_numero_seq')::int;
$$;

comment on table public.melosa_ciclos is
  'Um ciclo = uma RETIRADA_TANQUE (enchimento da melosa). ID global (ciclo_numero); ciclo_anterior_numero = último ID da mesma melosa.';
