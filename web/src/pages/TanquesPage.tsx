import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../state/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { glassField, glassPanel } from "../lib/glass";

type TanqueRow = {
  ativo: string;
  nome: string | null;
  obra_codigo: number | null;
  tanque_numero: number | null;
  capacidade_litros: number | null;
};

type ObraRow = { codigo: number; nome: string };

function labelTanque(row: TanqueRow, obraNome?: string | null): string {
  const titulo = row.nome?.trim() || (row.tanque_numero != null ? `Tanque ${row.tanque_numero}` : "Tanque");
  const obra =
    row.obra_codigo != null
      ? `${row.obra_codigo}${obraNome ? ` - ${obraNome}` : ""}`
      : (obraNome ?? "—");
  return `${titulo} - (${obra})`;
}

function fmtCapacidade(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

export default function TanquesPage() {
  const { token, canWriteOnPage } = useAuth();
  const canWrite = canWriteOnPage("tanques");

  const [tanques, setTanques] = useState<TanqueRow[]>([]);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroObra, setFiltroObra] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingAtivo, setEditingAtivo] = useState<string | null>(null);
  const [formTanqueNumero, setFormTanqueNumero] = useState("");
  const [formObraCodigo, setFormObraCodigo] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formCapacidade, setFormCapacidade] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TanqueRow | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const obrasPorCodigo = useMemo(() => new Map(obras.map((o) => [o.codigo, o.nome])), [obras]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [tanquesJson, obrasJson] = await Promise.all([
        apiGet<{ equipamentos: TanqueRow[] }>("/v1/equipamentos?tipo=TANQUE", token),
        apiGet<{ obras: ObraRow[] }>("/v1/obras", token),
      ]);
      setTanques(tanquesJson?.equipamentos ?? []);
      setObras(obrasJson?.obras ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar tanques");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const obraFiltro = filtroObra.trim() ? Number(filtroObra) : null;
    return tanques.filter((t) => {
      if (obraFiltro != null && Number.isFinite(obraFiltro) && t.obra_codigo !== obraFiltro) return false;
      if (!q) return true;
      const obraNome = t.obra_codigo != null ? obrasPorCodigo.get(t.obra_codigo) ?? "" : "";
      return (
        String(t.tanque_numero ?? "").includes(q) ||
        (t.nome ?? "").toLowerCase().includes(q) ||
        obraNome.toLowerCase().includes(q) ||
        String(t.obra_codigo ?? "").includes(q)
      );
    });
  }, [tanques, busca, filtroObra, obrasPorCodigo]);

  function openCreateForm() {
    setEditingAtivo(null);
    setFormTanqueNumero("");
    setFormObraCodigo(obras[0] ? String(obras[0].codigo) : "");
    setFormDescricao("");
    setFormCapacidade("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(row: TanqueRow) {
    setEditingAtivo(row.ativo);
    setFormTanqueNumero(row.tanque_numero != null ? String(row.tanque_numero) : "");
    setFormObraCodigo(row.obra_codigo != null ? String(row.obra_codigo) : "");
    setFormDescricao(row.nome ?? "");
    setFormCapacidade(row.capacidade_litros != null ? String(row.capacidade_litros) : "");
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !canWrite) return;

    const tanqueNumero = Number(formTanqueNumero.trim());
    const obraCodigo = Number(formObraCodigo);
    const descricao = formDescricao.trim();
    const capacidade = Number(formCapacidade.trim().replace(",", "."));

    if (!Number.isInteger(tanqueNumero) || tanqueNumero <= 0) {
      setFormError("Informe um número de tanque válido (ex.: 1, 2, 3).");
      return;
    }
    if (!Number.isFinite(obraCodigo) || obraCodigo <= 0) {
      setFormError("Selecione a obra.");
      return;
    }
    if (!descricao) {
      setFormError("Informe a descrição do tanque.");
      return;
    }
    if (!Number.isFinite(capacidade) || capacidade <= 0) {
      setFormError("Informe a capacidade em litros.");
      return;
    }

    setFormSaving(true);
    setFormError(null);
    try {
      const body = {
        tipo: "TANQUE" as const,
        tanque_numero: tanqueNumero,
        obra_codigo: obraCodigo,
        nome: descricao,
        capacidade_litros: capacidade,
      };
      if (editingAtivo) {
        await apiPatch(`/v1/equipamentos/${encodeURIComponent(editingAtivo)}`, token, body);
      } else {
        await apiPost("/v1/equipamentos", token, body);
      }
      setFormOpen(false);
      await load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar tanque");
    } finally {
      setFormSaving(false);
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget || !canWrite) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await apiDelete(`/v1/equipamentos/${encodeURIComponent(deleteTarget.ativo)}`, token);
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Erro ao excluir tanque");
    } finally {
      setDeleteSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tanques</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Cadastre os tanques por obra com capacidade em litros. No mobile aparecem como{" "}
          <strong>Descrição - (obra)</strong> para todos os usuários.
        </p>
      </header>

      <div className={`rounded-2xl p-4 sm:p-6 ${glassPanel}`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Buscar</label>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Número, descrição ou obra…"
              className={glassField}
            />
          </div>
          <div className="min-w-[120px]">
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Obra</label>
            <select value={filtroObra} onChange={(e) => setFiltroObra(e.target.value)} className={glassField}>
              <option value="">Todas</option>
              {obras.map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.codigo} — {o.nome}
                </option>
              ))}
            </select>
          </div>
          {canWrite ? (
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Criar tanque
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 overflow-x-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">A carregar…</p>
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nenhum tanque cadastrado.</p>
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10">
                  <th className="px-2 py-2 font-semibold">Tanque</th>
                  <th className="px-2 py-2 font-semibold">Obra</th>
                  <th className="px-2 py-2 font-semibold">Descrição</th>
                  <th className="px-2 py-2 font-semibold">Capacidade (L)</th>
                  {canWrite ? <th className="px-2 py-2 font-semibold w-24" /> : null}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((t) => (
                  <tr
                    key={t.ativo}
                    className="border-b border-slate-100 dark:border-white/5 hover:bg-white/40 dark:hover:bg-white/5"
                  >
                    <td className="px-2 py-2.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                      {t.tanque_numero ?? "—"}
                    </td>
                    <td className="px-2 py-2.5 text-slate-700 dark:text-slate-300">
                      {t.obra_codigo != null
                        ? `${t.obra_codigo} — ${obrasPorCodigo.get(t.obra_codigo) ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-slate-700 dark:text-slate-300">{t.nome ?? "—"}</td>
                    <td className="px-2 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                      {fmtCapacidade(t.capacidade_litros)}
                    </td>
                    {canWrite ? (
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditForm(t)}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                            title={`Editar ${labelTanque(t, obrasPorCodigo.get(t.obra_codigo ?? 0))}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(t);
                            }}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                            title={`Excluir ${labelTanque(t, obrasPorCodigo.get(t.obra_codigo ?? 0))}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <div className="mb-4 flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingAtivo ? "Editar tanque" : "Criar tanque"}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <form onSubmit={submitForm} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Tanque</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={formTanqueNumero}
                  onChange={(e) => setFormTanqueNumero(e.target.value)}
                  placeholder="Ex.: 1"
                  className={glassField}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Obra</label>
                <select
                  value={formObraCodigo}
                  onChange={(e) => setFormObraCodigo(e.target.value)}
                  className={glassField}
                  required
                >
                  <option value="">Selecione…</option>
                  {obras.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.codigo} — {o.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Descrição tanque
                </label>
                <input
                  type="text"
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Ex.: Tanque principal diesel"
                  className={glassField}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Capacidade (L)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={formCapacidade}
                  onChange={(e) => setFormCapacidade(e.target.value)}
                  placeholder="Ex.: 10000"
                  className={glassField}
                  required
                />
              </div>

              {formError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
              ) : null}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-white/15"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {formSaving ? "Salvando…" : editingAtivo ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Excluir tanque?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {labelTanque(deleteTarget, obrasPorCodigo.get(deleteTarget.obra_codigo ?? 0))}
            </p>
            {deleteError ? <p className="mt-2 text-sm text-red-600">{deleteError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleteSaving}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleteSaving ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
