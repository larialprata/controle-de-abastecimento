import { envValidated } from "../../config";
import { createSharePointObjectStorage } from "./sharepointStorage";
import { createSupabaseObjectStorage } from "./supabaseStorage";
import type { ObjectStorage, StorageUploadOptions } from "./types";

let cached: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (cached) return cached;
  if (envValidated.STORAGE_PROVIDER === "sharepoint") {
    cached = createSharePointObjectStorage();
  } else {
    cached = createSupabaseObjectStorage();
  }
  return cached;
}

export async function storageUpload(
  bucket: string,
  path: string,
  data: Buffer,
  options?: StorageUploadOptions,
): Promise<void> {
  await getObjectStorage().upload(bucket, path, data, options);
}

export async function storageExists(bucket: string, path: string): Promise<boolean> {
  return getObjectStorage().exists(bucket, path);
}

export async function storageDownload(bucket: string, path: string): Promise<Buffer> {
  return getObjectStorage().download(bucket, path);
}

export async function storageCreateSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  return getObjectStorage().createSignedUrl(bucket, path, expiresInSeconds);
}

export type { ObjectStorage, StorageUploadOptions };
