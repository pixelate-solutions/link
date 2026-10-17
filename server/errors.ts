/**
 * Errors shown to users, the model, or MCP clients. Messages we throw on purpose
 * are already user-facing; anything from the database or a library is replaced,
 * so SQL, parameters and ids never leak.
 */
export class UserFacingError extends Error {}

export function publicError(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (!(err instanceof Error)) return fallback;
  const e = err as Error & { code?: unknown; cause?: unknown; query?: unknown };
  if (e.code || e.cause || e.query || /failed query|violates|syntax|relation|column|duplicate key|invalid input/i.test(e.message)) return fallback;
  return e.message.slice(0, 200);
}
