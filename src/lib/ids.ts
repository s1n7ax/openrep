/**
 * A new random id for a user-created record (plan, day, set, …): 16 lowercase
 * hex characters (64 random bits). Works outside secure contexts, unlike
 * `crypto.randomUUID()`.
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The current time as an ISO 8601 UTC timestamp, the format user data stores. */
export function nowIso(): string {
  return new Date().toISOString();
}
