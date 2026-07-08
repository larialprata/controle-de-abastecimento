import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { apiGet } from "../../lib/api";
import { glassField, glassPanel, glassSelect } from "../../lib/glass";

type ObraOption = { codigo: number; nome: string };

type TanqueEquip = { ativo?: string; obra_codigo?: number | null; tanque_numero?: number | null; nome?: string | null };

type Props = {
  open: boolean;
  obras: ObraOption[];
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

export default function TanqueRetiradaEquipamentoModal({
  open,
  obras,
  apiBase,
  token,
  onClose,
  onSaved,
}: Props) {
  const [obraCodigo, setObraCodigo] = useState("");
  const [dataHora, setDataHora] = useState("");
  const [tanqueNumero, setTanqueNumero] = useState("");
  const [insumo, setInsumo] = useState("DIESEL_S10");
  const [quantidadeLitros, setQuantidadeLitros] = useState("");
  const [patrimonio, setPatrimonio] = useState("");
  const [obs, setObs] = useState("");
  const [tanques, setTanques] = useState<TanqueEquip[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setObraCodigo(obras[0] ? String(obras[0].codigo) : "");
    setDataHora(toDatetimeLocalValue(new Date().toISOString()));
    setTanqueNumero("");
    setInsumo("DIESEL_S10");
    setQuantidadeLitros("");
    setPatrimonio("");
    setObs("");
  }, [open, obras]);

  useEffect(() => {
    if (!open || !token) return;
    apiGet<{ equipamentos?: TanqueEquip[] }>("/v1/equipamentos?tipo=TANQUE", token)
      .then((json) => setTanques(json?.equipamentos ?? []))
      .catch(() => setTanques([]));
  }, [open, token]);

  const tanquesDaObra = useMemo(() => {
    const cod = Number(obraCodigo);
    if (!Number.isFinite(cod) || cod <= 0) return [];
    return tanques
      .filter((t) => Number(t.obra_codigo) === cod && t.tanque_numero != null)
      .sort((a, b) => Number(a.tanque_numero) - Number(b.tanque_numero));
  }, [tanques, obraCodigo]);

  useEffect(() => {
    if (tanquesDaObra.length === 1) {
      setTanqueNumero(String(tanquesDaObra[0].tanque_numero));
    } else if (!tanquesDaObra.some((t) => String(t.tanque_numero) === tanqueNumero)) {
      setTanqueNumero("");
    }
  }, [tanquesDaObra, tanqueNumero]);

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
    const tanque = Number(tanqueNumero);
    if (!Number.isFinite(tanque) || tanque <= 0) {
      setError("Selecione o tanque.");
      return;
    }
    const equipamento = patrimonio.trim().toUpperCase();
    if (!equipamento) {
      setError("Informe o patrimônio do equipamento.");
      return;
    }
    const litros = parseLitros(quantidadeLitros);
    if (litros == null) {
      setError("Quantidade em litros inválida.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/v1/tanque/movimentacoes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          obra_codigo: obra,
          data_hora: new Date(dataHora).toISOString(),
          tanque_numero: tanque,
          ativo_equipamento_texto: equipamento,
          quantidade_litros: litros,
          combustivel_tipo: insumo,
          obs: obs.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof json?.error === "string"
            ? json.error
            : json?.error
              ? JSON.stringify(json.error)
              : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao registrar retirada");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tanque-retirada-equip-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="tanque-retirada-equip-title" className="text-lg font-bold text-slate-900 dark:text-white">
            Retirada do tanque → equipamento
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
          Registro manual da retirada direta do tanque para um equipamento. Abate o saldo do tanque na dashboard.
        </p>

        <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label htmlFor="tanque-retirada-obra" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Contrato / obra
            </label>
            <select
              id="tanque-retirada-obra"
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
            <label htmlFor="tanque-retirada-tanque" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Tanque
            </label>
            <select
              id="tanque-retirada-tanque"
              className={glassSelect}
              value={tanqueNumero}
              onChange={(e) => setTanqueNumero(e.target.value)}
              disabled={saving || tanquesDaObra.length === 0}
              required
            >
              <option value="">{tanquesDaObra.length === 0 ? "Nenhum tanque nesta obra" : "Selecione…"}</option>
              {tanquesDaObra.map((t) => (
                <option key={String(t.tanque_numero)} value={String(t.tanque_numero)}>
                  Tanque {t.tanque_numero}
                  {t.nome ? ` — ${t.nome}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tanque-retirada-data" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Data e hora
            </label>
            <input
              id="tanque-retirada-data"
              type="datetime-local"
              className={glassField}
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label htmlFor="tanque-retirada-patrimonio" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Patrimônio do equipamento
            </label>
            <input
              id="tanque-retirada-patrimonio"
              type="text"
              className={glassField}
              value={patrimonio}
              onChange={(e) => setPatrimonio(e.target.value.toUpperCase())}
              disabled={saving}
              placeholder="Ex.: ASD123"
              required
            />
          </div>

          <div>
            <label htmlFor="tanque-retirada-insumo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Insumo
            </label>
            <select
              id="tanque-retirada-insumo"
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
            <label htmlFor="tanque-retirada-litros" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Quantidade (L)
            </label>
            <input
              id="tanque-retirada-litros"
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
            <label htmlFor="tanque-retirada-obs" className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Observações
            </label>
            <textarea
              id="tanque-retirada-obs"
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
              {saving ? "Salvando…" : "Registrar retirada"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
