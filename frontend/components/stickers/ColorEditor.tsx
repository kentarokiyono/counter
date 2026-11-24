"use client";

import { ALL_COLORS, COLOR_HEX, COLOR_NAME, ColorKey, StickerColor } from "@/lib/stickersApi";

export function Swatch({ color, size = 16 }: { color: ColorKey; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-1 ring-black/10"
      style={{ width: size, height: size, background: COLOR_HEX[color] }}
    />
  );
}

/**
 * 集計に使う色と、その意味（例: 赤 = 10代）の編集。
 * locked の色（数が入っている色）は外せない。
 */
export default function ColorEditor({
  value,
  onChange,
  locked = [],
}: {
  value: StickerColor[];
  onChange: (v: StickerColor[]) => void;
  locked?: ColorKey[];
}) {
  const unused = ALL_COLORS.filter((k) => !value.some((c) => c.key === k));
  const update = (key: ColorKey, label: string) => onChange(value.map((c) => (c.key === key ? { ...c, label } : c)));

  return (
    <div className="space-y-2">
      <ul className="overflow-hidden rounded-xl bg-card [&>*+*]:border-t [&>*+*]:border-separator">
        {value.map((c) => (
          <li key={c.key} className="flex items-center gap-3 px-4 py-2">
            <Swatch color={c.key} size={20} />
            <input
              value={c.label}
              onChange={(e) => update(c.key, e.target.value)}
              maxLength={20}
              aria-label={`${COLOR_NAME[c.key]}の意味`}
              placeholder={COLOR_NAME[c.key]}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-hidden placeholder:text-label-3"
            />
            <button
              type="button"
              className="text-[15px] text-danger disabled:opacity-30"
              disabled={value.length <= 1 || locked.includes(c.key)}
              onClick={() => onChange(value.filter((x) => x.key !== c.key))}
              aria-label={`${COLOR_NAME[c.key]}を外す`}
            >
              外す
            </button>
          </li>
        ))}
      </ul>
      {unused.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[13px] text-label-2">追加:</span>
          {unused.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange([...value, { key: k, label: COLOR_NAME[k] }])}
              className="flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[13px] active:opacity-70"
            >
              <Swatch color={k} size={12} />
              {COLOR_NAME[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
