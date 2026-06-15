-- Mobilidade do equipamento (estacionário ou móvel) — apenas tipo EQUIPAMENTO

do $$
begin
  if not exists (select 1 from pg_type where typname = 'equipamento_mobilidade') then
    create type public.equipamento_mobilidade as enum ('ESTACIONARIO', 'MOVEL');
  end if;
end $$;

alter table public.equipamentos
  add column if not exists mobilidade public.equipamento_mobilidade null;

comment on column public.equipamentos.mobilidade is
  'Estacionário ou móvel; aplicável somente a equipamentos (tipo EQUIPAMENTO).';
