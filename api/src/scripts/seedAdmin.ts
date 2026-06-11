import { createSupabaseServiceRole } from "../lib/supabase";

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@exemplo.com";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
const ROLE = process.env.SEED_ADMIN_ROLE ?? "admin";
const ADMIN_CPF = (process.env.SEED_ADMIN_CPF ?? "99999999999").replace(/\D/g, "");

async function main() {
  const service = createSupabaseServiceRole();

  const { data: list, error: listError } = await service.auth.admin.listUsers();
  if (listError) throw listError;

  type AuthUser = { id: string; email?: string | null };
  const users = ((list as any)?.users ?? []) as AuthUser[];

  const existing = users.find((u) => u.email === EMAIL);
  if (!existing) {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (createError) throw createError;

    if (!created?.user?.id) throw new Error("Falha ao criar usuário admin");

    const userId = created.user.id;
    const { error: profError } = await service.from("profiles").upsert(
      {
        user_id: userId,
        full_name: "Administrador",
        cpf: ADMIN_CPF.length === 11 ? ADMIN_CPF : "99999999999",
        address: "—",
        phone: "—",
        email: EMAIL,
        cnh_storage_path: null,
        role: ROLE,
        access_platform: "both",
      },
      { onConflict: "user_id" }
    );
    if (profError) throw profError;

    console.log(`Admin seed criado: ${EMAIL} (user_id=${userId}, profiles.role=${ROLE})`);
    return;
  }

  const userId = existing.id;
  const { error: profError } = await service.from("profiles").upsert(
    {
      user_id: userId,
      full_name: "Administrador",
      cpf: ADMIN_CPF.length === 11 ? ADMIN_CPF : "99999999999",
      address: "—",
      phone: "—",
      email: EMAIL,
      cnh_storage_path: null,
      role: ROLE,
      access_platform: "both",
    },
    { onConflict: "user_id" }
  );
  if (profError) throw profError;

  console.log(`Admin seed atualizado: ${EMAIL} (user_id=${userId}, profiles.role=${ROLE})`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

