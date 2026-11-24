"use client";

/** iOS 風の ON/OFF スイッチ */
export default function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-(--switch-on)" : "bg-fill-strong"
      }`}
    >
      <span
        className={`inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}
