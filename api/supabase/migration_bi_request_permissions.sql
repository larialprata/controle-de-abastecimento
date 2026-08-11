-- Permite configurar quais utilizadores podem solicitar alterações nos BIs.
-- As alterações de movimentações continuam bloqueadas para não-admin na API:
-- o formulário gera uma requisição pendente para aprovação.

alter table public.profiles
  add column if not exists web_write_permissions text[] not null default array[]::text[];

alter table public.profiles
  drop constraint if exists profiles_web_write_permissions_check;

alter table public.profiles
  add constraint profiles_web_write_permissions_check
  check (
    web_write_permissions <@ array[
      'contratos',
      'melosas',
      'equipamentos',
      'tanques',
      'bi_tanque',
      'bi_melosa'
    ]::text[]
  );

comment on column public.profiles.web_write_permissions is
  'Páginas em que o utilizador web pode alterar ou solicitar alteração; BIs sempre geram requisição.';
