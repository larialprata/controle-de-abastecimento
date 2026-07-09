alter table public.melosa_ciclos
  drop constraint if exists melosa_ciclos_ciclo_anterior_id_fkey;
0W
alter table public.melosa_ciclos
  add constraint melosa_ciclos_ciclo_anterior_id_fkey
  foreign key (ciclo_anterior_id)
  references public.melosa_ciclos (id)
  on delete set null;
