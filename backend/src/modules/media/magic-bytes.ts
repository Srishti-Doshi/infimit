/**
 * Magic-byte (file signature) verification for media uploads.
 *
 * Defence-in-depth against MIME spoofing — a tampered FE can claim
 * `mimeType: 'application/pdf'` at presign to satisfy the cap-check, then
 * `PUT` arbitrary bytes (e.g. a renamed JPEG) to the presigned URL. The
 * register flow fetches the first 16 bytes via a Range GET and confirms
 * they match the claimed type's signature; mismatches reject the register
 * call and the orphan S3 object is deleted.
 *
 * Signatures sourced from https://www.garykessler.net/library/file_sigs.html.
 * Wildcard slots (`null`) tolerate format-internal variations like the
 * 4-byte file-size field embedded in WebP's RIFF header.
 *
 * Out of scope: text-based formats (SVG, plain text) — they have no fixed
 * binary prefix. `verifyMagic` returns `{ ok: true, skipped: true }` for
 * any MIME not in the signature table; callers can use that signal to
 * fall back to a textual validation pass if needed.
 */

interface MagicSignature {
  readonly bytes: ReadonlyArray<number | null>;
  readonly name: string;
}

const SIGNATURES: Record<string, ReadonlyArray<MagicSignature>> = {
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], name: 'PDF (%PDF-)' }],
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff], name: 'JPEG (FF D8 FF)' }],
  'image/png': [
    {
      bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      name: 'PNG (89 50 4E 47 0D 0A 1A 0A)',
    },
  ],
  'image/webp': [
    {
      bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
      name: 'WebP (RIFF....WEBP)',
    },
  ],
  'image/gif': [
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], name: 'GIF87a' },
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], name: 'GIF89a' },
  ],
};

/**
 * Number of bytes the register flow asks S3 for. Sized to fit the longest
 * signature in the table (WebP's 12-byte prefix) with headroom — padded to
 * 16 so future additions don't require Range-size tuning.
 */
export const MAGIC_BYTES_HEAD_SIZE = 16;

export type VerifyResult = { ok: true; skipped?: boolean } | { ok: false; expected: string };

/**
 * Verify that `head` (the first bytes of an uploaded file) matches at
 * least one signature registered for `mimeType`.
 *
 * - `{ ok: true }` — bytes match a known signature.
 * - `{ ok: true, skipped: true }` — `mimeType` has no signature entry;
 *   caller decides whether to allow (e.g. SVG) or reject.
 * - `{ ok: false, expected: '...' }` — bytes don't match any registered
 *   signature; caller should reject the upload.
 */
export function verifyMagic(mimeType: string, head: Buffer): VerifyResult {
  const sigs = SIGNATURES[mimeType];
  if (!sigs) return { ok: true, skipped: true };
  for (const sig of sigs) {
    if (matchesSignature(head, sig.bytes)) {
      return { ok: true };
    }
  }
  return { ok: false, expected: sigs.map((s) => s.name).join(' or ') };
}

function matchesSignature(buf: Buffer, sig: ReadonlyArray<number | null>): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    const expected = sig[i];
    if (expected === null) continue;
    if (buf[i] !== expected) return false;
  }
  return true;
}
