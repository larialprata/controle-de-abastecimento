-- Auditoria de create/update/delete em movimentações (melosa e tanque).
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
