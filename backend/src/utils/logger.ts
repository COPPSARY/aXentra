type LogLevel = "info" | "warn" | "error";

const formatMeta = (meta: unknown): unknown => {
  if (!meta) return undefined;
  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
    };
  }
  return meta;
};

const writeLog = (level: LogLevel, message: string, meta?: unknown) => {
  const payload: { level: LogLevel; message: string; timestamp: string; meta?: unknown } = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  const formattedMeta = formatMeta(meta);
  if (formattedMeta !== undefined) {
    payload.meta = formattedMeta;
  }

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
};

export type Logger = typeof logger;

export const logger = {
  info(message: string, meta?: unknown) {
    writeLog("info", message, meta);
  },

  warn(message: string, meta?: unknown) {
    writeLog("warn", message, meta);
  },

  error(message: string, meta?: unknown) {
    writeLog("error", message, meta);
  },
};
