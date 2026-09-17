-- Adiciona SPE Igarata Ltda às empresas de obra (contratos).
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'obra_empresa'
      and e.enumlabel = 'SPE_IGARATA'
  ) then
    alter type public.obra_empresa add value 'SPE_IGARATA';
  end if;
end $$;
