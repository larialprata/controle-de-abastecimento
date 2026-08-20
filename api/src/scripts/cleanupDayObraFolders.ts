/**
 * Apaga pastas antigas (data)-(obra) sob ano/mês no SharePoint,
 * após reorganização para ano/mês/Assinaturas|...
 *
 *   npx ts-node --transpile-only src/scripts/cleanupDayObraFolders.ts --apply
 */
import "dotenv/config";
import { envValidated } from "../config";

const GRAPH = "https://graph.microsoft.com/v1.0";
const APPLY = process.argv.includes("--apply");
const DAY_OBRA_RE = /^\d{4}-\d{2}-\d{2}-/;

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
  const h = { Authorization: `Bearer ${t}` };
  const siteId = encodeURIComponent(envValidated.SHAREPOINT_SITE_ID);
  const drive = (await (await fetch(`${GRAPH}/sites/${siteId}/drive`, { headers: h })).json()) as {
    id: string;
  };
  const root = envValidated.SHAREPOINT_FOLDER_OPERATION;

  const years = (await (
    await fetch(`${GRAPH}/drives/${drive.id}/root:/${enc(root)}:/children?$top=50`, { headers: h })
  ).json()) as { value?: Array<{ id: string; name: string; folder?: unknown }> };

  let toDelete: Array<{ id: string; path: string }> = [];

  for (const year of years.value ?? []) {
    if (!year.folder || !/^\d{4}$/.test(year.name)) continue;
    const months = (await (
      await fetch(`${GRAPH}/drives/${drive.id}/items/${year.id}/children?$top=50`, { headers: h })
    ).json()) as { value?: Array<{ id: string; name: string; folder?: unknown }> };

    for (const month of months.value ?? []) {
      if (!month.folder || !/^\d{2}$/.test(month.name)) continue;
      const kids = (await (
        await fetch(`${GRAPH}/drives/${drive.id}/items/${month.id}/children?$top=200`, { headers: h })
      ).json()) as { value?: Array<{ id: string; name: string; folder?: unknown }> };

      for (const kid of kids.value ?? []) {
        if (kid.folder && DAY_OBRA_RE.test(kid.name)) {
          toDelete.push({ id: kid.id, path: `${root}/${year.name}/${month.name}/${kid.name}` });
        }
      }
    }
  }

  console.log(`pastas (data)-(obra) a remover: ${toDelete.length}`);
  toDelete.slice(0, 10).forEach((x) => console.log(" ", x.path));
  if (toDelete.length > 10) console.log("  ...");

  if (!APPLY) {
    console.log("dry-run — use --apply");
    return;
  }

  for (const item of toDelete) {
    const del = await fetch(`${GRAPH}/drives/${drive.id}/items/${item.id}`, {
      method: "DELETE",
      headers: h,
    });
    console.log(del.ok ? `removed ${item.path}` : `FAIL ${item.path} ${del.status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
