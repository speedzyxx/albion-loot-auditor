import { useMemo } from "react";
import { useAppStore } from "../store";
import { reconcile } from "../lib/audit";
import { formatSilver } from "../lib/format";

export function MetricsBar() {
  const loot = useAppStore((s) => s.loot);
  const trades = useAppStore((s) => s.trades);
  const chest = useAppStore((s) => s.parsedChest);
  const officers = useAppStore((s) => s.settings.officers);

  const audit = useMemo(
    () =>
      reconcile({
        loot,
        trades,
        chest: chest?.items ?? [],
        officers,
      }),
    [loot, trades, chest, officers],
  );

  const lootSilver = loot.reduce((s, e) => s + e.estimatedSilver, 0);
  const cards = [
    { label: "Silver loteado", value: formatSilver(lootSilver), sub: `${loot.length} eventos` },
    {
      label: "Silver en cofre",
      value: audit.chestReady ? formatSilver(audit.chestSilver) : "—",
      sub: audit.chestReady ? "inventario pegado" : "pega el cofre",
    },
    {
      label: "Cumplimiento gremio",
      value: audit.chestReady ? `${audit.compliance}%` : "—",
      sub: audit.chestReady
        ? `${audit.players.filter((p) => p.status === "pending").length} pendientes`
        : "esperando cofre",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-px border-b border-white/5 bg-white/5">
      {cards.map((card) => (
        <div key={card.label} className="bg-ink-800/80 px-6 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{card.label}</div>
          <div className="font-display text-3xl font-bold text-gold-400">{card.value}</div>
          <div className="text-xs text-slate-500">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}
