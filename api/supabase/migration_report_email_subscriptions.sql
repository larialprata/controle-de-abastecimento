-- Assinaturas de relatório diário por e-mail (obras específicas).
create table if not exists public.report_email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text null,
  obra_codigos int[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_email_subscriptions_email_check check (position('@' in email) > 1)
);

create unique index if not exists report_email_subscriptions_email_uidx
  on public.report_email_subscriptions (lower(email));

create index if not exists report_email_subscriptions_ativo_idx
  on public.report_email_subscriptions (ativo)
  where ativo = true;

alter table public.report_email_subscriptions enable row level security;

drop policy if exists report_email_subscriptions_admin_all on public.report_email_subscriptions;
create policy report_email_subscriptions_admin_all on public.report_email_subscriptions
  for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.report_email_subscriptions is
  'E-mails que recebem o relatório diário resumido das obras indicadas em obra_codigos.';
