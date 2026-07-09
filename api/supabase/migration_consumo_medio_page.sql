-- Página web "Consumo médio" — permissão consumo_medio
-- Execute no SQL Editor do Supabase.

alter table public.profiles drop constraint if exists profiles_web_permissions_check;

alter table public.profiles
  add constraint profiles_web_permissions_check
  check (
    web_permissions <@ array[
      'dashboard', 'contratos', 'melosas', 'equipamentos', 'tanques',
      'bi_tanque', 'bi_melosa', 'consumo_medio'
    ]::text[]
    and 'dashboard' = any (web_permissions)
  );

-- Quem já acessa BI Melosa recebe também Consumo médio
update public.profiles
set web_permissions = (
  select array_agg(distinct x order by x)
  from unnest(web_permissions || array['consumo_medio']::text[]) as x
)
where 'bi_melosa' = any (web_permissions)
  and not ('consumo_medio' = any (web_permissions));
