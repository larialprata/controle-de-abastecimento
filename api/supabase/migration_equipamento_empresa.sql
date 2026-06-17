-- Empresa do equipamento: Dimensional ou Terceirizado (tipo EQUIPAMENTO)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'equipamento_empresa') then
    create type public.equipamento_empresa as enum ('DIMENSIONAL', 'TERCEIRIZADO');
  end if;
end $$;

alter table public.equipamentos
  add column if not exists empresa text null;

comment on column public.equipamentos.empresa is
  'Empresa do equipamento: Dimensional ou Terceirizado; aplicável somente a equipamentos (tipo EQUIPAMENTO).';

-- Se a coluna ainda for enum legado, execute migration_equipamento_empresa_text.sql
