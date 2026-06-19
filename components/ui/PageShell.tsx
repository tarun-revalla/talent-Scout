import { cn } from "@/lib/cn";

/** Page content wrapper — Nav and transitions live in AppLayoutClient (root layout). */
export function PageShell({
  children,
  className,
  mainClassName,
  narrow = false,
}: {
  children: React.ReactNode;
  className?: string;
  mainClassName?: string;
  narrow?: boolean;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12",
        narrow ? "max-w-7xl" : "max-w-content",
        mainClassName,
        className,
      )}
    >
      {children}
    </main>
  );
}
