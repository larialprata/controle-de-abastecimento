-- Catálogo de óleos e capacidades (litros).

create table if not exists public.oleos (
  id text primary key,
  nome text not null,
  capacidade_litros numeric(12, 3) not null check (capacidade_litros > 0),
  created_at timestamptz not null default now()
);

comment on table public.oleos is
  'Óleos e fluidos com capacidade total em litros.';

alter table public.oleos enable row level security;

drop policy if exists oleos_select_authenticated on public.oleos;
create policy oleos_select_authenticated
  on public.oleos
  for select
  to authenticated
  using (true);

insert into public.oleos (id, nome, capacidade_litros) values
  ('XP_68', 'XP 68', 200),
  ('15W40', '15W40', 200),
  ('10W30', '10W 30', 50),
  ('ATF', 'ATF', 50),
  ('140_MINERAL', '140 MINERAL', 50),
  ('ARLA_32', 'ARLA 32', 50)
on conflict (id) do update set
  nome = excluded.nome,
  capacidade_litros = excluded.capacidade_litros;
