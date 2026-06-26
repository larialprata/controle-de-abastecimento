import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { litrosSobraAtualCiclo, relinkFilhosAoExcluirCiclo, type MelosaCicloRow } from "../lib/melosaCiclo";
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

    const ciclos = (data ?? []).map((row) => {
      const c = row as MelosaCicloRow;
      return {
        ...c,
        litros_sobra_atual: litrosSobraAtualCiclo(c),
        litros_retirada: toNum(c.litros_retirada),
        litros_sobra_anterior: toNum(c.litros_sobra_anterior),
        litros_abastecidos: toNum(c.litros_abastecidos),
        litros_devolvidos: toNum(c.litros_devolvidos),
        capacidade_litros: c.capacidade_litros != null ? toNum(c.capacidade_litros) : null,
        volume_excedente: toNum(c.volume_excedente),
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

router.delete("/melosa-ciclos/:id", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = String(req.params.id ?? "").trim();
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return res.status(400).json({ error: "ID do ciclo inválido" });

    const service = createSupabaseServiceRole();
    const { data: ciclo, error: findErr } = await service
      .from("melosa_ciclos")
      .select(
        "id, ciclo_numero, retirada_operation_id, ativo_melosa_texto, ciclo_anterior_id, ciclo_anterior_numero, data_hora",
      )
      .eq("id", id)
      .maybeSingle();

    if (findErr) return res.status(400).json({ error: findErr.message });
    if (!ciclo) return res.status(404).json({ error: "Ciclo não encontrado" });

    const filhosAtualizados = await relinkFilhosAoExcluirCiclo(service, ciclo as MelosaCicloRow);

    const { error: unlinkMelosaErr } = await service
      .from("melosa_movimentacoes")
      .update({ ciclo_id: null })
      .eq("ciclo_id", id);
    if (unlinkMelosaErr) return res.status(400).json({ error: unlinkMelosaErr.message });

    const { error: unlinkMovErr } = await service
      .from("movimentacoes")
      .update({ ciclo_id: null })
      .eq("ciclo_id", id);
    if (unlinkMovErr) return res.status(400).json({ error: unlinkMovErr.message });

    const { error: deleteRetiradaErr } = await service
      .from("movimentacoes")
      .delete()
      .eq("operation_id", ciclo.retirada_operation_id);
    if (deleteRetiradaErr) return res.status(400).json({ error: deleteRetiradaErr.message });

    const { error: deleteCicloErr } = await service.from("melosa_ciclos").delete().eq("id", id);
    if (deleteCicloErr) return res.status(400).json({ error: deleteCicloErr.message });

    return res.json({
      ok: true,
      id,
      ciclo_numero: ciclo.ciclo_numero,
      ativo_melosa_texto: ciclo.ativo_melosa_texto,
      filhos_atualizados: filhosAtualizados,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir ciclo." });
  }
});

export default router;
