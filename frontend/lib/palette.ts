/** 穏やかなパステル配色。地（bg）と文字（ink）の組み合わせ、カレンダー等のバー色 */
export type Tone = "blue" | "pink" | "green" | "orange" | "teal" | "purple" | "red" | "gray";

export const BADGE: Record<Tone, string> = {
  blue: "bg-p-blue text-p-blue-ink",
  pink: "bg-p-pink text-p-pink-ink",
  green: "bg-p-green text-p-green-ink",
  orange: "bg-p-orange text-p-orange-ink",
  teal: "bg-p-teal text-p-teal-ink",
  purple: "bg-p-purple text-p-purple-ink",
  red: "bg-p-red text-p-red-ink",
  gray: "bg-p-gray text-p-gray-ink",
};

export const BAR: Record<Tone, string> = {
  blue: "var(--p-blue-bar)",
  pink: "var(--p-pink-bar)",
  green: "var(--p-green-bar)",
  orange: "var(--p-orange-bar)",
  teal: "var(--p-teal-bar)",
  purple: "var(--p-purple-bar)",
  red: "var(--p-red-bar)",
  gray: "var(--p-gray-bar)",
};

export const INK: Record<Tone, string> = {
  blue: "var(--p-blue-ink)",
  pink: "var(--p-pink-ink)",
  green: "var(--p-green-ink)",
  orange: "var(--p-orange-ink)",
  teal: "var(--p-teal-ink)",
  purple: "var(--p-purple-ink)",
  red: "var(--p-red-ink)",
  gray: "var(--p-gray-ink)",
};
