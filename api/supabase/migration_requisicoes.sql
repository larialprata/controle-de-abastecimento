-- Página web "Requisições" + tabela de pedidos de confirmação
-- Execute no SQL Editor do Supabase.

-- 1) Permissão de página
alter table public.profiles drop constraint if exists profiles_web_permissions_check;

alter table public.profiles
  add constraint profiles_web_permissions_check
  check (
    web_permissions <@ array[
      'dashboard', 'contratos', 'melosas', 'equipamentos', 'tanques',
      'bi_tanque', 'bi_melosa', 'consumo_medio', 'requisicoes'
    ]::text[]
    and 'dashboard' = any (web_permissions)
  );

-- Utilizadores web/both passam a ver a página
update public.profiles
set web_permissions = (
  select array_agg(distinct x order by x)
  from unnest(web_permissions || array['requisicoes']::text[]) as x
)
where access_platform in ('web', 'both')
  and not ('requisicoes' = any (web_permissions));

-- 2) Tabela de requisições
create table if not exists public.requisicoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  solicitante_user_id uuid not null references auth.users (id) on delete cascade,
  solicitante_email text,

  tipo text not null
    check (tipo in (
      'saida_melosa',
      'corrigir_movimentacao',
      'alterar_cadastro',
      'modificacao_app',
      'conserto_app',
      'outro'
    )),
  acao text not null
    check (acao in ('adicionar', 'editar')),

  titulo text not null,
  descricao text not null,

  obra_codigo integer references public.obras (codigo) on delete set null,
  obra_nome text,

  -- Campos extras (ativo, litros, data, erro do app, etc.)
  detalhes jsonb not null default '{}'::jsonb,

  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'recusada')),

  resolvido_por uuid references auth.users (id) on delete set null,
  resolvido_em timestamptz,
  comentario_admin text
);

create index if not exists requisicoes_status_idx on public.requisicoes (status);
create index if not exists requisicoes_obra_idx on public.requisicoes (obra_codigo);
create index if not exists requisicoes_solicitante_idx on public.requisicoes (solicitante_user_id);
create index if not exists requisicoes_created_idx on public.requisicoes (created_at desc);

alter table public.requisicoes enable row level security;

-- API usa service role; policies básicas para segurança se alguém aceder via anon
drop policy if exists "requisicoes_select_own_or_admin" on public.requisicoes;
create policy "requisicoes_select_own_or_admin"
  on public.requisicoes for select
  using (
    solicitante_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "requisicoes_insert_own" on public.requisicoes;
create policy "requisicoes_insert_own"
  on public.requisicoes for insert
  with check (solicitante_user_id = auth.uid());
