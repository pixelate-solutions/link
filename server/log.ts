/**
 * Structured logger. Never log access tokens, account numbers or raw
 * transaction payloads; `redact` scrubs the common shapes defensively.
 */
const SECRET = /(access-(sandbox|development|production)-[\w-]+|public-(sandbox|development|production)-[\w-]+|sk_(live|test)_\w+|v1\.[\w-]+\.[\w-]+\.[\w-]+)/g;

export function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(SECRET, "[redacted]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = /token|secret|password|authorization|cookie/i.test(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  if (process.env.LINK_TEST === "1" && level === "info") return;
  const line = JSON.stringify({ level, msg, ...(meta ? (redact(meta) as object) : {}), at: new Date().toISOString() });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, err?: unknown, meta?: Record<string, unknown>) =>
    emit("error", msg, { ...meta, error: err instanceof Error ? { name: err.name, message: err.message } : String(err) }),
};
