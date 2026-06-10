-- Recalcula litros a partir dos medidores (aceita registos legados: inicial > final).
-- Só atualiza quando litros está zerado e a diferença é positiva.

update public.melosa_movimentacoes m
set litros = sub.diff
from (
  select
    id,
    abs(
      nullif(replace(replace(trim(melosa_medidor_acumulado_final_numero), ' ', ''), ',', '.'), '')::numeric
      - nullif(replace(replace(trim(melosa_medidor_acumulado_inicial_numero), ' ', ''), ',', '.'), '')::numeric
    ) as diff
  from public.melosa_movimentacoes
  where melosa_medidor_acumulado_inicial_numero is not null
    and melosa_medidor_acumulado_final_numero is not null
    and btrim(melosa_medidor_acumulado_inicial_numero) <> ''
    and btrim(melosa_medidor_acumulado_final_numero) <> ''
) sub
where m.id = sub.id
  and (m.litros is null or m.litros = 0)
  and sub.diff > 0;
