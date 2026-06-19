/** Lightweight in-memory cache to avoid skeleton flashes on back-navigation. */
type Entry = { data: unknown; at: number };

const store = new Map<string, Entry>();

export function readRouteCache<T>(key: string, ttlMs = 60_000): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return hit.data as T;
}

export function isRouteCacheFresh(key: string, ttlMs = 60_000): boolean {
  const hit = store.get(key);
  if (!hit) return false;
  return Date.now() - hit.at <= ttlMs;
}

export function writeRouteCache<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

export function invalidateRouteCache(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}
