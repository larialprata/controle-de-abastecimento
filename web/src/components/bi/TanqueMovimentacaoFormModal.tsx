import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { glassField, glassPanel, glassSelect } from "../../lib/glass";
import { INSUMO_OPCOES } from "../../lib/insumos";

export type TanqueMovimentacaoFormRow = {
  operation_id: string;
  tipo?: string | null;
  obra_codigo?: number;
  data_hora?: string;
  litros?: number | string | null;
  tanque_quantidade_abastecida?: string | null;
  combustivel_tipo?: string | null;
  nota_numero?: string | number | null;
  valor_unitario?: string | number | null;
  placa_texto?: string | null;
  placa_caminhao?: string | null;
  fornecedor_texto?: string | null;
  tanque_numero?: number | string | null;
  tanque_texto?: string | null;
  tanque_operador_nome?: string | null;
  lacre_tanque_numero?: string | null;
  lacre_melosa_numero?: string | null;
  melosa_horimetro_equipamento_abastecido_numero?: string | null;
  obs?: string | null;
};

type ObraOption = { codigo: number; nome: string };

type Props = {
  open: boolean;
  initialRow: TanqueMovimentacaoFormRow | null;
  obras: ObraOption[];
  apiBase: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
};

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

function textOrEmpty(value: unknown): string {
  if (value == null) return "";
  const raw = String(value).trim();
  return raw === "—" ? "" : raw;
}

const EQUIPAMENTO_OBS_PREFIX = "[TANQUE_EQUIPAMENTO]";

function isRetiradaParaEquipamento(obs?: string | null): boolean {
  return String(obs ?? "").trim().toUpperCase().startsWith(EQUIPAMENTO_OBS_PREFIX);
}

function obsSemMarcadorEquipamento(obs?: string | null): string {
  const raw = textOrEmpty(obs);
  if (!raw.toUpperCase().startsWith(EQUIPAMENTO_OBS_PREFIX)) return raw;
  return raw.slice(EQUIPAMENTO_OBS_PREFIX.length).replace(/^[\s:\-]+/, "");
}

export default function TanqueMovimentacaoFormModal({
  open,
  initialRow,
  obras,
  apiBase,
  token,
  onClose,
  onSaved,
}: Props) {
  const isEntrada = initialRow?.tipo === "ENTRADA_TANQUE_OBRA";
  const isRetirada = initialRow?.tipo === "RETIRADA_TANQUE";
  const paraEquipamento = isRetirada && isRetiradaParaEquipamento(initialRow?.obs);

  const [obraCodigo, setObraCodigo] = useState("");
  const [dataHora, setDataHora] = useState("");
  const [tanqueNumero, setTanqueNumero] = useState("");
  const [insumo, setInsumo] = useState("DIESEL_S10");
  const [quantidade, setQuantidade] = useState("");
  const [patrimonio, setPatrimonio] = useState("");
  const [notaNumero, setNotaNumero] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [operador, setOperador] = useState("");
  const [operadorTanque, setOperadorTanque] = useState("");
  const [lacreTanque, setLacreTanque] = useState("");
  const [lacreMelosa, setLacreMelosa] = useState("");
  const [horimetroTipo, setHorimetroTipo] = useState<HorimetroTipo>("");
  const [horimetroValor, setHorimetroValor] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !initialRow) return;
    setObraCodigo(initialRow.obra_codigo != null ? String(initialRow.obra_codigo) : "");
    setDataHora(toDatetimeLocalValue(initialRow.data_hora));
    setTanqueNumero(initialRow.tanque_numero != null ? String(initialRow.tanque_numero) : "");
    const combustivel = textOrEmpty(initialRow.combustivel_tipo);
    setInsumo(combustivel || "DIESEL_S10");
    const qtdRetirada = textOrEmpty(initialRow.tanque_quantidade_abastecida);
    setQuantidade(qtdRetirada || textOrEmpty(initialRow.litros));
    setPatrimonio(textOrEmpty(initialRow.placa_texto ?? initialRow.placa_caminhao));
    setNotaNumero(textOrEmpty(initialRow.nota_numero));
    setValorUnitario(textOrEmpty(initialRow.valor_unitario));
    setFornecedor(textOrEmpty(initialRow.fornecedor_texto));
    setOperador(textOrEmpty(initialRow.tanque_texto));
    setOperadorTanque(textOrEmpty(initialRow.tanque_operador_nome));
    setLacreTanque(textOrEmpty(initialRow.lacre_tanque_numero));
    setLacreMelosa(textOrEmpty(initialRow.lacre_melosa_numero));
    const hor = parseHorimetroFromRow(initialRow.melosa_horimetro_equipamento_abastecido_numero);
    setHorimetroTipo(hor.tipo);
    setHorimetroValor(hor.valor);
    setObs(
      isRetiradaParaEquipamento(initialRow.obs)
        ? obsSemMarcadorEquipamento(initialRow.obs)
        : textOrEmpty(initialRow.obs),
    );
    setError(null);
  }, [open, initialRow]);

  if (!open || !initialRow) return null;

  const tituloTipo = isEntrada
    ? "entrada"
    : paraEquipamento
      ? "saída para equipamento"
      : "saída para melosa";

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
    const litrosNum = Number(quantidade.trim().replace(",", "."));
    if (!Number.isFinite(litrosNum) || litrosNum < 0) {
      setError("Quantidade em litros inválida.");
      return;
    }
    const tanque = Number(tanqueNumero);
    if (!Number.isInteger(tanque) || tanque <= 0) {
      setError("Informe o número do tanque.");
      return;
    }
    let valor: number | null = null;
    if (isEntrada && valorUnitario.trim()) {
      valor = Number(valorUnitario.trim().replace(",", "."));
      if (!Number.isFinite(valor) || valor < 0) {
        setError("Valor unitário inválido.");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      obra_codigo: obra,
      data_hora: new Date(dataHora).toISOString(),
      tanque_numero: tanque,
      litros: litrosNum,
      combustivel_tipo: insumo.trim() || null,
      placa_texto: patrimonio.trim() ? patrimonio.trim().toUpperCase() : null,
      obs: paraEquipamento
        ? obs.trim()
          ? `${EQUIPAMENTO_OBS_PREFIX} ${obs.trim()}`
          : EQUIPAMENTO_OBS_PREFIX
        : obs.trim() || null,
    };

    if (isEntrada) {
      payload.nota_numero = notaNumero.trim() || null;
      payload.valor_unitario = valor;
      payload.fornecedor_texto = fornecedor.trim() || null;
      payload.placa_caminhao = patrimonio.trim() ? patrimonio.trim().toUpperCase() : null;
    }

    if (isRetirada) {
      payload.tanque_texto = operador.trim() || null;
      payload.tanque_operador_nome = operadorTanque.trim() || null;
      payload.lacre_tanque_numero = lacreTanque.trim() || null;
      payload.lacre_melosa_numero = paraEquipamento ? null : lacreMelosa.trim() || null;
      payload.melosa_horimetro_equipamento_abastecido_numero = resolveHorimetroNumero(
        horimetroTipo,
        horimetroValor,
      );
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/v1/tanque/movimentacoes/${initialRow.operation_id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof json?.error === "string" ? json.error : "Erro ao salvar movimentação";
        throw new Error(message);
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
      aria-labelledby="tanque-mov-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="tanque-mov-form-title" className="text-lg font-bold text-slate-900 dark:text-white">
            Editar movimentação
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
          Altere os dados desta {tituloTipo}. As fotos continuam no botão Adicionar / fotos.
        </p>

        <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label htmlFor="tanque-mov-obra" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Contrato / obra
            </label>
            <select
              id="tanque-mov-obra"
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
            <label htmlFor="tanque-mov-data" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Data e hora
            </label>
            <input
              id="tanque-mov-data"
              type="datetime-local"
              className={glassField}
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tanque-mov-num" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Tanque
              </label>
              <input
                id="tanque-mov-num"
                type="number"
                min={1}
                className={glassField}
                value={tanqueNumero}
                onChange={(e) => setTanqueNumero(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div>
              <label htmlFor="tanque-mov-litros" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Quantidade (L)
              </label>
              <input
                id="tanque-mov-litros"
                type="text"
                inputMode="decimal"
                className={glassField}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                disabled={saving}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="tanque-mov-insumo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Insumo
            </label>
            <select
              id="tanque-mov-insumo"
              className={glassSelect}
              value={insumo}
              onChange={(e) => setInsumo(e.target.value)}
              disabled={saving}
            >
              {INSUMO_OPCOES.some((o) => o.value === insumo) ? null : (
                <option value={insumo}>{insumo}</option>
              )}
              {INSUMO_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tanque-mov-pat" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              {isEntrada ? "Placa" : paraEquipamento ? "Patrimônio do equipamento" : "Patrimônio da melosa"}
            </label>
            <input
              id="tanque-mov-pat"
              type="text"
              className={glassField}
              value={patrimonio}
              onChange={(e) => setPatrimonio(e.target.value.toUpperCase())}
              disabled={saving}
            />
          </div>

          {isEntrada ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tanque-mov-nota" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Nº da nota
                  </label>
                  <input
                    id="tanque-mov-nota"
                    type="text"
                    className={glassField}
                    value={notaNumero}
                    onChange={(e) => setNotaNumero(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label htmlFor="tanque-mov-valor" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Valor unitário
                  </label>
                  <input
                    id="tanque-mov-valor"
                    type="text"
                    inputMode="decimal"
                    className={glassField}
                    value={valorUnitario}
                    onChange={(e) => setValorUnitario(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="tanque-mov-forn" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Fornecedor
                </label>
                <input
                  id="tanque-mov-forn"
                  type="text"
                  className={glassField}
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                  disabled={saving}
                />
              </div>
            </>
          ) : null}

          {isRetirada ? (
            <>
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
                    type="text"
                    className={`${glassField} mt-2`}
                    value={horimetroValor}
                    onChange={(e) => setHorimetroValor(e.target.value)}
                    disabled={saving}
                    placeholder="Ex.: 12540"
                  />
                ) : null}
              </div>
              <div>
                <label htmlFor="tanque-mov-op" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  {paraEquipamento ? "Operador do equipamento" : "Motorista da melosa"}
                </label>
                <input
                  id="tanque-mov-op"
                  type="text"
                  className={glassField}
                  value={operador}
                  onChange={(e) => setOperador(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <label htmlFor="tanque-mov-op-tanque" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Operador do tanque
                </label>
                <input
                  id="tanque-mov-op-tanque"
                  type="text"
                  className={glassField}
                  value={operadorTanque}
                  onChange={(e) => setOperadorTanque(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className={paraEquipamento ? "" : "grid grid-cols-2 gap-3"}>
                <div>
                  <label htmlFor="tanque-mov-lacre-t" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Lacre do tanque
                  </label>
                  <input
                    id="tanque-mov-lacre-t"
                    type="text"
                    className={glassField}
                    value={lacreTanque}
                    onChange={(e) => setLacreTanque(e.target.value)}
                    disabled={saving}
                  />
                </div>
                {paraEquipamento ? null : (
                  <div>
                    <label htmlFor="tanque-mov-lacre-m" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                      Lacre da melosa
                    </label>
                    <input
                      id="tanque-mov-lacre-m"
                      type="text"
                      className={glassField}
                      value={lacreMelosa}
                      onChange={(e) => setLacreMelosa(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                )}
              </div>
            </>
          ) : null}

          <div>
            <label htmlFor="tanque-mov-obs" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Observação
            </label>
            <textarea
              id="tanque-mov-obs"
              className={glassField}
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              disabled={saving}
            />
          </div>

          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
