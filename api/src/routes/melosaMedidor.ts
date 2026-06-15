import { Router } from "express";
import { createSupabaseServiceRole } from "../lib/supabase";
import {
  avaliarContinuidadeAbastecimentoMelosa,
  findUltimoMedidorFinalMelosa,
  parseMedidorNumero,
} from "../lib/melosaMedidorContinuidade";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

router.get("/melosa-medidor/esperado", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const ativo = typeof req.query.ativo === "string" ? req.query.ativo.trim() : "";
    if (!ativo) return res.status(400).json({ error: "Informe o parâmetro ativo (melosa)." });

    const medidorInicialRaw =
      typeof req.query.medidor_inicial === "string" ? req.query.medidor_inicial : undefined;
    const medidorInicialInformado = medidorInicialRaw != null ? parseMedidorNumero(medidorInicialRaw) : null;

    const service = createSupabaseServiceRole();
    const ultimo = await findUltimoMedidorFinalMelosa(service, ativo);

    if (medidorInicialInformado != null) {
      const avaliacao = await avaliarContinuidadeAbastecimentoMelosa(service, {
        ativoMelosa: ativo,
        medidorInicialInformado,
      });
      return res.json({
        ativo_melosa: ativo.toUpperCase(),
        medidor_esperado: avaliacao.medidor_esperado,
        medidor_informado: avaliacao.medidor_informado,
        medidor_desvio_litros: avaliacao.medidor_desvio_litros,
        status: avaliacao.status,
        ultimo_abastecimento: avaliacao.ultimo_abastecimento,
      });
    }

    return res.json({
      ativo_melosa: ativo.toUpperCase(),
      medidor_esperado: ultimo?.medidor_final ?? null,
      ultimo_abastecimento: ultimo
        ? {
            data_hora: ultimo.data_hora,
            ativo_equipamento: ultimo.ativo_equipamento_texto,
            medidor_final: ultimo.medidor_final,
            operation_id: ultimo.operation_id,
          }
        : null,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao consultar medidor." });
  }
});

router.get("/melosa-medidor/desvios", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const service = createSupabaseServiceRole();
    const ativo = typeof req.query.ativo === "string" ? req.query.ativo.trim() : "";
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

    let query = service
      .from("melosa_movimentacoes")
      .select(
        "operation_id, data_hora, ativo_melosa_texto, ativo_equipamento_texto, litros, melosa_medidor_acumulado_inicial_numero, melosa_medidor_acumulado_final_numero, medidor_final_anterior, medidor_desvio_litros, medidor_continuidade_status",
      )
      .eq("medidor_continuidade_status", "desvio")
      .order("data_hora", { ascending: false })
      .limit(limit);

    if (ativo) query = query.ilike("ativo_melosa_texto", ativo);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({
      desvios: data ?? [],
      total: data?.length ?? 0,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar desvios." });
  }
});

export default router;
