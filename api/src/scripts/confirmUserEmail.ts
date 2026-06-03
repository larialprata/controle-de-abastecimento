import { createSupabaseServiceRole } from "../lib/supabase";

const emailArg = process.argv[2];
if (!emailArg) {
  // eslint-disable-next-line no-console
  console.error("Uso: npm run confirm:email -- <email@exemplo.com>");
  process.exit(1);
}

const emailNorm = emailArg.trim().toLowerCase();

async function main() {
  const service = createSupabaseServiceRole();

  let userId: string | null = null;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = (data?.users ?? []) as { id: string; email?: string | null }[];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === emailNorm);
    if (found) {
      userId = found.id;
      break;
    }
    if (users.length < 200) break;
  }

  if (!userId) throw new Error(`Usuário não encontrado: ${emailNorm}`);

  const { error: updError } = await service.auth.admin.updateUserById(userId, { email_confirm: true });
  if (updError) throw updError;

  // eslint-disable-next-line no-console
  console.log(`Email confirmado: ${emailNorm} (user_id=${userId})`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
