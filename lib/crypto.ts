import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

export interface EncryptedKeypair {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function getKey(): Buffer {
  const b64 = process.env.KEYPAIR_ENCRYPTION_KEY;
  if (!b64) throw new Error("KEYPAIR_ENCRYPTION_KEY not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("KEYPAIR_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptKeypair(plaintext: string): EncryptedKeypair {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptKeypair(enc: EncryptedKeypair): string {
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
