/**
 * Re-mounts on navigation — triggers a lightweight CSS fade without blocking
 * the next page (unlike AnimatePresence mode="wait").
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
