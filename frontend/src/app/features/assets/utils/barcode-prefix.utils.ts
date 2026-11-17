const BARCODE_PREFIX_STORAGE_KEY = 'axentra.asset-type.barcode-prefixes';
const BARCODE_PREFIX_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const BARCODE_PREFIX_MAX_LENGTH = 24;

export const DEFAULT_BARCODE_PREFIX = 'AXENTRA';

type BarcodePrefixMap = Record<string, string>;

export function normalizeBarcodePrefix(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BARCODE_PREFIX_MAX_LENGTH);
}

export function isValidBarcodePrefix(value: string): boolean {
  return value === '' || BARCODE_PREFIX_PATTERN.test(value);
}

export function getAssetTypeBarcodePrefix(
  assetTypeId: number | string | null | undefined,
): string {
  const normalizedAssetTypeId = normalizeAssetTypeId(assetTypeId);
  if (!normalizedAssetTypeId) {
    return DEFAULT_BARCODE_PREFIX;
  }

  try {
    const storedPrefixes = readStoredPrefixes();
    const storedPrefix = storedPrefixes[normalizedAssetTypeId];
    return storedPrefix || DEFAULT_BARCODE_PREFIX;
  } catch {
    return DEFAULT_BARCODE_PREFIX;
  }
}

export function setAssetTypeBarcodePrefix(
  assetTypeId: number | string,
  prefix: string,
): void {
  const normalizedAssetTypeId = normalizeAssetTypeId(assetTypeId);
  if (!normalizedAssetTypeId) {
    return;
  }

  const normalizedPrefix = normalizeBarcodePrefix(prefix);

  try {
    const storedPrefixes = readStoredPrefixes();

    if (
      !normalizedPrefix ||
      normalizedPrefix === DEFAULT_BARCODE_PREFIX
    ) {
      delete storedPrefixes[normalizedAssetTypeId];
    } else {
      storedPrefixes[normalizedAssetTypeId] = normalizedPrefix;
    }

    writeStoredPrefixes(storedPrefixes);
  } catch {
    // Keep barcode generation working even if localStorage is unavailable.
  }
}

export function buildGeneratedBarcode(
  prefix: string,
  assetTypeId: number | string,
  date: Date = new Date(),
): string {
  const resolvedPrefix =
    normalizeBarcodePrefix(prefix) || DEFAULT_BARCODE_PREFIX;
  const normalizedAssetTypeId = normalizeAssetTypeId(assetTypeId) || 'TYPE';
  const dateCode = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/-/g, '');
  const randomCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `${resolvedPrefix}-${normalizedAssetTypeId}-${dateCode}-${randomCode}`;
}

function normalizeAssetTypeId(
  assetTypeId: number | string | null | undefined,
): string {
  const numericAssetTypeId =
    typeof assetTypeId === 'number' ? assetTypeId : Number(assetTypeId);

  return Number.isInteger(numericAssetTypeId) && numericAssetTypeId > 0
    ? String(numericAssetTypeId)
    : '';
}

function readStoredPrefixes(): BarcodePrefixMap {
  if (typeof window === 'undefined') {
    return {};
  }

  const rawValue = window.localStorage.getItem(BARCODE_PREFIX_STORAGE_KEY);
  if (!rawValue) {
    return {};
  }

  const parsedValue = JSON.parse(rawValue) as unknown;
  if (!parsedValue || typeof parsedValue !== 'object') {
    return {};
  }

  const storedPrefixes: BarcodePrefixMap = {};
  for (const [assetTypeId, prefix] of Object.entries(parsedValue)) {
    if (typeof prefix !== 'string') {
      continue;
    }

    const normalizedPrefix = normalizeBarcodePrefix(prefix);
    if (normalizedPrefix && isValidBarcodePrefix(normalizedPrefix)) {
      storedPrefixes[assetTypeId] = normalizedPrefix;
    }
  }

  return storedPrefixes;
}

function writeStoredPrefixes(prefixes: BarcodePrefixMap): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (Object.keys(prefixes).length === 0) {
    window.localStorage.removeItem(BARCODE_PREFIX_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    BARCODE_PREFIX_STORAGE_KEY,
    JSON.stringify(prefixes),
  );
}
