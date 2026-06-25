import "dotenv/config";
import {
  buildEquipamentoExternoQrUrl,
  equipamentosExternosConnectionMode,
  findEquipamentoExterno,
  isEquipamentosExternosConfigured,
} from "../lib/equipamentosExternos";

async function main() {
  console.log("Conexão:", equipamentosExternosConnectionMode() ?? "(não configurado)");
  console.log("Externo configurado:", isEquipamentosExternosConfigured());
  console.log("EQUIPAMENTOS_QR_PUBLIC_BASE_URL:", process.env.EQUIPAMENTOS_QR_PUBLIC_BASE_URL ?? "(vazio)");

  const ativo = process.argv[2]?.trim();
  if (!ativo) {
    console.log("\nUso: npm run test:equipamentos-externos -- ASD123");
    return;
  }

  const obraArg = process.argv[3];
  const obra = obraArg ? Number(obraArg) : null;
  const found = await findEquipamentoExterno(ativo, obra);
  if (!found) {
    console.log(`\nNenhum equipamento encontrado para ativo=${ativo} obra=${obra ?? "—"}`);
    return;
  }

  const url = buildEquipamentoExternoQrUrl(found.qr_token, process.env.EQUIPAMENTOS_QR_PUBLIC_BASE_URL);
  console.log("\nEncontrado:");
  console.log("  ativo_placa:", found.ativo_placa);
  console.log("  name:", found.name);
  console.log("  empresa:", found.company_name ?? "—");
  console.log("  contrato:", found.contract_name ?? "—");
  console.log("  obra:", found.obra_code ?? "—");
  console.log("  qr_token:", found.qr_token);
  console.log("  QR URL:", url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
