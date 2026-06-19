import { cn } from "@/lib/cn";

const variants = {
  default: "border-slate-200 text-slate-500 hover:bg-white hover:text-slate-900 hover:border-slate-300",
  brand: "border-cobalt-200 text-cobalt-700 bg-cobalt-50 hover:bg-cobalt-100",
  ghost: "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900",
} as const;

export function IconButton({
  children,
  className,
  variant = "default",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center border transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-500/40 focus-visible:ring-offset-2",
        "disabled:opacity-40 disabled:pointer-events-none",
        "active:scale-95",
        sizeClass,
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
