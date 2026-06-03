import * as FileSystem from "expo-file-system/legacy";

export async function readImageUriAsArrayBuffer(uri: string): Promise<{ arrayBuffer: ArrayBuffer; contentType: string }> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

  const extMatch = uri.match(/\.(\w+)(?:\?|#|$)/);
  const ext = (extMatch?.[1] ?? "jpg").toLowerCase();
  const safeExt = ext === "png" ? "png" : "jpg";
  const contentType = safeExt === "png" ? "image/png" : "image/jpeg";

  return {
    arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    contentType,
  };
}
