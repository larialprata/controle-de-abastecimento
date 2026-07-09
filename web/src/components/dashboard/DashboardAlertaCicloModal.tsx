import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiPatch } from "../../lib/api";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import { glassField, glassPanel } from "../../lib/glass";

export type DashboardAlertaCiclo = {
  id: string;
  ciclo_numero: number;
  ativo_melosa_texto: string;
  capacidade_litros: number | null;
  volume_excedente: number;
  litros_sobra_anterior: number;
  litros_retirada: number;
};

type Props = {
  open: boolean;
  ciclo: DashboardAlertaCiclo | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
};

function parseCapacidade(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function DashboardAlertaCicloModal({ open, ciclo, token, onClose, onSaved }: Props) {
  const [capacidade, setCapacidade] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !ciclo) return;
    setError(null);
    setCapacidade(
      ciclo.capacidade_litros != null && ciclo.capacidade_litros > 0
        ? String(ciclo.capacidade_litros)
        : "",
    );
  }, [open, ciclo]);

  if (!open || !ciclo) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cap = parseCapacidade(capacidade);
    if (cap == null) {
      setError("Informe a capacidade em litros (maior que zero).");
      return;
    }

    setSaving(true);
    try {
      await apiPatch(`/v1/melosa-ciclos/${ciclo.id}`, token, { capacidade_litros: cap });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const totalEnchimento = ciclo.litros_sobra_anterior + ciclo.litros_retirada;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-alerta-edit-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="dashboard-alerta-edit-title" className="text-lg font-bold text-slate-900 dark:text-white">
            Editar alerta — ciclo {ciclo.ciclo_numero}
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
          Melosa <strong>{ciclo.ativo_melosa_texto}</strong> — excedente atual de{" "}
          <strong>{fmtLitrosDashboard(ciclo.volume_excedente)} L</strong>. Ajuste a capacidade cadastrada para
          recalcular o alerta.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Sobra anterior + enchimento = {fmtLitrosDashboard(ciclo.litros_sobra_anterior)} +{" "}
          {fmtLitrosDashboard(ciclo.litros_retirada)} = {fmtLitrosDashboard(totalEnchimento)} L
        </p>

        <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label htmlFor="alerta-capacidade" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Capacidade da melosa (L)
            </label>
            <input
              id="alerta-capacidade"
              type="text"
              inputMode="decimal"
              className={glassField}
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
              disabled={saving}
              placeholder="Ex.: 5000"
              required
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
              {saving ? "Salvando…" : "Salvar e recalcular"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
