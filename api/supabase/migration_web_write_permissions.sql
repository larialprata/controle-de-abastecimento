-- Permissões de escrita no painel web (adicionar/editar/excluir por página de cadastro).
alter table public.profiles
  add column if not exists web_write_permissions text[] not null default array[]::text[];

alter table public.profiles drop constraint if exists profiles_web_write_permissions_check;

alter table public.profiles
  add constraint profiles_web_write_permissions_check
  check (
    web_write_permissions <@ array['contratos', 'melosas', 'equipamentos']::text[]
  );

comment on column public.profiles.web_write_permissions is
  'Páginas de cadastro em que o utilizador web pode criar/editar/excluir (além de ver).';
