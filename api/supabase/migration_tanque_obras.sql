-- Vínculo tanque (equipamentos.ativo) ↔ várias obras. Saldo permanece na linha única do tanque.
create table if not exists public.tanque_obras (
  ativo text not null references public.equipamentos (ativo) on delete cascade,
  obra_codigo int not null references public.obras (codigo) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ativo, obra_codigo)
);

create index if not exists tanque_obras_obra_codigo_idx on public.tanque_obras (obra_codigo);

comment on table public.tanque_obras is
  'Obras em que o tanque pode ser usado. O cadastro (capacidade/saldo) fica em equipamentos.';

-- Seed a partir da obra principal já cadastrada
insert into public.tanque_obras (ativo, obra_codigo)
select e.ativo, e.obra_codigo
from public.equipamentos e
where e.tipo = 'TANQUE'
  and e.obra_codigo is not null
on conflict do nothing;

alter table public.tanque_obras enable row level security;

drop policy if exists tanque_obras_select_authenticated on public.tanque_obras;
create policy tanque_obras_select_authenticated on public.tanque_obras
  for select to authenticated
  using (true);

drop policy if exists tanque_obras_admin_write on public.tanque_obras;
create policy tanque_obras_admin_write on public.tanque_obras
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists tanque_obras_service_role on public.tanque_obras;
create policy tanque_obras_service_role on public.tanque_obras
  for all to service_role
  using (true)
  with check (true);
