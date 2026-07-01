import { Response, NextFunction } from "express";
import { createSupabaseAnonWithToken, createSupabaseServiceRole } from "../lib/supabase";
import type { AuthedRequest } from "./requireAuth";

export type { AuthedRequest };

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.header("Authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: "Missing bearer token" });
    const accessToken = match[1];

    const supabase = createSupabaseAnonWithToken(accessToken);
    const { data, error: authError } = await supabase.auth.getUser();
    const authUser = data?.user;
    if (authError || !authUser) return res.status(401).json({ error: "Invalid token" });

    req.userId = authUser.id;

    const service = createSupabaseServiceRole();
    const { data: profRow, error: profError } = await service
      .from("profiles")
      .select("role")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (profError) return res.status(500).json({ error: profError.message });
    if (!profRow || profRow.role !== "admin") return res.status(403).json({ error: "Admin only" });

    return next();
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
