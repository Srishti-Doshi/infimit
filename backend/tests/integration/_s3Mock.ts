/**
 * In-memory stub for `@/config/s3` used by media integration tests.
 *
 * Tests assert on the FLOW (key shape, validator caps, DB writes), not on AWS
 * SDK internals — so we replace the module entirely with deterministic fakes.
 * `jest.mock('@/config/s3', () => require('./_s3Mock'))` at the top of each
 * media-touching test file rewires the import boundary.
 *
 * The fake captures every presigned URL handed out and every delete attempted,
 * so tests can assert on call sequences if they need to.
 */
import type { S3Client } from '@aws-sdk/client-s3';

interface IssuedPresign {
  key: string;
  contentType: string;
  ttl: number;
}

const issued: IssuedPresign[] = [];
const deleted: string[] = [];
const uploadedBytes = new Map<string, Buffer>();

export interface PresignedUpload {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export function getS3(): S3Client {
  // Tests never call .send() on the returned client — the wrappers below cover
  // every call site. Return a typed placeholder so consumers compile.
  return {} as S3Client;
}

export function resetS3ForTests(): void {
  issued.length = 0;
  deleted.length = 0;
  uploadedBytes.clear();
  nextDeleteError = null;
}

export async function presignUpload(
  key: string,
  contentType: string,
  ttlSec = 300,
): Promise<PresignedUpload> {
  issued.push({ key, contentType, ttl: ttlSec });
  return {
    uploadUrl: `https://mock-s3.test/${key}?sig=fake&Content-Type=${encodeURIComponent(contentType)}`,
    key,
    expiresIn: ttlSec,
  };
}

export function publicUrlFor(key: string): string {
  return `https://mock-cdn.test/${key}`;
}

let nextDeleteError: Error | null = null;

export async function deleteObject(key: string): Promise<void> {
  if (nextDeleteError) {
    const err = nextDeleteError;
    nextDeleteError = null;
    throw err;
  }
  deleted.push(key);
  uploadedBytes.delete(key);
}

/**
 * Test-only — make the NEXT `deleteObject` call throw the given error. Used
 * by sweeper tests to verify the "S3 transient error → still drop the
 * Mongo doc" path. Resets to a normal delete after one throw.
 */
export function __setNextDeleteError(err: Error): void {
  nextDeleteError = err;
}

/**
 * Range-GET shim. Returns the bytes registered via `__setUploadedBytes` for
 * this key, or zeros if none registered (which deliberately fails any non-
 * skipped magic check — explicit byte registration is the test API).
 */
export async function fetchObjectHead(key: string, bytes: number): Promise<Buffer> {
  const stored = uploadedBytes.get(key);
  if (!stored) {
    return Buffer.alloc(bytes);
  }
  return stored.subarray(0, bytes);
}

/**
 * Test-only — register the bytes the magic-byte verifier will see when the
 * service Range-GETs this key. Use this to simulate a successful upload of
 * a real PDF / JPEG / PNG matching the claimed MIME, or to simulate a
 * spoofed upload (e.g. claim PDF but stash JPEG bytes here to test the
 * mismatch rejection).
 */
export function __setUploadedBytes(key: string, bytes: Buffer): void {
  uploadedBytes.set(key, bytes);
}

/**
 * Mirror of `putObject` from the real module. Captures the bytes so the
 * article-PDF tests can assert "the cached PDF survived a second call" via
 * `objectExists` returning true on the same key.
 */
export async function putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
  uploadedBytes.set(key, body);
}

/**
 * Mirror of `objectExists` from the real module. Returns true when the key
 * has been written via `putObject` / `__setUploadedBytes`, false otherwise.
 */
export async function objectExists(key: string): Promise<boolean> {
  return uploadedBytes.has(key);
}

/**
 * Mirror of `presignDownload` from the real module. Returns a deterministic
 * `mock-s3.test` URL embedding the key so tests can assert on the 302
 * Location from the e-paper download endpoint.
 */
export async function presignDownload(key: string, ttlSec = 300): Promise<string> {
  issued.push({ key, contentType: 'application/octet-stream', ttl: ttlSec });
  return `https://mock-s3.test/${key}?sig=fake-get&Expires=${ttlSec}`;
}

/** Test-only — assert on issued presigns from the test body. */
export function __issuedPresigns(): readonly IssuedPresign[] {
  return issued;
}

/** Test-only — assert on which keys had deleteObject called. */
export function __deletedKeys(): readonly string[] {
  return deleted;
}
