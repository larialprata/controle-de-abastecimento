import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "../ErrorBoundary";
import Sidebar from "./Sidebar";

export default function DashboardLayout() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative flex h-screen overflow-hidden font-sans text-slate-900 dark:text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 -z-20 bg-gradient-to-br from-sky-100/95 via-violet-100/80 to-rose-100/70 dark:from-[#0a1113] dark:via-[#0d181a] dark:to-[#0b1416]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_90%_60%_at_10%_-10%,rgba(159,47,56,0.22),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(59,130,246,0.18),transparent_50%),radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(139,92,246,0.14),transparent_45%)] dark:bg-[radial-gradient(ellipse_85%_55%_at_15%_0%,rgba(61,184,168,0.16),transparent_55%),radial-gradient(ellipse_65%_50%_at_90%_85%,rgba(45,120,130,0.18),transparent_50%),radial-gradient(ellipse_50%_40%_at_40%_100%,rgba(20,40,48,0.55),transparent_45%)]"
        aria-hidden
      />

      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={`flex shrink-0 items-center gap-3 border-b border-white/40 px-3 py-2.5 backdrop-blur-md dark:border-white/10 lg:hidden ${navOpen ? "z-30" : "z-20"}`}
        >
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white/60 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <p className="min-w-0 truncate text-sm font-bold text-slate-900 dark:text-white">
            Controle de abastecimento
          </p>
        </header>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-5 xl:p-6">
          <div className="mx-auto w-full min-w-0 max-w-full xl:max-w-[1600px]">
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
