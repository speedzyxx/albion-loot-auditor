import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Send, Sheet } from "lucide-react";
import { useMemo, useState } from "react";
import { reconcile } from "../lib/audit";
import { buildDiscordReport, lootToCsv } from "../lib/discord";
import { useAppStore } from "../store";

export function ReportsView() {
  const loot = useAppStore((s) => s.loot);
  const deaths = useAppStore((s) => s.deaths);
  const trades = useAppStore((s) => s.trades);
  const parsedChest = useAppStore((s) => s.parsedChest);
  const officers = useAppStore((s) => s.settings.officers);
  const webhookUrl = useAppStore((s) => s.settings.webhookUrl);
  const map = useAppStore((s) => s.map);
  const [status, setStatus] = useState<string | null>(null);

  const audit = useMemo(
    () =>
      reconcile({
        loot,
        trades,
        chest: parsedChest?.items ?? [],
        officers,
      }),
    [loot, trades, parsedChest, officers],
  );

  const markdown = useMemo(
    () =>
      buildDiscordReport({
        title: "Balance ZvZ — Albion Loot Auditor",
        map,
        audit,
        loot,
        deaths,
        trades,
      }),
    [audit, deaths, loot, map, trades],
  );

  async function copyMd() {
    await writeText(markdown);
    setStatus("Reporte Markdown copiado. Pégalo en Discord.");
  }

  async function sendWebhook() {
    if (!webhookUrl) {
      setStatus("Configura el webhook en Ajustes.");
      return;
    }
    await invoke("send_discord_webhook", {
      payload: { webhookUrl, content: markdown },
    });
    setStatus("Balance enviado al canal de Discord.");
  }

  async function exportCsv() {
    const csv = lootToCsv(loot, deaths, trades);
    const path = await invoke<string>("save_text_file", {
      defaultName: `zvz-session-${new Date().toISOString().slice(0, 10)}.csv`,
      contents: csv,
    });
    setStatus(`CSV guardado en ${path}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="font-display text-3xl font-bold">Exportación</h1>
        <p className="mb-4 text-sm text-slate-500">
          Copia el reporte, envíalo por webhook o exporta la sesión a CSV/Excel.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyMd}
            className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-3 py-2 text-sm font-semibold text-ink-950"
          >
            <Copy size={15} /> Copiar Markdown
          </button>
          <button
            onClick={sendWebhook}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
          >
            <Send size={15} /> Enviar a Discord
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
          >
            <Sheet size={15} /> Exportar CSV
          </button>
        </div>
        {status && <div className="mt-3 text-sm text-cyan-300">{status}</div>}
      </div>
      <pre className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-ink-800/80 p-4 font-mono text-xs leading-relaxed text-slate-300">
        {markdown}
      </pre>
    </div>
  );
}
