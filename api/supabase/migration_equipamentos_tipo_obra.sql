-- Tipos Tanque/Melosa e vínculo opcional de tanque com obra

do $$
begin
  if not exists (select 1 from pg_type where typname = 'equipamento_tipo') then
    create type public.equipamento_tipo as enum ('TANQUE', 'MELOSA');
  end if;
end $$;

alter table public.equipamentos
  add column if not exists tipo public.equipamento_tipo not null default 'MELOSA';

alter table public.equipamentos
  add column if not exists obra_codigo int references public.obras (codigo);

alter table public.equipamentos
  alter column nome drop not null;

update public.equipamentos
set tipo = 'MELOSA'
where tipo is null;

update public.equipamentos
set nome = ativo
where nome is null or trim(nome) = '';

alter table public.equipamentos
  drop constraint if exists equipamentos_obra_tanque_chk;

alter table public.equipamentos
  add constraint equipamentos_obra_tanque_chk
  check (
    (tipo = 'MELOSA' and obra_codigo is null)
    or tipo = 'TANQUE'
  );

comment on column public.equipamentos.tipo is 'TANQUE ou MELOSA';
comment on column public.equipamentos.obra_codigo is 'Obra vinculada (opcional, apenas para tanque)';
comment on column public.equipamentos.nome is 'Descrição opcional; para melosa o ativo é o identificador principal';
