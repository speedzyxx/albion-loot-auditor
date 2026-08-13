import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffect } from "react";
import { Layout } from "./components/Layout";
import { LiveView } from "./components/LiveView";
import { AuditView } from "./components/AuditView";
import { DeathsView } from "./components/DeathsView";
import { TradesView } from "./components/TradesView";
import { ReportsView } from "./components/ReportsView";
import { SettingsView } from "./components/SettingsView";
import { useAppStore } from "./store";
import type {
  CaptureStatus,
  DeathEvent,
  LootEvent,
  NpcapStatus,
  PlayerInfo,
  StorageLog,
  TradeEvent,
} from "./types";

export default function App() {
  const view = useAppStore((s) => s.view);
  const settings = useAppStore((s) => s.settings);
  const setNpcap = useAppStore((s) => s.setNpcap);
  const setCapture = useAppStore((s) => s.setCapture);
  const addLoot = useAppStore((s) => s.addLoot);
  const addDeath = useAppStore((s) => s.addDeath);
  const addTrade = useAppStore((s) => s.addTrade);
  const addStorage = useAppStore((s) => s.addStorage);
  const upsertPlayer = useAppStore((s) => s.upsertPlayer);
  const setMap = useAppStore((s) => s.setMap);
  const setUpdateInfo = useAppStore((s) => s.setUpdateInfo);

  useEffect(() => {
    let unlisteners: Array<() => void> = [];

    async function boot() {
      try {
        const npcap = await invoke<NpcapStatus>("npcap_status");
        setNpcap(npcap);
        if (npcap.installed && settings.autoStartCapture) {
          const status = await invoke<CaptureStatus>("start_capture");
          setCapture(status);
        } else {
          const status = await invoke<CaptureStatus>("capture_status");
          setCapture(status);
        }
      } catch (err) {
        setCapture({
          running: false,
          npcap: {
            installed: false,
            message: String(err),
          },
          devices: [],
          packets: 0,
          decoded: 0,
          live: false,
          error: String(err),
        });
      }

      const onLoot = await listen<{ type: string; loot?: LootEvent } | LootEvent>("loot", (e) => {
        const p = e.payload as { loot?: LootEvent } & LootEvent;
        addLoot(p.loot ?? p);
      });
      const onDeath = await listen<{ death?: DeathEvent } & DeathEvent>("death", (e) => {
        const p = e.payload as { death?: DeathEvent } & DeathEvent;
        addDeath(p.death ?? p);
      });
      const onTrade = await listen<{ trade?: TradeEvent } & TradeEvent>("trade", (e) => {
        const p = e.payload as { trade?: TradeEvent } & TradeEvent;
        addTrade(p.trade ?? p);
      });
      const onStorage = await listen<{ storage?: StorageLog } & StorageLog>("storage", (e) => {
        const p = e.payload as { storage?: StorageLog } & StorageLog;
        addStorage(p.storage ?? p);
      });
      const onPlayer = await listen<{ player?: PlayerInfo } & PlayerInfo>("player", (e) => {
        const p = e.payload as { player?: PlayerInfo } & PlayerInfo;
        upsertPlayer(p.player ?? p);
      });
      const onCluster = await listen<{ cluster?: { map: string }; map?: string }>("cluster", (e) => {
        const map = e.payload.cluster?.map ?? e.payload.map;
        if (map) setMap(map);
      });

      unlisteners = [onLoot, onDeath, onTrade, onStorage, onPlayer, onCluster];

      try {
        const update = await check();
        if (update) {
          setUpdateInfo(`Actualización ${update.version} encontrada. Descargando…`);
          await update.downloadAndInstall();
          setUpdateInfo("Actualización instalada. Reiniciando…");
          await relaunch();
        }
      } catch {
        // No endpoint / unsigned local build: ignore.
      }
    }

    boot();
    const poll = window.setInterval(async () => {
      try {
        setCapture(await invoke<CaptureStatus>("capture_status"));
      } catch {
        /* ignore */
      }
    }, 2000);

    return () => {
      window.clearInterval(poll);
      unlisteners.forEach((u) => u());
    };
  }, [
    addDeath,
    addLoot,
    addStorage,
    addTrade,
    setCapture,
    setMap,
    setNpcap,
    setUpdateInfo,
    settings.autoStartCapture,
    upsertPlayer,
  ]);

  return (
    <Layout>
      {view === "live" && <LiveView />}
      {view === "audit" && <AuditView />}
      {view === "deaths" && <DeathsView />}
      {view === "trades" && <TradesView />}
      {view === "reports" && <ReportsView />}
      {view === "settings" && <SettingsView />}
    </Layout>
  );
}
