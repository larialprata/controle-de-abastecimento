import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import {
  buildEquipamentoConsumoDashboard,
  buildEquipamentoConsumoDetalhe,
} from "../lib/equipamentoConsumo";
import { upsertConsumoMetas } from "../lib/consumoMetas";
import { upsertMetaEquipamento } from "../lib/consumoMetasEquipamento";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { getUserObraCodigos } from "../lib/userObras";

const router = Router();

const metaItemSchema = z.object({
  mobilidade: z.enum(["ESTACIONARIO", "MOVEL"]).nullable(),
  unidade: z.enum(["h", "km"]),
  meta_litros_por_unidade: z.number().positive(),
  label: z.string().nullable().optional(),
});

const metaEquipamentoSchema = z.object({
  meta_litros_por_unidade: z.number().positive().optional(),
  usar_media_periodo: z.boolean().optional(),
  de: z.string().optional().nullable(),
  ate: z.string().optional().nullable(),
});

async function resolveObraScope(req: AuthedRequest, obraCodigo: number | null) {
  if (!req.userId) return { error: "Unauthorized", status: 401 as const };
  const service = createSupabaseServiceRole();
  const obraScope = await getUserObraCodigos(service, req.userId);
  if (obraCodigo != null && obraScope && !obraScope.includes(obraCodigo)) {
    return { error: "Sem acesso a esta obra.", status: 403 as const };
  }
  return { service, obraScope, obraCodigo };
}

router.get("/equipamentos/consumo", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const obraCodigoRaw =
      typeof req.query.obra_codigo === "string" ? Number(req.query.obra_codigo) : null;
    const obraCodigo = obraCodigoRaw != null && Number.isFinite(obraCodigoRaw) ? obraCodigoRaw : null;

    const scope = await resolveObraScope(req, obraCodigo);
    if ("error" in scope) return res.status(scope.status as number).json({ error: scope.error });

    const de = typeof req.query.de === "string" && req.query.de.trim() ? req.query.de.trim() : null;
    const ate = typeof req.query.ate === "string" && req.query.ate.trim() ? req.query.ate.trim() : null;
    const ativoEquipamento =
      typeof req.query.ativo === "string" && req.query.ativo.trim() ? req.query.ativo.trim() : null;
    const compararPeriodoAnterior = req.query.comparar === "1" || req.query.comparar === "true";

    const dashboard = await buildEquipamentoConsumoDashboard(
      scope.service,
      { de, ate, obraCodigo, ativoEquipamento, compararPeriodoAnterior },
      scope.obraScope,
    );
    return res.json(dashboard);
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao calcular consumo por equipamento.",
    });
  }
});

router.get("/equipamentos/consumo/detalhe", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const ativo = typeof req.query.ativo === "string" ? req.query.ativo.trim() : "";
    if (!ativo) return res.status(400).json({ error: "Parâmetro ativo é obrigatório." });

    const obraCodigoRaw =
      typeof req.query.obra_codigo === "string" ? Number(req.query.obra_codigo) : null;
    const obraCodigo = obraCodigoRaw != null && Number.isFinite(obraCodigoRaw) ? obraCodigoRaw : null;

    const scope = await resolveObraScope(req, obraCodigo);
    if ("error" in scope) return res.status(scope.status as number).json({ error: scope.error });

    const de = typeof req.query.de === "string" && req.query.de.trim() ? req.query.de.trim() : null;
    const ate = typeof req.query.ate === "string" && req.query.ate.trim() ? req.query.ate.trim() : null;
    const mesesRaw = typeof req.query.meses === "string" ? Number(req.query.meses) : 12;
    const meses = Number.isFinite(mesesRaw) ? Math.min(24, Math.max(3, mesesRaw)) : 12;

    const detalhe = await buildEquipamentoConsumoDetalhe(
      scope.service,
      ativo,
      { de, ate, obraCodigo },
      scope.obraScope,
      meses,
    );

    if (!detalhe) {
      return res.status(404).json({ error: "Equipamento sem dados suficientes no período." });
    }

    return res.json(detalhe);
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao carregar detalhe do equipamento.",
    });
  }
});

router.put("/equipamentos/consumo/metas", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = z.array(metaItemSchema).min(1).safeParse(req.body?.metas ?? req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados de metas inválidos." });
    }

    const service = createSupabaseServiceRole();
    const metas = await upsertConsumoMetas(service, parsed.data);
    return res.json({ metas });
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao salvar metas de consumo.",
    });
  }
});

router.put("/equipamentos/consumo/metas-equipamento/:ativo", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const ativo = String(req.params.ativo ?? "").trim();
    if (!ativo) return res.status(400).json({ error: "Ativo inválido." });

    const parsed = metaEquipamentoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });

    const service = createSupabaseServiceRole();
    const obraScope = await getUserObraCodigos(service, req.userId);

    const de = parsed.data.de ?? null;
    const ate = parsed.data.ate ?? null;

    let metaValor = parsed.data.meta_litros_por_unidade;
    let origem: "manual" | "media" = "manual";
    let unidade = "h";

    if (parsed.data.usar_media_periodo || metaValor == null) {
      const detalhe = await buildEquipamentoConsumoDetalhe(
        service,
        ativo,
        { de, ate },
        obraScope,
        1,
      );
      if (!detalhe?.equipamento.media_litros_por_unidade) {
        return res.status(400).json({ error: "Não há média calculável para definir meta." });
      }
      metaValor = detalhe.equipamento.media_litros_por_unidade;
      unidade = detalhe.equipamento.unidade;
      origem = "media";
    } else {
      const detalhe = await buildEquipamentoConsumoDetalhe(service, ativo, { de, ate }, obraScope, 1);
      unidade = detalhe?.equipamento.unidade ?? "h";
    }

    const meta = await upsertMetaEquipamento(service, ativo, metaValor, unidade, origem);
    return res.json({ meta });
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao salvar meta do equipamento.",
    });
  }
});

export default router;
