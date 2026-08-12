import { useCallback, useEffect, useState, Fragment } from "react";
import { Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useAuth } from "../state/AuthContext";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import { glassField, glassPanel, glassSelect } from "../lib/glass";

type AuditAction = "insert" | "update" | "delete";
type AuditEntity = "melosa" | "tanque";

type AuditRow = {
  id: string;
  entity: AuditEntity;
  action: AuditAction;
  operation_id: string;
  obra_codigo: number | null;
  actor_user_id: string | null;
  actor_full_name: string | null;
  actor_email: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  changed_keys: string[];
};

const ACTION_LABEL: Record<AuditAction, string> = {
  insert: "Adicionou",
  update: "Editou",
  delete: "Excluiu",
};

const ENTITY_LABEL: Record<AuditEntity, string> = {
  melosa: "BI abastecimentos",
  tanque: "BI Tanque",
};

function actionBadgeClass(action: AuditAction): string {
  if (action === "insert") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (action === "update") return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

function snapshotPreview(row: AuditRow): string {
  const src = row.action === "delete" ? row.before : row.after ?? row.before;
  if (!src) return "—";
  const litros = src.litros ?? src.melosa_quantidade_abastecida;
  const ativo = src.ativo_equipamento_texto ?? src.ativo_melosa_texto ?? src.tanque_numero;
  const parts = [
    litros != null ? `${litros} L` : null,
    ativo != null ? String(ativo) : null,
    row.changed_keys.length > 0 && row.action === "update"
      ? `campos: ${row.changed_keys.slice(0, 6).join(", ")}${row.changed_keys.length > 6 ? "…" : ""}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function AuditoriaPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [entity, setEntity] = useState<"" | AuditEntity>("");
  const [action, setAction] = useState<"" | AuditAction>("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (entity) qs.set("entity", entity);
      if (action) qs.set("action", action);
      if (dataDe) qs.set("de", dataDe);
      if (dataAte) qs.set("ate", dataAte);
      qs.set("limit", "300");
      const json = await apiGet<{ rows: AuditRow[] }>(
        `/v1/admin/movimentacao-audit?${qs.toString()}`,
        token,
      );
      setRows(json.rows ?? []);
      setSelected(new Set());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  }, [token, entity, action, dataDe, dataAte]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function confirmDelete() {
    if (!token || !confirmIds?.length) return;
    setDeleting(true);
    setError(null);
    setOkMsg(null);
    try {
      if (confirmIds.length === 1) {
        await apiDelete(`/v1/admin/movimentacao-audit/${confirmIds[0]}`, token);
      } else {
        await apiPost("/v1/admin/movimentacao-audit/delete", token, { ids: confirmIds });
      }
      setOkMsg(
        confirmIds.length === 1
          ? "Registo de auditoria excluído."
          : `${confirmIds.length} registos de auditoria excluídos.`,
      );
      setConfirmIds(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Auditoria</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Alterações feitas por utilizadores web nos BIs de tanque e abastecimentos. Ações de
          administradores e do app não aparecem aqui.
        </p>
      </header>

      <div className={`flex flex-wrap items-end gap-3 p-3 sm:p-4 ${glassPanel}`}>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Origem</span>
          <select
            className={glassSelect}
            value={entity}
            onChange={(e) => setEntity(e.target.value as "" | AuditEntity)}
          >
            <option value="">Todas</option>
            <option value="tanque">BI Tanque</option>
            <option value="melosa">BI abastecimentos</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ação</span>
          <select
            className={glassSelect}
            value={action}
            onChange={(e) => setAction(e.target.value as "" | AuditAction)}
          >
            <option value="">Todas</option>
            <option value="insert">Adicionou</option>
            <option value="update">Editou</option>
            <option value="delete">Excluiu</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">De</span>
          <input type="date" className={glassField} value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Até</span>
          <input type="date" className={glassField} value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => setConfirmIds(Array.from(selected))}
          disabled={loading || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Excluir selecionados{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-300/80 bg-red-50/90 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="rounded-2xl border border-emerald-300/80 bg-emerald-50/90 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          {okMsg}
        </div>
      ) : null}

      <div className={`overflow-hidden ${glassPanel}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    disabled={rows.length === 0}
                    className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Quem</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">BI</th>
                <th className="px-4 py-3">Obra</th>
                <th className="px-4 py-3">Resumo</th>
                <th className="px-4 py-3">Detalhe</th>
                <th className="px-4 py-3">Excluir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr className="border-t border-slate-100 dark:border-white/5">
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={(e) => toggleOne(row.id, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                          aria-label={`Selecionar ${row.id}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">
                        {formatWhen(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {row.actor_full_name || row.actor_email || "—"}
                        </div>
                        {row.actor_email && row.actor_full_name ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400">{row.actor_email}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${actionBadgeClass(row.action)}`}>
                          {ACTION_LABEL[row.action]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{ENTITY_LABEL[row.entity]}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{row.obra_codigo ?? "—"}</td>
                      <td className="max-w-xs px-4 py-3 text-slate-600 dark:text-slate-400">{snapshotPreview(row)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : row.id)}
                          className="text-sm font-semibold text-accent hover:underline"
                        >
                          {open ? "Ocultar" : "Ver JSON"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setConfirmIds([row.id])}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 hover:underline dark:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Excluir
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t border-slate-100 bg-slate-50/60 dark:border-white/5 dark:bg-black/20">
                        <td colSpan={9} className="px-4 py-3">
                          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            operation_id: {row.operation_id}
                          </p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <pre className="overflow-auto rounded-xl bg-black/80 p-3 text-xs text-emerald-100">
                              {JSON.stringify(row.before, null, 2) ?? "null"}
                            </pre>
                            <pre className="overflow-auto rounded-xl bg-black/80 p-3 text-xs text-sky-100">
                              {JSON.stringify(row.after, null, 2) ?? "null"}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    Nenhum registo de auditoria encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {confirmIds ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-audit-title"
        >
          <div className={`w-full max-w-md p-6 ${glassPanel}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="delete-audit-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Excluir auditoria
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Esta ação remove o histórico de forma permanente e não pode ser desfeita.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !deleting && setConfirmIds(null)}
                disabled={deleting}
                className="rounded-lg p-1 text-slate-500 hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-800 dark:text-slate-200">
              Confirma a exclusão de{" "}
              <span className="font-semibold">
                {confirmIds.length} registo{confirmIds.length === 1 ? "" : "s"}
              </span>
              ?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmIds(null)}
                disabled={deleting}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-black/5 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
