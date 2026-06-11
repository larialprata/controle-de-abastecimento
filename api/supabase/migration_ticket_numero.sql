-- Número permanente de ticket (sequencial, único entre tanque e melosa)
-- Execute no SQL Editor do Supabase.

create sequence if not exists public.ticket_numero_seq start with 1 increment by 1;

alter table public.movimentacoes
  add column if not exists ticket_numero int;

alter table public.melosa_movimentacoes
  add column if not exists ticket_numero int;

create unique index if not exists movimentacoes_ticket_numero_uidx
  on public.movimentacoes (ticket_numero)
  where ticket_numero is not null;

create unique index if not exists melosa_movimentacoes_ticket_numero_uidx
  on public.melosa_movimentacoes (ticket_numero)
  where ticket_numero is not null;

create or replace function public.next_ticket_numero()
returns int
language sql
volatile
as $$
  select nextval('public.ticket_numero_seq')::int;
$$;

comment on column public.movimentacoes.ticket_numero is
  'Número permanente do ticket de abastecimento (atribuído na primeira emissão).';
comment on column public.melosa_movimentacoes.ticket_numero is
  'Número permanente do ticket de abastecimento (atribuído na primeira emissão).';
