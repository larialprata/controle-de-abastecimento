-- Ao excluir um ciclo, zera a referência nos filhos que ainda não foram reencadeados.
-- Execute no SQL Editor do Supabase.

alter table public.melosa_ciclos
  drop constraint if exists melosa_ciclos_ciclo_anterior_id_fkey;

alter table public.melosa_ciclos
  add constraint melosa_ciclos_ciclo_anterior_id_fkey
  foreign key (ciclo_anterior_id)
  references public.melosa_ciclos (id)
  on delete set null;
