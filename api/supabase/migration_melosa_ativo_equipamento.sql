-- Melosa: patrimônio do equipamento → ativo_equipamento_texto;
-- placa_texto → ativo_melosa_texto (identificação da melosa).
-- Idempotente: só renomeia se a coluna antiga ainda existir.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'melosa_movimentacoes'
      and column_name = 'placa_texto'
  ) then
    alter table public.melosa_movimentacoes rename column placa_texto to ativo_melosa_texto;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'melosa_movimentacoes'
      and column_name = 'fornecedor_texto'
  ) then
    alter table public.melosa_movimentacoes rename column fornecedor_texto to ativo_equipamento_texto;
  end if;
end $$;

comment on column public.melosa_movimentacoes.ativo_melosa_texto is
  'Identificação da unidade melosa (ex.: placa do caminhão-melosa).';
comment on column public.melosa_movimentacoes.ativo_equipamento_texto is
  'Ativo/patrimônio do equipamento abastecido pela melosa.';
