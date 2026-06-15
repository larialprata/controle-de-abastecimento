-- Continuidade do medidor acumulado da melosa entre abastecimentos de equipamentos.
-- O inicial de cada abastecimento deve ser igual ao final do abastecimento anterior (mesma melosa).

alter table public.melosa_movimentacoes
  add column if not exists medidor_final_anterior numeric(14, 3);

alter table public.melosa_movimentacoes
  add column if not exists medidor_desvio_litros numeric(14, 3);

alter table public.melosa_movimentacoes
  add column if not exists medidor_continuidade_status text;

alter table public.melosa_movimentacoes
  drop constraint if exists melosa_movimentacoes_medidor_continuidade_status_check;

alter table public.melosa_movimentacoes
  add constraint melosa_movimentacoes_medidor_continuidade_status_check
  check (medidor_continuidade_status is null or medidor_continuidade_status in ('ok', 'desvio'));

create index if not exists melosa_movimentacoes_medidor_desvio_idx
  on public.melosa_movimentacoes (medidor_continuidade_status)
  where medidor_continuidade_status = 'desvio';
