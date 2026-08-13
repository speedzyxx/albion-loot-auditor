import type {
  AuditResult,
  ChestItem,
  ItemDelta,
  LootEvent,
  PlayerReconciliation,
  TradeEvent,
} from "../types";
import { itemKey } from "./format";

function asDelta(
  name: string,
  uniqueName: string,
  quantity: number,
  enchantment: number,
  silverEach: number,
): ItemDelta {
  const key = itemKey(uniqueName, name, enchantment);
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

export function reconcile(opts: {
  loot: LootEvent[];
  trades: TradeEvent[];
  chest: ChestItem[];
  officers: string[];
}): AuditResult {
  const officers = new Set(opts.officers.map((o) => o.trim().toLowerCase()).filter(Boolean));
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

  const chestPool = new Map<string, ItemDelta>();
  for (const item of opts.chest) {
    merge(chestPool, asDelta(item.name, item.uniqueName, item.quantity, item.enchantment, unitSilver(item.estimatedSilver, item.quantity)));
  }
  const chestSilver = sumSilver([...chestPool.values()]);

  const players: PlayerReconciliation[] = [];

  for (const [player, lootedMap] of lootByPlayer) {
    const looted = [...lootedMap.values()];
    const xfer = [...(transferred.get(player)?.values() ?? [])];
    const expected = new Map(lootedMap);
    for (const item of xfer) merge(expected, item, -1);

    const deposited: ItemDelta[] = [];
    const pending: ItemDelta[] = [];

    for (const item of expected.values()) {
      if (item.quantity <= 0) continue;
      const inChest = chestPool.get(item.key);
      if (!inChest || inChest.quantity <= 0) {
        pending.push({ ...item });
        continue;
      }
      const take = Math.min(item.quantity, inChest.quantity);
      const unit = item.quantity ? item.estimatedSilver / item.quantity : 0;
      deposited.push({
        ...item,
        quantity: take,
        estimatedSilver: Math.round(unit * take),
      });
      inChest.quantity -= take;
      inChest.estimatedSilver -= Math.round(unit * take);
      if (inChest.quantity <= 0) chestPool.delete(item.key);
      const leftover = item.quantity - take;
      if (leftover > 0) {
        pending.push({
          ...item,
          quantity: leftover,
          estimatedSilver: Math.round(unit * leftover),
        });
      }
    }

    const pendingSilver = sumSilver(pending);
    const transferredSilver = sumSilver(xfer);
    const depositedSilver = sumSilver(deposited);
    const lootedSilver = sumSilver(looted);

    let status: PlayerReconciliation["status"] = "complete";
    if (pending.length > 0) status = "pending";
    else if (xfer.length > 0 && deposited.length === 0) status = "transferred";
    else if (xfer.length > 0) status = "transferred";

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
    const rank = { pending: 0, transferred: 1, complete: 2 };
    return rank[a.status] - rank[b.status] || b.lootedSilver - a.lootedSilver;
  });

  const lootSilver = players.reduce((s, p) => s + p.lootedSilver, 0);
  const accounted = players.reduce((s, p) => s + p.depositedSilver + p.transferredSilver, 0);
  const compliance = lootSilver > 0 ? Math.round((accounted / lootSilver) * 100) : 100;

  return {
    players,
    chestSilver,
    lootSilver,
    compliance: Math.min(100, Math.max(0, compliance)),
    extras: [],
    unmatchedChest: [...chestPool.values()].filter((i) => i.quantity > 0),
  };
}

function unitSilver(total: number, qty: number): number {
  if (!qty) return 0;
  return total / qty;
}
