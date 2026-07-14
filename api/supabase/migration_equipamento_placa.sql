-- Placa do veículo/máquina associada ao patrimônio (ativo).
-- Execute no SQL Editor do Supabase (uma vez).
-- Ex.: ativo REVTR02 → placa KVW2O9X

alter table public.equipamentos
  add column if not exists placa text null;

comment on column public.equipamentos.placa is
  'Placa do veículo associada ao patrimônio; aplicável a equipamentos (tipo EQUIPAMENTO).';

-- Uma placa só pode estar em um equipamento (quando preenchida)
create unique index if not exists equipamentos_placa_unique_idx
  on public.equipamentos (upper(trim(placa)))
  where placa is not null and trim(placa) <> '';
