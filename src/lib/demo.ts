import type { BuildInfo, CombatHit, DeathEvent, LootEvent, TradeEvent } from "../types";

export function demoLoot(): LootEvent[] {
  const now = Date.now();
  const map = "T8 Black Zone — Stagbourne";
  const guild = "Eroth";
  return [
    row(now - 180000, "Hooz20", "FallenKnight", "Elder's Bow", "T8_2H_BOW", 1, 3, 4_850_000, map, guild),
    row(now - 160000, "Hooz20", "FallenKnight", "Adept's Bag", "T4_BAG", 2, 0, 48_000, map, guild),
    row(now - 140000, "Pichyluck", "NightWarden", "Expert's Armor", "T5_ARMOR_PLATE_SET3", 1, 2, 1_120_000, map, guild),
    row(now - 120000, "Pichyluck", "NightWarden", "Siphoned Energy", "T4_SKILLBOOK_STANDARD", 12, 0, 96_000, map, guild),
    row(now - 90000, "RivenXe", "Pichyluck", "Master's Spear", "T6_2H_SPEAR", 1, 1, 640_000, map, guild),
    row(now - 70000, "MiraVoid", "Hooz20", "Grandmaster's Cape", "T7_CAPEITEM_FW_BRIDGEWATCH", 1, 0, 890_000, map, guild),
    row(now - 55000, "Hooz20", "FallenKnight", "Trash", "T8_TRASH", 14, 0, 0, map, guild),
    row(now - 40000, "Hooz20", "MiraVoid", "Silver", "SILVER", 184_000, 0, 184_000, map, guild, true),
  ];
}

export function demoDeaths(): DeathEvent[] {
  return [
    {
      id: "d1",
      timestamp: Date.now() - 150000,
      victim: "FallenKnight",
      killer: "Hooz20",
      guild: "Eroth",
      map: "T8 Black Zone — Stagbourne",
      lostItems: [
        { itemName: "Elder's Bow", itemUniqueName: "T8_2H_BOW", quantity: 1, enchantment: 3, estimatedSilver: 4_850_000 },
        { itemName: "Adept's Bag", itemUniqueName: "T4_BAG", quantity: 2, enchantment: 0, estimatedSilver: 48_000 },
      ],
    },
    {
      id: "d2",
      timestamp: Date.now() - 125000,
      victim: "NightWarden",
      killer: "Pichyluck",
      guild: "Eroth",
      map: "T8 Black Zone — Stagbourne",
      lostItems: [
        { itemName: "Expert's Armor", itemUniqueName: "T5_ARMOR_PLATE_SET3", quantity: 1, enchantment: 2, estimatedSilver: 1_120_000 },
      ],
    },
  ];
}

export function demoTrades(): TradeEvent[] {
  return [
    {
      id: "t1",
      timestamp: Date.now() - 35000,
      fromPlayer: "RivenXe",
      toPlayer: "Hooz20",
      itemName: "Master's Spear",
      itemUniqueName: "T6_2H_SPEAR",
      quantity: 1,
      enchantment: 1,
      estimatedSilver: 640_000,
    },
  ];
}

export const demoChestText = `2	Adept's Bag
1	Elder's Bow@3
1	Expert's Armor@2
12	Siphoned Energy
1	Grandmaster's Cape
RivenXe deposited 1 Master's Spear`;

function row(
  timestamp: number,
  lootedBy: string,
  lootedFrom: string,
  itemName: string,
  itemUniqueName: string,
  quantity: number,
  enchantment: number,
  estimatedSilver: number,
  map: string,
  guild: string,
  isSilver = false,
): LootEvent {
  return {
    id: `${timestamp}-${lootedBy}-${itemUniqueName}`,
    timestamp,
    lootedBy,
    lootedFrom,
    itemNumId: 0,
    itemUniqueName,
    itemName,
    quantity,
    enchantment,
    quality: 0,
    estimatedSilver,
    isSilver,
    map,
    guild,
  };
}

export function demoDamage(): CombatHit[] {
  const now = Date.now();
  const map = "T8 Black Zone — Stagbourne";
  return [
    hit(now - 80000, "Hooz20", "FallenKnight", 18420, map),
    hit(now - 79000, "Pichyluck", "NightWarden", 22100, map),
    hit(now - 77000, "Hooz20", "NightWarden", 9600, map),
    hit(now - 74000, "RivenXe", "FallenKnight", 31200, map),
    hit(now - 70000, "MiraVoid", "NightWarden", 15400, map),
    hit(now - 68000, "Pichyluck", "FallenKnight", 19800, map),
  ];
}

export function demoHeals(): CombatHit[] {
  const now = Date.now();
  const map = "T8 Black Zone — Stagbourne";
  return [
    hit(now - 75000, "MiraVoid", "Hooz20", 8400, map),
    hit(now - 72000, "MiraVoid", "Pichyluck", 12100, map),
    hit(now - 69000, "MiraVoid", "RivenXe", 5600, map),
  ];
}

export function demoBuilds(): Record<string, BuildInfo> {
  const now = Date.now();
  return {
    Hooz20: {
      player: "Hooz20",
      guild: "Eroth",
      timestamp: now,
      items: [
        piece("T8_2H_BOW", "Elder's Bow", 3),
        piece("T8_ARMOR_LEATHER_SET3", "Elder's Jacket", 2),
        piece("T8_HEAD_LEATHER_SET3", "Elder's Hood", 2),
        piece("T8_SHOES_LEATHER_SET3", "Elder's Shoes", 1),
        piece("T8_CAPEITEM_FW_LYMHURST", "Lymhurst Cape", 0),
      ],
    },
    Pichyluck: {
      player: "Pichyluck",
      guild: "Eroth",
      timestamp: now,
      items: [
        piece("T8_MAIN_CURSEDSTAFF", "Elder's Cursed Staff", 2),
        piece("T8_ARMOR_CLOTH_SET3", "Elder's Robe", 2),
        piece("T8_HEAD_CLOTH_SET3", "Elder's Cowl", 1),
        piece("T8_SHOES_CLOTH_SET3", "Elder's Sandals", 1),
      ],
    },
  };
}

function hit(timestamp: number, source: string, target: string, amount: number, map: string): CombatHit {
  return { id: `${timestamp}-${source}-${target}`, timestamp, source, target, amount, map };
}

function piece(itemUniqueName: string, itemName: string, enchantment: number) {
  return { itemUniqueName, itemName, enchantment };
}
