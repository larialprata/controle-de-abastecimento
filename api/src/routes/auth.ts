import { Router } from "express";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRole } from "../lib/supabase";
import { envValidated } from "../config";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { canAccessClientPlatform, parseClientPlatform } from "../lib/accessPlatform";
import { DEFAULT_WEB_PERMISSIONS } from "../lib/webPermissions";
import { getUserObraCodigos } from "../lib/userObras";

const router = Router();

async function findAuthUserIdByEmail(service: ReturnType<typeof createSupabaseServiceRole>, emailNorm: string): Promise<string | null> {
  const target = emailNorm.toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = (data?.users ?? []) as { id: string; email?: string | null }[];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return found.id;
    if (users.length < 200) break;
  }
  return null;
}

function looksLikeEmailNotConfirmedError(message: string, code?: string) {
  const m = message.toLowerCase();
  const c = (code ?? "").toLowerCase();
  return (
    m.includes("email not confirmed") ||
    m.includes("not confirmed") ||
    m.includes("confirm your email") ||
    m.includes("email_not_confirmed") ||
    m.includes("email address not confirmed") ||
    c.includes("email_not_confirmed")
  );
}

function normalizeCpf(input: string) {
  return input.replace(/\D/g, "");
}

function placeholderCpfFromUserId(userId: string) {
  const digits = userId.replace(/\D/g, "");
  return `9${digits.slice(0, 10).padStart(10, "0")}`;
}

async function ensureWebProfileForOAuthUser(
  service: ReturnType<typeof createSupabaseServiceRole>,
  userId: string
) {
  const { data: adminUser, error: adminErr } = await service.auth.admin.getUserById(userId);
  if (adminErr || !adminUser?.user) throw new HttpError(401, "Usuário não encontrado no Auth");

  const authUser = adminUser.user;
  const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const email = authUser.email?.trim().toLowerCase() ?? null;
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    email?.split("@")[0] ||
    "Utilizador";

  const nowIso = new Date().toISOString();
  const { error: upsertError } = await service.from("profiles").upsert(
    {
      user_id: userId,
      full_name: fullName,
      cpf: placeholderCpfFromUserId(userId),
      address: "—",
      phone: "—",
      email,
      cnh_storage_path: null,
      role: "user",
      active: false,
      access_platform: "web",
      web_permissions: DEFAULT_WEB_PERMISSIONS,
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );
  if (upsertError) throw new HttpError(400, upsertError.message);
}

class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const profileSyncSchema = z.object({
  full_name: z.string().min(2),
  cpf: z.string().min(5),
  address: z.string().min(2),
  phone: z.string().min(2),
  email: z.string().email().optional().nullable(),
  cnh_storage_path: z.string().min(1),
});

async function upsertProfileFromValidatedOrThrow(
  service: ReturnType<typeof createSupabaseServiceRole>,
  userId: string,
  input: z.infer<typeof profileSyncSchema>,
  authEmailFallback: string | null | undefined
) {
  const cpfNormalized = normalizeCpf(input.cpf);
  if (cpfNormalized.length !== 11) throw new HttpError(400, "CPF inválido (esperado 11 dígitos)");

  const { data: cpfRow, error: cpfLookupError } = await service
    .from("profiles")
    .select("user_id")
    .eq("cpf", cpfNormalized)
    .maybeSingle();

  if (cpfLookupError) throw new HttpError(500, cpfLookupError.message);
  if (cpfRow && cpfRow.user_id !== userId) throw new HttpError(409, "CPF já cadastrado");

  const cnhPath = input.cnh_storage_path;
  const { data: fileExists } = await service.storage.from(envValidated.CNH_BUCKET).exists(cnhPath);
  if (fileExists !== true) throw new HttpError(400, "Arquivo da CNH não encontrado no Storage");

  const email =
    (typeof input.email === "string" && input.email.trim().length > 0 ? input.email.trim() : null) ??
    authEmailFallback ??
    null;
  const nowIso = new Date().toISOString();

  const upsertPayload = {
    user_id: userId,
    full_name: input.full_name,
    cpf: cpfNormalized,
    address: input.address,
    phone: input.phone,
    email,
    cnh_storage_path: cnhPath,
    role: "user" as const,
    active: false,
    access_platform: "app" as const,
    updated_at: nowIso,
  };

  const { error: upsertError } = await service.from("profiles").upsert(upsertPayload as any, { onConflict: "user_id" });
  if (upsertError) throw new HttpError(400, upsertError.message);
}

async function syncProfileFromUserMetadataOrThrow(service: ReturnType<typeof createSupabaseServiceRole>, userId: string) {
  const { data: adminUser, error: adminErr } = await service.auth.admin.getUserById(userId);
  if (adminErr || !adminUser?.user) throw new HttpError(401, "Usuário não encontrado no Auth");

  const authUser = adminUser.user;
  const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;

  const parsed = profileSyncSchema.safeParse({
    full_name: meta.full_name,
    cpf: meta.cpf,
    address: meta.address,
    phone: meta.phone,
    email: meta.email,
    cnh_storage_path: meta.cnh_storage_path,
  });
  if (!parsed.success) throw new HttpError(400, "Dados de cadastro inválidos", parsed.error.flatten());

  await upsertProfileFromValidatedOrThrow(service, userId, parsed.data, authUser.email ?? null);
}

const motoristaProfileBodySchema = z
  .object({
    full_name: z.string().min(2).optional(),
    cpf: z.string().min(5).optional(),
    address: z.string().min(2).optional(),
    phone: z.string().min(2).optional(),
    email: z.string().email().optional(),
    cnh_storage_path: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const parts = [data.full_name, data.cpf, data.address, data.phone, data.cnh_storage_path].map((v) =>
      v !== undefined && String(v).trim().length > 0 ? true : false
    );
    const anySet = parts.some(Boolean);
    const allSet = parts.every(Boolean);
    if (anySet && !allSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Envie nome, CPF, endereço, telefone e cnh_storage_path juntos para gravar o perfil, ou nenhum (login).",
      });
    }
  });

type MotoristaProfileBody = z.infer<typeof motoristaProfileBodySchema>;

async function syncMotoristaProfileFromParsedBodyOrThrow(
  service: ReturnType<typeof createSupabaseServiceRole>,
  userId: string,
  p: MotoristaProfileBody
) {
  const hasFullProfile =
    !!p.full_name?.trim() &&
    !!p.cpf?.trim() &&
    !!p.address?.trim() &&
    !!p.phone?.trim() &&
    !!p.cnh_storage_path?.trim();

  if (hasFullProfile) {
    const profileParsed = profileSyncSchema.safeParse({
      full_name: p.full_name,
      cpf: p.cpf,
      address: p.address,
      phone: p.phone,
      email: p.email,
      cnh_storage_path: p.cnh_storage_path,
    });
    if (!profileParsed.success) {
      throw new HttpError(400, "Dados de perfil inválidos", profileParsed.error.flatten());
    }
    const { data: adminUser, error: adminErr } = await service.auth.admin.getUserById(userId);
    if (adminErr || !adminUser?.user) throw new HttpError(401, "Usuário não encontrado no Auth");
    await upsertProfileFromValidatedOrThrow(service, userId, profileParsed.data, adminUser.user.email ?? null);
    return;
  }

  const { data: prof, error: profErr } = await service.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (profErr) throw new HttpError(500, profErr.message);
  if (!prof) {
    await syncProfileFromUserMetadataOrThrow(service, userId);
  }
}

router.post("/auth/register", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    });
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const service = createSupabaseServiceRole();
    const { data, error } = await service.auth.admin.createUser({
      email: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
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
    if (!data.user?.id) return res.status(500).json({ error: "Usuário não retornado ao criar cadastro" });
    return res.json({ ok: true, user_id: data.user.id });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/auth/register error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.post("/auth/finish-email-signup", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { email, password } = parsed.data;
    const emailNorm = email.trim();

    const anon = createClient(envValidated.SUPABASE_URL, envValidated.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signData, error: signError } = await anon.auth.signInWithPassword({
      email: emailNorm,
      password,
    });

    if (signData.session) {
      return res.json({ ok: true, alreadyConfirmed: true });
    }

    if (!signError) {
      return res.status(400).json({ error: "Não foi possível validar o cadastro" });
    }

    const errMsg = signError.message ?? "";
    const errCode = (signError as any).code as string | undefined;

    if (!looksLikeEmailNotConfirmedError(errMsg, errCode)) {
      return res.status(401).json({ error: signError.message });
    }

    const service = createSupabaseServiceRole();
    const userId = await findAuthUserIdByEmail(service, emailNorm);
    if (!userId) return res.status(404).json({ error: "Usuário não encontrado" });

    const { error: updError } = await service.auth.admin.updateUserById(userId, { email_confirm: true });
    if (updError) return res.status(400).json({ error: updError.message });

    return res.json({ ok: true, emailConfirmed: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/auth/finish-email-signup error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.post("/auth/ensure-role", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const ensureSchema = z
      .object({
        role: z.literal("user").optional(),
        platform: z.enum(["app", "web"]).optional(),
      })
      .and(motoristaProfileBodySchema);
    const parsed = ensureSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Corpo inválido", details: parsed.error.flatten() });
    }

    const { role: _roleIgnored, platform: bodyPlatform, ...profileBody } = parsed.data;
    const clientPlatform =
      parseClientPlatform(bodyPlatform) ?? parseClientPlatform(req.header("X-Client-Platform"));

    const service = createSupabaseServiceRole();

    let { data: profRow, error: profRoleError } = await service
      .from("profiles")
      .select("role, active, access_platform, web_permissions")
      .eq("user_id", req.userId)
      .maybeSingle();

    if (profRoleError) return res.status(500).json({ error: profRoleError.message });

    if (!profRow && clientPlatform === "web") {
      await ensureWebProfileForOAuthUser(service, req.userId);
      const refetch = await service
        .from("profiles")
        .select("role, active, access_platform, web_permissions")
        .eq("user_id", req.userId)
        .maybeSingle();
      if (refetch.error) return res.status(500).json({ error: refetch.error.message });
      profRow = refetch.data;
    }

    if (profRow?.role === "admin") {
      return res.json({
        ok: true,
        role: "admin",
        access_platform: profRow.access_platform ?? "both",
        web_permissions: profRow.web_permissions ?? DEFAULT_WEB_PERMISSIONS,
        obra_codigos: null,
      });
    }

    if (profRow && profRow.active === false) {
      return res.status(403).json({ error: "Perfil inativo. Aguarde liberação pelo administrador." });
    }

    if (profRow && clientPlatform && !canAccessClientPlatform(profRow, clientPlatform)) {
      const destino = clientPlatform === "web" ? "o painel web" : "o aplicativo mobile";
      return res.status(403).json({
        error: `Esta conta não tem permissão para acessar ${destino}.`,
      });
    }

    if (clientPlatform !== "web") {
      try {
        await syncMotoristaProfileFromParsedBodyOrThrow(service, req.userId, profileBody);
      } catch (e: any) {
        if (e instanceof HttpError) {
          return res.status(e.status).json({
            error: e.message,
            ...(e.details !== undefined ? { details: e.details } : {}),
          });
        }
        throw e;
      }
    }

    const obra_codigos = await getUserObraCodigos(service, req.userId);

    return res.json({
      ok: true,
      web_permissions: profRow?.web_permissions ?? DEFAULT_WEB_PERMISSIONS,
      access_platform: profRow?.access_platform ?? "app",
      obra_codigos,
    });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({
        error: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      });
    }
    // eslint-disable-next-line no-console
    console.error("[API] /v1/auth/ensure-role error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.post("/auth/complete-registration", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const service = createSupabaseServiceRole();

    const { data: profRow, error: profErr } = await service.from("profiles").select("role").eq("user_id", req.userId).maybeSingle();
    if (profErr) return res.status(500).json({ error: profErr.message });
    if (profRow?.role === "admin") {
      return res.json({ ok: true, role: "admin" });
    }

    const parsed = motoristaProfileBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Corpo inválido", details: parsed.error.flatten() });
    await syncMotoristaProfileFromParsedBodyOrThrow(service, req.userId, parsed.data);

    return res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({
        error: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      });
    }
    // eslint-disable-next-line no-console
    console.error("[API] /v1/auth/complete-registration error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

export default router;

