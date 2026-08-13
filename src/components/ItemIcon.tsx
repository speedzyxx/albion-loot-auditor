import { useEffect, useState } from "react";

export function itemIconCandidates(uniqueName: string, enchantment = 0): string[] {
  if (!uniqueName || uniqueName.startsWith("ITEM_")) {
    return [];
  }
  if (uniqueName === "SILVER") {
    return ["https://render.albiononline.com/v1/item/T1_SILVERBARS.png"];
  }
  const base = uniqueName.replace(/@\d+$/, "");
  const enc = enchantment > 0 ? enchantment : Number((uniqueName.match(/@(\d+)$/) || [])[1] || 0);
  const ids = enc > 0 ? [`${base}@${enc}`, base] : [base];
  return [...new Set(ids)].map((id) => `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png`);
}

export function ItemIcon({
  uniqueName,
  enchantment = 0,
  size = 40,
  label,
}: {
  uniqueName: string;
  enchantment?: number;
  size?: number;
  label?: string;
}) {
  const urls = itemIconCandidates(uniqueName, enchantment);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
  }, [uniqueName, enchantment]);
  const src = urls[idx];

  if (!src || idx >= urls.length) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded bg-ink-900 text-[9px] font-semibold uppercase text-slate-500"
        style={{ width: size, height: size }}
        title={label || uniqueName}
      >
        {(label || uniqueName || "?").slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={label || ""}
      width={size}
      height={size}
      className="shrink-0 rounded bg-ink-900 object-contain"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
