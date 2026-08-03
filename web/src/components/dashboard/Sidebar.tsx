import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  ChevronDown,
  Droplets,
  FileText,
  Fuel,
  Gauge,
  HardHat,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings2,
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

type NavSection = {
  id: string;
  title: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "visao-geral",
    title: "Visão geral",
    icon: LayoutDashboard,
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    id: "cadastros",
    title: "Cadastros",
    icon: HardHat,
    items: [
      { to: "/contratos", label: "Contratos", icon: FileText },
      { to: "/melosas", label: "Melosas", icon: Fuel },
      { to: "/tanques", label: "Tanques", icon: Warehouse },
      { to: "/equipamentos", label: "Equipamentos", icon: HardHat },
    ],
  },
  {
    id: "analises",
    title: "Análises",
    icon: BarChart3,
    items: [
      { to: "/bi", label: "BI Tanque", icon: BarChart3, end: true },
      { to: "/bi/melosa", label: "BI abastecimentos", icon: Droplets },
      { to: "/consumo-medio", label: "Consumo médio", icon: Gauge },
    ],
  },
  {
    id: "administracao",
    title: "Administração",
    icon: Settings2,
    items: [{ to: "/usuarios", label: "Usuários", icon: Users, adminOnly: true }],
  },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

function userInitial(email: string | null | undefined): string {
  const ch = email?.trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function findSectionForPath(pathname: string, sections: NavSection[]): string | null {
  for (const section of sections) {
    if (section.items.some((item) => isItemActive(pathname, item))) {
      return section.id;
    }
  }
  return null;
}

function NavItemLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-[13px] font-medium transition-colors",
          isActive
            ? "border-l-2 border-accent bg-gradient-to-r from-accent/12 to-rose-50/80 font-semibold text-accent dark:border-transparent dark:bg-none dark:bg-accent/20 dark:text-red-300"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100",
        ].join(" ")
      }
    >
      <item.icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      {item.label}
    </NavLink>
  );
}

function NavSectionDropdown({
  section,
  isOpen,
  onToggle,
  onNavigate,
  hasActiveItem,
}: {
  section: NavSection;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  hasActiveItem: boolean;
}) {
  const panelId = `nav-section-${section.id}`;

  return (
    <div
      className={[
        "overflow-hidden rounded-xl border shadow-sm transition-shadow",
        isOpen
          ? "border-accent/20 bg-white shadow-md shadow-slate-200/70 ring-1 ring-accent/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none dark:ring-0"
          : "border-slate-200/90 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]",
      ].join(" ")}
    >
      <button
        type="button"
        id={`${panelId}-trigger`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className={[
          "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
          hasActiveItem
            ? isOpen
              ? "bg-gradient-to-r from-accent/10 via-rose-50/90 to-white dark:bg-none"
              : "bg-gradient-to-r from-accent/10 via-rose-50/90 to-white dark:bg-none dark:bg-accent/15"
            : "hover:bg-slate-50 dark:hover:bg-white/[0.05]",
        ].join(" ")}
      >
        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm",
            hasActiveItem
              ? "bg-accent text-white shadow-accent/25 dark:bg-none dark:bg-accent/25 dark:text-red-300 dark:shadow-none"
              : "bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-400 dark:shadow-none",
          ].join(" ")}
        >
          <section.icon className="h-4 w-4" aria-hidden />
        </span>
        <span
          className={[
            "min-w-0 flex-1 text-sm font-semibold",
            hasActiveItem ? "text-accent dark:text-red-300" : "text-slate-700 dark:text-slate-200",
          ].join(" ")}
        >
          {section.title}
        </span>
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={`${panelId}-trigger`}
        className={[
          "grid transition-[grid-template-rows] duration-200 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="space-y-0.5 border-t border-slate-100 bg-slate-50/50 px-1 py-2 dark:border-white/[0.06] dark:bg-transparent">
            {section.items.map((item) => (
              <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const { signOut, isAdmin, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  const sections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.adminOnly || isAdmin),
      })).filter((section) => section.items.length > 0),
    [isAdmin],
  );

  const activeSectionId = findSectionForPath(location.pathname, sections);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (activeSectionId) initial[activeSectionId] = true;
    return initial;
  });

  useEffect(() => {
    if (!activeSectionId) return;
    setOpenSections((prev) => ({ ...prev, [activeSectionId]: true }));
  }, [activeSectionId]);

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const email = user?.email ?? null;

  return (
    <aside
      className={[
        glassSidebar,
        "fixed inset-y-0 left-0 z-50 flex h-full w-[min(18rem,88vw)] flex-col overflow-hidden shadow-2xl transition-transform duration-200 ease-out",
        "lg:static lg:z-auto lg:w-60 lg:shrink-0 lg:translate-x-0 lg:shadow-none xl:w-64",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      <div className="relative shrink-0 border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 px-4 pb-4 pt-5 dark:border-white/10 dark:bg-none">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-rose-500/80 to-violet-500/70"
          aria-hidden
        />
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-rose-700 text-white shadow-md shadow-accent/25">
            <Fuel className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight text-slate-900 dark:text-white">
              Controle de abastecimento
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Painel web</p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200 lg:hidden"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-slate-50/40 px-3 py-4 dark:bg-transparent" aria-label="Principal">
        {sections.map((section) => (
          <NavSectionDropdown
            key={section.id}
            section={section}
            isOpen={Boolean(openSections[section.id])}
            onToggle={() => toggleSection(section.id)}
            onNavigate={onClose}
            hasActiveItem={activeSectionId === section.id}
          />
        ))}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-slate-200/80 bg-white px-3 py-4 dark:border-white/10 dark:bg-transparent">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-transparent dark:bg-white/[0.05] dark:shadow-none">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-rose-100 text-sm font-bold text-accent dark:bg-none dark:bg-accent/25 dark:text-red-300">
            {userInitial(email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
              {email ?? "Utilizador"}
            </p>
            <p className="text-[10px] text-slate-500">{isAdmin ? "Administrador" : "Utilizador"}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] font-medium text-slate-500">Aparência</span>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm dark:border-white/10 dark:bg-black/20 dark:shadow-none">
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-label="Tema claro"
              className={[
                "flex h-7 w-7 items-center justify-center rounded-md transition",
                theme === "light" ? "bg-accent text-white" : "text-slate-400 hover:text-slate-600",
              ].join(" ")}
            >
              <Sun className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-label="Tema escuro"
              className={[
                "flex h-7 w-7 items-center justify-center rounded-md transition",
                theme === "dark" ? "bg-accent text-white" : "text-slate-400 hover:text-slate-600",
              ].join(" ")}
            >
              <Moon className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-accent/40 hover:bg-accent/5 hover:text-accent dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:shadow-none dark:hover:text-red-300"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sair
        </button>

        <p className="text-center text-[10px] text-slate-400">v{APP_VERSION}</p>
      </div>
    </aside>
  );
}
