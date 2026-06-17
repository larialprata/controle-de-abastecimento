import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error(
      "Defina DATABASE_URL no api/.env\n" +
        "(Supabase → Project Settings → Database → Connection string → URI)",
    );
    process.exit(1);
  }

  const sqlPath = join(__dirname, "../../supabase/migration_equipamento_empresa_text.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sql);
    console.log("Migration equipamento_empresa_text aplicada com sucesso.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
