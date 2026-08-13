import { useMemo } from "react";
import { useAppStore } from "../store";
import { parseChestPaste } from "../lib/chestParser";
import { reconcile } from "../lib/audit";
import { displayItem, formatSilver, cn } from "../lib/format";
import { ItemIcon } from "./ItemIcon";
import type { ItemDelta } from "../types";

const STATUS = {
  waiting: { label: "LOTEADO", className: "bg-cyan-500/15 text-cyan-300", icon: "📦" },
  complete: { label: "EN EL COFRE", className: "bg-emerald-500/15 text-emerald-300", icon: "🟢" },
  transferred: { label: "TRANSFERIDO", className: "bg-amber-500/15 text-amber-300", icon: "🟡" },
  pending: { label: "FALTA EN COFRE", className: "bg-rose-500/15 text-rose-300", icon: "🔴" },
} as const;

export function AuditView() {
  const chestText = useAppStore((s) => s.chestText);
  const setChestText = useAppStore((s) => s.setChestText);
  const parsedChest = useAppStore((s) => s.parsedChest);
  const loot = useAppStore((s) => s.loot);
  const trades = useAppStore((s) => s.trades);
  const officers = useAppStore((s) => s.settings.officers);
  const query = useAppStore((s) => s.query);

  const parsed = useMemo(
    () => parsedChest ?? (chestText ? parseChestPaste(chestText) : null),
    [parsedChest, chestText],
  );
  const audit = useMemo(
    () =>
      reconcile({
        loot,
        trades,
        chest: parsed?.items ?? [],
        officers,
      }),
    [loot, trades, parsed, officers],
  );

  const players = audit.players.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.player.toLowerCase().includes(q) || (p.guild ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Conciliación de cofre</h1>
          <p className="text-sm text-slate-500">
            Primero ves solo lo loteado. Cuando pegas el cofre, cada ítem pasa a{" "}
            <span className="text-emerald-300">está en el cofre</span> o{" "}
            <span className="text-rose-300">no está</span>.
          </p>
        </div>
        <div className="space-y-2">
          {players.map((p) => {
            const st = STATUS[p.status];
            return (
              <div key={p.player} className="rounded-xl border border-white/10 bg-ink-800/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-xl font-bold">{p.player}</div>
                    <div className="text-xs text-slate-500">{p.guild ?? "sin gremio"}</div>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", st.className)}>
                    {st.icon} {st.label}
                  </span>
                </div>
                {!audit.chestReady && (
                  <ItemList
                    title="Loot de cadáver"
                    items={p.looted}
                    empty="Sin ítems de combate"
                    tone="neutral"
                  />
                )}
                {audit.chestReady && (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <Meta label="Loteado" value={formatSilver(p.lootedSilver)} />
                      <Meta label="En cofre" value={formatSilver(p.depositedSilver)} />
                      <Meta label="Falta" value={formatSilver(p.pendingSilver)} />
                    </div>
                    <ItemList title="Está en el cofre" items={p.deposited} empty="Nada depositado" tone="ok" />
                    <ItemList title="No está en el cofre" items={p.pending} empty="Nada pendiente" tone="bad" />
                  </>
                )}
                {p.transferred.length > 0 && (
                  <ItemList title="Transferido a oficial" items={p.transferred} empty="" tone="warn" />
                )}
              </div>
            );
          })}
          {players.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-6 py-16 text-center text-slate-500">
              Todavía no hay loot de cadáver. Recoge ítems en el mundo; el banco no cuenta.
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-ink-800/70 p-4">
          <div className="text-sm font-semibold">Pegar cofre de Albion</div>
          <p className="mb-3 text-xs text-slate-500">
            Copia el inventario del cofre en el juego y pégalo aquí. Se compara al instante con lo loteado.
          </p>
          <textarea
            value={chestText}
            onChange={(e) => setChestText(e.target.value)}
            rows={14}
            placeholder={"2\tAdept's Bag\n1\tElder's Bow@3"}
            className="w-full resize-none rounded-lg border border-white/10 bg-ink-900 p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-gold-500/40"
          />
          {parsed && (
            <div className="mt-3 text-xs text-slate-400">
              {parsed.items.length} stacks en el cofre
              {audit.unmatchedChest.length > 0 && (
                <div className="mt-1 text-slate-500">
                  {audit.unmatchedChest.length} stacks del cofre no coinciden con loot de esta pelea
                </div>
              )}
              {parsed.warnings.length > 0 && (
                <div className="mt-2 text-amber-300">
                  {parsed.warnings.slice(0, 4).map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ItemList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: ItemDelta[];
  empty: string;
  tone: "ok" | "bad" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-100"
      : tone === "bad"
        ? "bg-rose-500/10 text-rose-100"
        : tone === "warn"
          ? "bg-amber-500/10 text-amber-100"
          : "bg-white/5 text-slate-200";
  return (
    <div className={cn("mt-3 rounded-lg p-3 text-sm", toneClass)}>
      <div className="mb-2 text-[11px] uppercase tracking-wider opacity-70">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs opacity-60">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((i) => (
            <div key={i.key} className="flex items-center gap-2">
              <ItemIcon uniqueName={i.uniqueName} enchantment={i.enchantment} size={28} label={i.name} />
              <span>{displayItem(i.name, i.enchantment, i.quantity)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}
