type Level = "debug" | "info" | "warn" | "error"

const isProd = process.env.NODE_ENV === "production"

function emit(level: Level, msg: string, meta?: unknown): void {
  if (isProd && level === "debug") return
  const payload = meta === undefined ? { msg } : { msg, meta }
  const line = `[${level}] ${JSON.stringify(payload)}`
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit("debug", msg, meta),
  info: (msg: string, meta?: unknown) => emit("info", msg, meta),
  warn: (msg: string, meta?: unknown) => emit("warn", msg, meta),
  error: (msg: string, meta?: unknown) => emit("error", msg, meta)
}
