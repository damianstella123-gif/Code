const store = new Map<string, { data: any; ts: number }>()
const TTL = 30000

export function getCached<T>(key: string): T | null {
  const entry = store.get(key)
  if (entry && Date.now() - entry.ts < TTL) return entry.data as T
  return null
}

export function setCache(key: string, data: any): void {
  store.set(key, { data, ts: Date.now() })
}

export function invalidateCache(key: string): void {
  store.delete(key)
}

export function invalidateCachePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
