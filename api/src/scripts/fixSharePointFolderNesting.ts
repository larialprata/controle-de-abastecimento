/**
 * Corrige pasta criada por engano: Documentos/documentos/teste/...
 * Move conteúdo para Teste/Combustível e Teste/CNH (raiz da biblioteca).
 *
 *   npx ts-node --transpile-only src/scripts/fixSharePointFolderNesting.ts
 */
import "dotenv/config";
import { envValidated } from "../config";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function token(): Promise<string> {
  const body = new URLSearchParams({
    client_id: envValidated.SHAREPOINT_CLIENT_ID,
    client_secret: envValidated.SHAREPOINT_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${envValidated.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  const j = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description ?? "token fail");
  return j.access_token;
}

function enc(p: string) {
  return p
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

async function graph(path: string, init?: RequestInit) {
  const t = await token();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${t}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${json?.error?.message ?? text}`);
  }
  return json;
}

async function getDriveId(): Promise<string> {
  const siteId = encodeURIComponent(envValidated.SHAREPOINT_SITE_ID);
  const drive = await graph(`/sites/${siteId}/drive`);
  return drive.id as string;
}

async function ensureFolder(driveId: string, folderPath: string): Promise<string> {
  const parts = folderPath.split("/").filter(Boolean);
  let parentPath = "";
  let parentId: string | null = null;

  for (const part of parts) {
    const currentPath = parentPath ? `${parentPath}/${part}` : part;
    try {
      const item = await graph(`/drives/${driveId}/root:/${enc(currentPath)}?$select=id,name`);
      parentId = item.id as string;
    } catch {
      const createBody = {
        name: part,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      };
      const created = parentId
        ? await graph(`/drives/${driveId}/items/${parentId}/children`, {
            method: "POST",
            body: JSON.stringify(createBody),
          })
        : await graph(`/drives/${driveId}/root/children`, {
            method: "POST",
            body: JSON.stringify(createBody),
          });
      parentId = created.id as string;
      console.log("created folder", currentPath);
    }
    parentPath = currentPath;
  }
  if (!parentId) throw new Error(`Falha ao garantir pasta ${folderPath}`);
  return parentId;
}

async function listChildren(driveId: string, folderPath: string) {
  try {
    const listed = await graph(`/drives/${driveId}/root:/${enc(folderPath)}:/children?$top=200`);
    return (listed.value ?? []) as Array<{ id: string; name: string; folder?: unknown }>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) return [];
    throw e;
  }
}

async function moveChildren(driveId: string, fromPath: string, toFolderId: string, toLabel: string) {
  const children = await listChildren(driveId, fromPath);
  console.log(`move ${children.length} itens de ${fromPath} -> ${toLabel}`);
  for (const child of children) {
    try {
      await graph(`/drives/${driveId}/items/${child.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          parentReference: { id: toFolderId },
          "@microsoft.graph.conflictBehavior": "rename",
        }),
      });
      console.log("  moved", child.name);
    } catch (e: unknown) {
      console.error("  FAIL", child.name, e instanceof Error ? e.message : e);
    }
  }
}

async function deleteIfEmpty(driveId: string, folderPath: string) {
  const children = await listChildren(driveId, folderPath);
  if (children.length > 0) {
    console.log(`não remove ${folderPath}: ainda tem ${children.length} itens`);
    return;
  }
  try {
    const item = await graph(`/drives/${driveId}/root:/${enc(folderPath)}?$select=id`);
    await graph(`/drives/${driveId}/items/${item.id}`, { method: "DELETE" });
    console.log("removed empty", folderPath);
  } catch (e: unknown) {
    console.warn("delete skip", folderPath, e instanceof Error ? e.message : e);
  }
}

async function main() {
  const driveId = await getDriveId();
  const destOps = envValidated.SHAREPOINT_FOLDER_OPERATION; // Teste/Combustível
  const destCnh = envValidated.SHAREPOINT_FOLDER_CNH; // Teste/CNH

  const opsId = await ensureFolder(driveId, destOps);
  const cnhId = await ensureFolder(driveId, destCnh);

  await moveChildren(driveId, "documentos/teste/combustível", opsId, destOps);
  await moveChildren(driveId, "documentos/teste/CNH", cnhId, destCnh);

  // limpa árvore errada de dentro para fora
  await deleteIfEmpty(driveId, "documentos/teste/combustível");
  await deleteIfEmpty(driveId, "documentos/teste/CNH");
  await deleteIfEmpty(driveId, "documentos/teste");
  await deleteIfEmpty(driveId, "documentos");

  const check = await listChildren(driveId, destOps);
  console.log(`OK em ${destOps}:`, check.map((c) => c.name));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
