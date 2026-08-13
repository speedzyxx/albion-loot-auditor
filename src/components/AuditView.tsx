import { useMemo } from "react";
import { useAppStore } from "../store";
import { parseChestPaste } from "../lib/chestParser";
import { reconcile } from "../lib/audit";
import { displayItem, formatSilver, cn } from "../lib/format";

const STATUS = {
  complete: { label: "COMPLETO", className: "bg-emerald-500/15 text-emerald-300", icon: "🟢" },
  transferred: { label: "TRANSFERIDO", className: "bg-amber-500/15 text-amber-300", icon: "🟡" },
  pending: { label: "PENDIENTE / RAT", className: "bg-rose-500/15 text-rose-300", icon: "🔴" },
} as const;

export function AuditView() {
  const chestText = useAppStore((s) => s.chestText);
  const setChestText = useAppStore((s) => s.setChestText);
  const parseChest = useAppStore((s) => s.parseChest);
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
            Loot de pelea − trades a oficiales vs inventario real del cofre.
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
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <Meta label="Loteado" value={formatSilver(p.lootedSilver)} />
                  <Meta label="En cofre" value={formatSilver(p.depositedSilver)} />
                  <Meta label="Pendiente" value={formatSilver(p.pendingSilver)} />
                </div>
                {p.pending.length > 0 && (
                  <div className="mt-3 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-200">
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-rose-300/70">
                      Ítems que loteó y no están en el cofre
                    </div>
                    {p.pending.map((i) => (
                      <div key={i.key}>{displayItem(i.name, i.enchantment, i.quantity)}</div>
                    ))}
                  </div>
                )}
                {p.transferred.length > 0 && (
                  <div className="mt-2 text-xs text-amber-200/80">
                    Transferido: {p.transferred.map((i) => displayItem(i.name, i.enchantment, i.quantity)).join(", ")}
                  </div>
                )}
              </div>
            );
          })}
          {players.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-6 py-16 text-center text-slate-500">
              No hay loot para conciliar. Captura un ZvZ o carga la demo.
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-ink-800/70 p-4">
          <div className="text-sm font-semibold">Pegar cofre de Albion</div>
          <p className="mb-3 text-xs text-slate-500">
            Usa el botón oficial de copiar en la pestaña del cofre y pega el texto aquí.
          </p>
          <textarea
            value={chestText}
            onChange={(e) => setChestText(e.target.value)}
            rows={14}
            placeholder={"2\tAdept's Bag\n1\tElder's Bow@3"}
            className="w-full resize-none rounded-lg border border-white/10 bg-ink-900 p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-gold-500/40"
          />
          <button
            onClick={parseChest}
            className="mt-3 w-full rounded-lg bg-gold-500 py-2 text-sm font-semibold text-ink-950 hover:bg-gold-400"
          >
            Parsear e inventariar
          </button>
          {parsed && (
            <div className="mt-3 text-xs text-slate-400">
              {parsed.items.length} stacks · {parsed.logs.length} logs de depósito/retiro
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}
