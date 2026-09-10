-- Obra Usina + encerrante (inicial/final) na retirada melosa
-- + seed melosas CCL0964/CCL1564 e Tanque Usina

alter table public.melosa_movimentacoes
  add column if not exists melosa_encerrante_inicial_numero text,
  add column if not exists melosa_encerrante_final_numero text;

alter table public.movimentacoes
  add column if not exists melosa_encerrante_inicial_numero text,
  add column if not exists melosa_encerrante_final_numero text;

comment on column public.melosa_movimentacoes.melosa_encerrante_inicial_numero is
  'Encerrante inicial (obra Usina / 9020).';
comment on column public.melosa_movimentacoes.melosa_encerrante_final_numero is
  'Encerrante final (obra Usina / 9020).';

insert into public.obras (codigo, nome) values (9020, 'Usina')
on conflict (codigo) do update set nome = excluded.nome;

insert into public.equipamentos (ativo, nome, tipo, capacidade_litros)
values
  ('CCL0964', 'CCL 0964', 'MELOSA', 2000),
  ('CCL1564', 'CCL 1564', 'MELOSA', 4000)
on conflict (ativo) do update
set nome = excluded.nome,
    tipo = 'MELOSA',
    capacidade_litros = excluded.capacidade_litros,
    obra_codigo = null,
    tanque_numero = null;

insert into public.equipamentos (
  ativo, nome, tipo, obra_codigo, tanque_numero, capacidade_litros, saldo_inicial_litros, saldo_inicial_em
) values (
  'T9020-1', 'Tanque Usina', 'TANQUE', 9020, 1, 15000, 15000, now()
)
on conflict (ativo) do update
set nome = excluded.nome,
    tipo = 'TANQUE',
    obra_codigo = 9020,
    tanque_numero = 1,
    capacidade_litros = 15000;
