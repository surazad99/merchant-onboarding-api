import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ValueTransformer } from 'typeorm';

/**
 * Field-level encryption (AES-256-GCM) for sensitive columns such as the owner tax ID.
 * Stored format: v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 * The "v1" prefix allows key rotation / algorithm changes later.
 */
const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptField(payload: string): string {
  const [version, iv, tag, data] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error('Unsupported encrypted field format');
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Note: ciphertext is randomised (random IV), so encrypted columns cannot be searched by equality. */
export const encryptedTransformer: ValueTransformer = {
  to: (value?: string | null) => (value == null ? value : encryptField(value)),
  from: (value?: string | null) => (value == null ? value : decryptField(value)),
};
