import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Droplets,
  FileText,
  Fuel,
  Gauge,
  HardHat,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { useAuth } from "../../state/AuthContext";
import { useTheme } from "../../state/ThemeContext";
import { glassSidebar } from "../../lib/glass";

export const APP_VERSION = "1.0.0";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/contratos", label: "Contratos", icon: FileText },
  { to: "/melosas", label: "Melosas", icon: Fuel },
  { to: "/tanques", label: "Tanques", icon: Warehouse },
  { to: "/equipamentos", label: "Equipamentos", icon: HardHat },
  { to: "/usuarios", label: "Usuários", icon: Users, adminOnly: true },
  { to: "/bi", label: "BI Tanque", icon: BarChart3, end: true },
  { to: "/bi/melosa", label: "BI abastecimentos", icon: Droplets },
  { to: "/consumo-medio", label: "Consumo médio", icon: Gauge },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const { signOut, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();

  const items = NAV.filter((item) => !item.adminOnly || isAdmin);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
      isActive
        ? "bg-accent text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-white/10",
    ].join(" ");

  return (
    <aside
      className={[
        glassSidebar,
        "fixed inset-y-0 left-0 z-50 flex h-full w-[min(17rem,88vw)] flex-col overflow-hidden shadow-xl transition-transform duration-200 ease-out",
        "lg:static lg:z-auto lg:w-52 lg:shrink-0 lg:translate-x-0 lg:shadow-none xl:w-56 2xl:w-64",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      <div className="flex items-start gap-2 border-b border-white/40 px-4 py-4 dark:border-white/10">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <FileText className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-slate-900 dark:text-white">
            Controle de abastecimento
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">Painel web</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/40 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="px-3 pt-4">
        <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Tema
        </p>
        <div className="flex rounded-lg border border-white/50 bg-white/35 p-0.5 backdrop-blur-md dark:border-white/10 dark:bg-black/30">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition",
              theme === "light"
                ? "bg-accent text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400",
            ].join(" ")}
          >
            <Sun className="h-3.5 w-3.5" aria-hidden />
            Claro
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition",
              theme === "dark"
                ? "bg-accent text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400",
            ].join(" ")}
          >
            <Moon className="h-3.5 w-3.5" aria-hidden />
            Escuro
          </button>
        </div>
      </div>

      <nav
        className="mt-5 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4"
        aria-label="Principal"
        onClick={onClose}
      >
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            <item.icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/40 px-3 py-4 dark:border-white/10">
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-accent transition hover:bg-white/40 dark:text-accent dark:hover:bg-white/10"
        >
          <LogOut className="h-5 w-5" aria-hidden />
          Sair
        </button>
        <p className="mt-3 text-center text-[10px] text-slate-400 dark:text-slate-600">v{APP_VERSION}</p>
      </div>
    </aside>
  );
}
