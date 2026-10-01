import { timingSafeEqual } from "crypto";
import { Router } from "express";
import { envValidated } from "../config";
import { parseHorimetroNumero } from "../lib/equipamentoConsumo";
import { createSupabaseServiceRole } from "../lib/supabase";

const router = Router();

type HorimetroLeitura = {
  horimetro: number;
  horimetro_texto: string;
  unidade: "h" | "km";
  horimetro_em: string | null;
  nome_movimento: string | null;
};

function normAtivo(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}

function apiKeyOk(header: unknown): boolean {
  const expected = envValidated.INTEGRACAO_API_KEY?.trim() ?? "";
  const got = String(header ?? "").trim();
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function latestHorimetros(): Promise<Map<string, HorimetroLeitura>> {
  const service = createSupabaseServiceRole();
  const latest = new Map<string, HorimetroLeitura>();
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await service
      .from("melosa_movimentacoes")
      .select(
        "data_hora, ativo_equipamento_texto, ativo_equipamento_nome, melosa_horimetro_equipamento_abastecido_numero",
      )
      .eq("tipo", "RETIRADA_MELOSA")
      .order("data_hora", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const ativo = normAtivo(row.ativo_equipamento_texto);
      if (!ativo || latest.has(ativo)) continue;
      const texto = String(row.melosa_horimetro_equipamento_abastecido_numero ?? "").trim();
      const parsed = parseHorimetroNumero(texto);
      if (!parsed) continue;
      latest.set(ativo, {
        horimetro: parsed.valor,
        horimetro_texto: texto,
        unidade: parsed.unidade === "km" ? "km" : "h",
        horimetro_em: row.data_hora ? String(row.data_hora) : null,
        nome_movimento: String(row.ativo_equipamento_nome ?? "").trim() || null,
      });
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return latest;
}

router.get("/integracao/ativos", async (req, res) => {
  try {
    if (!envValidated.INTEGRACAO_API_KEY?.trim()) {
      return res.status(503).json({ error: "Integração não configurada (INTEGRACAO_API_KEY)." });
    }
    if (!apiKeyOk(req.header("x-api-key"))) {
      return res.status(401).json({ error: "API key inválida." });
    }

    const ativoFiltro = normAtivo(req.query.ativo);
    const busca = String(req.query.q ?? "")
      .trim()
      .toLowerCase();
    const limitRaw = Number(req.query.limit ?? 500);
    const offsetRaw = Number(req.query.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(2000, Math.max(1, Math.trunc(limitRaw))) : 500;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.trunc(offsetRaw)) : 0;

    const service = createSupabaseServiceRole();
    const { data: equipamentos, error } = await service
      .from("equipamentos")
      .select("ativo, nome")
      .eq("tipo", "EQUIPAMENTO")
      .order("ativo");
    if (error) return res.status(500).json({ error: error.message });

    const horimetros = await latestHorimetros();
    const porAtivo = new Map<string, { ativo: string; nome: string | null }>();

    for (const eq of equipamentos ?? []) {
      const ativo = normAtivo(eq.ativo);
      if (!ativo) continue;
      porAtivo.set(ativo, {
        ativo: String(eq.ativo).trim(),
        nome: String(eq.nome ?? "").trim() || null,
      });
    }

    for (const [ativo, leitura] of horimetros) {
      if (porAtivo.has(ativo)) continue;
      porAtivo.set(ativo, {
        ativo,
        nome: leitura.nome_movimento,
      });
    }

    let itens = Array.from(porAtivo.entries()).map(([key, eq]) => {
      const leitura = horimetros.get(key);
      return {
        ativo: eq.ativo,
        nome: eq.nome,
        horimetro: leitura?.horimetro ?? null,
        horimetro_texto: leitura?.horimetro_texto ?? null,
        unidade: leitura?.unidade ?? null,
        horimetro_em: leitura?.horimetro_em ?? null,
      };
    });

    if (ativoFiltro) {
      itens = itens.filter((item) => normAtivo(item.ativo) === ativoFiltro);
    }
    if (busca) {
      itens = itens.filter((item) => {
        const blob = `${item.ativo} ${item.nome ?? ""}`.toLowerCase();
        return blob.includes(busca);
      });
    }

    itens.sort((a, b) => a.ativo.localeCompare(b.ativo, "pt-BR"));
    const total = itens.length;

    return res.json({
      itens: itens.slice(offset, offset + limit),
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao listar ativos.",
    });
  }
});

export default router;
