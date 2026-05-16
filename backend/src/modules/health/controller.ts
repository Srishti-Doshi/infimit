/**
 * Health endpoints.
 *
 * Two probes per docs/11-devops.md §11.7:
 *
 *  /healthz  — liveness. Cheap, always 200 if process is up.
 *              Used by container orchestrators' liveness probe.
 *
 *  /readyz   — readiness. Pings Mongo and Redis. 200 only if both reachable.
 *              503 with details otherwise. Used by load balancers to gate traffic.
 *
 *  /version  — small JSON {name, version, env} useful for sanity checks.
 */
import type { Request, Response } from 'express';
import { pingMongo } from '@/config/db';
import { pingRedis } from '@/config/redis';
import { loadEnv } from '@/config/env';

const env = loadEnv();
const startedAt = Date.now();

interface VersionInfo {
  name: string;
  version: string;
  env: string;
  startedAt: string;
  uptimeSeconds: number;
}

const PKG_VERSION = process.env.npm_package_version ?? '0.1.0';

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok' });
}

export async function getReady(_req: Request, res: Response): Promise<void> {
  const [mongoOk, redisOk] = await Promise.all([pingMongo(), pingRedis()]);
  const allOk = mongoOk && redisOk;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'not_ready',
    checks: {
      mongo: mongoOk ? 'ok' : 'fail',
      redis: redisOk ? 'ok' : 'fail',
    },
  });
}

export function getVersion(_req: Request, res: Response): void {
  const info: VersionInfo = {
    name: env.SERVICE_NAME,
    version: PKG_VERSION,
    env: env.NODE_ENV,
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1_000),
  };
  res.status(200).json(info);
}
