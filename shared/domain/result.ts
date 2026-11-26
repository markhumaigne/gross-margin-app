/** Outcome of a domain operation: a value, or a user-readable error message. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
