import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseChestPaste } from "./lib/chestParser";
import { demoBuilds, demoChestText, demoDamage, demoDeaths, demoHeals, demoLoot, demoTrades } from "./lib/demo";
import type {
  AppSettings,
  BuildInfo,
  CaptureStatus,
  CombatHit,
  DeathEvent,
  LootEvent,
  NpcapStatus,
  ParsedChest,
  PlayerInfo,
  StorageLog,
  TradeEvent,
  ViewId,
} from "./types";

interface AppState {
  view: ViewId;
  query: string;
  loot: LootEvent[];
  deaths: DeathEvent[];
  trades: TradeEvent[];
  storage: StorageLog[];
  damage: CombatHit[];
  heals: CombatHit[];
  builds: Record<string, BuildInfo>;
  players: Record<string, PlayerInfo>;
  map: string | null;
  chestText: string;
  parsedChest: ParsedChest | null;
  npcap: NpcapStatus | null;
  capture: CaptureStatus | null;
  settings: AppSettings;
  updateInfo: string | null;
  setView: (view: ViewId) => void;
  setQuery: (query: string) => void;
  setChestText: (text: string) => void;
  parseChest: () => void;
  addLoot: (event: LootEvent) => void;
  addDeath: (event: DeathEvent) => void;
  addTrade: (event: TradeEvent) => void;
  addStorage: (event: StorageLog) => void;
  addDamage: (event: CombatHit) => void;
  addHeal: (event: CombatHit) => void;
  upsertBuild: (build: BuildInfo) => void;
  upsertPlayer: (player: PlayerInfo) => void;
  setMap: (map: string) => void;
  setNpcap: (status: NpcapStatus) => void;
  setCapture: (status: CaptureStatus) => void;
  setSettings: (patch: Partial<AppSettings>) => void;
  setUpdateInfo: (info: string | null) => void;
  loadDemo: () => void;
  resetSession: () => void;
}

const defaultSettings: AppSettings = {
  webhookUrl: "",
  officers: ["Hooz20"],
  guildFilter: "Eroth",
  autoStartCapture: true,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: "live",
      query: "",
      loot: [],
      deaths: [],
      trades: [],
      storage: [],
      damage: [],
      heals: [],
      builds: {},
      players: {},
      map: null,
      chestText: "",
      parsedChest: null,
      npcap: null,
      capture: null,
      settings: defaultSettings,
      updateInfo: null,
      setView: (view) => set({ view }),
      setQuery: (query) => set({ query }),
      setChestText: (chestText) => set({ chestText }),
      parseChest: () => set({ parsedChest: parseChestPaste(get().chestText) }),
      addLoot: (event) =>
        set((s) => ({
          loot: [event, ...s.loot].slice(0, 5000),
          map: event.map ?? s.map,
        })),
      addDeath: (event) => set((s) => ({ deaths: [event, ...s.deaths].slice(0, 2000) })),
      addTrade: (event) => set((s) => ({ trades: [event, ...s.trades].slice(0, 2000) })),
      addStorage: (event) => set((s) => ({ storage: [event, ...s.storage].slice(0, 2000) })),
      addDamage: (event) => set((s) => ({ damage: [...s.damage, event].slice(-8000) })),
      addHeal: (event) => set((s) => ({ heals: [...s.heals, event].slice(-8000) })),
      upsertBuild: (build) => set((s) => ({ builds: { ...s.builds, [build.player]: build } })),
      upsertPlayer: (player) =>
        set((s) => ({ players: { ...s.players, [player.name]: player } })),
      setMap: (map) => set({ map }),
      setNpcap: (npcap) => set({ npcap }),
      setCapture: (capture) =>
        set((s) => ({
          capture,
          map: capture.map ?? s.map,
        })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setUpdateInfo: (updateInfo) => set({ updateInfo }),
      loadDemo: () =>
        set({
          loot: demoLoot(),
          deaths: demoDeaths(),
          trades: demoTrades(),
          damage: demoDamage(),
          heals: demoHeals(),
          builds: demoBuilds(),
          chestText: demoChestText,
          parsedChest: parseChestPaste(demoChestText),
          map: "T8 Black Zone — Stagbourne",
        }),
      resetSession: () =>
        set({
          loot: [],
          deaths: [],
          trades: [],
          storage: [],
          damage: [],
          heals: [],
          builds: {},
          players: {},
          map: null,
          parsedChest: null,
          chestText: "",
        }),
    }),
    {
      name: "ala-settings",
      partialize: (s) => ({ settings: s.settings }),
    },
  ),
);
