import { Router } from "express";
import { z } from "zod";
import { envValidated } from "../config";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { storageUpload } from "../lib/storage";
import { isMonthOrganizedStoragePath } from "../lib/storage/photoNaming";

const router = Router();

const KNOWN_BUCKETS = new Set([
  envValidated.CNH_BUCKET,
  envValidated.NOTAS_BUCKET,
  envValidated.LACRE_TANQUE_BUCKET,
  envValidated.LACRE_MELOSA_BUCKET,
  envValidated.MEDIDOR_TANQUE_BUCKET,
  envValidated.CONFIRMACAO_ABASTECIMENTO_BUCKET,
  envValidated.RETIRADA_HORIMETRO_BUCKET,
  envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
  envValidated.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET,
  envValidated.MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
  envValidated.MELOSA_LACRE_BUCKET,
  envValidated.MELOSA_ASSINATURAS_BUCKET,
  "melosa_medidor_acumulado",
  "melosa_comprovantes",
  "melosa_tanques",
  "melosa_tanque",
  "cnh",
]);

const uploadSchema = z.object({
  bucket: z.string().min(1),
  storage_path: z.string().min(1),
  content_type: z.string().optional(),
  data_base64: z.string().min(1),
  upsert: z.boolean().optional(),
});

function parseBase64Payload(raw: string, contentTypeHint?: string): { bytes: Buffer; contentType: string } {
  let contentType = contentTypeHint?.trim() || "application/octet-stream";
  let b64 = raw.trim();

  const dataUrl = /^data:([^;,]+);base64,(.+)$/i.exec(b64);
  if (dataUrl) {
    contentType = dataUrl[1] || contentType;
    b64 = dataUrl[2] ?? "";
  }

  const bytes = Buffer.from(b64, "base64");
  if (!bytes.length) throw new Error("data_base64 inválido");
  return { bytes, contentType };
}

/** Upload genérico (mobile sync / CNH) — destino conforme STORAGE_PROVIDER. */
router.post("/media/upload", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const bucket = parsed.data.bucket.trim();
    const storagePath = parsed.data.storage_path.trim().replace(/^\/+/, "");
    if (!KNOWN_BUCKETS.has(bucket)) {
      return res.status(400).json({ error: `Bucket não permitido: ${bucket}` });
    }
    if (!storagePath || storagePath.includes("..")) {
      return res.status(400).json({ error: "storage_path inválido" });
    }

    // Path deve pertencer ao usuário (legado userId/...) ou já estar no formato mensal (YYYY-MM/...).
    if (!isMonthOrganizedStoragePath(storagePath)) {
      const first = storagePath.split("/")[0];
      if (first !== req.userId) {
        return res.status(403).json({ error: "storage_path deve começar com o seu userId" });
      }
    }

    let parsedImage: { bytes: Buffer; contentType: string };
    try {
      parsedImage = parseBase64Payload(parsed.data.data_base64, parsed.data.content_type);
    } catch (e: unknown) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Payload inválido" });
    }

    await storageUpload(bucket, storagePath, parsedImage.bytes, {
      contentType: parsedImage.contentType,
      upsert: parsed.data.upsert ?? true,
    });

    return res.json({
      ok: true,
      bucket,
      storage_path: storagePath,
      provider: envValidated.STORAGE_PROVIDER,
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/media/upload error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

export default router;
