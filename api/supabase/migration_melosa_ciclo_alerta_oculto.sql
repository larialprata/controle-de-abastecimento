-- Permite ocultar alertas de capacidade no dashboard sem excluir o ciclo.
alter table public.melosa_ciclos
  add column if not exists alerta_oculto boolean not null default false;

create index if not exists melosa_ciclos_alerta_oculto_idx
  on public.melosa_ciclos (alerta_oculto)
  where alerta_oculto = true;

comment on column public.melosa_ciclos.alerta_oculto is
  'Quando true, o alerta de capacidade não aparece na seção Alertas do dashboard.';
