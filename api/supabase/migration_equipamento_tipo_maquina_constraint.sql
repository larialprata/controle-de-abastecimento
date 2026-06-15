-- Constraint após o valor EQUIPAMENTO existir no enum equipamento_tipo.
-- Rode só depois de migration_equipamento_tipo_maquina.sql (em transação separada).

alter table public.equipamentos drop constraint if exists equipamentos_obra_tanque_chk;

alter table public.equipamentos
  add constraint equipamentos_obra_tanque_chk
  check (
    (tipo = 'MELOSA' and obra_codigo is null)
    or tipo in ('TANQUE', 'EQUIPAMENTO')
  );

comment on column public.equipamentos.tipo is 'MELOSA, TANQUE ou EQUIPAMENTO (máquina abastecida)';
