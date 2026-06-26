import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Monitor, Plus, Shield, Smartphone, X } from "lucide-react";
import { useAuth } from "../state/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { glassField, glassPanel } from "../lib/glass";
import {
  DEFAULT_WEB_PERMISSIONS,
  normalizeWebPermissions,
  WEB_PAGES,
  type WebPageKey,
} from "../lib/webPermissions";

type AccessPlatform = "app" | "web" | "both";

type AdminUserRow = {
  id: string;
  email: string | null;
  role: "admin" | "user";
  active: boolean;
  is_melosa: boolean;
  cnh_storage_path: string | null;
  access_platform: AccessPlatform;
  web_permissions: WebPageKey[];
  obra_codigos: number[];
  created_at: string | null;
};

type ObraRow = { codigo: number; nome: string };

function isWebUser(u: AdminUserRow) {
  return u.role !== "admin" && u.access_platform === "web";
}

function profileLabel(u: AdminUserRow): string {
  if (u.role === "admin") return "Admin";
  return u.access_platform === "web" ? "Utilizador Web" : "Utilizador App";
}

function profileBadgeClass(u: AdminUserRow): string {
  if (u.role === "admin") return "bg-accent/15 text-accent";
  if (u.access_platform === "web") return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
}

export default function UsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCnhUserId, setLoadingCnhUserId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addFullName, setAddFullName] = useState("");
  const [addActive, setAddActive] = useState(true);
  const [addAccessPlatform, setAddAccessPlatform] = useState<"app" | "web">("web");
  const [addWebPermissions, setAddWebPermissions] = useState<WebPageKey[]>(DEFAULT_WEB_PERMISSIONS);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [permUser, setPermUser] = useState<AdminUserRow | null>(null);
  const [permDraft, setPermDraft] = useState<WebPageKey[]>(DEFAULT_WEB_PERMISSIONS);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [obraUser, setObraUser] = useState<AdminUserRow | null>(null);
  const [obraDraft, setObraDraft] = useState<number[]>([]);
  const [obraSaving, setObraSaving] = useState(false);
  const [obraError, setObraError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet<{ users: AdminUserRow[] }>("/v1/admin/users", token);
      setUsers(json.users ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function loadObras() {
    if (!token) return;
    try {
      const json = await apiGet<{ obras: ObraRow[] }>("/v1/obras", token);
      setObras(json.obras ?? []);
    } catch {
      setObras([]);
    }
  }

  useEffect(() => {
    load();
    loadObras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function setRole(userId: string, role: "admin" | "user") {
    if (!token) return;
    setError(null);
    await apiPost(`/v1/admin/users/${userId}/role`, token, { role });
    await load();
  }

  async function setActive(userId: string, active: boolean) {
    if (!token) return;
    setError(null);
    await apiPost(`/v1/admin/users/${userId}/active`, token, { active });
    await load();
  }

  async function setMelosa(userId: string, is_melosa: boolean) {
    if (!token) return;
    setError(null);
    await apiPost(`/v1/admin/users/${userId}/melosa`, token, { is_melosa });
    await load();
  }

  async function setAccessPlatform(userId: string, access_platform: "app" | "web") {
    if (!token) return;
    setError(null);
    await apiPost(`/v1/admin/users/${userId}/access-platform`, token, { access_platform });
    await load();
  }

  function openPermModal(user: AdminUserRow) {
    setPermUser(user);
    setPermDraft(normalizeWebPermissions(user.web_permissions));
    setPermError(null);
  }

  function closePermModal() {
    if (permSaving) return;
    setPermUser(null);
    setPermError(null);
  }

  function togglePermissionList(setter: Dispatch<SetStateAction<WebPageKey[]>>, key: WebPageKey, checked: boolean) {
    if (key === "dashboard") return;
    setter((prev) => {
      const set = new Set(prev);
      if (checked) set.add(key);
      else set.delete(key);
      set.add("dashboard");
      return WEB_PAGES.map((p) => p.key).filter((k) => set.has(k));
    });
  }

  function togglePermDraft(key: WebPageKey, checked: boolean) {
    togglePermissionList(setPermDraft, key, checked);
  }

  async function saveWebPermissions() {
    if (!token || !permUser) return;
    setPermSaving(true);
    setPermError(null);
    try {
      await apiPost(`/v1/admin/users/${permUser.id}/web-permissions`, token, {
        web_permissions: permDraft,
      });
      setPermUser(null);
      await load();
    } catch (err: unknown) {
      setPermError(err instanceof Error ? err.message : "Erro ao guardar permissões");
    } finally {
      setPermSaving(false);
    }
  }

  function openObraModal(user: AdminUserRow) {
    setObraUser(user);
    setObraDraft([...(user.obra_codigos ?? [])]);
    setObraError(null);
  }

  function closeObraModal() {
    if (obraSaving) return;
    setObraUser(null);
    setObraError(null);
  }

  function toggleObraDraft(codigo: number, checked: boolean) {
    setObraDraft((prev) => {
      const set = new Set(prev);
      if (checked) set.add(codigo);
      else set.delete(codigo);
      return Array.from(set).sort((a, b) => a - b);
    });
  }

  async function saveUserObras() {
    if (!token || !obraUser) return;
    setObraSaving(true);
    setObraError(null);
    try {
      await apiPost(`/v1/admin/users/${obraUser.id}/obras`, token, { obra_codigos: obraDraft });
      setObraUser(null);
      await load();
    } catch (err: unknown) {
      setObraError(err instanceof Error ? err.message : "Erro ao guardar obras");
    } finally {
      setObraSaving(false);
    }
  }

  function formatObraLabel(codigos: number[]): string {
    if (!codigos.length) return "Todas";
    if (codigos.length <= 2) {
      return codigos
        .map((c) => {
          const obra = obras.find((o) => o.codigo === c);
          return obra ? `${c} — ${obra.nome}` : String(c);
        })
        .join(", ");
    }
    return `${codigos.length} obra(s)`;
  }

  const openAddModal = useCallback(() => {
    setAddEmail("");
    setAddPassword("");
    setAddFullName("");
    setAddActive(true);
    setAddAccessPlatform("web");
    setAddWebPermissions(DEFAULT_WEB_PERMISSIONS);
    setAddError(null);
    setAddOpen(true);
  }, []);

  const closeAddModal = useCallback(() => {
    if (addSaving) return;
    setAddOpen(false);
    setAddError(null);
  }, [addSaving]);

  async function handleCreateUser() {
    if (!token) return;
    const emailTrim = addEmail.trim();
    const passwordTrim = addPassword;
    if (!emailTrim || !passwordTrim) {
      setAddError("Informe email e senha.");
      return;
    }
    if (passwordTrim.length < 6) {
      setAddError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setAddSaving(true);
    setAddError(null);
    try {
      await apiPost("/v1/admin/users", token, {
        email: emailTrim,
        password: passwordTrim,
        ...(addFullName.trim() ? { full_name: addFullName.trim() } : {}),
        active: addActive,
        access_platform: addAccessPlatform,
        ...(addAccessPlatform === "web" ? { web_permissions: addWebPermissions } : {}),
      });
      setAddOpen(false);
      setAddEmail("");
      setAddPassword("");
      setAddFullName("");
      await load();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Erro ao criar utilizador");
    } finally {
      setAddSaving(false);
    }
  }

  async function openCnh(userId: string) {
    if (!token) return;
    setError(null);
    setLoadingCnhUserId(userId);
    try {
      const json = await apiGet<{ url?: string }>(`/v1/admin/users/${userId}/cnh-url`, token);
      const url = typeof json?.url === "string" ? json.url.trim() : "";
      if (!url) throw new Error("CNH não encontrada.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao abrir CNH");
    } finally {
      setLoadingCnhUserId(null);
    }
  }

  return (
    <div>
      <header className={`mb-6 p-5 ${glassPanel}`}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Usuários</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Utilizador Web: defina quais páginas e obras (contratos) cada um pode ver. Admin vê tudo.
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

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
            Novo utilizador
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500 dark:text-slate-400">A carregar…</p> : null}

      {!loading ? (
        <div className={`overflow-hidden p-0 ${glassPanel}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="align-middle">
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Utilizador
                  </th>
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Perfil
                  </th>
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Status
                  </th>
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Páginas web
                  </th>
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Obras
                  </th>
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Motorista
                  </th>
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    CNH
                  </th>
                  <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-400">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-slate-50/90 dark:bg-white/[0.03]";
                  return (
                    <tr key={u.id} className={`${zebra} align-middle`}>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle dark:border-white/5">
                        <p className="font-semibold text-slate-900 dark:text-white">{u.email ?? u.id}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-500">{u.id}</p>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle dark:border-white/5">
                        <span
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                            profileBadgeClass(u),
                          ].join(" ")}
                        >
                          {u.role === "admin" ? (
                            <Shield className="h-3.5 w-3.5" aria-hidden />
                          ) : u.access_platform === "web" ? (
                            <Monitor className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Smartphone className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {profileLabel(u)}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle dark:border-white/5">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
                            u.active
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                          ].join(" ")}
                        >
                          {u.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle dark:border-white/5">
                        {isWebUser(u) ? (
                          <button
                            type="button"
                            onClick={() => openPermModal(u)}
                            className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"
                          >
                            {normalizeWebPermissions(u.web_permissions).length} página(s)
                          </button>
                        ) : u.role === "admin" ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Todas</span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle dark:border-white/5">
                        {u.role === "admin" ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Todas</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openObraModal(u)}
                            className="text-left text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300"
                          >
                            {formatObraLabel(u.obra_codigos ?? [])}
                          </button>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle dark:border-white/5">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
                            u.is_melosa
                              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                              : "bg-slate-200/80 text-slate-700 dark:bg-black/20 dark:text-slate-300",
                          ].join(" ")}
                        >
                          {u.is_melosa ? "Melosa" : "Padrão"}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle dark:border-white/5">
                        {u.cnh_storage_path ? (
                          <button
                            type="button"
                            onClick={() => openCnh(u.id)}
                            disabled={loadingCnhUserId === u.id}
                            className="text-sm font-semibold text-rose-700 hover:underline disabled:opacity-60 dark:text-rose-300"
                          >
                            {loadingCnhUserId === u.id ? "Abrindo..." : "Ver CNH"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Sem arquivo</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle dark:border-white/5">
                        {u.role === "admin" ? (
                          <div className="flex min-h-[32px] flex-wrap items-center gap-x-3 gap-y-1">
                            <button
                              type="button"
                              onClick={() => setRole(u.id, "user")}
                              className="text-sm font-semibold text-accent hover:underline"
                            >
                              Remover ADM
                            </button>
                            {u.active ? (
                              <button
                                type="button"
                                onClick={() => setActive(u.id, false)}
                                className="text-sm font-semibold text-amber-700 hover:underline dark:text-amber-300"
                              >
                                Desativar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActive(u.id, true)}
                                className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                              >
                                Ativar
                              </button>
                            )}
                            {u.is_melosa ? (
                              <button
                                type="button"
                                onClick={() => setMelosa(u.id, false)}
                                className="text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                              >
                                Tirar Melosa
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMelosa(u.id, true)}
                                className="text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                              >
                                Definir Melosa
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex min-h-[32px] flex-wrap items-center gap-x-3 gap-y-1">
                            <button
                              type="button"
                              onClick={() => setRole(u.id, "admin")}
                              className="text-sm font-semibold text-accent hover:underline"
                            >
                              Dar ADM
                            </button>
                            {u.access_platform !== "app" ? (
                              <button
                                type="button"
                                onClick={() => setAccessPlatform(u.id, "app")}
                                className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                              >
                                Definir App
                              </button>
                            ) : null}
                            {u.access_platform !== "web" ? (
                              <button
                                type="button"
                                onClick={() => setAccessPlatform(u.id, "web")}
                                className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"
                              >
                                Definir Web
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openPermModal(u)}
                                className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"
                              >
                                Páginas
                              </button>
                            )}
                            {u.active ? (
                              <button
                                type="button"
                                onClick={() => setActive(u.id, false)}
                                className="text-sm font-semibold text-amber-700 hover:underline dark:text-amber-300"
                              >
                                Desativar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActive(u.id, true)}
                                className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                              >
                                Ativar
                              </button>
                            )}
                            {u.is_melosa ? (
                              <button
                                type="button"
                                onClick={() => setMelosa(u.id, false)}
                                className="text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                              >
                                Tirar Melosa
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMelosa(u.id, true)}
                                className="text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                              >
                                Definir Melosa
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Nenhum utilizador.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-title"
        >
          <div className={`w-full max-w-md p-6 ${glassPanel}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="add-user-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Novo utilizador
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  A conta fica pronta para uso — sem confirmação de email.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={addSaving}
                className="rounded-lg p-1 text-slate-500 hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {addError ? (
              <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {addError}
              </div>
            ) : null}

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Email
                </span>
                <input
                  type="email"
                  className={glassField}
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  autoComplete="off"
                  disabled={addSaving}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Senha
                </span>
                <input
                  type="password"
                  className={glassField}
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={addSaving}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Nome completo (opcional)
                </span>
                <input
                  type="text"
                  className={glassField}
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  disabled={addSaving}
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Tipo de utilizador
                </legend>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="add-access-platform"
                    checked={addAccessPlatform === "web"}
                    onChange={() => setAddAccessPlatform("web")}
                    disabled={addSaving}
                    className="h-4 w-4 border-slate-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Utilizador Web (só painel)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="add-access-platform"
                    checked={addAccessPlatform === "app"}
                    onChange={() => setAddAccessPlatform("app")}
                    disabled={addSaving}
                    className="h-4 w-4 border-slate-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Utilizador App (só mobile)</span>
                </label>
              </fieldset>

              {addAccessPlatform === "web" ? (
                <fieldset className="space-y-2 rounded-lg border border-slate-200/80 p-3 dark:border-white/10">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Páginas do painel
                  </legend>
                  {WEB_PAGES.map((page) => (
                    <label key={page.key} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addWebPermissions.includes(page.key)}
                        disabled={addSaving || page.key === "dashboard"}
                        onChange={(e) => togglePermissionList(setAddWebPermissions, page.key, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {page.label}
                        {page.key === "dashboard" ? " (sempre)" : ""}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={addActive}
                  onChange={(e) => setAddActive(e.target.checked)}
                  disabled={addSaving}
                  className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Ativar imediatamente</span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeAddModal}
                disabled={addSaving}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-black/5 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateUser}
                disabled={addSaving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {addSaving ? "A criar…" : "Criar utilizador"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {permUser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="perm-user-title"
        >
          <div className={`w-full max-w-md p-6 ${glassPanel}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="perm-user-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Páginas do painel
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{permUser.email ?? permUser.id}</p>
              </div>
              <button
                type="button"
                onClick={closePermModal}
                disabled={permSaving}
                className="rounded-lg p-1 text-slate-500 hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {permError ? (
              <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {permError}
              </div>
            ) : null}

            <div className="space-y-2">
              {WEB_PAGES.map((page) => (
                <label key={page.key} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={permDraft.includes(page.key)}
                    disabled={permSaving || page.key === "dashboard"}
                    onChange={(e) => togglePermDraft(page.key, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {page.label}
                    {page.key === "dashboard" ? " (sempre)" : ""}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePermModal}
                disabled={permSaving}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-black/5 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveWebPermissions}
                disabled={permSaving}
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-700 disabled:opacity-50"
              >
                {permSaving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {obraUser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="obra-user-title"
        >
          <div className={`w-full max-w-md p-6 ${glassPanel}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="obra-user-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Obras permitidas
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{obraUser.email ?? obraUser.id}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Nenhuma selecionada = acesso a todas as obras. Com seleção, o utilizador só vê e regista dados dessas obras.
                </p>
              </div>
              <button
                type="button"
                onClick={closeObraModal}
                disabled={obraSaving}
                className="rounded-lg p-1 text-slate-500 hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {obraError ? (
              <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {obraError}
              </div>
            ) : null}

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {obras.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma obra cadastrada.</p>
              ) : (
                obras.map((obra) => (
                  <label key={obra.codigo} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={obraDraft.includes(obra.codigo)}
                      disabled={obraSaving}
                      onChange={(e) => toggleObraDraft(obra.codigo, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {obra.codigo} — {obra.nome}
                    </span>
                  </label>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeObraModal}
                disabled={obraSaving}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-black/5 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveUserObras}
                disabled={obraSaving}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:opacity-50"
              >
                {obraSaving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
