-- Páginas do painel web que cada Utilizador Web pode ver.
alter table public.profiles add column if not exists web_permissions text[] not null default array['dashboard']::text[];

update public.profiles
set web_permissions = array['dashboard', 'contratos', 'equipamentos', 'bi_tanque', 'bi_melosa']::text[]
where role = 'user'
  and access_platform = 'web'
  and web_permissions = array['dashboard']::text[];

alter table public.profiles drop constraint if exists profiles_web_permissions_check;
alter table public.profiles
  add constraint profiles_web_permissions_check
  check (
    web_permissions <@ array['dashboard', 'contratos', 'equipamentos', 'bi_tanque', 'bi_melosa']::text[]
    and 'dashboard' = any (web_permissions)
  );
