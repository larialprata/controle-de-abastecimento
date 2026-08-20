export type StorageUploadOptions = {
  contentType?: string;
  upsert?: boolean;
};

export type StorageObjectRef = {
  bucket: string;
  path: string;
};

export interface ObjectStorage {
  upload(bucket: string, path: string, data: Buffer, options?: StorageUploadOptions): Promise<void>;
  exists(bucket: string, path: string): Promise<boolean>;
  download(bucket: string, path: string): Promise<Buffer>;
  createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
}
