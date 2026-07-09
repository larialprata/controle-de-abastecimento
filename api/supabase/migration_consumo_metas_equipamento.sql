-- Metas de consumo por equipamento (patrimônio)
-- Execute no SQL Editor do Supabase.

create table if not exists public.consumo_metas_equipamento (
  ativo text primary key,
  meta_litros_por_unidade numeric(12, 4) not null check (meta_litros_por_unidade > 0),
  unidade text not null check (unidade in ('h', 'km')),
  origem text not null default 'manual' check (origem in ('manual', 'media')),
  updated_at timestamptz not null default now()
);

create index if not exists consumo_metas_equipamento_updated_idx
  on public.consumo_metas_equipamento (updated_at desc);

alter table public.consumo_metas_equipamento enable row level security;

drop policy if exists consumo_metas_equipamento_select_authenticated on public.consumo_metas_equipamento;
create policy consumo_metas_equipamento_select_authenticated
on public.consumo_metas_equipamento for select to authenticated using (true);

drop policy if exists consumo_metas_equipamento_all_service_role on public.consumo_metas_equipamento;
create policy consumo_metas_equipamento_all_service_role
on public.consumo_metas_equipamento for all to service_role using (true) with check (true);
