-- Permissões granulares de escrita nos BIs (adicionar / editar / excluir).
-- Também garante a tabela de auditoria de movimentações.
--
-- Ordem importante: remover o CHECK antigo ANTES de gravar as novas chaves.

alter table public.profiles
  add column if not exists web_write_permissions text[] not null default array[]::text[];

alter table public.profiles
  drop constraint if exists profiles_web_write_permissions_check;

-- Expande chaves legadas tudo-ou-nada para as 3 ações (e remove as legadas).
update public.profiles p
set web_write_permissions = (
  select coalesce(array_agg(distinct v), array[]::text[])
  from (
    select unnest(
      case x
        when 'bi_tanque' then array['bi_tanque_add', 'bi_tanque_edit', 'bi_tanque_delete']
        when 'bi_melosa' then array['bi_melosa_add', 'bi_melosa_edit', 'bi_melosa_delete']
        else array[x]
      end
    ) as v
    from unnest(p.web_write_permissions) as x
  ) q
  where v is not null
);

alter table public.profiles
  add constraint profiles_web_write_permissions_check
  check (
    web_write_permissions <@ array[
      'contratos',
      'melosas',
      'equipamentos',
      'tanques',
      'bi_tanque_add',
      'bi_tanque_edit',
      'bi_tanque_delete',
      'bi_melosa_add',
      'bi_melosa_edit',
      'bi_melosa_delete'
    ]::text[]
  );

comment on column public.profiles.web_write_permissions is
  'Escrita no painel: cadastros (página) e BIs (ações bi_*_add|edit|delete).';

create table if not exists public.movimentacao_audit (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('melosa', 'tanque')),
  action text not null check (action in ('insert', 'update', 'delete')),
  operation_id uuid not null,
  obra_codigo int null,
  actor_user_id uuid null,
  before jsonb null,
  after jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists movimentacao_audit_created_at_idx
  on public.movimentacao_audit (created_at desc);

create index if not exists movimentacao_audit_operation_id_idx
  on public.movimentacao_audit (operation_id);

create index if not exists movimentacao_audit_entity_idx
  on public.movimentacao_audit (entity);

create index if not exists movimentacao_audit_actor_idx
  on public.movimentacao_audit (actor_user_id);

create index if not exists movimentacao_audit_obra_idx
  on public.movimentacao_audit (obra_codigo);

alter table public.movimentacao_audit enable row level security;

drop policy if exists movimentacao_audit_admin_select on public.movimentacao_audit;
create policy movimentacao_audit_admin_select on public.movimentacao_audit
  for select
  using (public.is_admin());

comment on table public.movimentacao_audit is
  'Trilha de auditoria de insert/update/delete em melosa_movimentacoes e movimentacoes (tanque).';
