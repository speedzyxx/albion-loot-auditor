import type { AuditResult, DeathEvent, LootEvent, TradeEvent } from "../types";
import { displayItem, formatSilver } from "./format";
import { groupLootByMapAndGuild, groupPlayersByGuild } from "./lootGroups";

export function buildDiscordReport(opts: {
  title: string;
  map?: string | null;
  audit: AuditResult;
  loot: LootEvent[];
  deaths: DeathEvent[];
  trades: TradeEvent[];
}): string {
  const { title, map, audit, deaths, trades, loot } = opts;
  const rats = audit.players.filter((p) => p.status === "pending");
  const complete = audit.players.filter((p) => p.status === "complete");
  const xfer = audit.players.filter((p) => p.status === "transferred");
  const byMap = groupLootByMapAndGuild(loot);
  const byGuild = groupPlayersByGuild(audit.players);

  const lines: string[] = [
    `**${title}**`,
    map ? `Mapa actual: \`${map}\`` : "",
    `Loot total: **${formatSilver(audit.lootSilver)}** · Cofre: **${formatSilver(audit.chestSilver)}** · Cumplimiento: **${audit.compliance}%**`,
    `Jugadores: ${complete.length} 🟢 · ${xfer.length} 🟡 · ${rats.length} 🔴`,
    "",
  ];

  if (byMap.length) {
    lines.push("**Mapas donde se loteó**");
    for (const zone of byMap) {
      lines.push(`• **${zone.map}** — ${zone.events} picks · ${zone.looters} looters · ${zone.guilds.length} gremios`);
      for (const g of zone.guilds) {
        const names = g.members.map((m) => `${m.player} (${m.events.length})`).join(", ");
        lines.push(`  – ${g.guild}: ${names}`);
      }
    }
    lines.push("");
  }

  if (rats.length) {
    lines.push("**🔴 Pendiente / RAT**");
    for (const g of byGuild) {
      const pending = g.players.filter((p) => p.status === "pending");
      if (!pending.length) continue;
      lines.push(`*${g.guild}*`);
      for (const p of pending) {
        const items = p.pending.map((i) => displayItem(i.name, i.enchantment, i.quantity)).join(", ");
        lines.push(`• **${p.player}** — ${items || "ítems sin depositar"} (${formatSilver(p.pendingSilver)})`);
      }
    }
    lines.push("");
  }

  if (xfer.length) {
    lines.push("**🟡 Transferido a oficial**");
    for (const p of xfer) {
      const items = p.transferred.map((i) => displayItem(i.name, i.enchantment, i.quantity)).join(", ");
      lines.push(`• **${p.player}** → ${items} (${formatSilver(p.transferredSilver)})`);
    }
    lines.push("");
  }

  if (complete.length) {
    lines.push(`**🟢 Completo** (${complete.length})`);
    lines.push(complete.map((p) => p.player).join(", "));
    lines.push("");
  }

  if (deaths.length) {
    lines.push(`**Muertes:** ${deaths.length}`);
    for (const d of deaths.slice(0, 12)) {
      lines.push(`• ${d.victim}${d.killer ? ` ← ${d.killer}` : ""}`);
    }
    lines.push("");
  }

  if (trades.length) {
    lines.push(`**Trades:** ${trades.length}`);
  }

  return lines.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n").slice(0, 1900);
}

export function lootToCsv(loot: LootEvent[], deaths: DeathEvent[], trades: TradeEvent[]): string {
  const rows: string[][] = [
    ["type", "timestamp", "player", "other", "item", "unique", "qty", "enchant", "silver", "map", "guild"],
  ];
  for (const e of loot) {
    rows.push([
      "loot",
      new Date(e.timestamp).toISOString(),
      e.lootedBy,
      e.lootedFrom,
      e.itemName,
      e.itemUniqueName,
      String(e.quantity),
      String(e.enchantment),
      String(e.estimatedSilver),
      e.map ?? "",
      e.guild ?? "",
    ]);
  }
  for (const e of deaths) {
    rows.push([
      "death",
      new Date(e.timestamp).toISOString(),
      e.victim,
      e.killer ?? "",
      e.lostItems.map((i) => i.itemName).join("|"),
      "",
      "1",
      "0",
      String(e.lostItems.reduce((s, i) => s + i.estimatedSilver, 0)),
      e.map ?? "",
      e.guild ?? "",
    ]);
  }
  for (const e of trades) {
    rows.push([
      "trade",
      new Date(e.timestamp).toISOString(),
      e.fromPlayer,
      e.toPlayer,
      e.itemName,
      e.itemUniqueName,
      String(e.quantity),
      String(e.enchantment),
      String(e.estimatedSilver),
      "",
      "",
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
