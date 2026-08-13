import { Flame, Heart, RotateCcw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useAppStore } from "../store";
import { formatTime } from "../lib/format";
import { ItemIcon } from "./ItemIcon";
import type { BuildInfo, CombatHit } from "../types";

export function CombatView() {
  const damage = useAppStore((s) => s.damage);
  const heals = useAppStore((s) => s.heals);
  const builds = useAppStore((s) => s.builds);
  const query = useAppStore((s) => s.query);
  const map = useAppStore((s) => s.map);
  const localPlayer = useAppStore((s) => s.localPlayer);
  const loadDemo = useAppStore((s) => s.loadDemo);
  const resetCombat = useAppStore((s) => s.resetCombat);

  const q = query.trim().toLowerCase();
  const dmgRows = useMemo(() => meter(damage, "source", q), [damage, q]);
  const healRows = useMemo(() => meter(heals, "source", q), [heals, q]);
  const buildList = useMemo(() => {
    const list = Object.values(builds);
    if (!q) return list;
    return list.filter(
      (b) => b.player.toLowerCase().includes(q) || (b.guild ?? "").toLowerCase().includes(q),
    );
  }, [builds, q]);
  const recent = useMemo(() => {
    const rows: Array<CombatHit & { kind: "dmg" | "heal" }> = [
      ...damage.map((h) => ({ ...h, kind: "dmg" as const })),
      ...heals.map((h) => ({ ...h, kind: "heal" as const })),
    ];
    rows.sort((a, b) => b.timestamp - a.timestamp);
    return rows.slice(0, 40);
  }, [damage, heals]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Combate</h1>
          <p className="text-sm text-slate-500">
            Daño, curación y builds. Personaje:{" "}
            <span className="text-gold-400">{localPlayer ?? "esperando Join de tu cuenta"}</span>
            {" · "}
            Mapa:{" "}
            <span className="text-cyan-300">{map ?? "cambia de mapa (portal) para fijar el cluster"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadDemo}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
          >
            <Sparkles size={14} /> Demo ZvZ
          </button>
          <button
            onClick={resetCombat}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
          >
            <RotateCcw size={14} /> Reset daño / builds
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Meter title="Daño infligido" rows={dmgRows} color="bg-rose-500" empty="Entra a pelea (no ciudad). El medidor se llena con hits." />
        <Meter title="Curación" rows={healRows} color="bg-emerald-400" empty="Las curas de players visibles aparecen aquí." />
      </div>

      <div>
        <h2 className="mb-3 font-display text-xl font-bold">Builds</h2>
        {buildList.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center text-slate-500">
            Aún no hay equipos. Acércate a jugadores en el mundo; al verlos el decoder lee el gear.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {buildList.map((b) => (
            <BuildCard key={b.player} build={b} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-xl font-bold">Últimos hits</h2>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-800/70">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Hora</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Objetivo</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Sin hits todavía. Sal de la ciudad y entra en combate.
                  </td>
                </tr>
              )}
              {recent.map((h) => (
                <tr key={h.id} className="border-t border-white/5">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{formatTime(h.timestamp)}</td>
                  <td className="px-4 py-2">
                    {h.kind === "heal" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <Heart size={12} /> Cura
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-400">
                        <Flame size={12} /> Daño
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gold-400">{h.source}</td>
                  <td className="px-4 py-2 text-slate-300">{h.target}</td>
                  <td className="px-4 py-2 text-right font-mono">{h.amount.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function meter(hits: CombatHit[], key: "source" | "target", q: string) {
  const totals = new Map<string, number>();
  for (const h of hits) {
    const name = h[key];
    if (name === "desconocido" || name.startsWith("id:")) continue;
    if (q && !name.toLowerCase().includes(q)) continue;
    totals.set(name, (totals.get(name) ?? 0) + h.amount);
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1;
  return rows.slice(0, 24).map(([name, amount]) => ({
    name,
    amount,
    pct: Math.round((amount / max) * 100),
  }));
}

function Meter({
  title,
  rows,
  color,
  empty,
}: {
  title: string;
  rows: Array<{ name: string; amount: number; pct: number }>;
  color: string;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/70 p-4">
      <div className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <Flame size={16} className="text-gold-400" />
        {title}
      </div>
      {rows.length === 0 && <p className="text-sm text-slate-500">{empty}</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.name}>
            <div className="mb-0.5 flex justify-between text-xs">
              <span className="text-slate-200">
                {i + 1}. {r.name}
              </span>
              <span className="font-mono text-gold-400">{r.amount.toLocaleString("en-US")}</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-ink-900">
              <div className={`h-full ${color}`} style={{ width: `${r.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BuildCard({ build }: { build: BuildInfo }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/70 p-4">
      <div className="font-display text-lg font-bold">{build.player}</div>
      <div className="mb-2 text-xs text-slate-500">
        {build.guild ?? "sin gremio"} · {formatTime(build.timestamp)}
      </div>
      <div className="flex flex-wrap gap-1">
        {build.items.map((it, i) => (
          <div key={`${it.itemUniqueName}-${i}`} title={it.itemName}>
            <ItemIcon uniqueName={it.itemUniqueName} enchantment={it.enchantment} size={36} label={it.itemName} />
          </div>
        ))}
      </div>
    </div>
  );
}
