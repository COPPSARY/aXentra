const formatMeta = (meta) => {
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

const writeLog = (level, message, meta) => {
  const payload = {
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

export const logger = {
  info(message, meta) {
    writeLog("info", message, meta);
  },

  warn(message, meta) {
    writeLog("warn", message, meta);
  },

  error(message, meta) {
    writeLog("error", message, meta);
  },
};
