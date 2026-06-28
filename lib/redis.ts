import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function acquireLock(key: string, ttlMs = 5000): Promise<boolean> {
  const result = await redis.set(key, "1", { nx: true, px: ttlMs });
  return result === "OK";
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(key);
}

export function stockLockKey(productId: string, warehouseId: string) {
  return `lock:stock:${productId}:${warehouseId}`;
}