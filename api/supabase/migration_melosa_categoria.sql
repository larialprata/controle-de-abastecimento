-- Categoria da melosa: estacionária ou móvel
alter table public.melosa_movimentacoes add column if not exists melosa_categoria text;

alter table public.melosa_movimentacoes drop constraint if exists melosa_movimentacoes_categoria_check;
alter table public.melosa_movimentacoes
  add constraint melosa_movimentacoes_categoria_check
  check (melosa_categoria is null or melosa_categoria in ('ESTACIONARIA', 'MOVEL'));

alter table public.movimentacoes add column if not exists melosa_categoria text;
