import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "melosa_flow_checkpoint_v1";

export type MelosaFlowCheckpoint = {
  savedAt: string;
  screenStep: "register" | "quantidade_abastecida" | "horimetro" | "resumo";
  melosaObraCodigo: number;
  melosaPlacaTexto: string;
  melosaFornecedorTexto: string;
  melosaEquipamentoPlacaTexto: string;
  melosaEquipamentoNomeTexto: string;
  melosaEquipamentoEmpresa: string;
  melosaQuantidadeAbastecidaTexto: string;
  melosaQuantidadeAbastecidaFotoUri: string | null;
  melosaEncerranteInicialTexto?: string;
  melosaEncerranteFinalTexto?: string;
  melosaHorimetroEquipamentoNumero: string;
  melosaHorimetroEquipamentoFotoUri: string | null;
  melosaNaoTenhoHorimetro: boolean;
  melosaHorimetroMotivo: "" | "QUEBRADO" | "INEXISTENTE";
  melosaLubrificado: boolean;
  melosaMotoristaEquipamentoTexto: string;
  melosaEquipamentoOperadorFotoUri: string | null;
  melosaWdrCombustivelTipo: string;
  melosaAssinaturaOperadorDataUrl: string | null;
  melosaAssinaturaMotoristaDataUrl: string | null;
  localLatitude: number | null;
  localLongitude: number | null;
  localAddress: string | null;
};

export async function saveMelosaFlowCheckpoint(data: MelosaFlowCheckpoint): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch {
    // Não bloqueia o fluxo por falha de checkpoint
  }
}

export async function loadMelosaFlowCheckpoint(): Promise<MelosaFlowCheckpoint | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MelosaFlowCheckpoint;
    if (!parsed?.screenStep) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearMelosaFlowCheckpoint(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
