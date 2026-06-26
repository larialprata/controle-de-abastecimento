-- Vínculo utilizador ↔ obra (contrato). Lista vazia = acesso a todas as obras.
create table if not exists public.profile_obras (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  obra_codigo int not null references public.obras (codigo) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, obra_codigo)
);

create index if not exists profile_obras_obra_codigo_idx on public.profile_obras (obra_codigo);

alter table public.profile_obras enable row level security;

drop policy if exists profile_obras_select_own_or_admin on public.profile_obras;
create policy profile_obras_select_own_or_admin on public.profile_obras
  for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists profile_obras_admin_write on public.profile_obras;
create policy profile_obras_admin_write on public.profile_obras
  for all
  using (public.is_admin())
  with check (public.is_admin());
