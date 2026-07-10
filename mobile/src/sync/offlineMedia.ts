import * as FileSystem from "expo-file-system/legacy";
import { insertPendingMedia } from "../db/sqlite";
import { readImageUriAsArrayBuffer } from "../lib/readImageUri";
import { parseBase64DataUrl } from "../lib/signatureImage";

const OFFLINE_ROOT = `${FileSystem.documentDirectory ?? ""}pending-media/`;

function safeLocalName(storagePath: string): string {
  return storagePath.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function extFromUri(uri: string): string {
  const extMatch = String(uri).match(/\.(\w+)(?:\?|#|$)/);
  const ext = (extMatch?.[1] ?? "jpg").toLowerCase();
  return ext === "png" ? "png" : "jpg";
}

async function ensureOperationDir(operationId: string): Promise<string> {
  const dir = `${OFFLINE_ROOT}${operationId}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function stageImageFromUri(
  operationId: string,
  bucket: string,
  storagePath: string,
  sourceUri: string,
): Promise<void> {
  const { contentType } = await readImageUriAsArrayBuffer(sourceUri);
  const ext = extFromUri(sourceUri);
  const dir = await ensureOperationDir(operationId);
  const localUri = `${dir}${safeLocalName(storagePath)}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
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
