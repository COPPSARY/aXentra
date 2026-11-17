const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

export const applyMappedUpdates = (payload, target, mappings = []) => {
  for (const mapping of mappings) {
    const payloadKey = mapping.payloadKey;
    const dbKey = mapping.dbKey || payloadKey;
    const includeMode = mapping.includeMode || "defined";
    const transform = mapping.transform || ((value) => value);

    const shouldInclude = includeMode === "hasOwn"
      ? hasOwn(payload, payloadKey)
      : payload[payloadKey] !== undefined;

    if (!shouldInclude) {
      continue;
    }

    target[dbKey] = transform(payload[payloadKey], payload);
  }

  return target;
};
