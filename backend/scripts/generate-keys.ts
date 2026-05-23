/**
 * Generate RSA keypairs for RS256 JWT signing.
 *
 * Per docs/10-security.md §10.2, both access and refresh tokens are signed with
 * RS256 (asymmetric). This script emits four PEM files under `backend/keys/`:
 *
 *   keys/
 *     access-private.pem
 *     access-public.pem
 *     refresh-private.pem
 *     refresh-public.pem
 *
 * The `keys/` directory is gitignored. Each dev / CI environment runs this
 * script once on setup. Production keys come from a secrets manager and are
 * mounted as files at the same paths.
 *
 * Usage:
 *   npx tsx scripts/generate-keys.ts          # idempotent — skips existing keys
 *   npx tsx scripts/generate-keys.ts --force  # regenerate even if present
 *
 * SECURITY: regenerating keys invalidates every issued JWT. Only --force in
 * dev or when you intentionally want to rotate signing material.
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KEYS_DIR = join(__dirname, '..', 'keys');

const TARGETS = [
  { name: 'access', privateFile: 'access-private.pem', publicFile: 'access-public.pem' },
  { name: 'refresh', privateFile: 'refresh-private.pem', publicFile: 'refresh-public.pem' },
] as const;

const force = process.argv.includes('--force');

if (!existsSync(KEYS_DIR)) {
  mkdirSync(KEYS_DIR, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`created ${KEYS_DIR}`);
}

for (const target of TARGETS) {
  const privPath = join(KEYS_DIR, target.privateFile);
  const pubPath = join(KEYS_DIR, target.publicFile);
  const exists = existsSync(privPath) || existsSync(pubPath);

  if (exists && !force) {
    // eslint-disable-next-line no-console
    console.log(`skipped ${target.name}: keys already exist (use --force to regenerate)`);
    continue;
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // 0o600 on private = owner read/write only. Mode is ignored on Windows but
  // documents intent for any *nix dev/CI machine.
  writeFileSync(privPath, privateKey, { encoding: 'utf-8', mode: 0o600 });
  writeFileSync(pubPath, publicKey, { encoding: 'utf-8', mode: 0o644 });

  // eslint-disable-next-line no-console
  console.log(`generated ${target.name} keypair`);
  // eslint-disable-next-line no-console
  console.log(`  private: ${privPath}`);
  // eslint-disable-next-line no-console
  console.log(`  public:  ${pubPath}`);
}
