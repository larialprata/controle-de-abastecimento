import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { useAuth } from "../state/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { glassPanel } from "../lib/glass";

type AdminUserRow = {
  id: string;
  email: string | null;
  role: "admin" | "user";
  active: boolean;
  is_melosa: boolean;
  cnh_storage_path: string | null;
  created_at: string | null;
};

export default function UsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCnhUserId, setLoadingCnhUserId] = useState<string | null>(null);

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

  useEffect(() => {
    load();
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
          Gerencie acesso e permissões dos utilizadores do painel.
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

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
                            u.role === "admin"
                              ? "bg-accent/15 text-accent"
                              : "bg-slate-200/80 text-slate-700 dark:bg-black/20 dark:text-slate-300",
                          ].join(" ")}
                        >
                          <Shield className="h-3.5 w-3.5" aria-hidden />
                          {u.role === "admin" ? "Admin" : "Utilizador"}
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
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Nenhum utilizador.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
