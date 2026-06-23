export type MovimentoTipo = "ENTRADA_TANQUE_OBRA" | "RETIRADA_TANQUE" | "RETIRADA_MELOSA";

export type MovimentacaoPayload = {
  operation_id: string;
  tipo: MovimentoTipo;
  obra_codigo: number;
  data_hora?: string;
  litros: number;

  tanque_texto?: string | null;
  placa_texto?: string | null;
  fornecedor_texto?: string | null;
  tanque_numero?: 1 | 2 | null;

  combustivel_tipo?: string | null;
  nota_numero?: string | null;
  placa_caminhao?: string | null;
  valor_unitario?: number | null;
  nota_storage_path?: string | null;
  lacre_tanque_numero?: string | null;
  lacre_tanque_storage_path?: string | null;
  lacre_melosa_numero?: string | null;
  lacre_melosa_storage_path?: string | null;
  tanque_quantidade_abastecida?: string | null;
  tanque_quantidade_abastecida_storage_path?: string | null;
  tanque_operador_nome?: string | null;
  tanque_assinatura_operador_storage_path?: string | null;
  tanque_assinatura_melosa_storage_path?: string | null;
  retirada_horimetro_foto_storage_path?: string | null;

  melosa_km_registro?: number | null;
  melosa_litros_registro?: number | null;
  melosa_combustivel_tipo_registro?: string | null;
  melosa_comprovante_storage_path?: string | null;
  melosa_quantidade_abastecida?: string | null;
  melosa_quantidade_abastecida_storage_path?: string | null;
  melosa_lacre_numero?: string | null;
  melosa_lacre_storage_path?: string | null;
  melosa_horimetro_equipamento_abastecido_numero?: string | null;
  melosa_horimetro_equipamento_abastecido_storage_path?: string | null;
  melosa_motorista_equipamento_abastecido?: string | null;
  melosa_equipamento_operador_storage_path?: string | null;
  melosa_categoria?: "ESTACIONARIA" | "MOVEL" | null;
  ativo_equipamento_empresa?: string | null;
  ativo_equipamento_nome?: string | null;
  melosa_operador_nome?: string | null;
  melosa_assinatura_operador_storage_path?: string | null;
  melosa_assinatura_motorista_storage_path?: string | null;
  melosa_lubrificado?: boolean | null;

  melosa_km_retirada?: number | null;
  melosa_combustivel_tipo_retirada?: string | null;
  melosa_tanque_storage_path?: string | null;

  local_latitude?: number | null;
  local_longitude?: number | null;
  local_address?: string | null;

  obs?: string | null;
};
