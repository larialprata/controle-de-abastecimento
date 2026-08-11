import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

export const REQUISICAO_TIPOS = [
  "saida_melosa",
  "corrigir_movimentacao",
  "alterar_cadastro",
  "modificacao_app",
  "conserto_app",
  "outro",
] as const;

export type RequisicaoTipo = (typeof REQUISICAO_TIPOS)[number];

const createSchema = z.object({
  tipo: z.enum(REQUISICAO_TIPOS),
  acao: z.enum(["adicionar", "editar"]),
  titulo: z.string().trim().min(3).max(200),
  descricao: z.string().trim().min(5).max(5000),
  obra_codigo: z.number().int().positive().nullable().optional(),
  obra_nome: z.string().trim().max(300).nullable().optional(),
  detalhes: z.record(z.unknown()).optional(),
});

const decidirSchema = z.object({
  comentario: z.string().trim().max(2000).optional(),
});

const SELECT_COLS =
  "id, created_at, updated_at, solicitante_user_id, solicitante_email, tipo, acao, titulo, descricao, obra_codigo, obra_nome, detalhes, status, resolvido_por, resolvido_em, comentario_admin";

async function isAdminUser(service: ReturnType<typeof createSupabaseServiceRole>, userId: string) {
  const { data } = await service.from("profiles").select("role").eq("user_id", userId).maybeSingle();
  return data?.role === "admin";
}

router.get("/requisicoes", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const service = createSupabaseServiceRole();
    const admin = await isAdminUser(service, req.userId);

    let query = service.from("requisicoes").select(SELECT_COLS).order("created_at", { ascending: false });

    if (!admin) {
      query = query.eq("solicitante_user_id", req.userId);
    }

    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    if (status && ["pendente", "aprovada", "recusada"].includes(status)) {
      query = query.eq("status", status);
    }

    const obraRaw = typeof req.query.obra_codigo === "string" ? Number(req.query.obra_codigo) : NaN;
    if (Number.isFinite(obraRaw) && obraRaw > 0) {
      query = query.eq("obra_codigo", obraRaw);
    }

    const tipo = typeof req.query.tipo === "string" ? req.query.tipo.trim() : "";
    if (tipo && (REQUISICAO_TIPOS as readonly string[]).includes(tipo)) {
      query = query.eq("tipo", tipo);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const rows = data ?? [];
    const userIds = Array.from(
      new Set(rows.map((row) => row.solicitante_user_id).filter((id): id is string => typeof id === "string")),
    );
    const { data: profiles, error: profilesError } = userIds.length
      ? await service.from("profiles").select("user_id, full_name").in("user_id", userIds)
      : { data: [], error: null };
    if (profilesError) return res.status(500).json({ error: profilesError.message });

    const nameByUserId = new Map(
      (profiles ?? []).map((profile) => [String(profile.user_id), String(profile.full_name ?? "").trim()]),
    );
    const requisicoes = rows.map((row) => ({
      ...row,
      solicitante_nome: nameByUserId.get(String(row.solicitante_user_id)) || null,
    }));

    return res.json({ requisicoes, is_admin: admin });
  } catch (err: unknown) {
    console.error("[API] GET /v1/requisicoes error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/requisicoes", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    const service = createSupabaseServiceRole();
    const { data: profile } = await service
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", req.userId)
      .maybeSingle();
    const { data: authUser } = await service.auth.admin.getUserById(req.userId);
    const email = profile?.email ?? authUser?.user?.email ?? null;
    const solicitanteNome = profile?.full_name?.trim() || null;

    let obraNome = parsed.data.obra_nome?.trim() || null;
    const obraCodigo = parsed.data.obra_codigo ?? null;
    if (obraCodigo != null && !obraNome) {
      const { data: obra } = await service.from("obras").select("nome").eq("codigo", obraCodigo).maybeSingle();
      obraNome = obra?.nome ?? null;
    }

    const { data, error } = await service
      .from("requisicoes")
      .insert({
        solicitante_user_id: req.userId,
        solicitante_email: email,
        tipo: parsed.data.tipo,
        acao: parsed.data.acao,
        titulo: parsed.data.titulo,
        descricao: parsed.data.descricao,
        obra_codigo: obraCodigo,
        obra_nome: obraNome,
        detalhes: parsed.data.detalhes ?? {},
        status: "pendente",
      })
      .select(SELECT_COLS)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({
      requisicao: { ...data, solicitante_nome: solicitanteNome },
    });
  } catch (err: unknown) {
    console.error("[API] POST /v1/requisicoes error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/requisicoes/:id/aprovar", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = String(req.params.id ?? "");
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const parsed = decidirSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    const service = createSupabaseServiceRole();
    const { data: existing, error: findErr } = await service
      .from("requisicoes")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: "Requisição não encontrada" });
    if (existing.status !== "pendente") {
      return res.status(409).json({ error: `Já está ${existing.status}` });
    }

    const { data, error } = await service
      .from("requisicoes")
      .update({
        status: "aprovada",
        resolvido_por: req.userId,
        resolvido_em: new Date().toISOString(),
        comentario_admin: parsed.data.comentario?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(SELECT_COLS)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ requisicao: data });
  } catch (err: unknown) {
    console.error("[API] POST /v1/requisicoes/:id/aprovar error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/requisicoes/:id/recusar", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = String(req.params.id ?? "");
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const parsed = decidirSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }
    const comentario = parsed.data.comentario?.trim() ?? "";
    if (comentario.length < 3) {
      return res.status(400).json({ error: "Informe um comentário ao recusar (mín. 3 caracteres)." });
    }

    const service = createSupabaseServiceRole();
    const { data: existing, error: findErr } = await service
      .from("requisicoes")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: "Requisição não encontrada" });
    if (existing.status !== "pendente") {
      return res.status(409).json({ error: `Já está ${existing.status}` });
    }

    const { data, error } = await service
      .from("requisicoes")
      .update({
        status: "recusada",
        resolvido_por: req.userId,
        resolvido_em: new Date().toISOString(),
        comentario_admin: comentario,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(SELECT_COLS)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ requisicao: data });
  } catch (err: unknown) {
    console.error("[API] POST /v1/requisicoes/:id/recusar error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
