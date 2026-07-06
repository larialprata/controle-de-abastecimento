-- Saldo inicial do tanque (litros já existentes antes/ além das movimentações no app)
alter table public.equipamentos add column if not exists saldo_inicial_litros numeric(12, 3);

comment on column public.equipamentos.saldo_inicial_litros is
  'Para tipo TANQUE: quantidade de partida em litros. Entradas somam e retiradas descontam na dashboard.';

-- A partir de quando as movimentações passam a alterar o saldo (anteriores já estão no saldo inicial)
alter table public.equipamentos add column if not exists saldo_inicial_em timestamptz;

comment on column public.equipamentos.saldo_inicial_em is
  'Data/hora de referência do saldo inicial. Movimentações anteriores não alteram o saldo exibido.';

-- Tanques que já tinham saldo cadastrado em 06/07/2026: ignorar movimentações anteriores a esse dia
update public.equipamentos
set saldo_inicial_em = timestamptz '2026-07-06 00:00:00-03'
where tipo = 'TANQUE'
  and saldo_inicial_litros is not null
  and saldo_inicial_em is null;
