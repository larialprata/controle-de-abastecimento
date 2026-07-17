-- Cadastro de empresas proprietárias dos equipamentos (tipo EQUIPAMENTO).
-- Execute no SQL Editor do Supabase (uma vez).
-- Não altera equipamentos.empresa (texto); a API pode passar a validar/listar por esta tabela.

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresas_nome_nao_vazio check (length(trim(nome)) > 0),
  constraint empresas_nome_max check (char_length(nome) <= 100)
);

comment on table public.empresas is
  'Empresas proprietárias cadastradas para equipamentos (tipo EQUIPAMENTO).';
comment on column public.empresas.nome is
  'Nome de exibição da empresa (ex.: Dimensional, Construtora ABC).';
comment on column public.empresas.ativo is
  'Se false, a empresa deixa de aparecer como opção em novos cadastros.';

-- Unicidade case-insensitive (evita "Dimensional" e "dimensional")
create unique index if not exists empresas_nome_unique_ci
  on public.empresas (lower(trim(nome)));

create index if not exists empresas_ativo_nome_idx
  on public.empresas (ativo, nome);

create or replace function public.empresas_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.nome = trim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  return new;
end;
$$;

drop trigger if exists empresas_set_updated_at on public.empresas;
create trigger empresas_set_updated_at
before insert or update on public.empresas
for each row execute procedure public.empresas_set_updated_at();

-- Seed: Dimensional + nomes já usados em equipamentos.empresa
insert into public.empresas (nome)
select s.nome
from (
  select distinct on (lower(trim(e.empresa)))
    trim(regexp_replace(e.empresa, '\s+', ' ', 'g')) as nome
  from public.equipamentos e
  where e.empresa is not null
    and length(trim(e.empresa)) > 0
    and upper(trim(e.empresa)) not in ('TERCEIRIZADO', 'TERCEIRIZADA', 'DIMENSIONAL')
  order by lower(trim(e.empresa)), e.empresa
) s
on conflict ((lower(trim(nome)))) do nothing;

insert into public.empresas (nome)
values ('Dimensional')
on conflict ((lower(trim(nome)))) do nothing;

-- Normaliza legado DIMENSIONAL → Dimensional no texto dos equipamentos
update public.equipamentos
set empresa = 'Dimensional'
where upper(trim(empresa)) = 'DIMENSIONAL';

alter table public.empresas enable row level security;

drop policy if exists empresas_select_authenticated on public.empresas;
create policy empresas_select_authenticated
on public.empresas for select to authenticated using (true);

drop policy if exists empresas_all_service_role on public.empresas;
create policy empresas_all_service_role
on public.empresas for all to service_role using (true) with check (true);
