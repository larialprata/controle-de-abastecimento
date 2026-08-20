/**
 * Remove pastas antigas da 1ª organização (2026-06, 2026-07, notas, etc.)
 * após a reorganização ano/mês/(data)-(obra)/...
 *
 *   npx ts-node --transpile-only src/scripts/cleanupOldSharePointLayout.ts --apply
 */
import "dotenv/config";
import { envValidated } from "../config";

const GRAPH = "https://graph.microsoft.com/v1.0";
const APPLY = process.argv.includes("--apply");

async function token() {
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
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("token fail");
  return j.access_token;
}

function enc(p: string) {
  return p
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

async function main() {
  const t = await token();
  const siteId = encodeURIComponent(envValidated.SHAREPOINT_SITE_ID);
  const drive = (await (
    await fetch(`${GRAPH}/sites/${siteId}/drive`, { headers: { Authorization: `Bearer ${t}` } })
  ).json()) as { id: string };
  const root = envValidated.SHAREPOINT_FOLDER_OPERATION;
  const listRes = await fetch(`${GRAPH}/drives/${drive.id}/root:/${enc(root)}:/children?$top=50`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const listed = (await listRes.json()) as { value?: Array<{ id: string; name: string; folder?: unknown }> };
  const old = (listed.value ?? []).filter((x) => x.folder && /^(notas|\d{4}-\d{2})$/i.test(x.name));
  console.log(
    "pastas antigas:",
    old.map((o) => o.name),
  );
  if (!APPLY) {
    console.log("dry-run — use --apply para apagar");
    return;
  }
  for (const item of old) {
    const del = await fetch(`${GRAPH}/drives/${drive.id}/items/${item.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    console.log(del.ok ? `removed ${item.name}` : `FAIL ${item.name} ${del.status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
