-- Cadastro de tanques por obra (número + descrição) e permissão web "tanques"
-- Execute no Supabase SQL Editor (uma vez).

-- Número do tanque dentro da obra (tipo TANQUE)
alter table public.equipamentos add column if not exists tanque_numero smallint;

comment on column public.equipamentos.tanque_numero is
  'Número do tanque na obra; obrigatório quando tipo = TANQUE.';

-- Tanque exige obra; melosa não pode ter obra
alter table public.equipamentos drop constraint if exists equipamentos_obra_tanque_chk;
alter table public.equipamentos
  add constraint equipamentos_obra_tanque_chk check (
    (tipo = 'MELOSA' and obra_codigo is null)
    or (tipo = 'TANQUE' and obra_codigo is not null and tanque_numero is not null and tanque_numero > 0)
    or (tipo = 'EQUIPAMENTO')
  );

-- Um número de tanque por obra
create unique index if not exists equipamentos_obra_tanque_numero_unique
  on public.equipamentos (obra_codigo, tanque_numero)
  where tipo = 'TANQUE' and obra_codigo is not null and tanque_numero is not null;

-- Movimentações: aceitar qualquer tanque cadastrado (não só 1 e 2)
alter table public.movimentacoes drop constraint if exists movimentacoes_tanque_numero_check;
alter table public.movimentacoes
  add constraint movimentacoes_tanque_numero_check
  check (tanque_numero is null or tanque_numero > 0);

alter table public.melosa_movimentacoes drop constraint if exists melosa_movimentacoes_tanque_numero_check;
alter table public.melosa_movimentacoes
  add constraint melosa_movimentacoes_tanque_numero_check
  check (tanque_numero is null or tanque_numero > 0);

-- Permissões web: página Tanques
alter table public.profiles drop constraint if exists profiles_web_permissions_check;
alter table public.profiles
  add constraint profiles_web_permissions_check
  check (
    web_permissions <@ array[
      'dashboard', 'contratos', 'melosas', 'equipamentos', 'tanques', 'bi_tanque', 'bi_melosa'
    ]::text[]
    and 'dashboard' = any (web_permissions)
  );

alter table public.profiles drop constraint if exists profiles_web_write_permissions_check;
alter table public.profiles
  add constraint profiles_web_write_permissions_check
  check (
    web_write_permissions <@ array['contratos', 'melosas', 'equipamentos', 'tanques']::text[]
  );

-- Admins e quem já edita equipamentos ganham acesso à página Tanques
update public.profiles
set web_permissions = (
  select array_agg(distinct x order by x)
  from unnest(web_permissions || array['tanques']::text[]) as x
)
where role = 'admin'
   or 'equipamentos' = any (web_permissions);

update public.profiles
set web_write_permissions = (
  select array_agg(distinct x order by x)
  from unnest(web_write_permissions || array['tanques']::text[]) as x
)
where role = 'admin'
   or 'equipamentos' = any (web_write_permissions);
