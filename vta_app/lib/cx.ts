export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 select-none hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed active:translate-y-0 active:scale-[0.98]";
const BTN_VARIANT = {
  primary: "bg-forest-800 text-cream-50 hover:bg-forest-700 shadow-[0_1px_0_rgba(255,255,255,.12)_inset,0_6px_14px_-8px_rgba(19,61,43,.9)]",
  secondary: "bg-cream-50 text-forest-800 border border-cream-400 hover:bg-cream-200 hover:border-forest-300",
  ghost: "text-forest-800 hover:bg-forest-50",
  light: "bg-cream-50 text-forest-900 hover:bg-white",
  danger: "bg-danger-600 text-white hover:bg-[#8f3225]",
};
const BTN_SIZE = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-12 px-6 text-base" };

export function btnClass(variant: keyof typeof BTN_VARIANT = "primary", size: keyof typeof BTN_SIZE = "md", extra = "") {
  return cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], extra);
}
