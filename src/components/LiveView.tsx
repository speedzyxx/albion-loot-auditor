import { invoke } from "@tauri-apps/api/core";
import { CircleStop, Play, Sparkles, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useAppStore } from "../store";
import { displayItem, formatSilver, formatTime } from "../lib/format";
import type { CaptureStatus } from "../types";
import { ItemIcon } from "./ItemIcon";

export function LiveView() {
  const lootAll = useAppStore((s) => s.loot);
  const map = useAppStore((s) => s.map);
  const query = useAppStore((s) => s.query);
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
  const capture = useAppStore((s) => s.capture);
  const setCapture = useAppStore((s) => s.setCapture);
  const loadDemo = useAppStore((s) => s.loadDemo);
  const resetSession = useAppStore((s) => s.resetSession);

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
            Mapa: <span className="text-cyan-300">{map ?? "esperando Join / ChangeCluster"}</span>
            {" · "}
            Solo loot de cadáveres. El banco no cuenta. Pega el cofre en Auditoría para ver qué falta.
            {!map && (
              <span className="block text-amber-400/90">
                Si ya estás en el mapa, cruza un portal o relogea con la captura encendida. Lymhurst Portal es 1301.
              </span>
            )}
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

      <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-800/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Hora</th>
              <th className="px-4 py-3">Looter</th>
              <th className="px-4 py-3">Cadáver</th>
              <th className="px-4 py-3">Ítem</th>
              <th className="px-4 py-3">Gremio</th>
              <th className="px-4 py-3">Mapa</th>
              <th className="px-4 py-3 text-right">Silver</th>
            </tr>
          </thead>
          <tbody>
            {loot.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  <div className="mx-auto max-w-lg space-y-2 text-sm">
                    <p>Photon está vivo, pero aún no hay loot de combate.</p>
                    <p>
                      Sal de la ciudad, mata / entra a un ZvZ y <strong className="text-slate-300">recoge ítems de un cadáver</strong>{" "}
                      (incluido trash). Mover cosas en el banco no genera eventos de loot.
                    </p>
                    <p className="text-xs">
                      Daño, curación y builds van al apartado <strong className="text-slate-300">Combate</strong>. O pulsa Demo ZvZ
                      para ver iconos y filas de ejemplo.
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {loot.map((e) => (
              <tr key={e.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{formatTime(e.timestamp)}</td>
                <td className="px-4 py-2 font-semibold text-gold-400">{e.lootedBy}</td>
                <td className="px-4 py-2 text-slate-300">{e.lootedFrom || "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <ItemIcon uniqueName={e.itemUniqueName} enchantment={e.enchantment} label={e.itemName} />
                    <div>
                      <div>
                        {e.isSilver
                          ? `${formatSilver(e.quantity)} silver`
                          : displayItem(e.itemName, e.enchantment, e.quantity)}
                      </div>
                      {e.itemUniqueName.includes("TRASH") && (
                        <div className="text-[11px] uppercase tracking-wide text-amber-400">Trash</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2 text-cyan-300/80">{e.guild ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{e.map ?? "—"}</td>
                <td className="px-4 py-2 text-right font-mono text-emerald-300">
                  {formatSilver(e.estimatedSilver)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
