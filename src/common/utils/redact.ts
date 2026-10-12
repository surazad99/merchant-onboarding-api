export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /pass(word)?|token|secret|authorization|api[-_]?key|tax[-_]?id|national[-_]?id|ssn|card|cvv|iban|account[-_]?number/i;

/** Deep-copies a value, replacing the value of any sensitive-looking key. Used for audit metadata and logs. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 8) return '[TRUNCATED]' as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Shows only the last 4 characters, e.g. "*******6789". */
export function maskTail(value: string, visible = 4): string {
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}
