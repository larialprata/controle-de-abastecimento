import { apiGet, apiPost } from "./api";
import type { EquipamentoQrTipo } from "./equipamentoQrCode";

export type EquipamentoQrSource = "externo" | "abast";

export type EquipamentoQrResolved = {
  ativo: string;
  nome: string;
  obra_codigo: number | null;
  source: EquipamentoQrSource;
  qr_content: string;
  externo: {
    id: string;
    ativo_placa: string;
    obra_code: string | null;
    qr_token: string;
  } | null;
};

export type EquipamentoQrResolveItem = {
  ativo: string;
  nome?: string | null;
  obra_codigo?: number | null;
  tipo?: EquipamentoQrTipo;
};

export async function resolveEquipamentoQr(
  token: string,
  ativo: string,
  obraCodigo?: number | null,
): Promise<EquipamentoQrResolved> {
  const qs =
    obraCodigo != null && obraCodigo > 0
      ? `?obra_codigo=${encodeURIComponent(String(obraCodigo))}`
      : "";
  const { qr } = await apiGet<{ qr: EquipamentoQrResolved }>(
    `/v1/equipamentos/${encodeURIComponent(ativo)}/qr${qs}`,
    token,
  );
  return qr;
}

export async function resolveEquipamentosQrBatch(
  token: string,
  itens: EquipamentoQrResolveItem[],
): Promise<EquipamentoQrResolved[]> {
  const { itens: resolved } = (await apiPost("/v1/equipamentos/qr/resolve", token, {
    itens: itens.map((item) => ({
      ativo: item.ativo,
      nome: item.nome ?? undefined,
      obra_codigo: item.obra_codigo ?? null,
      tipo: item.tipo,
    })),
  })) as { itens: EquipamentoQrResolved[] };
  return resolved;
}
