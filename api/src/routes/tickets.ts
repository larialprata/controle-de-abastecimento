import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

const allocateSchema = z.object({
  origem: z.enum(["tanque", "melosa"]),
  operation_ids: z.array(z.string().uuid()).min(1).max(200),
});

async function isAdmin(service: ReturnType<typeof createSupabaseServiceRole>, userId: string) {
  const { data, error } = await service.from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.role === "admin";
}

async function nextTicketNumero(service: ReturnType<typeof createSupabaseServiceRole>): Promise<number> {
  const { data, error } = await service.rpc("next_ticket_numero");
  if (error) throw error;
  const n = Number(data);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Falha ao gerar número do ticket.");
  return n;
}

router.post("/tickets/numeros", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = allocateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    const { origem, operation_ids: operationIds } = parsed.data;
    const table = origem === "melosa" ? "melosa_movimentacoes" : "movimentacoes";
    const service = createSupabaseServiceRole();
    const admin = await isAdmin(service, req.userId);

    const numeros: Record<string, number> = {};

    for (const operationId of operationIds) {
      const { data: row, error: fetchError } = await service
        .from(table)
        .select("operation_id, usuario_id, ticket_numero")
        .eq("operation_id", operationId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!row) {
        return res.status(404).json({ error: `Movimentação não encontrada: ${operationId}` });
      }

      if (!admin && row.usuario_id !== req.userId) {
        return res.status(403).json({ error: "Sem permissão para emitir ticket desta movimentação." });
      }

      if (row.ticket_numero != null) {
        numeros[operationId] = row.ticket_numero;
        continue;
      }

      const ticketNumero = await nextTicketNumero(service);
      const { error: updateError } = await service
        .from(table)
        .update({ ticket_numero: ticketNumero })
        .eq("operation_id", operationId);

      if (updateError) throw updateError;
      numeros[operationId] = ticketNumero;
    }

    return res.json({ numeros });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
});

export default router;
