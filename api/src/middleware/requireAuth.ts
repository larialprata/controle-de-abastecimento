import { Request, Response, NextFunction } from "express";
import { createSupabaseAnonWithToken } from "../lib/supabase";
import { canAccessClientPlatform, parseClientPlatform } from "../lib/accessPlatform";

export type AuthedRequest = Request & { userId?: string };

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.header("Authorization") || "";
    const match = authHeader.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (!match) return res.status(401).json({ error: "Missing bearer token" });
    const rawToken = match[1].trim();
    const accessToken = rawToken.replace(/^"(.*)"$/, "$1");

    const supabase = createSupabaseAnonWithToken(accessToken);
    const { data, error } = await supabase.auth.getUser(accessToken);
    const authUser = data?.user;
    if (error || !authUser) return res.status(401).json({ error: "Invalid token" });

    const clientPlatform = parseClientPlatform(req.header("X-Client-Platform"));
    if (clientPlatform) {
      const { data: profRow, error: profErr } = await supabase
        .from("profiles")
        .select("role, access_platform, active")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (profErr) return res.status(500).json({ error: profErr.message });

      if (profRow && profRow.role !== "admin" && profRow.active === false) {
        return res.status(403).json({ error: "Perfil inativo. Aguarde liberação pelo administrador." });
      }

      if (profRow && !canAccessClientPlatform(profRow, clientPlatform)) {
        const destino = clientPlatform === "web" ? "o painel web" : "o aplicativo mobile";
        return res.status(403).json({ error: `Esta conta não tem permissão para acessar ${destino}.` });
      }
    }

    req.userId = authUser.id;
    return next();
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] requireAuth error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}

