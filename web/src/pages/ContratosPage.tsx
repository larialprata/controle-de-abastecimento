import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useAuth } from "../state/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { glassField, glassPanel } from "../lib/glass";

type ObraRow = {
  codigo: number;
  nome: string;
};

export default function ContratosPage() {
  const { token, isAdmin } = useAuth();
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addCodigo, setAddCodigo] = useState("");
  const [addNome, setAddNome] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet<{ obras: ObraRow[] }>("/v1/obras", token);
      setObras(json?.obras ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar obras");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return obras;
    return obras.filter(
      (o) =>
        String(o.codigo).includes(q) ||
        (o.nome ?? "").toLowerCase().includes(q),
    );
  }, [obras, busca]);

  const openAddModal = useCallback(() => {
    setAddCodigo("");
    setAddNome("");
    setAddError(null);
    setAddOpen(true);
  }, []);

  const closeAddModal = useCallback(() => {
    if (addSaving) return;
    setAddOpen(false);
    setAddError(null);
  }, [addSaving]);

  const handleAddObra = useCallback(async () => {
    if (!token) return;
    const codigoTrim = addCodigo.trim();
    const nomeTrim = addNome.trim();
    if (!codigoTrim || !nomeTrim) {
      setAddError("Informe o código e o nome da obra.");
      return;
    }
    const codigo = Number(codigoTrim.replace(/\D/g, ""));
    if (!Number.isFinite(codigo) || codigo <= 0) {
      setAddError("Código inválido. Use um número inteiro positivo.");
      return;
    }

    setAddSaving(true);
    setAddError(null);
    try {
      await apiPost("/v1/obras", token, { codigo, nome: nomeTrim });
      setAddOpen(false);
      setAddCodigo("");
      setAddNome("");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao adicionar contrato";
      setAddError(msg);
    } finally {
      setAddSaving(false);
    }
  }, [addCodigo, addNome, load, token]);

  return (
    <div>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Início
      </Link>

      <header className={`mb-6 p-5 ${glassPanel}`}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Contratos</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Obras cadastradas em <code className="rounded bg-black/5 px-1 text-xs dark:bg-black/20">public.obras</code>{" "}
          (código e nome utilizados nos registos de abastecimento).
        </p>
      </header>

      <div className={`mb-4 flex flex-wrap items-end gap-4 p-4 ${glassPanel}`}>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Atualizar
          </span>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "A carregar…" : "Recarregar"}
          </button>
        </div>

        {isAdmin ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cadastro
            </span>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Adicionar contrato
            </button>
          </div>
        ) : null}

        <div className="min-w-[200px] flex-1 flex-col gap-1 sm:max-w-md">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Pesquisar
          </span>
          <input
            type="search"
            placeholder="Código ou nome da obra…"
            className={glassField}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className={`overflow-hidden p-0 ${glassPanel}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Código
                </th>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Obra
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((o, idx) => {
                const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-slate-50/90 dark:bg-white/[0.03]";
                return (
                  <tr key={o.codigo} className={zebra}>
                    <td className="border-b border-slate-100 px-4 py-3 font-mono text-slate-700 dark:border-white/5 dark:text-slate-300">
                      {o.codigo}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      <span className="font-semibold text-slate-900 dark:text-white">{o.nome}</span>
                    </td>
                  </tr>
                );
              })}
              {filtradas.length === 0 && !loading ? (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    Nenhuma obra para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-obra-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAddModal();
          }}
        >
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="add-obra-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Adicionar contrato (obra)
              </h2>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={addSaving}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              O código deve ser único. Será usado nos registos de abastecimento no app.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="add-obra-codigo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Código
                </label>
                <input
                  id="add-obra-codigo"
                  type="text"
                  inputMode="numeric"
                  className={glassField}
                  placeholder="Ex.: 250"
                  value={addCodigo}
                  onChange={(e) => setAddCodigo(e.target.value)}
                  disabled={addSaving}
                />
              </div>
              <div>
                <label htmlFor="add-obra-nome" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Nome da obra
                </label>
                <input
                  id="add-obra-nome"
                  type="text"
                  className={glassField}
                  placeholder="Ex.: Nova Obra"
                  value={addNome}
                  onChange={(e) => setAddNome(e.target.value)}
                  disabled={addSaving}
                />
              </div>
            </div>

            {addError ? (
              <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{addError}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeAddModal}
                disabled={addSaving}
                className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleAddObra()}
                disabled={addSaving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {addSaving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
