import * as FileSystem from "expo-file-system/legacy";

export function parseBase64DataUrl(dataUrl: string): { base64: string; contentType: string } {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (match?.[1] && match[2]) {
    return { contentType: match[1], base64: match[2] };
  }
  return { contentType: "image/png", base64: dataUrl.replace(/^data:image\/\w+;base64,/, "") };
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function writeBase64ImageToCache(dataUrl: string, filename: string): Promise<string> {
  const { base64 } = parseBase64DataUrl(dataUrl);
  const path = `${FileSystem.cacheDirectory ?? ""}${filename}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}
