type Level = "debug" | "info" | "warn" | "error";

function fmt(level: Level, obj: unknown, msg?: string): [string, unknown[]] {
  const ts = new Date().toISOString();
  const tag = `[${ts}] ${level.toUpperCase()}`;
  if (typeof obj === "string") return [`${tag} ${obj}`, []];
  return [`${tag} ${msg ?? ""}`, [obj]];
}

function emit(level: Level, a: unknown, b?: string) {
  const [m, extras] = fmt(level, a, b);
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(m, ...extras);
}

export const log = {
  debug: (a: unknown, b?: string) => emit("debug", a, b),
  info: (a: unknown, b?: string) => emit("info", a, b),
  warn: (a: unknown, b?: string) => emit("warn", a, b),
  error: (a: unknown, b?: string) => emit("error", a, b),
};
