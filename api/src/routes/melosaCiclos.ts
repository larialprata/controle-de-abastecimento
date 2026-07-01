import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { buildMelosaFluxo } from "../lib/melosaFluxo";
import { excluirMelosaCiclo, excluirMelosaCiclosEmLote, enriquecerCiclosParaListagem, avaliarEnchimentoMelosa, type MelosaCicloRow } from "../lib/melosaCiclo";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { getUserObraCodigos } from "../lib/userObras";

const router = Router();

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

router.get("/melosa-ciclos/fluxo", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const ativo = typeof req.query.ativo === "string" ? req.query.ativo.trim() : "";
    if (!ativo) return res.status(400).json({ error: "Informe o parâmetro ativo (ex.: CCL1999)." });

    const service = createSupabaseServiceRole();
    const obraScope = await getUserObraCodigos(service, req.userId);
    const obraCodigoRaw =
      typeof req.query.obra_codigo === "string" ? Number(req.query.obra_codigo) : null;
    const obraCodigo = obraCodigoRaw != null && Number.isFinite(obraCodigoRaw) ? obraCodigoRaw : null;

    const fluxo = await buildMelosaFluxo(service, {
      ativoMelosa: ativo,
      obraCodigo,
      obraScope,
    });

    return res.json(fluxo);
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao montar fluxo." });
  }
});

router.get("/melosa-ciclos", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const service = createSupabaseServiceRole();
    const obraScope = await getUserObraCodigos(service, req.userId);
    const ativo = typeof req.query.ativo === "string" ? req.query.ativo.trim() : "";
    const apenasSuspeitos = req.query.suspeitos === "1" || req.query.suspeitos === "true";
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

    let query = service
      .from("melosa_ciclos")
      .select("*")
      .order("ciclo_numero", { ascending: false })
      .limit(limit);

    if (ativo) query = query.ilike("ativo_melosa_texto", ativo);
    if (apenasSuspeitos) query = query.eq("status", "suspeito");
    if (obraScope) query = query.in("obra_codigo", obraScope);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const rows = (data ?? []) as MelosaCicloRow[];
    const metricas = await enriquecerCiclosParaListagem(service, rows);

    const ciclos = rows.map((row) => {
      const c = row;
      const m = metricas.get(c.id);
      const litrosAbastecidos = m?.litros_abastecidos ?? toNum(c.litros_abastecidos);
      const litrosSobraAnterior = m?.litros_sobra_anterior ?? toNum(c.litros_sobra_anterior);
      const litrosSobraAtual =
        m?.litros_sobra_atual ??
        Math.max(0, litrosSobraAnterior + toNum(c.litros_retirada) - litrosAbastecidos);
      const capacidade = c.capacidade_litros != null ? toNum(c.capacidade_litros) : null;
      const { volumeExcedente, status } = avaliarEnchimentoMelosa(
        litrosSobraAnterior,
        toNum(c.litros_retirada),
        capacidade,
      );
      return {
        ...c,
        litros_sobra_atual: litrosSobraAtual,
        litros_retirada: toNum(c.litros_retirada),
        litros_sobra_anterior: litrosSobraAnterior,
        litros_abastecidos: litrosAbastecidos,
        litros_devolvidos: toNum(c.litros_devolvidos),
        capacidade_litros: capacidade,
        volume_excedente: volumeExcedente,
        status,
      };
    });

    const suspeitos = ciclos.filter((c) => c.status === "suspeito").length;

    return res.json({
      ciclos,
      resumo: {
        total: ciclos.length,
        suspeitos,
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ciclos." });
  }
});

router.post("/melosa-ciclos/bulk-delete", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Lista de IDs inválida" });

    const service = createSupabaseServiceRole();
    const resultados = await excluirMelosaCiclosEmLote(service, parsed.data.ids);

    return res.json({ ok: true, excluidos: resultados.length, ciclos: resultados });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir ciclos." });
  }
});

router.delete("/melosa-ciclos/:id", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = String(req.params.id ?? "").trim();
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return res.status(400).json({ error: "ID do ciclo inválido" });

    const service = createSupabaseServiceRole();
    const resultado = await excluirMelosaCiclo(service, id);

    return res.json({
      ok: true,
      ...resultado,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir ciclo." });
  }
});

export default router;
