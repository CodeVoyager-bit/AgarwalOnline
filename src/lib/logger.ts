const sensitive = /password|secret|token|signature|authorization|code/i;

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value instanceof Error)
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === "development" ? value.stack : undefined,
    };
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitive.test(key) ? "[redacted]" : clean(item),
    ]),
  );
}

export function log(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
) {
  const record = JSON.stringify({
    at: new Date().toISOString(),
    level,
    event,
    details: clean(details),
  });
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(`${record}\n`);
}
