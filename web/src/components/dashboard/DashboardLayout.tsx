import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "../ErrorBoundary";
import Sidebar from "./Sidebar";

export default function DashboardLayout() {
  const location = useLocation();

  return (
    <div className="relative flex min-h-screen overflow-x-hidden font-sans text-slate-900 dark:text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 -z-20 bg-gradient-to-br from-sky-100/95 via-violet-100/80 to-rose-100/70 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_90%_60%_at_10%_-10%,rgba(159,47,56,0.22),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(59,130,246,0.18),transparent_50%),radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(139,92,246,0.14),transparent_45%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_20%_10%,rgba(159,47,56,0.35),transparent_55%),radial-gradient(ellipse_60%_45%_at_90%_80%,rgba(30,64,175,0.4),transparent_50%)]"
        aria-hidden
      />
      <Sidebar />
      <main className="relative min-h-screen flex-1 overflow-x-auto p-6 lg:p-8">
        <div className="mx-auto max-w-[1680px]">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
