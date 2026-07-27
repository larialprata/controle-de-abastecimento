-- Flag no perfil: recebe relatório diário por e-mail das obras vinculadas.
alter table public.profiles
  add column if not exists recebe_relatorio_email boolean;

update public.profiles
set recebe_relatorio_email = false
where recebe_relatorio_email is null;

alter table public.profiles
  alter column recebe_relatorio_email set default false;

do $$
begin
  alter table public.profiles alter column recebe_relatorio_email set not null;
exception
  when others then null;
end $$;

comment on column public.profiles.recebe_relatorio_email is
  'Se true, envia relatório diário para o e-mail do utilizador (obras em profile_obras; vazio = todas).';
