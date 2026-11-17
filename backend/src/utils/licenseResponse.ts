/** A license as sent to a client that must not receive its key. */
export type WithoutLicenseKey<L> = Omit<L, "licenseKey">;

/**
 * Removes the license key from a license before it is sent to a client.
 *
 * A key is a secret, so it is returned only where a client asks for one
 * license by id (the detail page, which reveals and copies it) and in the
 * create and update responses to the person who just submitted it. Every
 * list, embedded or related-record response uses this instead, so one request
 * cannot collect the keys of every license in scope.
 *
 * Accepts a model instance or a plain object and returns a plain object.
 */
export function withoutLicenseKey<L extends { licenseKey?: unknown }>(
  license: L
): WithoutLicenseKey<L>;
export function withoutLicenseKey(license: null): null;
export function withoutLicenseKey<L extends { licenseKey?: unknown }>(
  license: L | null
): WithoutLicenseKey<L> | null;
export function withoutLicenseKey<L extends { licenseKey?: unknown }>(
  license: L | null
): WithoutLicenseKey<L> | null {
  if (!license) {
    return null;
  }

  const { licenseKey: _licenseKey, ...rest } = license;
  return rest;
}
