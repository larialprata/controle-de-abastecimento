-- Metas de consumo médio por mobilidade e unidade (L/h ou L/km)
-- Execute no SQL Editor do Supabase.

create table if not exists public.consumo_metas (
  id uuid primary key default gen_random_uuid(),
  mobilidade public.equipamento_mobilidade,
  unidade text not null check (unidade in ('h', 'km')),
  meta_litros_por_unidade numeric(12, 4) not null check (meta_litros_por_unidade > 0),
  label text,
  updated_at timestamptz not null default now(),
  unique (mobilidade, unidade)
);

-- Metas padrão (mobilidade null = fallback geral)
insert into public.consumo_metas (mobilidade, unidade, meta_litros_por_unidade, label)
values
  (null, 'h', 3.0, 'Padrão estacionário (L/h)'),
  (null, 'km', 0.5, 'Padrão móvel (L/km)'),
  ('ESTACIONARIO', 'h', 2.5, 'Estacionário (L/h)'),
  ('MOVEL', 'km', 0.35, 'Móvel (L/km)')
on conflict (mobilidade, unidade) do nothing;

alter table public.consumo_metas enable row level security;

drop policy if exists consumo_metas_select_authenticated on public.consumo_metas;
create policy consumo_metas_select_authenticated
on public.consumo_metas for select to authenticated using (true);

drop policy if exists consumo_metas_all_service_role on public.consumo_metas;
create policy consumo_metas_all_service_role
on public.consumo_metas for all to service_role using (true) with check (true);
