import { createSupabaseServiceRole } from "../supabase";
import type { ObjectStorage, StorageUploadOptions } from "./types";

function normalizePath(storagePath: string): string {
  return storagePath.trim().replace(/^\/+/, "");
}

export function createSupabaseObjectStorage(): ObjectStorage {
  const service = createSupabaseServiceRole();

  return {
    async upload(bucket, path, data, options) {
      const storagePath = normalizePath(path);
      const { error } = await service.storage.from(bucket).upload(storagePath, data, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? true,
      });
      if (error) throw new Error(error.message);
    },

    async exists(bucket, path) {
      const storagePath = normalizePath(path);
      if (!storagePath) return false;

      const { data, error } = await service.storage.from(bucket).exists(storagePath);
      if (error) {
        console.warn("[storage.exists]", bucket, storagePath, error.message);
      }
      if (data === true) return true;

      const slash = storagePath.lastIndexOf("/");
      const folder = slash >= 0 ? storagePath.slice(0, slash) : "";
      const fileName = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
      const { data: listed, error: listError } = await service.storage.from(bucket).list(folder, {
        limit: 200,
        search: fileName,
      });
      if (listError) {
        console.warn("[storage.list]", bucket, folder, listError.message);
        return false;
      }
      return listed?.some((f) => f.name === fileName) ?? false;
    },

    async download(bucket, path) {
      const storagePath = normalizePath(path);
      const { data, error } = await service.storage.from(bucket).download(storagePath);
      if (error || !data) throw new Error(error?.message ?? "Arquivo não encontrado no Storage");
      return Buffer.from(await data.arrayBuffer());
    },

    async createSignedUrl(bucket, path, expiresInSeconds) {
      const storagePath = normalizePath(path);
      const { data, error } = await service.storage
        .from(bucket)
        .createSignedUrl(storagePath, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "Não foi possível gerar URL assinada");
      }
      return data.signedUrl;
    },
  };
}
