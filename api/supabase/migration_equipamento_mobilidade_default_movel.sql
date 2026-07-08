-- Padrão de mobilidade = MÓVEL.
-- Todo equipamento passa a ser móvel por padrão; só é estacionário quando definido explicitamente.
-- Backfill: como todos os registros até agora são móveis, ajusta tudo para MOVEL.

alter table public.equipamentos
  alter column mobilidade set default 'MOVEL'::public.equipamento_mobilidade;

-- Ajusta todos os equipamentos existentes para móvel
-- (inclui geradores que a heurística antiga marcava como estacionário).
update public.equipamentos
set mobilidade = 'MOVEL'::public.equipamento_mobilidade
where tipo = 'EQUIPAMENTO'
  and (mobilidade is null or mobilidade <> 'MOVEL');

comment on column public.equipamentos.mobilidade is
  'Estacionário ou móvel; aplicável somente a equipamentos (tipo EQUIPAMENTO). Padrão: MOVEL.';
