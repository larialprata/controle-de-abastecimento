import * as FileSystem from "expo-file-system/legacy";
import { insertPendingMedia } from "../db/sqlite";
import { parseBase64DataUrl } from "../lib/signatureImage";

const OFFLINE_ROOT = `${FileSystem.documentDirectory ?? ""}pending-media/`;
const CAPTURE_ROOT = `${FileSystem.documentDirectory ?? ""}captured-photos/`;

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

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function ensureOperationDir(operationId: string): Promise<string> {
  const dir = `${OFFLINE_ROOT}${operationId}/`;
  await ensureDir(dir);
  return dir;
}

/**
 * Copia a foto da câmera/galeria para o armazenamento interno do app.
 * URIs de cache/content:// somem ou não leem bem offline — por isso persistimos na hora.
 */
export async function persistCapturedPhoto(sourceUri: string): Promise<string> {
  if (!sourceUri?.trim()) throw new Error("URI da foto inválida.");
  if (!FileSystem.documentDirectory) {
    throw new Error("Armazenamento local indisponível neste dispositivo.");
  }

  // Já está no armazenamento interno do app
  if (sourceUri.startsWith(FileSystem.documentDirectory)) {
    return sourceUri;
  }

  await ensureDir(CAPTURE_ROOT);
  const ext = extFromUri(sourceUri);
  const dest = `${CAPTURE_ROOT}${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch {
    // Fallback: lê e regrava (necessário em alguns content:// do Android)
    const base64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(dest, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return dest;
  }
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
  const dir = await ensureOperationDir(operationId);
  const localUri = `${dir}${safeLocalName(storagePath)}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: durableUri, to: localUri });
  } catch {
    const base64 = await FileSystem.readAsStringAsync(durableUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(localUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  // Confirma que o arquivo local existe antes de enfileirar
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
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
  const dir = await ensureOperationDir(operationId);
  const localUri = `${dir}${safeLocalName(storagePath)}.png`;
  await FileSystem.writeAsStringAsync(localUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  insertPendingMedia({
    operation_id: operationId,
    bucket,
    storage_path: storagePath,
    local_uri: localUri,
    content_type: contentType,
  });
}
