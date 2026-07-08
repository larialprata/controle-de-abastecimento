import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { glassField, glassPanel, glassSelect } from "../../lib/glass";

export type MelosaMovimentacaoFormRow = {
  operation_id?: string;
  obra_codigo?: number;
  data_hora?: string;
  ativo_melosa_texto?: string | null;
  placa_texto?: string | null;
  ativo_equipamento_texto?: string | null;
  fornecedor_texto?: string | null;
  tanque_numero?: number | string | null;
  melosa_combustivel_tipo_retirada?: string | null;
  melosa_combustivel_tipo_registro?: string | null;
  melosa_quantidade_abastecida?: string | null;
  litros?: number | string | null;
  melosa_categoria?: string | null;
  melosa_horimetro_equipamento_abastecido_numero?: string | null;
  melosa_motorista_equipamento_abastecido?: string | null;
  melosa_operador_nome?: string | null;
  melosa_lubrificado?: boolean | null;
  obs?: string | null;
};

type ObraOption = { codigo: number; nome: string };

type Props = {
  open: boolean;
  mode: "add" | "edit";
  initialRow?: MelosaMovimentacaoFormRow | null;
  obras: ObraOption[];
  melosasAtivos: string[];
  apiBase: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
};

const INSUMO_OPCOES = [
  { value: "DIESEL_S10", label: "Diesel S10" },
  { value: "GASOLINA", label: "Gasolina" },
  { value: "ALCOOL", label: "Álcool" },
] as const;

type HorimetroTipo = "" | "valor" | "quebrado" | "inexistente";

function parseHorimetroFromRow(num?: string | null): { tipo: HorimetroTipo; valor: string } {
  const raw = String(num ?? "").trim();
  if (!raw) return { tipo: "", valor: "" };
  const upper = raw.toUpperCase();
  if (upper === "QUEBRADO") return { tipo: "quebrado", valor: "" };
  if (upper === "INEXISTENTE") return { tipo: "inexistente", valor: "" };
  return { tipo: "valor", valor: raw };
}

function resolveHorimetroNumero(tipo: HorimetroTipo, valor: string): string | null {
  if (tipo === "quebrado") return "Quebrado";
  if (tipo === "inexistente") return "Inexistente";
  if (tipo === "valor") return valor.trim() || null;
  return null;
}

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLitros(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveInsumo(row?: MelosaMovimentacaoFormRow | null): string {
  const ret = row?.melosa_combustivel_tipo_retirada;
  if (ret != null && String(ret).trim()) return String(ret).trim();
  const reg = row?.melosa_combustivel_tipo_registro;
  if (reg != null && String(reg).trim()) return String(reg).trim();
  return "DIESEL_S10";
}

function resolveQuantidade(row?: MelosaMovimentacaoFormRow | null): string {
  const qtd = row?.melosa_quantidade_abastecida;
  if (qtd != null && String(qtd).trim()) return String(qtd).trim();
  const litros = row?.litros;
  if (litros != null && String(litros).trim()) return String(litros).trim();
  return "";
}

export default function MelosaMovimentacaoFormModal({
  open,
  mode,
  initialRow,
  obras,
  melosasAtivos,
  apiBase,
  token,
  onClose,
  onSaved,
}: Props) {
  const [obraCodigo, setObraCodigo] = useState("");
  const [dataHora, setDataHora] = useState("");
  const [ativoMelosa, setAtivoMelosa] = useState("");
  const [ativoEquipamento, setAtivoEquipamento] = useState("");
  const [insumo, setInsumo] = useState("DIESEL_S10");
  const [quantidadeLitros, setQuantidadeLitros] = useState("");
  const [categoria, setCategoria] = useState<"ESTACIONARIA" | "MOVEL">("MOVEL");
  const [horimetroTipo, setHorimetroTipo] = useState<HorimetroTipo>("");
  const [horimetroValor, setHorimetroValor] = useState("");
  const [motorista, setMotorista] = useState("");
  const [operador, setOperador] = useState("");
  const [lubrificado, setLubrificado] = useState(false);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const melosaOpcoes = useMemo(() => {
    const set = new Set(melosasAtivos.map((a) => a.trim().toUpperCase()).filter(Boolean));
    const atual = ativoMelosa.trim().toUpperCase();
    if (atual) set.add(atual);
    return Array.from(set).sort();
  }, [ativoMelosa, melosasAtivos]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && initialRow) {
      setObraCodigo(initialRow.obra_codigo != null ? String(initialRow.obra_codigo) : "");
      setDataHora(toDatetimeLocalValue(initialRow.data_hora));
      setAtivoMelosa(
        String(initialRow.ativo_melosa_texto ?? initialRow.placa_texto ?? "").trim().toUpperCase(),
      );
      setAtivoEquipamento(
        String(initialRow.ativo_equipamento_texto ?? initialRow.fornecedor_texto ?? "").trim().toUpperCase(),
      );
      setInsumo(resolveInsumo(initialRow));
      setQuantidadeLitros(resolveQuantidade(initialRow));
      const cat = initialRow.melosa_categoria;
      setCategoria(cat === "ESTACIONARIA" ? "ESTACIONARIA" : "MOVEL");
      const hor = parseHorimetroFromRow(initialRow.melosa_horimetro_equipamento_abastecido_numero);
      setHorimetroTipo(hor.tipo);
      setHorimetroValor(hor.valor);
      setMotorista(String(initialRow.melosa_motorista_equipamento_abastecido ?? "").trim());
      setOperador(String(initialRow.melosa_operador_nome ?? "").trim());
      setLubrificado(initialRow.melosa_lubrificado === true);
      setObs(String(initialRow.obs ?? "").trim());
    } else {
      setObraCodigo(obras[0] ? String(obras[0].codigo) : "");
      setDataHora(toDatetimeLocalValue(new Date().toISOString()));
      setAtivoMelosa(melosasAtivos[0]?.trim().toUpperCase() ?? "");
      setAtivoEquipamento("");
      setInsumo("DIESEL_S10");
      setQuantidadeLitros("");
      setCategoria("MOVEL");
      setHorimetroTipo("");
      setHorimetroValor("");
      setMotorista("");
      setOperador("");
      setLubrificado(false);
      setObs("");
    }
  }, [open, mode, initialRow, obras, melosasAtivos]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const obra = Number(obraCodigo);
    if (!Number.isFinite(obra) || obra <= 0) {
      setError("Selecione o contrato/obra.");
      return;
    }
    if (!dataHora.trim()) {
      setError("Informe data e hora.");
      return;
    }
    const melosa = ativoMelosa.trim().toUpperCase();
    if (!melosa) {
      setError("Informe o patrimônio da melosa.");
      return;
    }
    const equipamento = ativoEquipamento.trim().toUpperCase();
    if (!equipamento) {
      setError("Informe o ativo do equipamento abastecido.");
      return;
    }
    const litros = parseLitros(quantidadeLitros);
    if (litros == null) {
      setError("Quantidade em litros inválida.");
      return;
    }

    const dataIso = new Date(dataHora).toISOString();
    const horimetroNumero = resolveHorimetroNumero(horimetroTipo, horimetroValor);

    setSaving(true);
    try {
      if (mode === "add") {
        const res = await fetch(`${apiBase}/v1/melosa/movimentacoes`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            obra_codigo: obra,
            data_hora: dataIso,
            ativo_melosa_texto: melosa,
            ativo_equipamento_texto: equipamento,
            quantidade_litros: litros,
            melosa_combustivel_tipo_retirada: insumo,
            melosa_categoria: categoria || null,
            melosa_horimetro_equipamento_abastecido_numero: horimetroNumero,
            melosa_motorista_equipamento_abastecido: motorista.trim() || null,
            melosa_operador_nome: operador.trim() || null,
            melosa_lubrificado: lubrificado,
            obs: obs.trim() || null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      } else {
        const operationId = initialRow?.operation_id;
        if (!operationId) throw new Error("ID da movimentação não encontrado.");

        const res = await fetch(`${apiBase}/v1/melosa/movimentacoes/${operationId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            obra_codigo: obra,
            data_hora: dataIso,
            ativo_melosa_texto: melosa,
            ativo_equipamento_texto: equipamento,
            litros,
            melosa_quantidade_abastecida: String(litros),
            melosa_combustivel_tipo_retirada: insumo,
            melosa_categoria: categoria || null,
            melosa_horimetro_equipamento_abastecido_numero: horimetroNumero,
            melosa_motorista_equipamento_abastecido: motorista.trim() || null,
            melosa_operador_nome: operador.trim() || null,
            melosa_lubrificado: lubrificado,
            obs: obs.trim() || null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar movimentação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="melosa-mov-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="melosa-mov-form-title" className="text-lg font-bold text-slate-900 dark:text-white">
            {mode === "add" ? "Adicionar movimentação" : "Editar movimentação"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {mode === "add"
            ? "Registro manual pela web — fotos e assinaturas não são obrigatórias."
            : "Altere os dados da movimentação selecionada."}
        </p>

        <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label htmlFor="melosa-mov-obra" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Contrato / obra
            </label>
            <select
              id="melosa-mov-obra"
              className={glassSelect}
              value={obraCodigo}
              onChange={(e) => setObraCodigo(e.target.value)}
              disabled={saving}
              required
            >
              <option value="">Selecione…</option>
              {obras.map((o) => (
                <option key={o.codigo} value={String(o.codigo)}>
                  {o.codigo} — {o.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="melosa-mov-data" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Data e hora
            </label>
            <input
              id="melosa-mov-data"
              type="datetime-local"
              className={glassField}
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label htmlFor="melosa-mov-ativo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Patrimônio melosa
            </label>
            <input
              id="melosa-mov-ativo"
              type="text"
              list="melosa-patrimonios-list"
              className={glassField}
              value={ativoMelosa}
              onChange={(e) => setAtivoMelosa(e.target.value.toUpperCase())}
              disabled={saving}
              placeholder="Ex.: ABC1D23"
              required
            />
            <datalist id="melosa-patrimonios-list">
              {melosaOpcoes.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="melosa-mov-equip" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Ativo equipamento
            </label>
            <input
              id="melosa-mov-equip"
              type="text"
              className={glassField}
              value={ativoEquipamento}
              onChange={(e) => setAtivoEquipamento(e.target.value.toUpperCase())}
              disabled={saving}
              placeholder="Patrimônio do equipamento abastecido"
              required
            />
          </div>

          <div>
            <label htmlFor="melosa-mov-insumo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Insumo
            </label>
            <select
              id="melosa-mov-insumo"
              className={glassSelect}
              value={insumo}
              onChange={(e) => setInsumo(e.target.value)}
              disabled={saving}
            >
              {INSUMO_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="melosa-mov-litros" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Quantidade (L)
            </label>
            <input
              id="melosa-mov-litros"
              type="text"
              inputMode="decimal"
              className={glassField}
              value={quantidadeLitros}
              onChange={(e) => setQuantidadeLitros(e.target.value)}
              disabled={saving}
              placeholder="Ex.: 150,5"
              required
            />
          </div>

          <div>
            <label htmlFor="melosa-mov-cat" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Categoria GHG
            </label>
            <select
              id="melosa-mov-cat"
              className={glassSelect}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as "ESTACIONARIA" | "MOVEL")}
              disabled={saving}
            >
              <option value="MOVEL">Móvel (padrão)</option>
              <option value="ESTACIONARIA">Estacionária</option>
            </select>
          </div>

          <div>
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Horímetro</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "valor", label: "Informar valor" },
                  { id: "quebrado", label: "Quebrado" },
                  { id: "inexistente", label: "Inexistente" },
                ] as const
              ).map((opt) => {
                const selected = horimetroTipo === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setHorimetroTipo((prev) => (prev === opt.id ? "" : opt.id));
                      if (opt.id !== "valor") setHorimetroValor("");
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      selected
                        ? "border-accent bg-accent text-white"
                        : "border-slate-300 bg-white/80 text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:bg-black/20 dark:text-slate-200 dark:hover:bg-white/10"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {horimetroTipo === "valor" ? (
              <input
                id="melosa-mov-horimetro"
                type="text"
                className={`${glassField} mt-2`}
                value={horimetroValor}
                onChange={(e) => setHorimetroValor(e.target.value)}
                disabled={saving}
                placeholder="Ex.: 1250"
              />
            ) : null}
          </div>

          <div>
              <label htmlFor="melosa-mov-motorista" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Motorista
            </label>
            <input
              id="melosa-mov-motorista"
              type="text"
              className={glassField}
              value={motorista}
              onChange={(e) => setMotorista(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="melosa-mov-operador" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Operador melosa
            </label>
            <input
              id="melosa-mov-operador"
              type="text"
              className={glassField}
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              disabled={saving}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={lubrificado}
              onChange={(e) => setLubrificado(e.target.checked)}
              disabled={saving}
              className="h-4 w-4 rounded border-slate-300"
            />
            Lubrificado
          </label>

          <div>
            <label htmlFor="melosa-mov-obs" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Observações
            </label>
            <textarea
              id="melosa-mov-obs"
              className={`${glassField} min-h-[72px] resize-y`}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              disabled={saving}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-300/80 bg-red-50/90 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Salvando…" : mode === "add" ? "Adicionar" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
