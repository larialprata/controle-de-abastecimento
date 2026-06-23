import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../state/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { parseObraCodigoInput } from "../lib/obraCodigo";
import { glassField, glassPanel } from "../lib/glass";
import {
  EMPRESA_LABEL,
  OBRA_EMPRESAS,
  type ObraComEmpresa,
  type ObraEmpresa,
} from "../lib/obrasEmpresa";

type ObraRow = ObraComEmpresa;

type ObraFormMode = "add" | "edit";

function fmtEmpresa(v: ObraEmpresa | null | undefined): string {
  if (!v) return "—";
  return EMPRESA_LABEL[v] ?? v;
}

export default function ContratosPage() {
  const { token, isAdmin } = useAuth();
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<"" | ObraEmpresa>("");
  const [selectedCodigos, setSelectedCodigos] = useState<number[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<ObraFormMode>("add");
  const [formCodigo, setFormCodigo] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formEmpresa, setFormEmpresa] = useState<ObraEmpresa>("DIMENSIONAL");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<number[] | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

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
    return obras.filter((o) => {
      if (empresaFiltro && o.empresa !== empresaFiltro) return false;
      if (!q) return true;
      return (
        String(o.codigo).includes(q) ||
        (o.nome ?? "").toLowerCase().includes(q) ||
        fmtEmpresa(o.empresa).toLowerCase().includes(q)
      );
    });
  }, [obras, busca, empresaFiltro]);

  const filtradasCodigos = useMemo(() => filtradas.map((o) => o.codigo), [filtradas]);
  const allFiltradasSelected =
    filtradasCodigos.length > 0 && filtradasCodigos.every((c) => selectedCodigos.includes(c));

  const toggleOne = useCallback((codigo: number) => {
    setSelectedCodigos((prev) =>
      prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo],
    );
  }, []);

  const toggleAllFiltradas = useCallback(() => {
    setSelectedCodigos((prev) => {
      if (allFiltradasSelected) {
        return prev.filter((c) => !filtradasCodigos.includes(c));
      }
      const merged = new Set([...prev, ...filtradasCodigos]);
      return Array.from(merged);
    });
  }, [allFiltradasSelected, filtradasCodigos]);

  const openAddModal = useCallback(() => {
    setFormMode("add");
    setFormCodigo("");
    setFormNome("");
    setFormEmpresa("DIMENSIONAL");
    setFormError(null);
    setFormOpen(true);
  }, []);

  const openEditModal = useCallback((obra: ObraRow) => {
    setFormMode("edit");
    setFormCodigo(String(obra.codigo));
    setFormNome(obra.nome ?? "");
    setFormEmpresa(obra.empresa ?? "DIMENSIONAL");
    setFormError(null);
    setFormOpen(true);
  }, []);

  const closeFormModal = useCallback(() => {
    if (formSaving) return;
    setFormOpen(false);
    setFormError(null);
  }, [formSaving]);

  const handleSaveObra = useCallback(async () => {
    if (!token) return;
    const nomeTrim = formNome.trim();
    if (!nomeTrim) {
      setFormError("Informe o nome da obra.");
      return;
    }

    setFormSaving(true);
    setFormError(null);
    try {
      if (formMode === "add") {
        const codigoTrim = formCodigo.trim();
        if (!codigoTrim) {
          setFormError("Informe o código da obra.");
          return;
        }
        const codigo = parseObraCodigoInput(codigoTrim);
        if (codigo == null) {
          setFormError("Código inválido. Ex.: 230 ou 00.230");
          return;
        }
        await apiPost("/v1/obras", token, { codigo, nome: nomeTrim, empresa: formEmpresa });
      } else {
        const codigo = Number(formCodigo);
        if (!Number.isFinite(codigo) || codigo <= 0) {
          setFormError("Código inválido.");
          return;
        }
        await apiPatch(`/v1/obras/${codigo}`, token, { nome: nomeTrim, empresa: formEmpresa });
      }
      setFormOpen(false);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao guardar contrato";
      setFormError(msg);
    } finally {
      setFormSaving(false);
    }
  }, [formCodigo, formEmpresa, formMode, formNome, load, token]);

  const handleDelete = useCallback(async () => {
    if (!token || !deleteTarget?.length) return;
    setDeleteSaving(true);
    setError(null);
    try {
      for (const codigo of deleteTarget) {
        await apiDelete(`/v1/obras/${codigo}`, token);
      }
      setSelectedCodigos((prev) => prev.filter((c) => !deleteTarget.includes(c)));
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao excluir contrato(s)");
    } finally {
      setDeleteSaving(false);
    }
  }, [deleteTarget, load, token]);

  const editSelected = useCallback(() => {
    if (selectedCodigos.length !== 1) return;
    const obra = obras.find((o) => o.codigo === selectedCodigos[0]);
    if (obra) openEditModal(obra);
  }, [obras, openEditModal, selectedCodigos]);

  const colCount = isAdmin ? 5 : 3;

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
          (código, nome e empresa — Dimensional ou Delurb).
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
          <>
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

            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Seleção
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={editSelected}
                  disabled={selectedCodigos.length !== 1}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Editar ({selectedCodigos.length === 1 ? 1 : 0})
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget([...selectedCodigos])}
                  disabled={selectedCodigos.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Excluir ({selectedCodigos.length})
                </button>
              </div>
            </div>
          </>
        ) : null}

        <div className="flex min-w-[160px] flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Empresa
          </span>
          <select
            className={glassField}
            value={empresaFiltro}
            onChange={(e) => setEmpresaFiltro(e.target.value as "" | ObraEmpresa)}
          >
            <option value="">Todas</option>
            {OBRA_EMPRESAS.map((e) => (
              <option key={e} value={e}>
                {EMPRESA_LABEL[e]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[200px] flex-1 flex-col gap-1 sm:max-w-md">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Pesquisar
          </span>
          <input
            type="search"
            placeholder="Código, obra ou empresa…"
            className={glassField}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {selectedCodigos.length > 0 ? (
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          {selectedCodigos.length} contrato{selectedCodigos.length === 1 ? "" : "s"} selecionado
          {selectedCodigos.length === 1 ? "" : "s"}.
        </p>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className={`overflow-hidden p-0 ${glassPanel}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                {isAdmin ? (
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={allFiltradasSelected}
                      onChange={toggleAllFiltradas}
                      disabled={filtradas.length === 0 || loading}
                      aria-label="Selecionar todos os contratos visíveis"
                    />
                  </th>
                ) : null}
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Código
                </th>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Obra
                </th>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Empresa
                </th>
                {isAdmin ? (
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Ações
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((o, idx) => {
                const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-slate-50/90 dark:bg-white/[0.03]";
                const selected = selectedCodigos.includes(o.codigo);
                return (
                  <tr
                    key={o.codigo}
                    className={`${zebra} ${selected ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                  >
                    {isAdmin ? (
                      <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleOne(o.codigo)}
                          aria-label={`Selecionar contrato ${o.codigo}`}
                        />
                      </td>
                    ) : null}
                    <td className="border-b border-slate-100 px-4 py-3 font-mono text-slate-700 dark:border-white/5 dark:text-slate-300">
                      {o.codigo}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      <span className="font-semibold text-slate-900 dark:text-white">{o.nome}</span>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {fmtEmpresa(o.empresa)}
                      </span>
                    </td>
                    {isAdmin ? (
                      <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(o)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget([o.codigo])}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Excluir
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {filtradas.length === 0 && !loading ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    Nenhuma obra para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="obra-form-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFormModal();
          }}
        >
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="obra-form-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {formMode === "add" ? "Adicionar contrato (obra)" : "Editar contrato"}
              </h2>
              <button
                type="button"
                onClick={closeFormModal}
                disabled={formSaving}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {formMode === "add"
                ? "O código deve ser único. Vincule o contrato a Dimensional ou Delurb."
                : "Altere o nome e a empresa. O código não pode ser mudado."}
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="obra-form-codigo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Código
                </label>
                <input
                  id="obra-form-codigo"
                  type="text"
                  inputMode="numeric"
                  className={glassField}
                  placeholder="Ex.: 250"
                  value={formCodigo}
                  onChange={(e) => setFormCodigo(e.target.value)}
                  disabled={formSaving || formMode === "edit"}
                />
              </div>
              <div>
                <label htmlFor="obra-form-nome" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Nome da obra
                </label>
                <input
                  id="obra-form-nome"
                  type="text"
                  className={glassField}
                  placeholder="Ex.: Nova Obra"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  disabled={formSaving}
                />
              </div>
              <div>
                <label htmlFor="obra-form-empresa" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Empresa
                </label>
                <select
                  id="obra-form-empresa"
                  className={glassField}
                  value={formEmpresa}
                  onChange={(e) => setFormEmpresa(e.target.value as ObraEmpresa)}
                  disabled={formSaving}
                >
                  {OBRA_EMPRESAS.map((e) => (
                    <option key={e} value={e}>
                      {EMPRESA_LABEL[e]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {formError ? (
              <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{formError}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeFormModal}
                disabled={formSaving}
                className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveObra()}
                disabled={formSaving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {formSaving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-obra-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteSaving) setDeleteTarget(null);
          }}
        >
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <h2 id="delete-obra-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Excluir contrato{deleteTarget.length > 1 ? "s" : ""}?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {deleteTarget.length === 1
                ? `O contrato ${deleteTarget[0]} será removido permanentemente.`
                : `${deleteTarget.length} contratos serão removidos permanentemente.`}{" "}
              Contratos com movimentações ou equipamentos vinculados não podem ser excluídos.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteSaving}
                className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteSaving}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleteSaving ? "A excluir…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
