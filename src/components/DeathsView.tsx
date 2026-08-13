import { useMemo } from "react";
import { useAppStore } from "../store";
import { formatTime } from "../lib/format";

export function DeathsView() {
  const deathsAll = useAppStore((s) => s.deaths);
  const query = useAppStore((s) => s.query);
  const deaths = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deathsAll;
    return deathsAll.filter(
      (e) =>
        e.victim.toLowerCase().includes(q) ||
        (e.killer ?? "").toLowerCase().includes(q) ||
        (e.guild ?? "").toLowerCase().includes(q) ||
        (e.map ?? "").toLowerCase().includes(q),
    );
  }, [deathsAll, query]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Muertes</h1>
        <p className="text-sm text-slate-500">Quién murió y el inventario perdido en el wipe.</p>
      </div>
      <div className="space-y-2">
        {deaths.length === 0 && (
          <Empty text="Aún no hay muertes decodificadas en esta sesión." />
        )}
        {deaths.map((d) => (
          <div key={d.id} className="rounded-xl border border-white/10 bg-ink-800/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-display text-xl font-bold text-rose-300">{d.victim}</span>
                {d.killer && <span className="text-sm text-slate-400"> ← {d.killer}</span>}
              </div>
              <div className="font-mono text-xs text-slate-500">{formatTime(d.timestamp)}</div>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {d.guild ?? "—"} · {d.map ?? "sin mapa"}
            </div>
            {d.lostItems.length > 0 && (
              <ul className="mt-2 text-sm text-slate-300">
                {d.lostItems.map((i, idx) => (
                  <li key={idx}>
                    {i.quantity}× {i.itemName}
                    {i.enchantment ? `.${i.enchantment}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TradesView() {
  const tradesAll = useAppStore((s) => s.trades);
  const query = useAppStore((s) => s.query);
  const storage = useAppStore((s) => s.storage);
  const trades = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tradesAll;
    return tradesAll.filter(
      (e) =>
        e.fromPlayer.toLowerCase().includes(q) ||
        e.toPlayer.toLowerCase().includes(q) ||
        e.itemName.toLowerCase().includes(q),
    );
  }, [tradesAll, query]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Trades y almacenamiento</h1>
        <p className="text-sm text-slate-500">
          Transferencias jugador → jugador y movimientos de cofre/loot bag.
        </p>
      </div>
      <Table
        headers={["Hora", "De", "Para", "Ítem", "Qty", "Silver"]}
        rows={trades.map((t) => [
          formatTime(t.timestamp),
          t.fromPlayer,
          t.toPlayer,
          `${t.itemName}${t.enchantment ? `@${t.enchantment}` : ""}`,
          String(t.quantity),
          String(t.estimatedSilver),
        ])}
        empty="Sin trades en esta sesión. Los oficiales también pueden cargarse vía demo."
      />
      <div>
        <h2 className="mb-2 font-display text-xl font-bold">Chest / storage logs</h2>
        <Table
          headers={["Hora", "Jugador", "Acción", "Ítem", "Qty", "Contenedor"]}
          rows={storage.map((s) => [
            formatTime(s.timestamp),
            s.player,
            s.action,
            s.itemName,
            String(s.quantity),
            s.container ?? "—",
          ])}
          empty="Sin registros de almacenamiento todavía."
        />
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-6 py-16 text-center text-slate-500">
      {text}
    </div>
  );
}

function Table({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-800/70">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="px-4 py-12 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-white/5">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
