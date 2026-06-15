-- Tipo EQUIPAMENTO (máquinas/equipamentos abastecidos pela melosa)
-- IMPORTANTE: execute este arquivo sozinho e confirme (commit) antes da migration
-- migration_equipamento_tipo_maquina_constraint.sql

do $$
begin
  alter type public.equipamento_tipo add value 'EQUIPAMENTO';
exception
  when duplicate_object then null;
end $$;
