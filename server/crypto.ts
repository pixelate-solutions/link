import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM envelope for secrets at rest (Plaid access tokens).
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url). The key comes from
 * LINK_ENCRYPTION_KEY (32 bytes, base64) and never touches the database.
 */
function key(): Buffer {
  const raw = process.env.LINK_ENCRYPTION_KEY;
  if (!raw) throw new Error("LINK_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("LINK_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encryptSecret(plaintext: string, aad = "link"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(envelope: string, aad = "link"): string {
  const [v, iv, tag, ct] = envelope.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized secret envelope");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function sign(value: string): string {
  return `${value}.${createHmac("sha256", key()).update(value).digest("base64url")}`;
}

export function unsign(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value).slice(i + 1));
  const actual = Buffer.from(signed.slice(i + 1));
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : null;
}
