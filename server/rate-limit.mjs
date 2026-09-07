const buckets = new Map();
export function rateLimit(key, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  current.count += 1;
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}
setInterval(() => { const now = Date.now(); for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key); }, 60_000).unref();
