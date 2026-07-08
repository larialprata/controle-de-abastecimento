import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Pencil, Plus, QrCode, Trash2, Upload, X } from "lucide-react";
import { useAuth } from "../../state/AuthContext";
import type { WebWritePageKey } from "../../lib/webPermissions";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { resolveMobilidadeEquipamento } from "../../lib/equipamentoMobilidade";
import {
  collectEmpresasFromRows,
  labelEquipamentoEmpresa,
  normalizeEquipamentoEmpresa,
} from "../../lib/equipamentoEmpresa";
import { EMPRESA_LABEL } from "../../lib/obrasEmpresa";
import {
  chunkImportRows,
  downloadEquipamentosImportTemplate,
  parseEquipamentosImportFile,
  type EquipamentoImportRow,
} from "../../lib/equipamentosImport";
import { parseObraCodigoInput } from "../../lib/obraCodigo";
import { glassField, glassPanel } from "../../lib/glass";
import { downloadEquipamentosQrHtml } from "../../lib/equipamentoQrCode";
import { resolveEquipamentosQrBatch } from "../../lib/equipamentoQrResolve";
import EquipamentoQrModal from "./EquipamentoQrModal";

export type CadastroAtivoTipo = "MELOSA" | "EQUIPAMENTO";
export type EquipamentoMobilidade = "ESTACIONARIO" | "MOVEL";

type EquipamentoRow = {
  ativo: string;
  nome: string | null;
  tipo: CadastroAtivoTipo;
  obra_codigo: number | null;
  capacidade_litros?: number | null;
  mobilidade?: EquipamentoMobilidade | null;
  empresa?: string | null;
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
  showEmpresa?: boolean;
  enableImport?: boolean;
  enableBulkSelect?: boolean;
  enableQrCode?: boolean;
  writePageKey: WebWritePageKey;
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
  showEmpresa = false,
  enableImport = false,
  enableBulkSelect = false,
  enableQrCode = false,
  writePageKey,
}: CadastroAtivosPageProps) {
  const { token, canWriteOnPage, canAccessObra } = useAuth();
  const canWrite = canWriteOnPage(writePageKey);
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
  const [bulkDeleteAtivos, setBulkDeleteAtivos] = useState<string[] | null>(null);
  const [selectedAtivos, setSelectedAtivos] = useState<Set<string>>(() => new Set());
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formMobilidade, setFormMobilidade] = useState<"" | EquipamentoMobilidade>("");
  const [formEmpresa, setFormEmpresa] = useState("");
  const [empresaCustomMode, setEmpresaCustomMode] = useState(false);
  const [filtroMobilidade, setFiltroMobilidade] = useState<"" | EquipamentoMobilidade>("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroObraCodigo, setFiltroObraCodigo] = useState("");
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
  const [qrTarget, setQrTarget] = useState<EquipamentoRow | null>(null);
  const [qrExporting, setQrExporting] = useState(false);

  const showCapacidade = fixedTipo === "MELOSA";
  const showObra = fixedTipo === "EQUIPAMENTO";

  const obrasPorCodigo = useMemo(() => new Map(obras.map((o) => [o.codigo, o.nome])), [obras]);

  const obrasFormulario = useMemo(
    () => obras.filter((o) => canAccessObra(o.codigo)),
    [obras, canAccessObra],
  );

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

  useEffect(() => {
    const valid = new Set(equipamentos.map((e) => e.ativo));
    setSelectedAtivos((prev) => {
      const next = new Set([...prev].filter((ativo) => valid.has(ativo)));
      return next.size === prev.size ? prev : next;
    });
  }, [equipamentos]);

  const empresasCadastradas = useMemo(
    () => collectEmpresasFromRows(equipamentos),
    [equipamentos],
  );

  const empresasOpcoes = useMemo(() => {
    const set = new Set<string>(empresasCadastradas);
    Object.values(EMPRESA_LABEL).forEach((label) => set.add(label));
    const atual = normalizeEquipamentoEmpresa(formEmpresa);
    if (atual) set.add(atual);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [empresasCadastradas, formEmpresa]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtroEmpresaNorm = normalizeEquipamentoEmpresa(filtroEmpresa);
    const obraFiltro = filtroObraCodigo.trim() ? Number(filtroObraCodigo) : null;
    return equipamentos.filter((e) => {
      if (obraFiltro != null && Number.isFinite(obraFiltro)) {
        if (obraFiltro === 0) {
          if (e.obra_codigo != null) return false;
        } else if (e.obra_codigo !== obraFiltro) {
          return false;
        }
      }
      if (filtroMobilidade && e.mobilidade !== filtroMobilidade) return false;
      if (
        filtroEmpresaNorm &&
        normalizeEquipamentoEmpresa(e.empresa)?.toLowerCase() !== filtroEmpresaNorm.toLowerCase()
      ) {
        return false;
      }
      if (!q) return true;
      return (
        (e.ativo ?? "").toLowerCase().includes(q) ||
        (e.nome ?? "").toLowerCase().includes(q) ||
        (e.mobilidade ? MOBILIDADE_LABEL[e.mobilidade].toLowerCase().includes(q) : false) ||
        (e.empresa ? labelEquipamentoEmpresa(e.empresa).toLowerCase().includes(q) : false)
      );
    });
  }, [equipamentos, busca, filtroMobilidade, filtroEmpresa, filtroObraCodigo]);

  const showSelection = canWrite && enableBulkSelect;
  const allFiltradasSelected =
    filtradas.length > 0 && filtradas.every((e) => selectedAtivos.has(e.ativo));
  const someFiltradasSelected = filtradas.some((e) => selectedAtivos.has(e.ativo));

  const toggleSelectAtivo = useCallback((ativo: string) => {
    setSelectedAtivos((prev) => {
      const next = new Set(prev);
      if (next.has(ativo)) next.delete(ativo);
      else next.add(ativo);
      return next;
    });
  }, []);

  const toggleSelectAllFiltradas = useCallback(() => {
    setSelectedAtivos((prev) => {
      const next = new Set(prev);
      if (allFiltradasSelected) {
        filtradas.forEach((e) => next.delete(e.ativo));
      } else {
        filtradas.forEach((e) => next.add(e.ativo));
      }
      return next;
    });
  }, [allFiltradasSelected, filtradas]);

  const clearSelection = useCallback(() => {
    setSelectedAtivos(new Set());
  }, []);

  const openQrModal = useCallback((e: EquipamentoRow) => {
    setQrTarget(e);
  }, []);

  const handleExportQrCodes = useCallback(async () => {
    const base =
      selectedAtivos.size > 0
        ? filtradas.filter((e) => selectedAtivos.has(e.ativo))
        : filtradas;
    if (!token || base.length === 0) return;
    setQrExporting(true);
    try {
      const resolved = await resolveEquipamentosQrBatch(
        token,
        base.map((e) => ({
          ativo: e.ativo,
          nome: e.nome,
          obra_codigo: e.obra_codigo,
          tipo: fixedTipo,
        })),
      );
      await downloadEquipamentosQrHtml(
        resolved.map((qr) => ({
          ativo: qr.externo?.ativo_placa?.trim() || qr.ativo,
          nome: qr.nome,
          tipo: fixedTipo,
          qr_content: qr.qr_content,
          source: qr.source,
          company_name: qr.externo?.company_name ?? null,
          contract_name: qr.externo?.contract_name ?? null,
          qr_token: qr.externo?.qr_token ?? null,
        })),
        `QR codes — ${title}`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao exportar QR codes.");
    } finally {
      setQrExporting(false);
    }
  }, [filtradas, fixedTipo, selectedAtivos, title, token]);

  const qrExportCount =
    selectedAtivos.size > 0
      ? filtradas.filter((e) => selectedAtivos.has(e.ativo)).length
      : filtradas.length;

  const isEditing = editingAtivoOriginal != null;

  const openAddModal = useCallback(() => {
    setEditingAtivoOriginal(null);
    setFormAtivo("");
    setFormNome("");
    setFormObraCodigo("");
    setFormCapacidadeLitros("");
    setFormMobilidade("");
    setFormEmpresa("");
    setEmpresaCustomMode(false);
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
    setFormEmpresa(normalizeEquipamentoEmpresa(e.empresa) ?? "");
    setEmpresaCustomMode(false);
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
    setBulkDeleteAtivos(null);
    setDeleteError(null);
  }, [deleteSaving]);

  const openBulkDeleteModal = useCallback(() => {
    if (selectedAtivos.size === 0) return;
    setDeleteError(null);
    setDeleteTarget(null);
    setBulkDeleteAtivos([...selectedAtivos]);
  }, [selectedAtivos]);

  const deleteAtivosList = useMemo(() => {
    if (bulkDeleteAtivos?.length) return bulkDeleteAtivos;
    if (deleteTarget) return [deleteTarget.ativo];
    return [];
  }, [bulkDeleteAtivos, deleteTarget]);

  const isBulkDelete = (bulkDeleteAtivos?.length ?? 0) > 0;

  const handleSave = useCallback(async () => {
    if (!token) return;
    const ativoTrim = formAtivo.trim();
    if (!ativoTrim) {
      setFormError("Informe o ativo.");
      return;
    }

    const nomeTrim = formNome.trim();
    const obraCodigo =
      showObra && formObraCodigo.trim() !== "" ? parseObraCodigoInput(formObraCodigo) : null;
    if (showObra && formObraCodigo.trim() !== "" && obraCodigo == null) {
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

    if (showEmpresa) {
      payload.empresa = normalizeEquipamentoEmpresa(formEmpresa);
    }

    setFormSaving(true);
    setFormError(null);
    try {
      if (isEditing && editingAtivoOriginal) {
        await apiPatch(`/v1/equipamentos/${encodeURIComponent(editingAtivoOriginal)}`, token, payload);
      } else {
        await apiPost("/v1/equipamentos", token, payload);
      }
      const savedRow: EquipamentoRow = {
        ativo: ativoTrim,
        nome: nomeTrim || ativoTrim,
        tipo: fixedTipo,
        obra_codigo: obraCodigo,
        mobilidade: showMobilidade
          ? resolveMobilidadeEquipamento(nomeTrim || ativoTrim, formMobilidade || null)
          : null,
        empresa: showEmpresa ? normalizeEquipamentoEmpresa(formEmpresa) : null,
      };
      const wasCreate = !isEditing;
      setFormOpen(false);
      setEditingAtivoOriginal(null);
      setFormAtivo("");
      setFormNome("");
      setFormObraCodigo("");
      setFormCapacidadeLitros("");
      setFormMobilidade("");
      setFormEmpresa("");
      setEmpresaCustomMode(false);
      await load();
      if (enableQrCode && wasCreate) {
        setQrTarget(savedRow);
      }
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
    formEmpresa,
    formNome,
    formObraCodigo,
    isEditing,
    load,
    showCapacidade,
    showMobilidade,
    showEmpresa,
    showObra,
    enableQrCode,
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
    if (!token || deleteAtivosList.length === 0) return;
    setDeleteSaving(true);
    setDeleteError(null);
    const erros: string[] = [];
    const batchSize = 5;

    try {
      for (let i = 0; i < deleteAtivosList.length; i += batchSize) {
        const chunk = deleteAtivosList.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (ativo) => {
            try {
              await apiDelete(`/v1/equipamentos/${encodeURIComponent(ativo)}`, token);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Erro ao excluir";
              erros.push(`${ativo}: ${msg}`);
            }
          }),
        );
      }

      if (erros.length > 0) {
        const restante = erros.length - Math.min(erros.length, 3);
        const detalhe =
          erros.slice(0, 3).join(" · ") + (restante > 0 ? ` · e mais ${restante}` : "");
        setDeleteError(`Falha ao excluir ${erros.length} de ${deleteAtivosList.length}. ${detalhe}`);
        setDeleteTarget(null);
        setBulkDeleteAtivos(null);
        setSelectedAtivos((prev) => {
          const failed = new Set(
            erros.map((e) => e.split(":")[0]?.trim()).filter((a): a is string => Boolean(a)),
          );
          return new Set([...prev].filter((ativo) => failed.has(ativo)));
        });
        await load();
        return;
      }

      setDeleteTarget(null);
      setBulkDeleteAtivos(null);
      setSelectedAtivos(new Set());
      await load();
    } finally {
      setDeleteSaving(false);
    }
  }, [deleteAtivosList, load, token]);

  const colCount =
    (showSelection ? 1 : 0) +
    2 +
    (showObra ? 1 : 0) +
    (showEmpresa ? 1 : 0) +
    (showMobilidade ? 1 : 0) +
    (showCapacidade ? 1 : 0) +
    (canWrite ? 1 : 0);

  return (
    <div className="page-shell">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Início
      </Link>

      <header className={`${glassPanel} px-4 py-4 sm:p-5`}>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl md:text-3xl dark:text-white">{title}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{description}</p>
      </header>

      <div className={`flex flex-wrap items-end gap-3 p-3 sm:gap-4 sm:p-4 ${glassPanel}`}>
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

        {canWrite ? (
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

        {canWrite && enableImport ? (
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

        {enableQrCode ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              QR codes
            </span>
            <button
              type="button"
              onClick={() => void handleExportQrCodes()}
              disabled={loading || qrExporting || qrExportCount === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
            >
              <QrCode className="h-4 w-4" aria-hidden />
              {qrExporting
                ? "A exportar…"
                : selectedAtivos.size > 0
                  ? `Exportar QR selecionados (${qrExportCount})`
                  : `Exportar QR (${qrExportCount})`}
            </button>
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

        {showEmpresa ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Empresa
            </span>
            <select
              className={glassField}
              value={filtroEmpresa}
              onChange={(e) => setFiltroEmpresa(e.target.value)}
            >
              <option value="">Todas</option>
              {empresasCadastradas.map((empresa) => (
                <option key={empresa} value={empresa}>
                  {labelEquipamentoEmpresa(empresa)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {showObra ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Obra
            </span>
            <select
              className={glassField}
              value={filtroObraCodigo}
              onChange={(e) => setFiltroObraCodigo(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="0">Sem obra vinculada</option>
              {obrasFormulario.map((o) => (
                <option key={o.codigo} value={String(o.codigo)}>
                  {o.codigo} — {o.nome}
                </option>
              ))}
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

      {showSelection ? (
        <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 p-4 ${glassPanel}`}>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-white">{filtradas.length}</strong>{" "}
            {filtradas.length === 1 ? "registro" : "registros"}
            {busca.trim() || filtroMobilidade || filtroEmpresa || filtroObraCodigo ? " (filtrado)" : ""} ·{" "}
            <strong className="text-slate-900 dark:text-white">{selectedAtivos.size}</strong> selecionado
            {selectedAtivos.size === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {selectedAtivos.size > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                disabled={deleteSaving}
                className="rounded-lg border border-slate-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
              >
                Limpar seleção
              </button>
            ) : null}
            <button
              type="button"
              onClick={openBulkDeleteModal}
              disabled={deleteSaving || selectedAtivos.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Excluir selecionados
              {selectedAtivos.size > 0 ? ` (${selectedAtivos.size})` : ""}
            </button>
          </div>
        </div>
      ) : null}

      <div className={`overflow-hidden p-0 ${glassPanel}`}>
        <div className="table-scroll">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr>
                {showSelection ? (
                  <th className="border-b border-slate-200 bg-slate-100 px-3 py-3 text-center dark:border-white/10 dark:bg-slate-800/90">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                      checked={allFiltradasSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allFiltradasSelected && someFiltradasSelected;
                      }}
                      onChange={toggleSelectAllFiltradas}
                      disabled={filtradas.length === 0 || deleteSaving}
                      aria-label="Selecionar todos os registros visíveis"
                      title="Selecionar todos os registros visíveis"
                    />
                  </th>
                ) : null}
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
                {showEmpresa ? (
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Empresa
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
                {canWrite ? (
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
                  <tr
                    key={e.ativo}
                    className={`${zebra} ${selectedAtivos.has(e.ativo) ? "ring-1 ring-inset ring-accent/30" : ""}`}
                  >
                    {showSelection ? (
                      <td className="border-b border-slate-100 px-3 py-3 text-center dark:border-white/5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                          checked={selectedAtivos.has(e.ativo)}
                          onChange={() => toggleSelectAtivo(e.ativo)}
                          disabled={deleteSaving}
                          aria-label={`Selecionar ${e.ativo}`}
                        />
                      </td>
                    ) : null}
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      {enableQrCode ? (
                        <button
                          type="button"
                          onClick={() => openQrModal(e)}
                          className="font-mono text-slate-700 underline-offset-2 transition hover:text-accent hover:underline dark:text-slate-300"
                          title="Ver QR code"
                        >
                          {e.ativo}
                        </button>
                      ) : (
                        <span className="font-mono text-slate-700 dark:text-slate-300">{e.ativo}</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      {enableQrCode ? (
                        <button
                          type="button"
                          onClick={() => openQrModal(e)}
                          className="text-left font-semibold text-slate-900 underline-offset-2 transition hover:text-accent hover:underline dark:text-white"
                          title="Ver QR code"
                        >
                          {e.nome || "—"}
                        </button>
                      ) : (
                        <span className="font-semibold text-slate-900 dark:text-white">{e.nome || "—"}</span>
                      )}
                    </td>
                    {showObra ? (
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-white/5 dark:text-slate-400">
                        {e.obra_codigo != null ? `${e.obra_codigo} - ${obraNome ?? "?"}` : "—"}
                      </td>
                    ) : null}
                    {showEmpresa ? (
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-white/5 dark:text-slate-400">
                        {labelEquipamentoEmpresa(e.empresa)}
                      </td>
                    ) : null}
                    {showMobilidade ? (
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-white/5 dark:text-slate-400">
                        {e.mobilidade ? MOBILIDADE_LABEL[e.mobilidade] : "—"}
                      </td>
                    ) : null}
                    {showCapacidade ? (
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-white/5 dark:text-slate-400">
                        {e.capacidade_litros != null
                          ? new Intl.NumberFormat("pt-BR").format(Number(e.capacidade_litros))
                          : "—"}
                      </td>
                    ) : null}
                    {canWrite ? (
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
                    {obrasFormulario.map((o) => (
                      <option key={o.codigo} value={String(o.codigo)}>
                        {o.codigo} - {o.nome}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {showEmpresa ? (
                <div>
                  <label htmlFor="cadastro-form-empresa" className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Empresa (opcional)
                  </label>
                  {empresaCustomMode ? (
                    <div className="flex gap-2">
                      <input
                        id="cadastro-form-empresa"
                        type="text"
                        className={glassField}
                        placeholder="Ex.: Construtora Alfa"
                        value={formEmpresa}
                        onChange={(e) => setFormEmpresa(e.target.value)}
                        disabled={formSaving}
                        maxLength={100}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEmpresaCustomMode(false);
                          setFormEmpresa("");
                        }}
                        disabled={formSaving}
                        className="shrink-0 rounded-lg border border-slate-300 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
                      >
                        Lista
                      </button>
                    </div>
                  ) : (
                    <select
                      id="cadastro-form-empresa"
                      className={glassField}
                      value={formEmpresa}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__nova__") {
                          setEmpresaCustomMode(true);
                          setFormEmpresa("");
                        } else {
                          setFormEmpresa(v);
                        }
                      }}
                      disabled={formSaving}
                    >
                      <option value="">Sem empresa</option>
                      {empresasOpcoes.map((empresa) => (
                        <option key={empresa} value={empresa}>
                          {empresa}
                        </option>
                      ))}
                      <option value="__nova__">➕ Nova empresa…</option>
                    </select>
                  )}
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Selecione a empresa proprietária ou escolha <strong>Nova empresa</strong> para cadastrar outra.
                  </p>
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
              padrão (coluna <strong>empresa</strong> opcional: informe o nome da empresa, ex.{" "}
              <strong>Dimensional</strong>, <strong>Construtora Alfa</strong>). Linhas duplicadas são unificadas
              por patrimônio.
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

      {(deleteTarget || bulkDeleteAtivos) ? (
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
              {isBulkDelete ? "Excluir selecionados" : "Excluir registo"}
            </h2>
            {isBulkDelete ? (
              <>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  Tem certeza que deseja excluir{" "}
                  <strong className="text-slate-900 dark:text-white">{deleteAtivosList.length}</strong>{" "}
                  {deleteAtivosList.length === 1 ? "equipamento" : "equipamentos"}? Esta ação não pode ser desfeita.
                </p>
                <ul className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  {deleteAtivosList.slice(0, 20).map((ativo) => (
                    <li key={ativo}>{ativo}</li>
                  ))}
                  {deleteAtivosList.length > 20 ? (
                    <li className="pt-1 text-slate-500">… e mais {deleteAtivosList.length - 20}</li>
                  ) : null}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                Tem certeza que deseja excluir{" "}
                <strong className="text-slate-900 dark:text-white">{deleteTarget?.ativo}</strong>? Esta ação não pode
                ser desfeita.
              </p>
            )}
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

      {qrTarget ? (
        <EquipamentoQrModal
          ativo={qrTarget.ativo}
          nome={qrTarget.nome}
          tipo={qrTarget.tipo}
          obraCodigo={qrTarget.obra_codigo}
          token={token ?? ""}
          onClose={() => setQrTarget(null)}
        />
      ) : null}
    </div>
  );
}
