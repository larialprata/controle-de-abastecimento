import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole, createSupabaseAnonWithToken } from "../lib/supabase";
import { envValidated } from "../config";
import { requireAdmin, type AuthedRequest } from "../middleware/requireAdmin";

const router = Router();

router.get("/users", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const service = createSupabaseServiceRole();

    // Lista usuários do Auth (service role ignora RLS)
    const { data: listUsersData, error: authUsersError } = await service.auth.admin.listUsers();
    if (authUsersError) throw authUsersError;

    type AuthUserRow = { id: string; email?: string | null; created_at?: string | null };
    const users = (listUsersData?.users ?? []) as AuthUserRow[];

    const userIds = users.map((u) => u.id);
    const profs = userIds.length
      ? await service.from("profiles").select("user_id, role, active, is_melosa, cnh_storage_path").in("user_id", userIds)
      : { data: [], error: null };

    if ("error" in profs && profs.error) throw profs.error;

    const profById = new Map((profs.data ?? []).map((r: any) => [r.user_id, r]));

    const payload = users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role: profById.get(u.id)?.role ?? "user",
      active: profById.get(u.id)?.active ?? false,
      is_melosa: profById.get(u.id)?.is_melosa ?? false,
      cnh_storage_path: profById.get(u.id)?.cnh_storage_path ?? null,
      created_at: u.created_at,
    }));

    return res.json({ users: payload });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

const updateRoleSchema = z.object({
  role: z.enum(["admin", "user"]),
});

const updateActiveSchema = z.object({
  active: z.boolean(),
});

const updateMelosaSchema = z.object({
  is_melosa: z.boolean(),
});

router.post("/users/:userId/role", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId } = req.params;
    const { role } = parsed.data;

    const service = createSupabaseServiceRole();
    const { data: existing, error: exErr } = await service.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (!existing) return res.status(404).json({ error: "Perfil não encontrado para este usuário" });

    const { error } = await service.from("profiles").update({ role }).eq("user_id", userId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users/:userId/role error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.post("/users/:userId/active", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateActiveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId } = req.params;
    const { active } = parsed.data;

    const service = createSupabaseServiceRole();
    const { data: existing, error: exErr } = await service.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (!existing) return res.status(404).json({ error: "Perfil não encontrado para este usuário" });

    const { error } = await service.from("profiles").update({ active }).eq("user_id", userId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users/:userId/active error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.post("/users/:userId/melosa", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateMelosaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId } = req.params;
    const { is_melosa } = parsed.data;

    const service = createSupabaseServiceRole();
    const { data: existing, error: exErr } = await service.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (!existing) return res.status(404).json({ error: "Perfil não encontrado para este usuário" });

    const { error } = await service.from("profiles").update({ is_melosa }).eq("user_id", userId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users/:userId/melosa error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.get("/users/:userId/cnh-url", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId inválido" });

    const service = createSupabaseServiceRole();
    const { data: profile, error: profErr } = await service
      .from("profiles")
      .select("cnh_storage_path")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) return res.status(500).json({ error: profErr.message });

    const path = typeof profile?.cnh_storage_path === "string" ? profile.cnh_storage_path.trim() : "";
    if (!path) return res.status(404).json({ error: "CNH não encontrada para este usuário" });

    const { data, error } = await service.storage.from(envValidated.CNH_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return res.status(404).json({ error: "Arquivo da CNH não encontrado no bucket" });
    return res.json({ url: data.signedUrl });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users/:userId/cnh-url error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

export default router;

