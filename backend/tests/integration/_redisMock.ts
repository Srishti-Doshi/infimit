/**
 * Minimal in-memory ioredis stub for integration tests.
 *
 * Implements ONLY the operations used by the auth module:
 *   - set(key, value, 'EX', seconds)
 *   - get(key)
 *   - exists(key)
 *   - del(key1, key2, ...)
 *   - incr(key)
 *   - expire(key, seconds)
 *   - ttl(key)
 *
 * TTLs are honoured: an expired key looks deleted on the next access. We don't
 * run a sweeper — lazy expiration is good enough for short-lived test runs.
 *
 * This mock replaces `@/config/redis` via `jest.mock(...)` in each integration
 * test file so production code paths stay untouched.
 */
interface Entry {
  value: string;
  /** ms-since-epoch absolute expiry, or null for no TTL. */
  expiresAt: number | null;
}

class InMemoryRedis {
  private readonly store = new Map<string, Entry>();

  private prune(key: string): Entry | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  async set(key: string, value: string, mode?: string, seconds?: number): Promise<'OK'> {
    let expiresAt: number | null = null;
    if (mode === 'EX' && typeof seconds === 'number') {
      expiresAt = Date.now() + seconds * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.prune(key)?.value ?? null;
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.reduce((acc, k) => (this.prune(k) ? acc + 1 : acc), 0);
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n += 1;
    }
    return n;
  }

  async incr(key: string): Promise<number> {
    const e = this.prune(key);
    const next = e ? Number(e.value) + 1 : 1;
    this.store.set(key, { value: String(next), expiresAt: e?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.prune(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const e = this.prune(key);
    if (!e) return -2;
    if (e.expiresAt === null) return -1;
    return Math.ceil((e.expiresAt - Date.now()) / 1000);
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  async quit(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }

  /** Test-only: wipe everything between cases. */
  flushAllSync(): void {
    this.store.clear();
  }
}

const singleton = new InMemoryRedis();

export function getRedis(): InMemoryRedis {
  return singleton;
}

export async function connectRedis(): Promise<InMemoryRedis> {
  return singleton;
}

export async function pingRedis(): Promise<boolean> {
  return true;
}

export async function disconnectRedis(): Promise<void> {
  singleton.flushAllSync();
}

/** Test-only helper exported for `beforeEach` resets. */
export function __resetRedisMock(): void {
  singleton.flushAllSync();
}
