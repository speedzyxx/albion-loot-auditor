import type { LootEvent, PlayerInfo, PlayerReconciliation } from "../types";
import { formatSilver } from "./format";

export const NO_GUILD = "Sin gremio";
export const NO_MAP = "Mapa desconocido";

export function guildOf(event: LootEvent, players: Record<string, PlayerInfo>): string {
  return event.guild?.trim() || players[event.lootedBy]?.guild?.trim() || NO_GUILD;
}

export function mapOf(event: LootEvent): string {
  return event.map?.trim() || NO_MAP;
}

export interface MemberLoot {
  player: string;
  guild: string;
  events: LootEvent[];
  silver: number;
}

export interface GuildLoot {
  guild: string;
  members: MemberLoot[];
  events: number;
  silver: number;
}

export interface MapLoot {
  map: string;
  guilds: GuildLoot[];
  events: number;
  silver: number;
  looters: number;
}

function sortGuilds(guilds: string[], prefer?: string) {
  const pref = prefer?.trim().toLowerCase();
  return [...guilds].sort((a, b) => {
    if (pref) {
      if (a.toLowerCase() === pref) return -1;
      if (b.toLowerCase() === pref) return 1;
    }
    if (a === NO_GUILD) return 1;
    if (b === NO_GUILD) return -1;
    return a.localeCompare(b);
  });
}

export function groupLootByMapAndGuild(
  loot: LootEvent[],
  players: Record<string, PlayerInfo> = {},
  preferGuild?: string,
): MapLoot[] {
  const byMap = new Map<string, LootEvent[]>();
  for (const ev of loot) {
    const map = mapOf(ev);
    if (!byMap.has(map)) byMap.set(map, []);
    byMap.get(map)!.push(ev);
  }

  return [...byMap.entries()].map(([map, events]) => {
    const byGuild = new Map<string, LootEvent[]>();
    for (const ev of events) {
      const g = guildOf(ev, players);
      if (!byGuild.has(g)) byGuild.set(g, []);
      byGuild.get(g)!.push(ev);
    }
    const guilds: GuildLoot[] = sortGuilds([...byGuild.keys()], preferGuild).map((guild) => {
      const rows = byGuild.get(guild)!;
      const byPlayer = new Map<string, LootEvent[]>();
      for (const ev of rows) {
        if (!byPlayer.has(ev.lootedBy)) byPlayer.set(ev.lootedBy, []);
        byPlayer.get(ev.lootedBy)!.push(ev);
      }
      const members: MemberLoot[] = [...byPlayer.entries()]
        .map(([player, evs]) => ({
          player,
          guild,
          events: evs,
          silver: evs.reduce((s, e) => s + e.estimatedSilver, 0),
        }))
        .sort((a, b) => b.events.length - a.events.length || a.player.localeCompare(b.player));
      return {
        guild,
        members,
        events: rows.length,
        silver: rows.reduce((s, e) => s + e.estimatedSilver, 0),
      };
    });
    const looters = new Set(events.map((e) => e.lootedBy)).size;
    return {
      map,
      guilds,
      events: events.length,
      silver: events.reduce((s, e) => s + e.estimatedSilver, 0),
      looters,
    };
  });
}

export function groupPlayersByGuild(
  players: PlayerReconciliation[],
  preferGuild?: string,
): Array<{ guild: string; players: PlayerReconciliation[]; silver: number }> {
  const byGuild = new Map<string, PlayerReconciliation[]>();
  for (const p of players) {
    const g = p.guild?.trim() || NO_GUILD;
    if (!byGuild.has(g)) byGuild.set(g, []);
    byGuild.get(g)!.push(p);
  }
  return sortGuilds([...byGuild.keys()], preferGuild).map((guild) => {
    const list = byGuild.get(guild)!;
    return {
      guild,
      players: list,
      silver: list.reduce((s, p) => s + p.lootedSilver, 0),
    };
  });
}

export function lootSummary(loot: LootEvent[], players: Record<string, PlayerInfo> = {}) {
  const maps = new Set(loot.map((e) => mapOf(e)));
  const guilds = new Set(loot.map((e) => guildOf(e, players)));
  const looters = new Set(loot.map((e) => e.lootedBy));
  const silver = loot.reduce((s, e) => s + e.estimatedSilver, 0);
  return {
    maps: maps.size,
    guilds: guilds.size,
    looters: looters.size,
    events: loot.length,
    silverLabel: formatSilver(silver),
  };
}
