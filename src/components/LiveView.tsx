import { invoke } from "@tauri-apps/api/core";
import { CircleStop, MapPin, Play, Sparkles, Trash2, Users } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useAppStore } from "../store";
import { displayItem, formatSilver, formatTime } from "../lib/format";
import { groupLootByMapAndGuild, lootSummary } from "../lib/lootGroups";
import type { CaptureStatus, LootEvent } from "../types";
import { ItemIcon } from "./ItemIcon";

export function LiveView() {
  const lootAll = useAppStore((s) => s.loot);
  const map = useAppStore((s) => s.map);
  const query = useAppStore((s) => s.query);
  const players = useAppStore((s) => s.players);
  const preferGuild = useAppStore((s) => s.settings.guildFilter);
  const capture = useAppStore((s) => s.capture);
  const setCapture = useAppStore((s) => s.setCapture);
  const loadDemo = useAppStore((s) => s.loadDemo);
  const resetSession = useAppStore((s) => s.resetSession);

  const loot = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lootAll;
    return lootAll.filter(
      (e) =>
        e.lootedBy.toLowerCase().includes(q) ||
        e.lootedFrom.toLowerCase().includes(q) ||
        e.itemName.toLowerCase().includes(q) ||
        (e.guild ?? "").toLowerCase().includes(q) ||
        (e.map ?? "").toLowerCase().includes(q),
    );
  }, [lootAll, query]);

  const grouped = useMemo(
    () => groupLootByMapAndGuild(loot, players, preferGuild),
    [loot, players, preferGuild],
  );
  const summary = useMemo(() => lootSummary(loot, players), [loot, players]);

  async function toggle() {
    if (capture?.running) {
      setCapture(await invoke<CaptureStatus>("stop_capture"));
    } else {
      setCapture(await invoke<CaptureStatus>("start_capture"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Combat loot</h1>
          <p className="text-sm text-slate-500">
            Ahora: <span className="text-cyan-300">{map ?? "esperando Join / ChangeCluster"}</span>
            {" · "}
            Agrupado por mapa y gremio. El banco no cuenta.
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
            onClick={resetSession}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
          >
            <Trash2 size={14} /> Limpiar
          </button>
          <button
            onClick={toggle}
            className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold text-ink-950 hover:bg-gold-400"
          >
            {capture?.running ? <CircleStop size={14} /> : <Play size={14} />}
            {capture?.running ? "Detener captura" : "Iniciar captura"}
          </button>
        </div>
      </div>

      {loot.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip>
            {summary.events} picks · {summary.looters} looters
          </Chip>
          <Chip>
            {summary.maps} mapa{summary.maps === 1 ? "" : "s"}
          </Chip>
          <Chip>
            {summary.guilds} gremio{summary.guilds === 1 ? "" : "s"}
          </Chip>
          <Chip>{summary.silverLabel} silver</Chip>
        </div>
      )}

      {loot.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 px-6 py-16 text-center text-slate-500">
          <div className="mx-auto max-w-lg space-y-2 text-sm">
            <p>Photon está vivo, pero aún no hay loot de combate.</p>
            <p>
              Sal de la ciudad, mata / entra a un ZvZ y <strong className="text-slate-300">recoge ítems de un cadáver</strong>{" "}
              (incluido trash).
            </p>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {grouped.map((zone) => (
          <section key={zone.map} className="overflow-hidden rounded-xl border border-white/10 bg-ink-800/70">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-cyan-400/10 px-4 py-3">
              <div className="flex items-center gap-2 text-cyan-200">
                <MapPin size={16} className="text-cyan-400" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-cyan-300/70">Loteado en</div>
                  <div className="font-display text-lg font-bold text-cyan-100">{zone.map}</div>
                </div>
              </div>
              <div className="text-xs text-cyan-200/80">
                {zone.events} picks · {zone.looters} looters · {zone.guilds.length} gremio
                {zone.guilds.length === 1 ? "" : "s"} · {formatSilver(zone.silver)}
              </div>
            </header>
            <div className="space-y-4 p-4">
              {zone.guilds.map((g) => (
                <div key={g.guild}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gold-400">
                      <Users size={14} />
                      {g.guild}
                    </div>
                    <div className="text-xs text-slate-500">
                      {g.members.length} miembro{g.members.length === 1 ? "" : "s"} · {g.events} picks ·{" "}
                      {formatSilver(g.silver)}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {g.members.map((m) => (
                      <div key={m.player} className="rounded-lg border border-white/5 bg-ink-900/50 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="font-display text-base font-bold text-gold-400">{m.player}</div>
                          <div className="text-xs text-slate-500">
                            {m.events.length} ítem{m.events.length === 1 ? "" : "s"} · {formatSilver(m.silver)}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {m.events.map((e) => (
                            <LootLine key={e.id} event={e} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function LootLine({ event: e }: { event: LootEvent }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <ItemIcon uniqueName={e.itemUniqueName} enchantment={e.enchantment} size={32} label={e.itemName} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-slate-100">
          {e.isSilver ? `${formatSilver(e.quantity)} silver` : displayItem(e.itemName, e.enchantment, e.quantity)}
          {e.itemUniqueName.includes("TRASH") && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-400">Trash</span>
          )}
        </div>
        <div className="text-[11px] text-slate-500">
          de {e.lootedFrom || "cadáver"} · {formatTime(e.timestamp)}
        </div>
      </div>
      <div className="shrink-0 font-mono text-xs text-emerald-300">{formatSilver(e.estimatedSilver)}</div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-ink-800 px-3 py-1 text-slate-300">{children}</span>
  );
}
