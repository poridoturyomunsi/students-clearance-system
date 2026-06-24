export const simpleApiCache = new Map<string, { ts: number; ttl: number; data: any }>();

export function getCached(key: string) {
  const entry = simpleApiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    simpleApiCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(key: string, data: any, ttl = 60000) {
  simpleApiCache.set(key, { ts: Date.now(), ttl, data });
}
