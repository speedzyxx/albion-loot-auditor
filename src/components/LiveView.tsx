import { invoke } from "@tauri-apps/api/core";
import { CircleStop, Play, Sparkles, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useAppStore } from "../store";
import { displayItem, formatSilver, formatTime } from "../lib/format";
import type { CaptureStatus } from "../types";

export function LiveView() {
  const lootAll = useAppStore((s) => s.loot);
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
            Quién loteó, de qué cadáver, cantidad, encantamiento y valor estimado.
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
                <td colSpan={7} className="px-4 py-16 text-center text-slate-500">
                  Esperando paquetes Photon. Entra a un ZvZ o carga la sesión demo.
                </td>
              </tr>
            )}
            {loot.map((e) => (
              <tr key={e.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{formatTime(e.timestamp)}</td>
                <td className="px-4 py-2 font-semibold text-gold-400">{e.lootedBy}</td>
                <td className="px-4 py-2 text-slate-300">{e.lootedFrom || "—"}</td>
                <td className="px-4 py-2">
                  {e.isSilver ? `${formatSilver(e.quantity)} silver` : displayItem(e.itemName, e.enchantment, e.quantity)}
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
