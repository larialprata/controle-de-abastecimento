-- Resumo e assinaturas na retirada do tanque (última etapa do app, igual à melosa).

alter table public.movimentacoes
  add column if not exists tanque_operador_nome text,
  add column if not exists tanque_assinatura_operador_storage_path text,
  add column if not exists tanque_assinatura_melosa_storage_path text;

comment on column public.movimentacoes.tanque_operador_nome is
  'Nome do operador do tanque no momento do registro (usuário logado).';

comment on column public.movimentacoes.tanque_assinatura_operador_storage_path is
  'Storage path da assinatura do operador do tanque (bucket melosa_assinaturas).';

comment on column public.movimentacoes.tanque_assinatura_melosa_storage_path is
  'Storage path da assinatura do responsável pela melosa (bucket melosa_assinaturas).';
