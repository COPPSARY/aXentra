/**
 * How one request field maps onto one database column in an update.
 *
 * - `dbKey` defaults to `payloadKey`.
 * - `includeMode: "defined"` (default) skips `undefined`; `"hasOwn"` copies any
 *   key present on the payload, including an explicit `undefined`.
 */
export interface UpdateMapping<P> {
  payloadKey: keyof P & string;
  dbKey?: string;
  includeMode?: "defined" | "hasOwn";
  transform?: (value: any, payload: P) => unknown;
}

const hasOwn = (obj: object | null | undefined, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj || {}, key);

export const applyMappedUpdates = <P extends object, T extends Record<string, unknown>>(
  payload: P,
  target: T,
  mappings: UpdateMapping<P>[] = []
): T => {
  for (const mapping of mappings) {
    const payloadKey = mapping.payloadKey;
    const dbKey = mapping.dbKey || payloadKey;
    const includeMode = mapping.includeMode || "defined";
    const transform = mapping.transform || ((value: unknown) => value);

    const shouldInclude = includeMode === "hasOwn"
      ? hasOwn(payload, payloadKey)
      : payload[payloadKey as keyof P] !== undefined;

    if (!shouldInclude) {
      continue;
    }

    (target as Record<string, unknown>)[dbKey] = transform(payload[payloadKey as keyof P], payload);
  }

  return target;
};
