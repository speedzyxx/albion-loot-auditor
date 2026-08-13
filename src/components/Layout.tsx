import {
  Activity,
  Boxes,
  FileSpreadsheet,
  Flame,
  Radio,
  Search,
  Settings,
  Skull,
  Swords,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAppStore } from "../store";
import type { ViewId } from "../types";
import { NpcapBanner } from "./NpcapBanner";
import { MetricsBar } from "./MetricsBar";
import { cn } from "../lib/format";

const NAV: Array<{ id: ViewId; label: string; icon: typeof Radio }> = [
  { id: "live", label: "Captura live", icon: Radio },
  { id: "combat", label: "Combate", icon: Flame },
  { id: "audit", label: "Auditoría cofre", icon: Boxes },
  { id: "deaths", label: "Muertes", icon: Skull },
  { id: "trades", label: "Trades", icon: Swords },
  { id: "reports", label: "Reportes", icon: FileSpreadsheet },
  { id: "settings", label: "Ajustes", icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);
  const capture = useAppStore((s) => s.capture);
  const updateInfo = useAppStore((s) => s.updateInfo);
  const map = useAppStore((s) => s.map);
  const localPlayer = useAppStore((s) => s.localPlayer);

  return (
    <div className="flex h-full text-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/5 bg-ink-800/90">
        <div className="border-b border-white/5 px-5 py-5">
          <div className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-gold-500">
            Albion
          </div>
          <div className="font-display text-2xl font-bold leading-tight">Loot Auditor</div>
          <div className="mt-1 text-xs text-slate-500">& Analytics · ZvZ desk</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
                  active
                    ? "bg-gold-500/15 text-gold-400 shadow-glow"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                )}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/5 p-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className={cn("status-dot", capture?.live ? "live bg-emerald-400" : "bg-slate-600")} />
            {capture?.live ? "Photon live" : capture?.running ? "Escuchando UDP" : "Captura detenida"}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-600">
            {capture?.packets ?? 0} pkts · {capture?.decoded ?? 0} ev
            {typeof capture?.clusters === "number" && capture.clusters > 0 ? ` · ${capture.clusters} mapas` : ""}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-white/5 bg-ink-800/60 px-6 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar jugador (Hooz20), gremio (Eroth) o mapa…"
              className="w-full rounded-lg border border-white/10 bg-ink-900 py-2 pl-10 pr-3 text-sm outline-none ring-gold-500/40 placeholder:text-slate-600 focus:ring-2"
            />
          </div>
          <div className="hidden min-w-[260px] items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200 md:flex">
            <Activity size={14} className="text-cyan-400" />
            <span className="truncate font-medium">
              {localPlayer ? `${localPlayer} · ` : ""}
              {map ?? "Sin cluster — cruza un portal o relogea"}
            </span>
          </div>
        </header>
        {updateInfo && (
          <div className="bg-cyan-500/10 px-6 py-2 text-xs text-cyan-200">{updateInfo}</div>
        )}
        <NpcapBanner />
        <MetricsBar />
        <section className="grid-fade min-h-0 flex-1 overflow-auto p-6">{children}</section>
      </main>
    </div>
  );
}
