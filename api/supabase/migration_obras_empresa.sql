-- Vincula cada obra/contrato a Dimensional ou Delurb.
-- Execute no SQL Editor do Supabase.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'obra_empresa') then
    create type public.obra_empresa as enum ('DIMENSIONAL', 'DELURB', 'SPE_IGARATA');
  end if;
end $$;

alter table public.obras
  add column if not exists empresa public.obra_empresa;

comment on column public.obras.empresa is
  'Empresa responsável pelo contrato: Dimensional ou Delurb.';
