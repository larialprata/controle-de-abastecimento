-- Migração: placa (substitui uso de ativo_texto), fornecedor, tanque 1 ou 2
-- Execute no Supabase SQL Editor (uma vez).

-- public.movimentacoes
alter table public.movimentacoes add column if not exists placa_texto text;
alter table public.movimentacoes add column if not exists fornecedor_texto text;
alter table public.movimentacoes add column if not exists tanque_numero smallint;

alter table public.movimentacoes drop constraint if exists movimentacoes_tanque_numero_check;
alter table public.movimentacoes
  add constraint movimentacoes_tanque_numero_check
  check (tanque_numero is null or tanque_numero in (1, 2));

update public.movimentacoes
set placa_texto = trim(ativo_texto)
where (placa_texto is null or btrim(placa_texto) = '')
  and ativo_texto is not null
  and btrim(ativo_texto) <> '';

update public.movimentacoes
set placa_texto = trim(placa_caminhao)
where (placa_texto is null or btrim(placa_texto) = '')
  and placa_caminhao is not null
  and btrim(placa_caminhao) <> '';

-- public.melosa_movimentacoes
alter table public.melosa_movimentacoes add column if not exists placa_texto text;
alter table public.melosa_movimentacoes add column if not exists fornecedor_texto text;
alter table public.melosa_movimentacoes add column if not exists tanque_numero smallint;

alter table public.melosa_movimentacoes drop constraint if exists melosa_movimentacoes_tanque_numero_check;
alter table public.melosa_movimentacoes
  add constraint melosa_movimentacoes_tanque_numero_check
  check (tanque_numero is null or tanque_numero in (1, 2));

update public.melosa_movimentacoes
set placa_texto = trim(ativo_texto)
where (placa_texto is null or btrim(placa_texto) = '')
  and ativo_texto is not null
  and btrim(ativo_texto) <> '';
