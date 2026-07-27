import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { envValidated } from "../config";

/** Preferência: Resend (API key). Fallback: SMTP Microsoft/etc. */
export function isEmailConfigured(): boolean {
  if (envValidated.RESEND_API_KEY?.trim()) return true;
  return Boolean(envValidated.SMTP_HOST && envValidated.SMTP_FROM);
}

function resolveFromAddress(): string {
  const from = (envValidated.SMTP_FROM ?? envValidated.RESEND_FROM ?? "").trim();
  if (from) return from;
  // Conta de teste gratuita do Resend (só envia para o e-mail da conta Resend)
  return "Controle Abastecimento <onboarding@resend.dev>";
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = envValidated.RESEND_API_KEY!.trim();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resolveFromAddress(),
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    name?: string;
    id?: string;
  };

  if (!res.ok) {
    throw new Error(
      typeof json.message === "string"
        ? `Resend: ${json.message}`
        : `Resend HTTP ${res.status}`,
    );
  }
}

async function sendViaSmtp(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (!envValidated.SMTP_HOST || !envValidated.SMTP_FROM) {
    throw new Error("SMTP não configurado (SMTP_HOST / SMTP_FROM).");
  }

  const transportOptions: SMTPTransport.Options = {
    host: envValidated.SMTP_HOST,
    port: envValidated.SMTP_PORT,
    secure: envValidated.SMTP_SECURE,
  };

  if (envValidated.SMTP_USER) {
    transportOptions.auth = {
      user: envValidated.SMTP_USER,
      pass: envValidated.SMTP_PASS ?? "",
    };
  }

  const transporter = nodemailer.createTransport(transportOptions);
  await transporter.sendMail({
    from: envValidated.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error(
      "E-mail não configurado. Defina RESEND_API_KEY (recomendado) ou SMTP_HOST/SMTP_FROM no .env da API.",
    );
  }

  if (envValidated.RESEND_API_KEY?.trim()) {
    await sendViaResend(opts);
    return;
  }

  await sendViaSmtp(opts);
}
