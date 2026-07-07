import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Settings2, X } from "lucide-react";
import { apiPut } from "../../lib/api";
import { DEFAULT_METAS, type ConsumoMeta } from "../../lib/consumoMetasShared";
import { glassField, glassPanel } from "../../lib/glass";

type Props = {
  open: boolean;
  metas: ConsumoMeta[];
  token: string;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (metas: ConsumoMeta[]) => void;
};

type MetaDraft = {
  mobilidade: string | null;
  unidade: string;
  meta_litros_por_unidade: string;
  label: string;
};

function toDraft(metas: ConsumoMeta[]): MetaDraft[] {
  const base = metas.length > 0 ? metas : DEFAULT_METAS;
  return base.map((m) => ({
    mobilidade: m.mobilidade,
    unidade: m.unidade,
    meta_litros_por_unidade: String(m.meta_litros_por_unidade),
    label: m.label ?? "",
  }));
}

function mobilidadeLabel(m: string | null): string {
  if (m === "ESTACIONARIO") return "Estacionário";
  if (m === "MOVEL") return "Móvel";
  return "Padrão (fallback)";
}

export default function ConsumoMedioMetasModal({ open, metas, token, isAdmin, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<MetaDraft[]>(() => toDraft(metas));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(metas));
      setError(null);
    }
  }, [open, metas]);

  const save = useCallback(async () => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const payload = draft.map((d) => {
        const v = Number(d.meta_litros_por_unidade.replace(",", "."));
        if (!Number.isFinite(v) || v <= 0) throw new Error("Todas as metas devem ser números positivos.");
        return {
          mobilidade: d.mobilidade as "ESTACIONARIO" | "MOVEL" | null,
          unidade: d.unidade as "h" | "km",
          meta_litros_por_unidade: v,
          label: d.label.trim() || null,
        };
      });
      const res = await apiPut<{ metas: ConsumoMeta[] }>("/v1/equipamentos/consumo/metas", token, {
        metas: payload,
      });
      onSaved(res.metas);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar metas.");
    } finally {
      setSaving(false);
    }
  }, [draft, isAdmin, onClose, onSaved, token]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Settings2 className="mt-0.5 h-5 w-5 text-orange-600 dark:text-orange-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Metas de consumo</h2>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                Limites em L/h ou L/km por mobilidade do equipamento.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/80 dark:hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {draft.map((d, idx) => (
            <div
              key={`${d.mobilidade ?? "default"}-${d.unidade}`}
              className="rounded-xl border border-white/40 bg-white/30 p-3 dark:border-white/10 dark:bg-black/20"
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {d.label || mobilidadeLabel(d.mobilidade)} · {d.unidade === "km" ? "L/km" : "L/h"}
              </p>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-bold uppercase text-slate-500">Meta</span>
                <input
                  className={glassField}
                  value={d.meta_litros_por_unidade}
                  disabled={!isAdmin}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, meta_litros_por_unidade: v } : x)));
                  }}
                />
              </label>
            </div>
          ))}
        </div>

        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
        ) : null}

        {!isAdmin ? (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Apenas administradores podem alterar as metas.
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
          >
            {isAdmin ? "Cancelar" : "Fechar"}
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvando…" : "Salvar metas"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
