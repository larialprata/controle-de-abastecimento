import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../state/AuthContext";
import { glassPanel } from "../lib/glass";

export default function LoginPage() {
  const { signIn, loading, session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@exemplo.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [session, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signIn(email, password);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha no login");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-sky-100/95 via-violet-100/80 to-rose-100/70 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_90%_60%_at_10%_-10%,rgba(159,47,56,0.2),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(59,130,246,0.16),transparent_50%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_20%_10%,rgba(159,47,56,0.32),transparent_55%)]"
        aria-hidden
      />
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>
      <div className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className={`w-full max-w-md p-8 ${glassPanel}`}>
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
              <FileText className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Controle de abastecimento</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Entre para aceder ao painel web</p>
          </div>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Email
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0d1117] dark:text-slate-100"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Senha
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0d1117] dark:text-slate-100"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </label>
            {error ? (
              <div className="rounded-lg border border-red-300/80 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-lg bg-accent py-3 text-sm font-bold text-white shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? "A entrar…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
