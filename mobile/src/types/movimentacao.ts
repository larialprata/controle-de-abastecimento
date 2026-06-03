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
  medidor_tanque_numero_inicial?: string | null;
  medidor_tanque_foto_inicial_storage_path?: string | null;
  medidor_tanque_numero_final?: string | null;
  medidor_tanque_foto_final_storage_path?: string | null;
  confirmacao_abastecimento_foto_storage_path?: string | null;

  melosa_km_registro?: number | null;
  melosa_litros_registro?: number | null;
  melosa_combustivel_tipo_registro?: string | null;
  melosa_comprovante_storage_path?: string | null;
  melosa_medidor_acumulado_inicial_numero?: string | null;
  melosa_medidor_acumulado_inicial_storage_path?: string | null;
  melosa_lacre_numero?: string | null;
  melosa_lacre_storage_path?: string | null;
  melosa_medidor_acumulado_final_numero?: string | null;
  melosa_medidor_acumulado_final_storage_path?: string | null;
  melosa_horimetro_equipamento_abastecido_numero?: string | null;
  melosa_horimetro_equipamento_abastecido_storage_path?: string | null;
  melosa_motorista_equipamento_abastecido?: string | null;
  melosa_equipamento_operador_storage_path?: string | null;
  melosa_categoria?: "ESTACIONARIA" | "MOVEL" | null;

  melosa_km_retirada?: number | null;
  melosa_combustivel_tipo_retirada?: string | null;
  melosa_tanque_storage_path?: string | null;

  local_latitude?: number | null;
  local_longitude?: number | null;
  local_address?: string | null;

  obs?: string | null;
};
