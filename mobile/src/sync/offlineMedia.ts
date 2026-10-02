import * as FileSystem from "expo-file-system/legacy";
import { insertPendingMedia } from "../db/sqlite";
import { parseBase64DataUrl } from "../lib/signatureImage";

function safeLocalName(storagePath: string): string {
  return storagePath.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function extFromUri(uri: string): string {
  const extMatch = String(uri).match(/\.(\w+)(?:\?|#|$)/);
  const ext = (extMatch?.[1] ?? "jpg").toLowerCase();
  return ext === "png" ? "png" : "jpg";
}

function contentTypeFromExt(ext: string): string {
  return ext === "png" ? "image/png" : "image/jpeg";
}

function requireDocumentDir(): string {
  const dir = FileSystem.documentDirectory;
  if (!dir) {
    throw new Error("Armazenamento local indisponível neste dispositivo.");
  }
  return dir.endsWith("/") ? dir : `${dir}/`;
}

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function fileExists(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return Boolean(info.exists);
}

async function writeBase64File(dest: string, base64: string): Promise<void> {
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!(await fileExists(dest))) {
    throw new Error("Não foi possível guardar a foto no celular. Tente tirar a foto novamente.");
  }
}

/**
 * Copia a foto da câmera/galeria para o armazenamento interno do app.
 * URIs de cache/content:// somem ou não leem bem offline — por isso persistimos na hora.
 * O base64 (quando a câmera devolve) grava direto, sem depender de rede nem de content://.
 */
export async function persistCapturedPhoto(sourceUri: string, base64?: string | null): Promise<string> {
  const trimmedUri = sourceUri?.trim() ?? "";
  const trimmedBase64 = base64?.trim() ?? "";
  if (!trimmedUri && !trimmedBase64) throw new Error("URI da foto inválida.");

  const root = requireDocumentDir();
  if (trimmedUri.startsWith(root) && !trimmedBase64) {
    return trimmedUri;
  }

  const captureRoot = `${root}captured-photos/`;
  await ensureDir(captureRoot);
  const ext = trimmedBase64 ? "jpg" : extFromUri(trimmedUri || "foto.jpg");
  const dest = `${captureRoot}${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  if (trimmedBase64) {
    await writeBase64File(dest, trimmedBase64);
    return dest;
  }

  try {
    await FileSystem.copyAsync({ from: trimmedUri, to: dest });
    if (await fileExists(dest)) return dest;
  } catch {
    // content:// do Android nem sempre copia; tenta ler os bytes.
  }

  const read = await FileSystem.readAsStringAsync(trimmedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await writeBase64File(dest, read);
  return dest;
}

export async function stageImageFromUri(
  operationId: string,
  bucket: string,
  storagePath: string,
  sourceUri: string,
): Promise<void> {
  const durableUri = await persistCapturedPhoto(sourceUri);
  const ext = extFromUri(durableUri);
  const contentType = contentTypeFromExt(ext);
  const root = requireDocumentDir();
  const dir = `${root}pending-media/${operationId}/`;
  await ensureDir(dir);
  const localUri = `${dir}${safeLocalName(storagePath)}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: durableUri, to: localUri });
  } catch {
    const base64 = await FileSystem.readAsStringAsync(durableUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await writeBase64File(localUri, base64);
  }

  if (!(await fileExists(localUri))) {
    throw new Error("Não foi possível guardar a foto no celular. Tente tirar a foto novamente.");
  }

  insertPendingMedia({
    operation_id: operationId,
    bucket,
    storage_path: storagePath,
    local_uri: localUri,
    content_type: contentType,
  });
}

export async function stageImageFromDataUrl(
  operationId: string,
  bucket: string,
  storagePath: string,
  dataUrl: string,
): Promise<void> {
  const { base64, contentType } = parseBase64DataUrl(dataUrl);
  if (!base64.trim()) {
    throw new Error("Não foi possível guardar a assinatura no celular. Assine novamente.");
  }
  const root = requireDocumentDir();
  const dir = `${root}pending-media/${operationId}/`;
  await ensureDir(dir);
  const localUri = `${dir}${safeLocalName(storagePath)}.png`;
  await writeBase64File(localUri, base64);
  insertPendingMedia({
    operation_id: operationId,
    bucket,
    storage_path: storagePath,
    local_uri: localUri,
    content_type: contentType,
  });
}
