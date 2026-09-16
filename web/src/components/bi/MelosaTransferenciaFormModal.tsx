import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { glassField, glassPanel, glassSelect } from "../../lib/glass";

type ObraOption = { codigo: number; nome: string };

type Props = {
  open: boolean;
  obras: ObraOption[];
  melosasAtivos: string[];
  apiBase: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
  /** Pré-preenche o formulário (lançamento pontual). */
  initial?: {
    obraCodigo?: number;
    dataHora?: string;
    origem?: string;
    destino?: string;
    litros?: number;
    obs?: string;
  } | null;
};

const INSUMO_OPCOES = [
  { value: "DIESEL_S10", label: "Diesel S10" },
  { value: "GASOLINA", label: "Gasolina" },
  { value: "ALCOOL", label: "Álcool" },
] as const;

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

export default function MelosaTransferenciaFormModal({
  open,
  obras,
  melosasAtivos,
  apiBase,
  token,
  onClose,
  onSaved,
  initial = null,
}: Props) {
  const [obraCodigo, setObraCodigo] = useState("");
  const [dataHora, setDataHora] = useState("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [insumo, setInsumo] = useState("DIESEL_S10");
  const [quantidadeLitros, setQuantidadeLitros] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const melosaOpcoes = useMemo(() => {
    const set = new Set(melosasAtivos.map((a) => a.trim().toUpperCase()).filter(Boolean));
    const o = origem.trim().toUpperCase();
    const d = destino.trim().toUpperCase();
    if (o) set.add(o);
    if (d) set.add(d);
    return Array.from(set).sort();
  }, [destino, melosasAtivos, origem]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setObraCodigo(
      initial?.obraCodigo != null
        ? String(initial.obraCodigo)
        : obras[0]
          ? String(obras[0].codigo)
          : "",
    );
    setDataHora(
      toDatetimeLocalValue(initial?.dataHora ?? new Date().toISOString()),
    );
    setOrigem(String(initial?.origem ?? "").trim().toUpperCase());
    setDestino(String(initial?.destino ?? "").trim().toUpperCase());
    setInsumo("DIESEL_S10");
    setQuantidadeLitros(initial?.litros != null ? String(initial.litros) : "");
    setObs(String(initial?.obs ?? "").trim());
  }, [open, initial, obras]);

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
    const ativoOrigem = origem.trim().toUpperCase();
    const ativoDestino = destino.trim().toUpperCase();
    if (!ativoOrigem || !ativoDestino) {
      setError("Informe a melosa de origem e a de destino.");
      return;
    }
    if (ativoOrigem === ativoDestino) {
      setError("Origem e destino devem ser diferentes.");
      return;
    }
    const litros = parseLitros(quantidadeLitros);
    if (litros == null) {
      setError("Quantidade em litros inválida.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/v1/melosa/transferencias`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          obra_codigo: obra,
          data_hora: new Date(dataHora).toISOString(),
          ativo_melosa_origem: ativoOrigem,
          ativo_melosa_destino: ativoDestino,
          litros,
          melosa_combustivel_tipo_retirada: insumo,
          obs: obs.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao registrar transferência");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="melosa-transf-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="melosa-transf-form-title" className="text-lg font-bold text-slate-900 dark:text-white">
            Transbordo entre melosas
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
          Esvazia a melosa de origem e gera enchimento (ciclo) na melosa de destino, sem alterar o tanque da obra.
          No dashboard, o nível da melosa destino passa a refletir o volume recebido.
        </p>

        <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label htmlFor="melosa-transf-obra" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Contrato / obra
            </label>
            <select
              id="melosa-transf-obra"
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
            <label htmlFor="melosa-transf-data" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Data e hora
            </label>
            <input
              id="melosa-transf-data"
              type="datetime-local"
              className={glassField}
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label htmlFor="melosa-transf-origem" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Melosa origem (esvazia)
            </label>
            <input
              id="melosa-transf-origem"
              type="text"
              list="melosa-transf-origens"
              className={glassField}
              value={origem}
              onChange={(e) => setOrigem(e.target.value.toUpperCase())}
              disabled={saving}
              placeholder="Ex.: CCL1563"
              required
            />
            <datalist id="melosa-transf-origens">
              {melosaOpcoes.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="melosa-transf-destino" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Melosa destino (enche)
            </label>
            <input
              id="melosa-transf-destino"
              type="text"
              list="melosa-transf-destinos"
              className={glassField}
              value={destino}
              onChange={(e) => setDestino(e.target.value.toUpperCase())}
              disabled={saving}
              placeholder="Ex.: CCL1399"
              required
            />
            <datalist id="melosa-transf-destinos">
              {melosaOpcoes.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="melosa-transf-insumo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Insumo
            </label>
            <select
              id="melosa-transf-insumo"
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
            <label htmlFor="melosa-transf-litros" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Quantidade (L)
            </label>
            <input
              id="melosa-transf-litros"
              type="text"
              inputMode="decimal"
              className={glassField}
              value={quantidadeLitros}
              onChange={(e) => setQuantidadeLitros(e.target.value)}
              disabled={saving}
              placeholder="Ex.: 2290"
              required
            />
          </div>

          <div>
            <label htmlFor="melosa-transf-obs" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Observação (opcional)
            </label>
            <textarea
              id="melosa-transf-obs"
              className={glassField}
              rows={2}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              disabled={saving}
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Registrar transferência"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
