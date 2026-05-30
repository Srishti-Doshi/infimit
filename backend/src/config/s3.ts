/**
 * S3 client (AWS SDK v3) with lazy construction + presign helpers.
 *
 * The same code path serves dev (MinIO via docker-compose), test (mocked at
 * the module boundary — see tests/integration/_s3Mock.ts), and production
 * (real AWS S3). Selection happens entirely via env:
 *
 *   - dev:    `S3_ENDPOINT=http://localhost:9000`, `S3_FORCE_PATH_STYLE=true`,
 *             `S3_ACCESS_KEY=minioadmin`, `S3_SECRET_KEY=minioadmin`.
 *   - prod:   leave `S3_ENDPOINT` empty so the SDK uses the AWS default endpoint;
 *             `S3_FORCE_PATH_STYLE=false`; creds via the standard provider chain
 *             (IAM role / env / shared config).
 *
 * Lazy construction: `getS3()` builds the client on first call and caches it.
 * The module loads cheaply at boot — services that never touch media never pay
 * the SDK's startup cost.
 */
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { loadEnv } from './env';

let client: S3Client | null = null;

export function getS3(): S3Client {
  if (client) return client;
  const env = loadEnv();
  const cfg: S3ClientConfig = {
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
  // For real AWS S3, leave endpoint unset so the SDK picks the regional URL
  // automatically. For MinIO / LocalStack, force the endpoint.
  if (env.S3_ENDPOINT) {
    cfg.endpoint = env.S3_ENDPOINT;
  }
  // Static creds only when both halves are provided; otherwise let the SDK's
  // default credential chain handle IAM / env / shared config in production.
  if (env.S3_ACCESS_KEY && env.S3_SECRET_KEY) {
    cfg.credentials = {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    };
  }
  client = new S3Client(cfg);
  return client;
}

/**
 * For tests / graceful shutdown. The SDK's S3Client doesn't hold long-lived
 * connections, but explicit destroy is good hygiene.
 */
export function resetS3ForTests(): void {
  client?.destroy();
  client = null;
}

export interface PresignedUpload {
  /** Pre-signed PUT URL the client uploads the binary to. */
  uploadUrl: string;
  /** S3 object key the upload lands at. */
  key: string;
  /** Seconds until the URL expires. */
  expiresIn: number;
}

/**
 * Issue a presigned PUT URL. The client `PUT`s the binary directly to S3;
 * after success, it calls `/media/register` to record the metadata.
 *
 * The `contentType` is bound into the signature — uploads with a different
 * `Content-Type` header will be rejected by S3, defending against the FE
 * inflating an `image/jpeg` cap with a much larger `application/pdf`.
 */
export async function presignUpload(
  key: string,
  contentType: string,
  ttlSec?: number,
): Promise<PresignedUpload> {
  const env = loadEnv();
  const expiresIn = ttlSec ?? env.S3_PRESIGN_TTL_SEC;
  const s3 = getS3();
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn });
  return { uploadUrl, key, expiresIn };
}

/**
 * Resolve a key to its public-facing GET URL. In dev with MinIO this is the
 * direct path-style URL on localhost:9000; in production this points at the
 * CloudFront distribution in front of the bucket.
 */
export function publicUrlFor(key: string): string {
  const env = loadEnv();
  if (!env.S3_PUBLIC_BASE_URL) {
    throw new Error('S3_PUBLIC_BASE_URL not configured');
  }
  const base = env.S3_PUBLIC_BASE_URL.replace(/\/+$/, '');
  const path = key.replace(/^\/+/, '');
  return `${base}/${path}`;
}

/**
 * Delete an object from S3. Used by media DELETE to drop the binary after
 * the metadata doc is removed. Failures are swallowed by the caller — losing
 * an S3 object after the DB doc is gone is preferable to refusing the user's
 * request; orphaned objects can be GC'd by a sweeper later.
 */
export async function deleteObject(key: string): Promise<void> {
  const env = loadEnv();
  const s3 = getS3();
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
