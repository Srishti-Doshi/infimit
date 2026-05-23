import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

/**
 * Argon2id parameters per docs/10-security.md §10.3.
 *
 * The Argon2id algorithm is the recommended OWASP default (combines
 * memory-hardness against GPU attacks with side-channel resistance). The
 * parameter set matches OWASP's "modest" tier:
 *   - memoryCost 19 MiB (19456 KiB)
 *   - timeCost 2 iterations
 *   - parallelism 1 lane
 *
 * @node-rs/argon2's `algorithm: 2` is the integer constant for Argon2id.
 * Defaults would also pick Argon2id but the literal makes intent explicit.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  algorithm: 2,
} as const;

/**
 * Hash a plaintext password. The returned string includes the algorithm
 * identifier and parameters, so verification can read them back without
 * needing to know what settings were used at hash time.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return argon2Hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against a stored Argon2 hash.
 * Returns `false` on any failure (mismatched hash, malformed input, etc.)
 * rather than throwing — callers should treat the boolean as the only signal.
 */
export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2Verify(storedHash, plaintext);
  } catch {
    return false;
  }
}
