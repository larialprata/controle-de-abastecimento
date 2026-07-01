import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole, createSupabaseAnonWithToken } from "../lib/supabase";
import { envValidated } from "../config";
import { requireAdmin, type AuthedRequest } from "../middleware/requireAdmin";
import { DEFAULT_WEB_PERMISSIONS, FULL_WEB_USER_PERMISSIONS, normalizeWebPermissions, normalizeWebWritePermissions } from "../lib/webPermissions";
import { listObraCodigosForUsers, setUserObraCodigos } from "../lib/userObras";

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
      ? await service
          .from("profiles")
          .select("user_id, role, active, is_melosa, cnh_storage_path, access_platform, web_permissions, web_write_permissions")
          .in("user_id", userIds)
      : { data: [], error: null };

    if ("error" in profs && profs.error) throw profs.error;

    const profById = new Map((profs.data ?? []).map((r: any) => [r.user_id, r]));
    const obrasByUser = await listObraCodigosForUsers(service, userIds);

    const payload = users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role: profById.get(u.id)?.role ?? "user",
      active: profById.get(u.id)?.active ?? false,
      is_melosa: profById.get(u.id)?.is_melosa ?? false,
      cnh_storage_path: profById.get(u.id)?.cnh_storage_path ?? null,
      access_platform: profById.get(u.id)?.access_platform ?? "app",
      web_permissions: normalizeWebPermissions(profById.get(u.id)?.web_permissions),
      web_write_permissions: normalizeWebWritePermissions(
        profById.get(u.id)?.web_permissions,
        profById.get(u.id)?.web_write_permissions,
      ),
      obra_codigos: obrasByUser.get(u.id) ?? [],
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

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  full_name: z.string().min(2).optional(),
  active: z.boolean().optional(),
  access_platform: z.enum(["app", "web"]).optional(),
  web_permissions: z.array(z.string()).optional(),
});

const updateAccessPlatformSchema = z.object({
  access_platform: z.enum(["app", "web"]),
});

const updateWebPermissionsSchema = z.object({
  web_permissions: z.array(z.string()).min(1),
  web_write_permissions: z.array(z.string()).optional(),
});

const updateUserObrasSchema = z.object({
  obra_codigos: z.array(z.number().int().positive()),
});

function placeholderCpfFromUserId(userId: string) {
  const digits = userId.replace(/\D/g, "");
  return `9${digits.slice(0, 10).padStart(10, "0")}`;
}

router.post("/users", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const emailNorm = parsed.data.email.trim().toLowerCase();
    const { password, full_name, active, access_platform, web_permissions } = parsed.data;
    const platform = access_platform ?? "web";
    const permissions =
      platform === "web"
        ? normalizeWebPermissions(web_permissions ?? DEFAULT_WEB_PERMISSIONS)
        : DEFAULT_WEB_PERMISSIONS;
    const service = createSupabaseServiceRole();

    const { data, error } = await service.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: true,
    });

    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        msg.includes("already been registered") ||
        msg.includes("already registered") ||
        msg.includes("user already exists") ||
        msg.includes("duplicate")
      ) {
        return res.status(409).json({ error: "Este email já está cadastrado" });
      }
      return res.status(400).json({ error: error.message });
    }

    const userId = data.user?.id;
    if (!userId) return res.status(500).json({ error: "Usuário não retornado ao criar cadastro" });

    const nowIso = new Date().toISOString();
    const { error: profError } = await service.from("profiles").upsert(
      {
        user_id: userId,
        full_name: full_name?.trim() || emailNorm.split("@")[0] || "Utilizador",
        cpf: placeholderCpfFromUserId(userId),
        address: "—",
        phone: "—",
        email: emailNorm,
        cnh_storage_path: null,
        role: "user",
        active: active ?? true,
        access_platform: platform,
        web_permissions: permissions,
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );
    if (profError) return res.status(400).json({ error: profError.message });

    return res.status(201).json({ ok: true, user_id: userId, email: emailNorm });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users POST error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
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

    const patch =
      role === "admin"
        ? { role, access_platform: "both" as const, web_permissions: FULL_WEB_USER_PERMISSIONS }
        : { role, access_platform: "web" as const, web_permissions: DEFAULT_WEB_PERMISSIONS };

    const { error } = await service.from("profiles").update(patch).eq("user_id", userId);
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

router.post("/users/:userId/access-platform", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateAccessPlatformSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId } = req.params;
    const { access_platform } = parsed.data;

    const service = createSupabaseServiceRole();
    const { data: existing, error: exErr } = await service
      .from("profiles")
      .select("user_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (!existing) return res.status(404).json({ error: "Perfil não encontrado para este usuário" });
    if (existing.role === "admin") {
      return res.status(400).json({ error: "Administradores têm acesso à web e ao app." });
    }

    const patch =
      access_platform === "web"
        ? { access_platform, web_permissions: DEFAULT_WEB_PERMISSIONS }
        : { access_platform };

    const { error } = await service.from("profiles").update(patch).eq("user_id", userId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users/:userId/access-platform error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.post("/users/:userId/web-permissions", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateWebPermissionsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId } = req.params;
    const web_permissions = normalizeWebPermissions(parsed.data.web_permissions);
    const web_write_permissions = normalizeWebWritePermissions(
      web_permissions,
      parsed.data.web_write_permissions ?? [],
    );

    const service = createSupabaseServiceRole();
    const { data: existing, error: exErr } = await service
      .from("profiles")
      .select("user_id, role, access_platform")
      .eq("user_id", userId)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (!existing) return res.status(404).json({ error: "Perfil não encontrado para este usuário" });
    if (existing.role === "admin") {
      return res.status(400).json({ error: "Administradores têm acesso a todas as páginas." });
    }
    if (existing.access_platform !== "web") {
      return res.status(400).json({ error: "Permissões de páginas web só se aplicam a Utilizador Web." });
    }

    const { error } = await service
      .from("profiles")
      .update({ web_permissions, web_write_permissions })
      .eq("user_id", userId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true, web_permissions, web_write_permissions });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users/:userId/web-permissions error:", err);
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

router.post("/users/:userId/obras", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateUserObrasSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId } = req.params;
    const service = createSupabaseServiceRole();
    const { data: existing, error: exErr } = await service
      .from("profiles")
      .select("user_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (!existing) return res.status(404).json({ error: "Perfil não encontrado para este usuário" });
    if (existing.role === "admin") {
      return res.status(400).json({ error: "Administradores têm acesso a todas as obras." });
    }

    await setUserObraCodigos(service, userId, parsed.data.obra_codigos);
    return res.json({ ok: true, obra_codigos: parsed.data.obra_codigos });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/admin/users/:userId/obras error:", err);
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

