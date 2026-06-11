-- Plataforma de acesso: app (só mobile), web (só painel), both (admin — app e web).
alter table public.profiles add column if not exists access_platform text;

update public.profiles
set access_platform = 'both'
where access_platform is null and role = 'admin';

update public.profiles
set access_platform = 'app'
where access_platform is null;

alter table public.profiles alter column access_platform set default 'app';

alter table public.profiles drop constraint if exists profiles_access_platform_check;
alter table public.profiles
  add constraint profiles_access_platform_check
  check (access_platform in ('app', 'web', 'both'));

do $$
begin
  alter table public.profiles alter column access_platform set not null;
exception
  when others then null;
end $$;
