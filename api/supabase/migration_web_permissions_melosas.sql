-- Permissão da página Melosas na web

alter table public.profiles drop constraint if exists profiles_web_permissions_check;

alter table public.profiles
  add constraint profiles_web_permissions_check
  check (
    web_permissions <@ array['dashboard', 'contratos', 'melosas', 'equipamentos', 'bi_tanque', 'bi_melosa']::text[]
    and 'dashboard' = any (web_permissions)
  );

update public.profiles
set web_permissions = (
  select array_agg(distinct x)
  from unnest(web_permissions || array['melosas']::text[]) as x
)
where 'equipamentos' = any (web_permissions)
  and not ('melosas' = any (web_permissions));
