-- Remove horímetro e colunas legadas (ativo / equipamento) já substituídas por placa, fornecedor, tanque.
-- Execute uma vez no Supabase SQL Editor, depois do deploy da API/app (que deixam de enviar estes campos).

-- public.movimentacoes
alter table public.movimentacoes drop column if exists melosa_horimetro_registro;
alter table public.movimentacoes drop column if exists melosa_horimetro_retirada;
alter table public.movimentacoes drop column if exists ativo_texto;
alter table public.movimentacoes drop column if exists equipamento_nome;

-- public.melosa_movimentacoes
alter table public.melosa_movimentacoes drop column if exists melosa_horimetro_registro;
alter table public.melosa_movimentacoes drop column if exists melosa_horimetro_retirada;
alter table public.melosa_movimentacoes drop column if exists ativo_texto;
alter table public.melosa_movimentacoes drop column if exists equipamento_nome;
