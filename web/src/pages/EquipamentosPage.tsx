import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../state/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { glassField, glassPanel } from "../lib/glass";

type EquipamentoTipo = "TANQUE" | "MELOSA";

type EquipamentoRow = {
  ativo: string;
  nome: string | null;
  tipo: EquipamentoTipo;
  obra_codigo: number | null;
};

type ObraRow = { codigo: number; nome: string };

const TIPO_LABEL: Record<EquipamentoTipo, string> = {
  MELOSA: "Melosa",
  TANQUE: "Tanque",
};

export default function EquipamentosPage() {
  const { token, isAdmin } = useAuth();
  const [equipamentos, setEquipamentos] = useState<EquipamentoRow[]>([]);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"" | EquipamentoTipo>("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingAtivoOriginal, setEditingAtivoOriginal] = useState<string | null>(null);
  const [formTipo, setFormTipo] = useState<EquipamentoTipo>("MELOSA");
  const [formAtivo, setFormAtivo] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formObraCodigo, setFormObraCodigo] = useState<string>("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EquipamentoRow | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const obrasPorCodigo = useMemo(() => new Map(obras.map((o) => [o.codigo, o.nome])), [obras]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [equipJson, obrasJson] = await Promise.all([
        apiGet<{ equipamentos: EquipamentoRow[] }>("/v1/equipamentos", token),
        apiGet<{ obras: ObraRow[] }>("/v1/obras", token),
      ]);
      setEquipamentos(equipJson?.equipamentos ?? []);
      setObras(obrasJson?.obras ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar equipamentos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return equipamentos.filter((e) => {
      if (filtroTipo && e.tipo !== filtroTipo) return false;
      if (!q) return true;
      return (
        (e.ativo ?? "").toLowerCase().includes(q) ||
        (e.nome ?? "").toLowerCase().includes(q) ||
        TIPO_LABEL[e.tipo].toLowerCase().includes(q)
      );
    });
  }, [equipamentos, busca, filtroTipo]);

  const isEditing = editingAtivoOriginal != null;

  const openAddModal = useCallback(() => {
    setEditingAtivoOriginal(null);
    setFormTipo("MELOSA");
    setFormAtivo("");
    setFormNome("");
    setFormObraCodigo("");
    setFormError(null);
    setFormOpen(true);
  }, []);

  const openEditModal = useCallback((e: EquipamentoRow) => {
    setEditingAtivoOriginal(e.ativo);
    setFormTipo(e.tipo);
    setFormAtivo(e.ativo);
    setFormNome(e.nome && e.nome !== e.ativo ? e.nome : "");
    setFormObraCodigo(e.obra_codigo != null ? String(e.obra_codigo) : "");
    setFormError(null);
    setFormOpen(true);
  }, []);

  const closeFormModal = useCallback(() => {
    if (formSaving) return;
    setFormOpen(false);
    setEditingAtivoOriginal(null);
    setFormError(null);
  }, [formSaving]);

  const closeDeleteModal = useCallback(() => {
    if (deleteSaving) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, [deleteSaving]);

  const handleSaveEquipamento = useCallback(async () => {
    if (!token) return;
    const ativoTrim = formAtivo.trim();
    if (!ativoTrim) {
      setFormError("Informe o ativo.");
      return;
    }

    const nomeTrim = formNome.trim();
    if (formTipo === "TANQUE" && !nomeTrim) {
      setFormError("Informe uma descrição para o tanque.");
      return;
    }

    const obraCodigo =
      formTipo === "TANQUE" && formObraCodigo.trim() !== "" ? Number(formObraCodigo) : null;
    if (formTipo === "TANQUE" && formObraCodigo.trim() !== "" && !Number.isFinite(obraCodigo)) {
      setFormError("Obra inválida.");
      return;
    }

    const payload = {
      ativo: ativoTrim,
      nome: formTipo === "MELOSA" ? nomeTrim || ativoTrim : nomeTrim,
      tipo: formTipo,
      obra_codigo: obraCodigo,
    };

    setFormSaving(true);
    setFormError(null);
    try {
      if (isEditing && editingAtivoOriginal) {
        await apiPatch(`/v1/equipamentos/${encodeURIComponent(editingAtivoOriginal)}`, token, payload);
      } else {
        await apiPost("/v1/equipamentos", token, payload);
      }
      setFormOpen(false);
      setEditingAtivoOriginal(null);
      setFormAtivo("");
      setFormNome("");
      setFormObraCodigo("");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao guardar equipamento";
      setFormError(msg);
    } finally {
      setFormSaving(false);
    }
  }, [editingAtivoOriginal, formAtivo, formNome, formObraCodigo, formTipo, isEditing, load, token]);

  const handleDeleteEquipamento = useCallback(async () => {
    if (!token || !deleteTarget) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await apiDelete(`/v1/equipamentos/${encodeURIComponent(deleteTarget.ativo)}`, token);
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir equipamento";
      setDeleteError(msg);
    } finally {
      setDeleteSaving(false);
    }
  }, [deleteTarget, load, token]);

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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Equipamentos</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Cadastro de <strong>melosas</strong> e <strong>tanques</strong>. As melosas cadastradas aparecem no app
          mobile para seleção do ativo. Tanques podem ser vinculados opcionalmente a uma obra.
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
              Adicionar equipamento
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo</span>
          <select className={glassField} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as "" | EquipamentoTipo)}>
            <option value="">Todos</option>
            <option value="MELOSA">Melosa</option>
            <option value="TANQUE">Tanque</option>
          </select>
        </div>

        <div className="min-w-[200px] flex-1 flex-col gap-1 sm:max-w-md">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Pesquisar
          </span>
          <input
            type="search"
            placeholder="Ativo, nome ou tipo…"
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
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Tipo
                </th>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Ativo
                </th>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Descrição
                </th>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Obra
                </th>
                {isAdmin ? (
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Ações
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((e, idx) => {
                const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-slate-50/90 dark:bg-white/[0.03]";
                const obraNome = e.obra_codigo != null ? obrasPorCodigo.get(e.obra_codigo) : null;
                return (
                  <tr key={e.ativo} className={zebra}>
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-bold uppercase text-slate-700 dark:bg-white/10 dark:text-slate-200">
                        {TIPO_LABEL[e.tipo] ?? e.tipo}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 font-mono text-slate-700 dark:border-white/5 dark:text-slate-300">
                      {e.ativo}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      <span className="font-semibold text-slate-900 dark:text-white">{e.nome || "—"}</span>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-white/5 dark:text-slate-400">
                      {e.tipo === "TANQUE" && e.obra_codigo != null
                        ? `${e.obra_codigo} - ${obraNome ?? "?"}`
                        : "—"}
                    </td>
                    {isAdmin ? (
                      <td className="border-b border-slate-100 px-4 py-3 text-right dark:border-white/5">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(e)}
                            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-200/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                            aria-label={`Editar ${e.ativo}`}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(e);
                            }}
                            className="rounded-lg p-2 text-red-600 transition hover:bg-red-100 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                            aria-label={`Excluir ${e.ativo}`}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {filtradas.length === 0 && !loading ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    Nenhum equipamento para mostrar.
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
          aria-labelledby="equipamento-form-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFormModal();
          }}
        >
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="equipamento-form-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {isEditing ? "Editar equipamento" : "Adicionar equipamento"}
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

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="equipamento-form-tipo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Tipo
                </label>
                <select
                  id="equipamento-form-tipo"
                  className={glassField}
                  value={formTipo}
                  onChange={(e) => {
                    const tipo = e.target.value as EquipamentoTipo;
                    setFormTipo(tipo);
                    if (tipo === "MELOSA") setFormObraCodigo("");
                  }}
                  disabled={formSaving}
                >
                  <option value="MELOSA">Melosa</option>
                  <option value="TANQUE">Tanque</option>
                </select>
              </div>

              <div>
                <label htmlFor="equipamento-form-ativo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Ativo
                </label>
                <input
                  id="equipamento-form-ativo"
                  type="text"
                  className={glassField}
                  placeholder={formTipo === "MELOSA" ? "Ex.: ABC1D23" : "Ex.: TQ-01"}
                  value={formAtivo}
                  onChange={(e) => setFormAtivo(e.target.value)}
                  disabled={formSaving}
                />
                {formTipo === "MELOSA" ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Este ativo aparecerá no app mobile para seleção da melosa.
                  </p>
                ) : null}
              </div>

              {formTipo === "TANQUE" ? (
                <>
                  <div>
                    <label htmlFor="equipamento-form-nome" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                      Descrição do tanque
                    </label>
                    <input
                      id="equipamento-form-nome"
                      type="text"
                      className={glassField}
                      placeholder="Ex.: Tanque obra Barreira"
                      value={formNome}
                      onChange={(e) => setFormNome(e.target.value)}
                      disabled={formSaving}
                    />
                  </div>
                  <div>
                    <label htmlFor="equipamento-form-obra" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                      Obra (opcional)
                    </label>
                    <select
                      id="equipamento-form-obra"
                      className={glassField}
                      value={formObraCodigo}
                      onChange={(e) => setFormObraCodigo(e.target.value)}
                      disabled={formSaving}
                    >
                      <option value="">Sem vínculo com obra</option>
                      {obras.map((o) => (
                        <option key={o.codigo} value={String(o.codigo)}>
                          {o.codigo} - {o.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="equipamento-form-nome-opc" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Descrição (opcional)
                  </label>
                  <input
                    id="equipamento-form-nome-opc"
                    type="text"
                    className={glassField}
                    placeholder="Ex.: Melosa caminhão 01"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    disabled={formSaving}
                  />
                </div>
              )}
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
                onClick={() => void handleSaveEquipamento()}
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
          aria-labelledby="delete-equipamento-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <h2 id="delete-equipamento-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Excluir equipamento
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Tem certeza que deseja excluir{" "}
              <strong className="text-slate-900 dark:text-white">
                {TIPO_LABEL[deleteTarget.tipo]} — {deleteTarget.ativo}
              </strong>
              ? Esta ação não pode ser desfeita.
            </p>
            {deleteError ? (
              <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{deleteError}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteSaving}
                className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteEquipamento()}
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
