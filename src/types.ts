export type ViewId =
  | "live"
  | "audit"
  | "combat"
  | "deaths"
  | "trades"
  | "reports"
  | "settings";

export type PlayerStatus = "complete" | "transferred" | "pending";

export interface NpcapStatus {
  installed: boolean;
  dllPath?: string | null;
  versionHint?: string | null;
  message: string;
}

export interface CaptureStatus {
  running: boolean;
  npcap: NpcapStatus;
  devices: string[];
  packets: number;
  decoded: number;
  live: boolean;
  error?: string | null;
  map?: string | null;
}

export interface LootEvent {
  id: string;
  timestamp: number;
  lootedBy: string;
  lootedFrom: string;
  itemNumId: number;
  itemUniqueName: string;
  itemName: string;
  quantity: number;
  enchantment: number;
  quality: number;
  estimatedSilver: number;
  isSilver: boolean;
  map?: string | null;
  guild?: string | null;
}

export interface LostItem {
  itemName: string;
  itemUniqueName: string;
  quantity: number;
  enchantment: number;
  estimatedSilver: number;
}

export interface DeathEvent {
  id: string;
  timestamp: number;
  victim: string;
  killer?: string | null;
  guild?: string | null;
  map?: string | null;
  lostItems: LostItem[];
}

export interface TradeEvent {
  id: string;
  timestamp: number;
  fromPlayer: string;
  toPlayer: string;
  itemName: string;
  itemUniqueName: string;
  quantity: number;
  enchantment: number;
  estimatedSilver: number;
}

export interface StorageLog {
  id: string;
  timestamp: number;
  player: string;
  action: string;
  itemName: string;
  itemUniqueName: string;
  quantity: number;
  container?: string | null;
}

export interface PlayerInfo {
  name: string;
  guild?: string | null;
  alliance?: string | null;
  objectId?: number | null;
}

export interface CombatHit {
  id: string;
  timestamp: number;
  source: string;
  target: string;
  amount: number;
  map?: string | null;
}

export interface GearPiece {
  itemName: string;
  itemUniqueName: string;
  enchantment: number;
}

export interface BuildInfo {
  player: string;
  guild?: string | null;
  items: GearPiece[];
  timestamp: number;
}

export interface ChestItem {
  key: string;
  name: string;
  uniqueName: string;
  quantity: number;
  enchantment: number;
  estimatedSilver: number;
  raw: string;
}

export interface ChestLogLine {
  player: string;
  action: "deposit" | "withdraw" | "unknown";
  item: ChestItem;
  raw: string;
}

export interface ParsedChest {
  items: ChestItem[];
  logs: ChestLogLine[];
  warnings: string[];
}

export interface ItemDelta {
  key: string;
  name: string;
  uniqueName: string;
  quantity: number;
  enchantment: number;
  estimatedSilver: number;
}

export interface PlayerReconciliation {
  player: string;
  guild?: string | null;
  status: PlayerStatus;
  lootedSilver: number;
  depositedSilver: number;
  transferredSilver: number;
  pendingSilver: number;
  looted: ItemDelta[];
  deposited: ItemDelta[];
  transferred: ItemDelta[];
  pending: ItemDelta[];
}

export interface AuditResult {
  players: PlayerReconciliation[];
  chestSilver: number;
  lootSilver: number;
  compliance: number;
  extras: ItemDelta[];
  unmatchedChest: ItemDelta[];
}

export interface PriceQuote {
  uniqueName: string;
  sellPrice: number;
  location: string;
}

export interface AppSettings {
  webhookUrl: string;
  officers: string[];
  guildFilter: string;
  autoStartCapture: boolean;
}
