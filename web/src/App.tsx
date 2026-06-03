import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import type React from "react";
import { AuthProvider, useAuth } from "./state/AuthContext";
import { ThemeProvider } from "./state/ThemeContext";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import MelosaBIPage from "./pages/MelosaBIPage";
import TanqueBIPage from "./pages/TanqueBIPage";
import UsersPage from "./pages/UsersPage";
import ContratosPage from "./pages/ContratosPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef1f6] text-slate-600 dark:bg-[#0f1117] dark:text-slate-400">
        A carregar…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef1f6] text-slate-600 dark:bg-[#0f1117] dark:text-slate-400">
        A carregar…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/40 dark:bg-amber-950/25">
        <h1 className="text-lg font-bold text-amber-900 dark:text-amber-200">Acesso negado</h1>
        <p className="mt-2 text-sm text-amber-800/90 dark:text-amber-200/80">
          Esta área é reservada a administradores.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block text-sm font-semibold text-accent hover:underline"
        >
          Voltar ao início
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="contratos" element={<ContratosPage />} />
        <Route path="bi" element={<TanqueBIPage />} />
        <Route path="bi/melosa" element={<MelosaBIPage />} />
        <Route
          path="usuarios"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
        <Route path="users" element={<Navigate to="/usuarios" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
