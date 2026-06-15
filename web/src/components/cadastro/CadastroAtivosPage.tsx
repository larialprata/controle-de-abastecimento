import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useAuth } from "../../state/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { resolveMobilidadeEquipamento } from "../../lib/equipamentoMobilidade";
import {
  chunkImportRows,
  downloadEquipamentosImportTemplate,
  parseEquipamentosImportFile,
  type EquipamentoImportRow,
} from "../../lib/equipamentosImport";
import { glassField, glassPanel } from "../../lib/glass";

export type CadastroAtivoTipo = "MELOSA" | "EQUIPAMENTO";
export type EquipamentoMobilidade = "ESTACIONARIO" | "MOVEL";

type EquipamentoRow = {
  ativo: string;
  nome: string | null;
  tipo: CadastroAtivoTipo;
  obra_codigo: number | null;
  capacidade_litros?: number | null;
  mobilidade?: EquipamentoMobilidade | null;
};

const MOBILIDADE_LABEL: Record<EquipamentoMobilidade, string> = {
  ESTACIONARIO: "Estacionário",
  MOVEL: "Móvel",
};

type ObraRow = { codigo: number; nome: string };

export type CadastroAtivosPageProps = {
  fixedTipo: CadastroAtivoTipo;
  title: string;
  description: ReactNode;
  ativoPlaceholder: string;
  nomePlaceholder: string;
  ativoHint?: string;
  emptyMessage: string;
  addLabel: string;
  showMobilidade?: boolean;
  enableImport?: boolean;
};

export default function CadastroAtivosPage({
  fixedTipo,
  title,
  description,
  ativoPlaceholder,
  nomePlaceholder,
  ativoHint,
  emptyMessage,
  addLabel,
  showMobilidade = false,
  enableImport = false,
}: CadastroAtivosPageProps) {
  const { token, isAdmin } = useAuth();
  const [equipamentos, setEquipamentos] = useState<EquipamentoRow[]>([]);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingAtivoOriginal, setEditingAtivoOriginal] = useState<string | null>(null);
  const [formAtivo, setFormAtivo] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formObraCodigo, setFormObraCodigo] = useState<string>("");
  const [formCapacidadeLitros, setFormCapacidadeLitros] = useState<string>("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EquipamentoRow | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formMobilidade, setFormMobilidade] = useState<"" | EquipamentoMobilidade>("");
  const [filtroMobilidade, setFiltroMobilidade] = useState<"" | EquipamentoMobilidade>("");
  const [importOpen, setImportOpen] = useState(false);
  const [importModo, setImportModo] = useState<"upsert" | "criar">("upsert");
  const [importRows, setImportRows] = useState<EquipamentoImportRow[]>([]);
  const [importParseErrors, setImportParseErrors] = useState<{ linha: number; mensagem: string }[]>([]);
  const [importSaving, setImportSaving] = useState(false);
  const [importResult, setImportResult] = useState<{
    criados: number;
    atualizados: number;
    ignorados: number;
    erros: { linha?: number; ativo: string; mensagem: string }[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const showCapacidade = fixedTipo === "MELOSA";
  const showObra = fixedTipo === "EQUIPAMENTO";

  const obrasPorCodigo = useMemo(() => new Map(obras.map((o) => [o.codigo, o.nome])), [obras]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [equipJson, obrasJson] = await Promise.all([
        apiGet<{ equipamentos: EquipamentoRow[] }>(`/v1/equipamentos?tipo=${fixedTipo}`, token),
        showObra ? apiGet<{ obras: ObraRow[] }>("/v1/obras", token) : Promise.resolve({ obras: [] }),
      ]);
      setEquipamentos(equipJson?.equipamentos ?? []);
      setObras(obrasJson?.obras ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Erro ao carregar ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [fixedTipo, showObra, title, token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return equipamentos.filter((e) => {
      if (filtroMobilidade && e.mobilidade !== filtroMobilidade) return false;
      if (!q) return true;
      return (
        (e.ativo ?? "").toLowerCase().includes(q) ||
        (e.nome ?? "").toLowerCase().includes(q) ||
        (e.mobilidade ? MOBILIDADE_LABEL[e.mobilidade].toLowerCase().includes(q) : false)
      );
    });
  }, [equipamentos, busca, filtroMobilidade]);

  const isEditing = editingAtivoOriginal != null;

  const openAddModal = useCallback(() => {
    setEditingAtivoOriginal(null);
    setFormAtivo("");
    setFormNome("");
    setFormObraCodigo("");
    setFormCapacidadeLitros("");
    setFormMobilidade("");
    setFormError(null);
    setFormOpen(true);
  }, []);

  const openEditModal = useCallback((e: EquipamentoRow) => {
    setEditingAtivoOriginal(e.ativo);
    setFormAtivo(e.ativo);
    setFormNome(e.nome && e.nome !== e.ativo ? e.nome : "");
    setFormObraCodigo(e.obra_codigo != null ? String(e.obra_codigo) : "");
    setFormCapacidadeLitros(
      e.capacidade_litros != null && Number.isFinite(Number(e.capacidade_litros))
        ? String(e.capacidade_litros)
        : "",
    );
    setFormMobilidade(e.mobilidade ?? "");
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

  const handleSave = useCallback(async () => {
    if (!token) return;
    const ativoTrim = formAtivo.trim();
    if (!ativoTrim) {
      setFormError("Informe o ativo.");
      return;
    }

    const nomeTrim = formNome.trim();
    const obraCodigo =
      showObra && formObraCodigo.trim() !== "" ? Number(formObraCodigo) : null;
    if (showObra && formObraCodigo.trim() !== "" && !Number.isFinite(obraCodigo)) {
      setFormError("Obra inválida.");
      return;
    }

    const payload: Record<string, unknown> = {
      ativo: ativoTrim,
      nome: nomeTrim || ativoTrim,
      tipo: fixedTipo,
      obra_codigo: obraCodigo,
    };

    if (showCapacidade) {
      const capTrim = formCapacidadeLitros.trim();
      if (capTrim) {
        const cap = Number(capTrim.replace(",", "."));
        if (!Number.isFinite(cap) || cap <= 0) {
          setFormError("Capacidade inválida.");
          return;
        }
        payload.capacidade_litros = cap;
      } else if (isEditing) {
        payload.capacidade_litros = null;
      }
    }

    if (showMobilidade) {
      const nomeParaRegra = nomeTrim || ativoTrim;
      payload.mobilidade = resolveMobilidadeEquipamento(
        nomeParaRegra,
        formMobilidade || null,
      );
    }

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
      setFormCapacidadeLitros("");
      setFormMobilidade("");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao guardar";
      setFormError(msg);
    } finally {
      setFormSaving(false);
    }
  }, [
    editingAtivoOriginal,
    fixedTipo,
    formAtivo,
    formCapacidadeLitros,
    formMobilidade,
    formNome,
    formObraCodigo,
    isEditing,
    load,
    showCapacidade,
    showMobilidade,
    showObra,
    token,
  ]);

  const openImportModal = useCallback(() => {
    setImportOpen(true);
    setImportRows([]);
    setImportParseErrors([]);
    setImportResult(null);
    setImportError(null);
    setImportModo("upsert");
  }, []);

  const closeImportModal = useCallback(() => {
    if (importSaving) return;
    setImportOpen(false);
  }, [importSaving]);

  const handleImportFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setImportError(null);
    setImportResult(null);
    try {
      const { rows, errors } = await parseEquipamentosImportFile(file);
      setImportRows(rows);
      setImportParseErrors(errors);
      if (rows.length === 0 && errors.length === 0) {
        setImportError("Nenhuma linha válida na planilha.");
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Erro ao ler planilha.");
      setImportRows([]);
      setImportParseErrors([]);
    }
  }, []);

  const handleRunImport = useCallback(async () => {
    if (!token || importRows.length === 0) return;
    setImportSaving(true);
    setImportError(null);
    setImportResult(null);
    try {
      const batches = chunkImportRows(importRows);
      const total = {
        criados: 0,
        atualizados: 0,
        ignorados: 0,
        erros: [] as { linha?: number; ativo: string; mensagem: string }[],
      };

      for (const itens of batches) {
        const result = (await apiPost("/v1/equipamentos/import", token, {
          modo: importModo,
          itens,
        })) as {
          criados: number;
          atualizados: number;
          ignorados: number;
          erros: { linha?: number; ativo: string; mensagem: string }[];
        };
        total.criados += result.criados;
        total.atualizados += result.atualizados;
        total.ignorados += result.ignorados;
        total.erros.push(...(result.erros ?? []));
      }

      setImportResult({
        criados: total.criados,
        atualizados: total.atualizados,
        ignorados: total.ignorados,
        erros: total.erros,
      });
      if (total.criados > 0 || total.atualizados > 0) {
        await load();
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Erro na importação.");
    } finally {
      setImportSaving(false);
    }
  }, [importModo, importRows, load, token]);

  const handleDelete = useCallback(async () => {
    if (!token || !deleteTarget) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await apiDelete(`/v1/equipamentos/${encodeURIComponent(deleteTarget.ativo)}`, token);
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir";
      setDeleteError(msg);
    } finally {
      setDeleteSaving(false);
    }
  }, [deleteTarget, load, token]);

  const colCount =
    2 + (showObra ? 1 : 0) + (showMobilidade ? 1 : 0) + (showCapacidade ? 1 : 0) + (isAdmin ? 1 : 0);

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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">{title}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{description}</p>
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
              {addLabel}
            </button>
          </div>
        ) : null}

        {isAdmin && enableImport ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Planilha
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openImportModal}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500"
              >
                <Upload className="h-4 w-4" aria-hidden />
                Importar
              </button>
              <button
                type="button"
                onClick={() => downloadEquipamentosImportTemplate()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
              >
                <Download className="h-4 w-4" aria-hidden />
                Modelo
              </button>
            </div>
          </div>
        ) : null}

        {showMobilidade ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Mobilidade
            </span>
            <select
              className={glassField}
              value={filtroMobilidade}
              onChange={(e) => setFiltroMobilidade(e.target.value as "" | EquipamentoMobilidade)}
            >
              <option value="">Todas</option>
              <option value="ESTACIONARIO">Estacionário</option>
              <option value="MOVEL">Móvel</option>
            </select>
          </div>
        ) : null}

        <div className="min-w-[200px] flex-1 flex-col gap-1 sm:max-w-md">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Pesquisar
          </span>
          <input
            type="search"
            placeholder="Ativo ou descrição…"
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
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Ativo
                </th>
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                  Descrição
                </th>
                {showObra ? (
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Obra
                  </th>
                ) : null}
                {showMobilidade ? (
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Mobilidade
                  </th>
                ) : null}
                {showCapacidade ? (
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Capacidade (L)
                  </th>
                ) : null}
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
                    <td className="border-b border-slate-100 px-4 py-3 font-mono text-slate-700 dark:border-white/5 dark:text-slate-300">
                      {e.ativo}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      <span className="font-semibold text-slate-900 dark:text-white">{e.nome || "—"}</span>
                    </td>
                    {showObra ? (
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-white/5 dark:text-slate-400">
                        {e.obra_codigo != null ? `${e.obra_codigo} - ${obraNome ?? "?"}` : "—"}
                      </td>
                    ) : null}
                    {showCapacidade ? (
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-white/5 dark:text-slate-400">
                        {e.capacidade_litros != null
                          ? new Intl.NumberFormat("pt-BR").format(Number(e.capacidade_litros))
                          : "—"}
                      </td>
                    ) : null}
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
                  <td colSpan={colCount} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    {emptyMessage}
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
          aria-labelledby="cadastro-form-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFormModal();
          }}
        >
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="cadastro-form-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {isEditing ? `Editar ${title.toLowerCase().replace(/s$/, "")}` : addLabel}
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
                <label htmlFor="cadastro-form-ativo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Ativo
                </label>
                <input
                  id="cadastro-form-ativo"
                  type="text"
                  className={glassField}
                  placeholder={ativoPlaceholder}
                  value={formAtivo}
                  onChange={(e) => setFormAtivo(e.target.value)}
                  disabled={formSaving}
                />
                {ativoHint ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ativoHint}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="cadastro-form-nome" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Descrição (opcional)
                </label>
                <input
                  id="cadastro-form-nome"
                  type="text"
                  className={glassField}
                  placeholder={nomePlaceholder}
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  disabled={formSaving}
                />
              </div>

              {showObra ? (
                <div>
                  <label htmlFor="cadastro-form-obra" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Obra (opcional)
                  </label>
                  <select
                    id="cadastro-form-obra"
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
              ) : null}

              {showMobilidade ? (
                <div>
                  <label
                    htmlFor="cadastro-form-mobilidade"
                    className="mb-1 block text-xs font-bold uppercase text-slate-500"
                  >
                    Mobilidade (opcional)
                  </label>
                  <select
                    id="cadastro-form-mobilidade"
                    className={glassField}
                    value={formMobilidade}
                    onChange={(e) => setFormMobilidade(e.target.value as "" | EquipamentoMobilidade)}
                    disabled={formSaving}
                  >
                    <option value="">Não informado</option>
                    <option value="ESTACIONARIO">Estacionário</option>
                    <option value="MOVEL">Móvel</option>
                  </select>
                </div>
              ) : null}

              {showCapacidade ? (
                <div>
                  <label
                    htmlFor="cadastro-form-capacidade"
                    className="mb-1 block text-xs font-bold uppercase text-slate-500"
                  >
                    Capacidade (litros)
                  </label>
                  <input
                    id="cadastro-form-capacidade"
                    type="text"
                    inputMode="decimal"
                    className={glassField}
                    placeholder="Ex.: 10000"
                    value={formCapacidadeLitros}
                    onChange={(e) => setFormCapacidadeLitros(e.target.value)}
                    disabled={formSaving}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Usada no controle de ciclos para detectar enchimento acima do permitido.
                  </p>
                </div>
              ) : null}
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
                onClick={() => void handleSave()}
                disabled={formSaving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {formSaving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-equipamentos-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeImportModal();
          }}
        >
          <div className={`w-full max-w-lg rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="import-equipamentos-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Importar equipamentos
              </h2>
              <button
                type="button"
                onClick={closeImportModal}
                disabled={importSaving}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Envie um arquivo <strong>.xlsx</strong> ou <strong>.csv</strong>. Aceita colunas{" "}
              <code className="text-xs">PATRIMÔNIO</code> / <code className="text-xs">EQUIPAMENTO</code> ou o modelo
              padrão. Linhas duplicadas são unificadas por patrimônio.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="import-modo" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Se o ativo já existir
                </label>
                <select
                  id="import-modo"
                  className={glassField}
                  value={importModo}
                  onChange={(e) => setImportModo(e.target.value as "upsert" | "criar")}
                  disabled={importSaving}
                >
                  <option value="upsert">Atualizar dados</option>
                  <option value="criar">Ignorar (só criar novos)</option>
                </select>
              </div>

              <div>
                <label htmlFor="import-file" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Arquivo
                </label>
                <input
                  id="import-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                  disabled={importSaving}
                  onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
                />
              </div>

      {importRows.length > 0 ? (
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {importRows.length} equipamento(s) único(s) pronto(s) para importar
                  {importRows.length > 500 ? " (será enviado em lotes)" : ""}.
                </p>
              ) : null}

              {importParseErrors.length > 0 ? (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  {importParseErrors.map((e) => (
                    <p key={`${e.linha}-${e.mensagem}`}>
                      Linha {e.linha}: {e.mensagem}
                    </p>
                  ))}
                </div>
              ) : null}

              {importResult ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                  <p>
                    Criados: <strong>{importResult.criados}</strong> · Atualizados:{" "}
                    <strong>{importResult.atualizados}</strong> · Ignorados:{" "}
                    <strong>{importResult.ignorados}</strong>
                  </p>
                  {importResult.erros.length > 0 ? (
                    <div className="mt-2 max-h-28 overflow-y-auto text-xs text-red-700 dark:text-red-300">
                      {importResult.erros.map((e) => (
                        <p key={`${e.ativo}-${e.mensagem}`}>
                          {e.linha != null ? `Linha ${e.linha} — ` : ""}
                          {e.ativo}: {e.mensagem}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {importError ? (
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">{importError}</p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeImportModal}
                disabled={importSaving}
                className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => void handleRunImport()}
                disabled={importSaving || importRows.length === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {importSaving ? "A importar…" : "Importar"}
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
          aria-labelledby="delete-cadastro-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <h2 id="delete-cadastro-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Excluir registo
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Tem certeza que deseja excluir{" "}
              <strong className="text-slate-900 dark:text-white">{deleteTarget.ativo}</strong>? Esta ação não pode ser
              desfeita.
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
