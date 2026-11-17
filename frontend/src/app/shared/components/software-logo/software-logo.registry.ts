import { SOFTWARE_LOGO_ENTRIES } from './software-logo.manifest';

/**
 * Resolves a software name to a bundled logo in `public/assets/software-logos/`.
 *
 * Entries come from the generated manifest (tools/software-logos/build.mjs):
 * longest brand titles first, so "Adobe Photoshop" wins over "Adobe", and the
 * broad Microsoft family rule last. First match wins; no match → the
 * component shows a letter tile.
 *
 * To add software, edit tools/software-logos/catalog.mjs and run
 * `node tools/software-logos/build.mjs` from the frontend folder.
 */
const SOFTWARE_LOGO_BASE_PATH = '/assets/software-logos/';

const cache = new Map<string, string | null>();

export function resolveSoftwareLogo(name: string | null | undefined): string | null {
  const normalized = name?.trim();
  if (!normalized) {
    return null;
  }

  const cached = cache.get(normalized);
  if (cached !== undefined) {
    return cached;
  }

  const match = SOFTWARE_LOGO_ENTRIES.find((entry) => entry.pattern.test(normalized));
  const url = match ? `${SOFTWARE_LOGO_BASE_PATH}${match.file}` : null;
  cache.set(normalized, url);
  return url;
}
