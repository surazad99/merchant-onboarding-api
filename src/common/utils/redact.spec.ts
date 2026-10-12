import { maskTail, REDACTED, redact } from './redact';

describe('redact', () => {
  it('redacts sensitive keys at any depth, including inside arrays', () => {
    const out = redact({
      ok: 'visible',
      password: 'hunter2',
      nested: { accessToken: 'abc', ownerTaxId: '123-45-6789', list: [{ apiKey: 'k', keep: 1 }] },
      Authorization: 'Bearer x',
    });
    expect(out).toEqual({
      ok: 'visible',
      password: REDACTED,
      nested: { accessToken: REDACTED, ownerTaxId: REDACTED, list: [{ apiKey: REDACTED, keep: 1 }] },
      Authorization: REDACTED,
    });
  });

  it('does not mutate its input', () => {
    const input = { password: 'x' };
    redact(input);
    expect(input.password).toBe('x');
  });

  it('maskTail keeps only the last 4 characters', () => {
    expect(maskTail('123-45-6789')).toBe('*******6789');
    expect(maskTail('abc')).toBe('***');
  });
});
