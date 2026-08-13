export function formatSilver(value: number): string {
  const n = Math.round(value);
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}m`;
  }
  if (Math.abs(n) >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return n.toLocaleString("en-US");
}

export function formatFullSilver(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} silver`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function itemKey(uniqueName: string, name: string, enchantment: number): string {
  const base = (uniqueName || name || "unknown").trim().toUpperCase();
  const clean = base.replace(/@\d+$/, "").replace(/\.\d+$/, "");
  return `${clean}@${enchantment || 0}`;
}

export function displayItem(name: string, enchantment: number, quantity: number): string {
  const enc = enchantment > 0 ? `.${enchantment}` : "";
  return `${quantity}× ${name}${enc}`;
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
