import { Request, Response, NextFunction } from "express";
import { createSupabaseAnonWithToken } from "../lib/supabase";

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

    req.userId = authUser.id;
    return next();
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] requireAuth error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
