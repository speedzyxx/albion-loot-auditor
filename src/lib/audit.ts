import type {
  AuditResult,
  ChestItem,
  ItemDelta,
  LootEvent,
  PlayerReconciliation,
  TradeEvent,
} from "../types";
import { itemKeys } from "./format";

function asDelta(
  name: string,
  uniqueName: string,
  quantity: number,
  enchantment: number,
  silverEach: number,
): ItemDelta {
  const key = itemKeys(uniqueName, name, enchantment)[0] ?? `${name}@${enchantment || 0}`;
  return {
    key,
    name,
    uniqueName,
    quantity,
    enchantment,
    estimatedSilver: silverEach * quantity,
  };
}

function merge(target: Map<string, ItemDelta>, item: ItemDelta, sign = 1) {
  const prev = target.get(item.key);
  if (prev) {
    prev.quantity += item.quantity * sign;
    prev.estimatedSilver += item.estimatedSilver * sign;
    if (prev.quantity <= 0) target.delete(item.key);
  } else if (sign > 0) {
    target.set(item.key, { ...item });
  }
}

function sumSilver(items: ItemDelta[]): number {
  return items.reduce((s, i) => s + i.estimatedSilver, 0);
}

function indexChest(items: ChestItem[]): Map<string, ItemDelta> {
  const pool = new Map<string, ItemDelta>();
  for (const item of items) {
    const delta = asDelta(
      item.name,
      item.uniqueName,
      item.quantity,
      item.enchantment,
      unitSilver(item.estimatedSilver, item.quantity),
    );
    const keys = itemKeys(item.uniqueName, item.name, item.enchantment);
    const existing = keys.map((k) => pool.get(k)).find(Boolean);
    if (existing) {
      existing.quantity += delta.quantity;
      existing.estimatedSilver += delta.estimatedSilver;
      for (const k of keys) pool.set(k, existing);
    } else {
      for (const k of keys) pool.set(k, delta);
    }
  }
  return pool;
}

function takeFromChest(pool: Map<string, ItemDelta>, item: ItemDelta): number {
  for (const k of itemKeys(item.uniqueName, item.name, item.enchantment)) {
    const inChest = pool.get(k);
    if (!inChest || inChest.quantity <= 0) continue;
    const take = Math.min(item.quantity, inChest.quantity);
    inChest.quantity -= take;
    const unit = item.quantity ? item.estimatedSilver / item.quantity : 0;
    inChest.estimatedSilver -= Math.round(unit * take);
    return take;
  }
  return 0;
}

export function reconcile(opts: {
  loot: LootEvent[];
  trades: TradeEvent[];
  chest: ChestItem[];
  officers: string[];
}): AuditResult {
  const officers = new Set(opts.officers.map((o) => o.trim().toLowerCase()).filter(Boolean));
  const chestReady = opts.chest.length > 0;
  const lootByPlayer = new Map<string, Map<string, ItemDelta>>();
  const playerGuild = new Map<string, string | null | undefined>();

  for (const ev of opts.loot) {
    if (ev.isSilver) continue;
    const player = ev.lootedBy;
    playerGuild.set(player, ev.guild);
    if (!lootByPlayer.has(player)) lootByPlayer.set(player, new Map());
    merge(
      lootByPlayer.get(player)!,
      asDelta(ev.itemName, ev.itemUniqueName, ev.quantity, ev.enchantment, unitSilver(ev.estimatedSilver, ev.quantity)),
    );
  }

  const transferred = new Map<string, Map<string, ItemDelta>>();
  for (const trade of opts.trades) {
    const toOfficer = officers.size === 0 || officers.has(trade.toPlayer.toLowerCase());
    if (!toOfficer) continue;
    if (!transferred.has(trade.fromPlayer)) transferred.set(trade.fromPlayer, new Map());
    merge(
      transferred.get(trade.fromPlayer)!,
      asDelta(
        trade.itemName,
        trade.itemUniqueName,
        trade.quantity,
        trade.enchantment,
        unitSilver(trade.estimatedSilver, trade.quantity),
      ),
    );
  }

  const chestPool = indexChest(opts.chest);
  const chestSilver = sumSilver([...new Set(chestPool.values())]);

  const players: PlayerReconciliation[] = [];

  for (const [player, lootedMap] of lootByPlayer) {
    const looted = [...lootedMap.values()];
    const xfer = [...(transferred.get(player)?.values() ?? [])];
    const expected = new Map(lootedMap);
    for (const item of xfer) merge(expected, item, -1);

    const deposited: ItemDelta[] = [];
    const pending: ItemDelta[] = [];

    if (chestReady) {
      for (const item of expected.values()) {
        if (item.quantity <= 0) continue;
        const take = takeFromChest(chestPool, item);
        const unit = item.quantity ? item.estimatedSilver / item.quantity : 0;
        if (take > 0) {
          deposited.push({
            ...item,
            quantity: take,
            estimatedSilver: Math.round(unit * take),
          });
        }
        const leftover = item.quantity - take;
        if (leftover > 0) {
          pending.push({
            ...item,
            quantity: leftover,
            estimatedSilver: Math.round(unit * leftover),
          });
        }
      }
    }

    const pendingSilver = sumSilver(pending);
    const transferredSilver = sumSilver(xfer);
    const depositedSilver = sumSilver(deposited);
    const lootedSilver = sumSilver(looted);

    let status: PlayerReconciliation["status"] = "waiting";
    if (chestReady) {
      if (pending.length > 0) status = "pending";
      else if (xfer.length > 0) status = "transferred";
      else status = "complete";
    }

    players.push({
      player,
      guild: playerGuild.get(player),
      status,
      lootedSilver,
      depositedSilver,
      transferredSilver,
      pendingSilver,
      looted,
      deposited,
      transferred: xfer,
      pending,
    });
  }

  players.sort((a, b) => {
    const rank = { pending: 0, waiting: 1, transferred: 2, complete: 3 };
    return rank[a.status] - rank[b.status] || b.lootedSilver - a.lootedSilver;
  });

  const lootSilver = players.reduce((s, p) => s + p.lootedSilver, 0);
  const accounted = players.reduce((s, p) => s + p.depositedSilver + p.transferredSilver, 0);
  const compliance = !chestReady
    ? 0
    : lootSilver > 0
      ? Math.round((accounted / lootSilver) * 100)
      : 100;

  const leftover = [...new Set(chestPool.values())].filter((i) => i.quantity > 0);

  return {
    players,
    chestSilver,
    lootSilver,
    compliance: Math.min(100, Math.max(0, compliance)),
    chestReady,
    extras: [],
    unmatchedChest: leftover,
  };
}

function unitSilver(total: number, qty: number): number {
  if (!qty) return 0;
  return total / qty;
}
