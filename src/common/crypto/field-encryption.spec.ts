import { decryptField, encryptField } from './field-encryption';

describe('field-level encryption (AES-256-GCM)', () => {
  const original = process.env.FIELD_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);
  });
  afterAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = original;
  });

  it('round-trips and never stores plaintext', () => {
    const cipher = encryptField('123-45-6789');
    expect(cipher.startsWith('v1:')).toBe(true);
    expect(cipher).not.toContain('123-45-6789');
    expect(decryptField(cipher)).toBe('123-45-6789');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptField('same')).not.toEqual(encryptField('same'));
  });

  it('detects tampering', () => {
    const parts = encryptField('secret').split(':');
    parts[3] = Buffer.from('tampered!').toString('base64');
    expect(() => decryptField(parts.join(':'))).toThrow();
  });

  it('rejects a missing/invalid key', () => {
    process.env.FIELD_ENCRYPTION_KEY = 'short';
    expect(() => encryptField('x')).toThrow(/FIELD_ENCRYPTION_KEY/);
    process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);
  });
});
