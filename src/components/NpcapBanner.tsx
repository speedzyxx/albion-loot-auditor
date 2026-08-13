import { invoke } from "@tauri-apps/api/core";
import { Download, ShieldAlert } from "lucide-react";
import { useAppStore } from "../store";
import type { CaptureStatus, NpcapStatus } from "../types";

export function NpcapBanner() {
  const npcap = useAppStore((s) => s.npcap);
  const setNpcap = useAppStore((s) => s.setNpcap);
  const setCapture = useAppStore((s) => s.setCapture);
  if (!npcap || npcap.installed) return null;

  async function install() {
    await invoke("open_npcap_installer");
  }

  async function recheck() {
    const status = await invoke<NpcapStatus>("npcap_status");
    setNpcap(status);
    if (status.installed) {
      try {
        setCapture(await invoke<CaptureStatus>("start_capture"));
      } catch {
        setCapture(await invoke<CaptureStatus>("capture_status"));
      }
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-500/20 bg-amber-500/10 px-6 py-3">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-400" />
        <div>
          <div className="text-sm font-semibold text-amber-200">Npcap no detectado</div>
          <div className="text-xs text-amber-100/70">
            Instala Npcap con la opción <span className="font-mono">WinPcap API compatible</span> y
            vuelve a comprobar. Sin el driver no hay captura UDP de Albion.
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={install}
          className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold text-ink-950 hover:bg-gold-400"
        >
          <Download size={14} />
          Instalar Npcap
        </button>
        <button
          onClick={recheck}
          className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
        >
          Ya lo instalé
        </button>
      </div>
    </div>
  );
}
