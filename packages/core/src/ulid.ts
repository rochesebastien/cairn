import { decodeTime, ulid as generate } from "ulid";

/**
 * Crockford base32 alphabet minus I, L, O and U, as used by ULID.
 * The first character encodes the high bits of the 48-bit timestamp and can
 * therefore never exceed '7'.
 */
export const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** Generate a new ULID (26 chars, uppercase Crockford base32). */
export function newUlid(seedTime?: number): string {
  return generate(seedTime);
}

/** True when `value` is a syntactically valid, canonical (uppercase) ULID. */
export function isUlid(value: unknown): value is string {
  return typeof value === "string" && ULID_PATTERN.test(value);
}

/**
 * Uppercase + trim a user-supplied ULID so that `cairn amend 01hz...` works
 * from a shell that lowercased the argument. Returns the input untouched when
 * it is not a string.
 */
export function normalizeUlid(value: string): string {
  return value.trim().toUpperCase();
}

/** Milliseconds since epoch encoded in the ULID. Throws when malformed. */
export function ulidTime(value: string): number {
  assertUlid(value);
  return decodeTime(value);
}

export function assertUlid(value: unknown, label = "id"): asserts value is string {
  if (!isUlid(value)) {
    throw new TypeError(`Invalid ULID for ${label}: ${String(value)}`);
  }
}
