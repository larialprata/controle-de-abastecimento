import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../state/AuthContext";
import { glassPanel } from "../lib/glass";

function MicrosoftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 23 23" aria-hidden>
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

export default function LoginPage() {
  const { signIn, signInWithOutlook, loading, session, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [fieldsEditable, setFieldsEditable] = useState(false);

  useEffect(() => {
    if (session && !loading) navigate("/", { replace: true });
  }, [session, loading, navigate]);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const oauthErr = params.get("error_description") ?? params.get("error");
    if (oauthErr) {
      setError(decodeURIComponent(oauthErr.replace(/\+/g, " ")));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    clearAuthError();
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setSubmitting(false);
    }
  }

  async function onOutlookLogin() {
    setError(null);
    clearAuthError();
    setOauthBusy(true);
    try {
      await signInWithOutlook();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao abrir login Microsoft");
      setOauthBusy(false);
    }
  }

  const busy = submitting || oauthBusy;
  const oauthProcessing = loading && oauthBusy;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-sky-100/95 via-violet-100/80 to-rose-100/70 dark:from-[#0a1113] dark:via-[#0d181a] dark:to-[#0b1416]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_90%_60%_at_10%_-10%,rgba(159,47,56,0.2),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(59,130,246,0.16),transparent_50%)] dark:bg-[radial-gradient(ellipse_85%_55%_at_15%_0%,rgba(61,184,168,0.14),transparent_55%),radial-gradient(ellipse_60%_45%_at_90%_80%,rgba(45,120,130,0.16),transparent_50%)]"
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
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Entre com <strong className="font-semibold text-slate-700 dark:text-slate-300">email e senha</strong> ou com{" "}
              <strong className="font-semibold text-slate-700 dark:text-slate-300">Outlook / Microsoft</strong>
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <form className="mb-6 grid gap-4" onSubmit={onSubmit} autoComplete="off">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Email
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0d1117] dark:text-slate-100"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                name="web-login-email"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="seu@email.com"
                readOnly={!fieldsEditable}
                onFocus={() => setFieldsEditable(true)}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Senha
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0d1117] dark:text-slate-100"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                name="web-login-password"
                autoComplete="new-password"
                placeholder="Digite a sua senha"
                readOnly={!fieldsEditable}
                onFocus={() => setFieldsEditable(true)}
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy || loading}
              className="mt-2 rounded-lg bg-accent py-3 text-sm font-bold text-white shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "A entrar…" : "Entrar com email e senha"}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-slate-200 dark:border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs font-semibold uppercase tracking-wide">
              <span className="bg-white/80 px-2 text-slate-500 dark:bg-transparent dark:text-slate-400">ou</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOutlookLogin}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#0d1117] dark:text-slate-100 dark:hover:bg-white/5"
          >
            <MicrosoftIcon />
            {oauthBusy ? (oauthProcessing ? "A validar login…" : "A redirecionar…") : "Entrar com Outlook"}
          </button>
        </div>
      </div>
    </div>
  );
}
