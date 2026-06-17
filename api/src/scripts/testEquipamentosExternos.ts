import "dotenv/config";
import pg from "pg";
import {
  findEquipamentoExterno,
  isEquipamentosExternosConfigured,
  buildEquipamentoExternoQrUrl,
} from "../lib/equipamentosExternos";

async function main() {
  console.log("EQUIPAMENTOS_DB_URL configurado:", isEquipamentosExternosConfigured());
  console.log("EQUIPAMENTOS_QR_PUBLIC_BASE_URL:", process.env.EQUIPAMENTOS_QR_PUBLIC_BASE_URL ?? "(vazio)");

  const pool = new pg.Pool({
    connectionString: process.env.EQUIPAMENTOS_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  const total = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM equipments WHERE active = true AND ativo_placa IS NOT NULL",
  );
  console.log("Equipamentos ativos com ativo_placa:", total.rows[0]?.n);

  const withObra = await pool.query(
    `SELECT e.ativo_placa, o.code AS obra_code, e.qr_token, e.name
     FROM equipments e
     INNER JOIN obras o ON o.id = e.obra_id
     WHERE e.active = true AND e.ativo_placa IS NOT NULL
     ORDER BY e.created_at DESC
     LIMIT 5`,
  );
  console.log("\nAmostra com obra:", withObra.rows.length);
  for (const row of withObra.rows) {
    const obraNum = Number(String(row.obra_code).replace(/^0+\.?/, ""));
    const found = await findEquipamentoExterno(row.ativo_placa, obraNum);
    const url = found
      ? buildEquipamentoExternoQrUrl(found.qr_token, process.env.EQUIPAMENTOS_QR_PUBLIC_BASE_URL)
      : null;
    console.log(`  ${row.ativo_placa} + obra ${row.obra_code} => ${found ? "OK" : "FALHOU"} ${url ?? ""}`);
  }

  const semObra = await pool.query(
    `SELECT e.ativo_placa, e.qr_token, e.name
     FROM equipments e
     WHERE e.active = true AND e.ativo_placa IS NOT NULL
     ORDER BY e.created_at DESC
     LIMIT 3`,
  );
  console.log("\nAmostra sem obra (match só por ativo):");
  for (const row of semObra.rows) {
    const found = await findEquipamentoExterno(row.ativo_placa, null);
    const url = found
      ? buildEquipamentoExternoQrUrl(found.qr_token, process.env.EQUIPAMENTOS_QR_PUBLIC_BASE_URL)
      : null;
    console.log(`  ${row.ativo_placa} => ${found ? "OK" : "FALHOU"} ${url ?? ""}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
