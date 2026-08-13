export function itemIconUrl(uniqueName: string, enchantment = 0): string | null {
  if (!uniqueName || uniqueName === "SILVER") {
    return "https://render.albiononline.com/v1/item/T1_SILVERBARS.png";
  }
  if (uniqueName.startsWith("ITEM_")) {
    return null;
  }
  const base = uniqueName.replace(/@\d+$/, "");
  const id = enchantment > 0 ? `${base}@${enchantment}` : uniqueName.includes("@") ? uniqueName : base;
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png`;
}

export function ItemIcon({
  uniqueName,
  enchantment = 0,
  size = 40,
}: {
  uniqueName: string;
  enchantment?: number;
  size?: number;
}) {
  const src = itemIconUrl(uniqueName, enchantment);
  if (!src) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded bg-ink-900 text-[10px] text-slate-500"
        style={{ width: size, height: size }}
      >
        ?
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded bg-ink-900 object-contain"
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
