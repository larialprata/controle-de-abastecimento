-- Correção rápida: coluna exigida pelo app mobile na sincronização melosa.
-- Execute no SQL Editor do Supabase se aparecer:
-- "Could not find the 'ativo_equipamento_empresa' column of 'melosa_movimentacoes'"

alter table public.melosa_movimentacoes
  add column if not exists ativo_equipamento_empresa text null;

comment on column public.melosa_movimentacoes.ativo_equipamento_empresa is
  'Empresa do equipamento abastecido (DIMENSIONAL ou TERCEIRIZADO).';
