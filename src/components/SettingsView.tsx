import { invoke } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { useAppStore } from "../store";
import type { CaptureStatus } from "../types";

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const capture = useAppStore((s) => s.capture);
  const npcap = useAppStore((s) => s.npcap);
  const setCapture = useAppStore((s) => s.setCapture);

  async function refreshPrices() {
    const names = [
      ...new Set(
        useAppStore
          .getState()
          .loot.filter((l) => !l.isSilver)
          .map((l) => l.itemUniqueName),
      ),
    ];
    if (names.length === 0) return;
    const quotes = await invoke<Array<{ uniqueName: string; sellPrice: number }>>("fetch_item_prices", {
      uniqueNames: names,
    });
    const map = new Map(quotes.map((q) => [q.uniqueName, q.sellPrice]));
    const loot = useAppStore.getState().loot.map((item) => ({
      ...item,
      estimatedSilver: item.isSilver
        ? item.quantity
        : (map.get(item.itemUniqueName) ?? item.estimatedSilver) * item.quantity,
    }));
    useAppStore.setState({ loot });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Ajustes</h1>
        <p className="text-sm text-slate-500">Webhook, oficiales y captura automática.</p>
      </div>

      <Field label="Webhook de Discord">
        <input
          value={settings.webhookUrl}
          onChange={(e) => setSettings({ webhookUrl: e.target.value })}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 font-mono text-sm"
        />
      </Field>

      <Field label="Oficiales (reciben trades, separados por coma)">
        <input
          value={settings.officers.join(", ")}
          onChange={(e) =>
            setSettings({
              officers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            })
          }
          placeholder="Hooz20, Pichyluck"
          className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Filtro de gremio por defecto">
        <input
          value={settings.guildFilter}
          onChange={(e) => setSettings({ guildFilter: e.target.value })}
          placeholder="Eroth"
          className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm"
        />
      </Field>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={settings.autoStartCapture}
          onChange={(e) => setSettings({ autoStartCapture: e.target.checked })}
        />
        Iniciar captura UDP al abrir la app (si Npcap está instalado)
      </label>

      <div className="rounded-xl border border-white/10 bg-ink-800/70 p-4 text-sm text-slate-400">
        <div>Npcap: {npcap?.installed ? "instalado" : "no detectado"}</div>
        <div className="font-mono text-xs">{npcap?.dllPath ?? "—"}</div>
        <div className="mt-2">
          Captura: {capture?.running ? "activa" : "detenida"} · {capture?.devices.length ?? 0}{" "}
          interfaces
        </div>
        {capture?.error && <div className="mt-2 text-rose-300">{capture.error}</div>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={refreshPrices}
          className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950"
        >
          Actualizar precios (AODP)
        </button>
        <button
          onClick={async () => setCapture(await invoke<CaptureStatus>("capture_status"))}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm"
        >
          Refrescar estado
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-slate-400">{label}</span>
      {children}
    </label>
  );
}
