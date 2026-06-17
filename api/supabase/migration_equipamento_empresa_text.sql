-- Converte empresa de enum para text (aceita todas as empresas cadastradas no app).
-- Execute no SQL Editor do Supabase (uma vez).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'equipamentos'
      and column_name = 'empresa'
      and udt_name = 'equipamento_empresa'
  ) then
    alter table public.equipamentos
      alter column empresa type text using empresa::text;
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'equipamentos'
      and column_name = 'empresa'
  ) then
    alter table public.equipamentos
      add column empresa text null;
  end if;
end $$;

drop type if exists public.equipamento_empresa;

comment on column public.equipamentos.empresa is
  'Empresa proprietária do equipamento; aplicável somente a equipamentos (tipo EQUIPAMENTO).';
