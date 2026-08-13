import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseChestPaste } from "./lib/chestParser";
import { demoChestText, demoDeaths, demoLoot, demoTrades } from "./lib/demo";
import type {
  AppSettings,
  CaptureStatus,
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
      upsertPlayer: (player) =>
        set((s) => ({ players: { ...s.players, [player.name]: player } })),
      setMap: (map) => set({ map }),
      setNpcap: (npcap) => set({ npcap }),
      setCapture: (capture) => set({ capture }),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setUpdateInfo: (updateInfo) => set({ updateInfo }),
      loadDemo: () =>
        set({
          loot: demoLoot(),
          deaths: demoDeaths(),
          trades: demoTrades(),
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
