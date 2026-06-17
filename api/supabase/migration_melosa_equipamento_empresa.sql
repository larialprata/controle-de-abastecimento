-- Empresa do equipamento abastecido na retirada melosa (Dimensional / Terceirizado).
alter table public.melosa_movimentacoes
  add column if not exists ativo_equipamento_empresa text null;

comment on column public.melosa_movimentacoes.ativo_equipamento_empresa is
  'Empresa do equipamento abastecido (DIMENSIONAL ou TERCEIRIZADO).';
