import type { ChestItem, ChestLogLine, ParsedChest } from "../types";
import { itemKey } from "./format";

const DEPOSIT_RE =
  /^(.+?)\s+(deposited|depositó|deposit|puso|colocó|added)\s+(\d+)\s*[x×]?\s+(.+)$/i;
const WITHDRAW_RE =
  /^(.+?)\s+(withdrew|retiró|retiró|took|sacó|removed)\s+(\d+)\s*[x×]?\s+(.+)$/i;
const QTY_NAME_RE = /^(\d+)\s*[x×]\s+(.+)$/i;
const NAME_QTY_RE = /^(.+?)\s*[x×]\s+(\d+)$/i;
const TAB_RE = /^(.+?)\t+(\d+)$/;
const QTY_TAB_RE = /^(\d+)\t+(.+)$/;

export function parseChestPaste(text: string): ParsedChest {
  const items = new Map<string, ChestItem>();
  const logs: ChestLogLine[] = [];
  const warnings: string[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isHeader(l));

  if (lines.length === 0) {
    return { items: [], logs: [], warnings: ["El portapapeles está vacío."] };
  }

  for (const raw of lines) {
    const deposit = raw.match(DEPOSIT_RE);
    if (deposit) {
      const item = toItem(deposit[4], Number(deposit[3]), raw);
      logs.push({ player: deposit[1].trim(), action: "deposit", item, raw });
      add(items, item);
      continue;
    }
    const withdraw = raw.match(WITHDRAW_RE);
    if (withdraw) {
      const item = toItem(withdraw[4], Number(withdraw[3]), raw);
      logs.push({ player: withdraw[1].trim(), action: "withdraw", item, raw });
      continue;
    }

    let parsed: ChestItem | null = null;
    const tabNameQty = raw.match(TAB_RE);
    const tabQtyName = raw.match(QTY_TAB_RE);
    const qtyName = raw.match(QTY_NAME_RE);
    const nameQty = raw.match(NAME_QTY_RE);

    if (tabNameQty) parsed = toItem(tabNameQty[1], Number(tabNameQty[2]), raw);
    else if (tabQtyName) parsed = toItem(tabQtyName[2], Number(tabQtyName[1]), raw);
    else if (qtyName) parsed = toItem(qtyName[2], Number(qtyName[1]), raw);
    else if (nameQty) parsed = toItem(nameQty[1], Number(nameQty[2]), raw);
    else if (/^[A-Z0-9_@.+-]+$/.test(raw)) parsed = toItem(raw, 1, raw);

    if (parsed) {
      add(items, parsed);
    } else {
      warnings.push(`Línea no reconocida: ${raw}`);
    }
  }

  return {
    items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name)),
    logs,
    warnings,
  };
}

function isHeader(line: string): boolean {
  const l = line.toLowerCase();
  return (
    l === "item" ||
    l === "name" ||
    l.startsWith("item\t") ||
    l.includes("cantidad") ||
    l === "amount" ||
    l.startsWith("quantity")
  );
}

function toItem(rawName: string, quantity: number, raw: string): ChestItem {
  const trimmed = rawName.trim().replace(/,$/, "");
  const { uniqueName, name, enchantment } = splitName(trimmed);
  return {
    key: itemKey(uniqueName, name, enchantment),
    name,
    uniqueName,
    quantity: Math.max(1, quantity || 1),
    enchantment,
    estimatedSilver: 0,
    raw,
  };
}

function splitName(input: string): { uniqueName: string; name: string; enchantment: number } {
  let name = input.trim();
  let enchantment = 0;
  const at = name.match(/@(\d+)$/);
  const dot = name.match(/\.(\d+)$/);
  if (at) {
    enchantment = Number(at[1]);
    name = name.replace(/@\d+$/, "");
  } else if (dot && /^[A-Z0-9_]+$/.test(name.replace(/\.\d+$/, ""))) {
    enchantment = Number(dot[1]);
    name = name.replace(/\.\d+$/, "");
  }
  const unique = /^[A-Z0-9_]+$/.test(name) ? name : name.toUpperCase().replace(/\s+/g, "_");
  return { uniqueName: unique, name, enchantment };
}

function add(map: Map<string, ChestItem>, item: ChestItem) {
  const prev = map.get(item.key);
  if (prev) {
    prev.quantity += item.quantity;
  } else {
    map.set(item.key, { ...item });
  }
}
