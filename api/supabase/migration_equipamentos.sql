-- Cadastro de equipamentos (ativo / patrimônio + nome)
-- Execute no SQL Editor do Supabase.

create table if not exists public.equipamentos (
  ativo text primary key,
  nome text not null
);

comment on table public.equipamentos is
  'Equipamentos abastecidos pela melosa (ativo/patrimônio e descrição).';
comment on column public.equipamentos.ativo is
  'Patrimônio ou identificação do equipamento (usado no app como Ativo do Equipamento).';
