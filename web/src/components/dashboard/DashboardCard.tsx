import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { glassPanel } from "../../lib/glass";

type Props = {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export default function DashboardCard({ to, title, description, icon: Icon }: Props) {
  return (
    <Link
      to={to}
      className={`group flex flex-col gap-4 p-6 transition hover:border-accent/35 hover:shadow-lg ${glassPanel}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent transition group-hover:bg-accent/25">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
      </div>
    </Link>
  );
}
