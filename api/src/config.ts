import "dotenv/config";

export const env = {
  SUPABASE_URL: process.env.SUPABASE_URL as string | undefined,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY as string | undefined,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined,
  // Bucket onde a CNH foi enviada via Expo (default: "cnh")
  CNH_BUCKET: (process.env.CNH_BUCKET ?? "cnh") as string,
  // Bucket onde as notas foram enviadas via Expo (default: "notas")
  NOTAS_BUCKET: (process.env.NOTAS_BUCKET ?? "notas") as string,
  // Buckets de lacres na retirada de tanque
  LACRE_TANQUE_BUCKET: (process.env.LACRE_TANQUE_BUCKET ?? "lacre_tanque") as string,
  LACRE_MELOSA_BUCKET: (process.env.LACRE_MELOSA_BUCKET ?? "lacre_melosa") as string,
  // Bucket das fotos de medidor do tanque
  MEDIDOR_TANQUE_BUCKET: (process.env.MEDIDOR_TANQUE_BUCKET ?? "medidor_tanque") as string,
  // Bucket da foto de confirmação do abastecimento na retirada
  CONFIRMACAO_ABASTECIMENTO_BUCKET: (process.env.CONFIRMACAO_ABASTECIMENTO_BUCKET ?? "confirmacao_abastecimento") as string,
  RETIRADA_HORIMETRO_BUCKET: (process.env.RETIRADA_HORIMETRO_BUCKET ?? "retirada_horimetro") as string,
  // Bucket da foto da quantidade abastecida na retirada melosa
  FOTO_QUANTIDADE_ABASTECIDA_BUCKET: (process.env.FOTO_QUANTIDADE_ABASTECIDA_BUCKET ??
    "foto_quantidade_abastecida") as string,
  MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET: (process.env.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET ??
    "melosa_horimetro_equipamento_abastecido") as string,
  MELOSA_EQUIPAMENTO_OPERADOR_BUCKET: (process.env.MELOSA_EQUIPAMENTO_OPERADOR_BUCKET ?? "melosa_equipamento_operador") as string,
  MELOSA_LACRE_BUCKET: (process.env.MELOSA_LACRE_BUCKET ?? "melosa_lacre") as string,
  MELOSA_ASSINATURAS_BUCKET: (process.env.MELOSA_ASSINATURAS_BUCKET ?? "melosa_assinaturas") as string,
  EQUIPAMENTOS_DB_URL: process.env.EQUIPAMENTOS_DB_URL as string | undefined,
  EQUIPAMENTOS_QR_PUBLIC_BASE_URL: process.env.EQUIPAMENTOS_QR_PUBLIC_BASE_URL as string | undefined,
  PORT: Number(process.env.PORT ?? 3001),
  // Relatório diário por e-mail
  SMTP_HOST: process.env.SMTP_HOST as string | undefined,
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_SECURE: String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
  SMTP_USER: process.env.SMTP_USER as string | undefined,
  SMTP_PASS: process.env.SMTP_PASS as string | undefined,
  SMTP_FROM: process.env.SMTP_FROM as string | undefined,
  /** API key Resend — se definido, tem prioridade sobre SMTP */
  RESEND_API_KEY: process.env.RESEND_API_KEY as string | undefined,
  RESEND_FROM: process.env.RESEND_FROM as string | undefined,
  CRON_SECRET: process.env.CRON_SECRET as string | undefined,
  /** Hora local América/São Paulo (0–23) para disparo automático; vazio = desligado */
  DAILY_REPORT_HOUR: process.env.DAILY_REPORT_HOUR
    ? Number(process.env.DAILY_REPORT_HOUR)
    : undefined,
};

function assertEnv() {
  const missing: string[] = [];
  if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env.PORT) missing.push("PORT");
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

assertEnv();

// Depois de validar via assertEnv, o TypeScript ainda enxerga possivelmente undefined.
// Este cast “trava” os tipos para o restante do projeto.
export const envValidated = {
  SUPABASE_URL: env.SUPABASE_URL as string,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY as string,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY as string,
  CNH_BUCKET: env.CNH_BUCKET,
  NOTAS_BUCKET: env.NOTAS_BUCKET,
  LACRE_TANQUE_BUCKET: env.LACRE_TANQUE_BUCKET,
  LACRE_MELOSA_BUCKET: env.LACRE_MELOSA_BUCKET,
  MEDIDOR_TANQUE_BUCKET: env.MEDIDOR_TANQUE_BUCKET,
  CONFIRMACAO_ABASTECIMENTO_BUCKET: env.CONFIRMACAO_ABASTECIMENTO_BUCKET,
  RETIRADA_HORIMETRO_BUCKET: env.RETIRADA_HORIMETRO_BUCKET,
  FOTO_QUANTIDADE_ABASTECIDA_BUCKET: env.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
  MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET: env.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET,
  MELOSA_EQUIPAMENTO_OPERADOR_BUCKET: env.MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
  MELOSA_LACRE_BUCKET: env.MELOSA_LACRE_BUCKET,
  MELOSA_ASSINATURAS_BUCKET: env.MELOSA_ASSINATURAS_BUCKET,
  PORT: env.PORT,
  SMTP_HOST: env.SMTP_HOST,
  SMTP_PORT: env.SMTP_PORT,
  SMTP_SECURE: env.SMTP_SECURE,
  SMTP_USER: env.SMTP_USER,
  SMTP_PASS: env.SMTP_PASS,
  SMTP_FROM: env.SMTP_FROM,
  RESEND_API_KEY: env.RESEND_API_KEY,
  RESEND_FROM: env.RESEND_FROM,
  CRON_SECRET: env.CRON_SECRET,
  DAILY_REPORT_HOUR: env.DAILY_REPORT_HOUR,
};

