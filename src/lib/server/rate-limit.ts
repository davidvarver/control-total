const buckets = new Map<string, { count: number; resetAt: number }>();
const maxBuckets = 10_000;
let lastSweepAt = 0;

export function hitRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweepExpiredBuckets(now);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= maxBuckets) {
      dropOldestBucket();
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function sweepExpiredBuckets(now: number) {
  if (now - lastSweepAt < 60_000) {
    return;
  }

  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function dropOldestBucket() {
  const oldestKey = buckets.keys().next().value as string | undefined;
  if (oldestKey) {
    buckets.delete(oldestKey);
  }
}
