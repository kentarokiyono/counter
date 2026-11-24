"use client";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  ariaLabel?: string;
  className?: string;
  size?: "sm" | "md";
}

/** iOS のセグメントコントロール */
export default function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
  size = "md",
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex rounded-[9px] bg-fill p-[2px] ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-w-0 flex-1 whitespace-nowrap rounded-[7px] px-3 font-medium transition-all ${
              size === "sm" ? "py-1 text-[13px]" : "py-1.5 text-[14px]"
            } ${
              active
                ? "bg-card text-label shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-[#636366]"
                : "text-label hover:opacity-70"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
