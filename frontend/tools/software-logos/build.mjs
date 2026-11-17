#!/usr/bin/env node
/**
 * Builds the software logo set used by <app-software-logo>.
 *
 *   node tools/software-logos/build.mjs
 *
 * - Reads the curated list in ./catalog.mjs.
 * - Pulls each icon from the Simple Icons package (CC0) at a pinned version.
 * - Skips icons that are wide wordmarks (unreadable in a square tile) and
 *   icons that carry a non-CC0 licence.
 * - Rebuilds every SVG from its path data only (no scripts, no external refs),
 *   filled with the brand colour (very light brand colours fall back to grey
 *   so the mark stays visible on a white tile).
 * - Writes public/assets/software-logos/*.svg and the generated manifest
 *   src/app/shared/components/software-logo/software-logo.manifest.ts
 *
 * To add software: add a title (and optional extra match patterns) to
 * catalog.mjs and rerun. Titles not found are reported and simply fall back
 * to the letter tile in the UI.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATALOG,
  CUSTOM_LOGOS,
  LOGOS_VERSION,
  MANUAL_LOGOS,
  SIMPLE_ICONS_VERSION,
} from './catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '../..');
const outputDir = path.join(frontendRoot, 'public/assets/software-logos');
const manifestFile = path.join(
  frontendRoot,
  'src/app/shared/components/software-logo/software-logo.manifest.ts',
);
const cdnBase = `https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}`;

/** Wordmarks are scaled to 24 wide, so their height span is small. */
const MIN_MARK_HEIGHT = 13;
/** Logos-set icons wider than this ratio are wordmarks. */
const MAX_LOGO_ASPECT = 1.4;
/** Brand colours lighter than this become a neutral dark grey. */
const MAX_FILL_LUMINANCE = 0.6;
const FALLBACK_FILL = '#374151';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Same rule Simple Icons uses to turn a title into a file slug. */
function titleToSlug(title) {
  const replacements = {
    '+': 'plus', '.': 'dot', '&': 'and', 'đ': 'd', 'ħ': 'h', 'ı': 'i',
    'ĸ': 'k', 'ŀ': 'l', 'ł': 'l', 'ß': 'ss', 'ŧ': 't', 'ø': 'o',
  };
  return title
    .toLowerCase()
    .replace(/[+.&đħıĸŀłßŧø]/g, (char) => replacements[char])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\d]/g, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive pattern source for a product title. */
function titlePattern(title) {
  const body = escapeRegExp(title.trim()).replace(/\s+/g, '\\s*');
  const start = /^\w/.test(title) ? '\\b' : '';
  const end = /\w$/.test(title) ? '\\b' : '(?!\\w)';
  return `${start}${body}${end}`;
}

function relativeLuminance(hex) {
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Approximate vertical extent of an SVG path (control points included).
 * Good enough to tell a square mark from a long, flat wordmark.
 */
function pathHeightSpan(d) {
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  const track = (py) => {
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  };
  const skipSeparators = () => {
    while (index < d.length && /[\s,]/.test(d[index])) {
      index++;
    }
  };
  const readNumber = () => {
    skipSeparators();
    const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(d.slice(index));
    if (!match) {
      return NaN;
    }
    index += match[0].length;
    return Number(match[0]);
  };
  // Arc flags are a single 0/1 and may be packed together ("0 01-.2.4").
  const readFlag = () => {
    skipSeparators();
    const char = d[index];
    if (char !== '0' && char !== '1') {
      return NaN;
    }
    index++;
    return Number(char);
  };
  const counts = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

  while (true) {
    skipSeparators();
    if (index >= d.length) {
      break;
    }
    if (/[a-zA-Z]/.test(d[index])) {
      command = d[index++];
    } else if (!command) {
      break;
    }
    const lower = command.toLowerCase();
    const relative = command === lower;
    if (lower === 'z') {
      x = startX;
      y = startY;
      continue;
    }
    if (!(lower in counts)) {
      break;
    }
    const values = Array.from({ length: counts[lower] }, (_, position) =>
      lower === 'a' && (position === 3 || position === 4) ? readFlag() : readNumber(),
    );
    if (values.some(Number.isNaN)) {
      break;
    }

    switch (lower) {
      case 'h':
        x = relative ? x + values[0] : values[0];
        break;
      case 'v':
        y = relative ? y + values[0] : values[0];
        track(y);
        break;
      case 'a': {
        const ny = relative ? y + values[6] : values[6];
        track(ny);
        track(ny - values[1]);
        track(ny + values[1]);
        x = relative ? x + values[5] : values[5];
        y = ny;
        break;
      }
      default: {
        for (let pair = 1; pair < values.length; pair += 2) {
          track(relative ? y + values[pair] : values[pair]);
        }
        x = relative ? x + values[values.length - 2] : values[values.length - 2];
        y = relative ? y + values[values.length - 1] : values[values.length - 1];
      }
    }
    if (lower === 'm') {
      startX = x;
      startY = y;
      command = relative ? 'l' : 'L';
    }
  }

  return Number.isFinite(minY) ? Math.min(maxY, 24) - Math.max(minY, 0) : 0;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return response.text();
}

async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await task(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const dataText = await fetchText(`${cdnBase}/_data/simple-icons.json`);
if (!dataText) {
  throw new Error(`Unable to load Simple Icons ${SIMPLE_ICONS_VERSION} data.`);
}
const data = JSON.parse(dataText);
const icons = Array.isArray(data) ? data : data.icons;
const byTitle = new Map(icons.map((icon) => [icon.title.toLowerCase(), icon]));

// Second source: gilbarbara/logos (CC0-1.0), full-colour marks. Used when
// Simple Icons only has a wordmark, lacks the brand, or isn't CC0.
const logosText = await fetchText(
  `https://cdn.jsdelivr.net/npm/@iconify-json/logos@${LOGOS_VERSION}/icons.json`,
);
if (!logosText) {
  throw new Error(`Unable to load @iconify-json/logos ${LOGOS_VERSION}.`);
}
const logosSet = JSON.parse(logosText);

/** Square-ish full-colour mark from the logos set, or a reason it can't be used. */
function fromLogosSet(name) {
  const icon = logosSet.icons[name];
  if (!icon) {
    return { reason: 'missing' };
  }
  const width = icon.width ?? logosSet.width ?? 16;
  const height = icon.height ?? logosSet.height ?? 16;
  if (Math.max(width, height) / Math.min(width, height) > MAX_LOGO_ASPECT) {
    return { reason: 'wordmark' };
  }
  const hasExternalReference = [...icon.body.matchAll(/href="([^"]*)"/g)].some(
    ([, target]) => !target.startsWith('#'),
  );
  if (/<(script|image|foreignObject|iframe|style)\b|\son\w+=/i.test(icon.body) || hasExternalReference) {
    return { reason: 'unsafe' };
  }
  return {
    content: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${width} ${height}">${icon.body}</svg>\n`,
  };
}

const report = { added: [], fromLogos: [], missing: [], wordmark: [], licensed: [] };

/** Tries Simple Icons; returns the built entry or the reason it was rejected. */
async function fromSimpleIcons(entry) {
  const icon = byTitle.get(entry.title.toLowerCase());
  if (!icon) {
    return { reason: 'missing' };
  }
  if (icon.license && icon.license.type !== 'CC0-1.0') {
    return { reason: 'licensed', detail: icon.license.type };
  }

  const slug = icon.slug ?? titleToSlug(icon.title);
  const svg = await fetchText(`${cdnBase}/icons/${slug}.svg`);
  const pathData = svg?.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
  if (!pathData || !/^[\sMmLlHhVvCcSsQqTtAaZz\d.,eE+-]+$/.test(pathData)) {
    return { reason: 'missing' };
  }
  if (pathHeightSpan(pathData) < MIN_MARK_HEIGHT) {
    return { reason: 'wordmark' };
  }

  const fill =
    relativeLuminance(icon.hex) > MAX_FILL_LUMINANCE ? FALLBACK_FILL : `#${icon.hex}`;
  return {
    title: icon.title,
    file: `${slug}.svg`,
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="${pathData}"/></svg>\n`,
  };
}

const built = await mapWithConcurrency(CATALOG, 8, async (entry) => {
  const patterns = [titlePattern(entry.title), ...(entry.match ?? [])];
  const simple = await fromSimpleIcons(entry);
  if (simple.content) {
    report.added.push(entry.title);
    return { ...simple, patterns };
  }

  if (entry.logos) {
    const logo = fromLogosSet(entry.logos);
    if (logo.content) {
      report.fromLogos.push(entry.title);
      return {
        title: entry.title,
        file: `${titleToSlug(entry.title)}.svg`,
        content: logo.content,
        patterns,
      };
    }
  }

  if (simple.reason === 'licensed') {
    report.licensed.push(`${entry.title} (${simple.detail})`);
  } else if (simple.reason === 'wordmark') {
    report.wordmark.push(entry.title);
  } else {
    report.missing.push(entry.title);
  }
  return null;
});

const entries = built.filter(Boolean);

// Official files you add yourself (e.g. from a vendor's press kit).
const manualLogos = [];
for (const manual of MANUAL_LOGOS) {
  try {
    const content = await readFile(path.join(here, 'manual', manual.file), 'utf8');
    if (/<script\b|\son\w+=/i.test(content)) {
      console.warn(`Ignored manual/${manual.file}: contains script content.`);
      continue;
    }
    manualLogos.push({ ...manual, content });
  } catch {
    report.missing.push(`${manual.title} (add tools/software-logos/manual/${manual.file})`);
  }
}

await mkdir(outputDir, { recursive: true });
for (const existing of await readdir(outputDir)) {
  if (existing.endsWith('.svg')) {
    await rm(path.join(outputDir, existing));
  }
}
for (const entry of entries) {
  await writeFile(path.join(outputDir, entry.file), entry.content);
}
for (const custom of [...CUSTOM_LOGOS, ...manualLogos]) {
  await writeFile(path.join(outputDir, custom.file), custom.content);
}

// Longest titles first so "Adobe Photoshop" wins over "Adobe", and custom
// vendor-family rules (e.g. Microsoft) go last as the broadest catch-alls.
const manifest = [
  ...entries
    .sort((left, right) => right.title.length - left.title.length)
    .map(({ title, file, patterns }) => ({ title, file, patterns })),
  ...manualLogos.map(({ title, file, patterns }) => ({ title, file, patterns })),
  ...CUSTOM_LOGOS.map(({ title, file, patterns }) => ({ title, file, patterns })),
];

const manifestSource = `// GENERATED by tools/software-logos/build.mjs — do not edit by hand.
// Icons: Simple Icons ${SIMPLE_ICONS_VERSION} and gilbarbara/logos ${LOGOS_VERSION} (both CC0-1.0),
// plus manual vendor files and custom marks.
// Trademarks belong to their owners; logos are used only to identify products.

export interface SoftwareLogoEntry {
  title: string;
  file: string;
  pattern: RegExp;
}

export const SOFTWARE_LOGO_ENTRIES: readonly SoftwareLogoEntry[] = [
${manifest
  .map(
    (entry) =>
      `  { title: ${JSON.stringify(entry.title)}, file: ${JSON.stringify(entry.file)}, pattern: /${entry.patterns
        .map((pattern) => `(?:${pattern})`)
        .join('|')
        .replace(/\//g, '\\/')}/i },`,
  )
  .join('\n')}
];
`;

await writeFile(manifestFile, manifestSource);

console.log(`Added ${report.added.length} Simple Icons + ${report.fromLogos.length} from the logos set (${report.fromLogos.sort().join(', ')}) + ${manualLogos.length} manual + ${CUSTOM_LOGOS.length} custom.`);
if (report.wordmark.length) {
  console.log(`Skipped, wordmark only (${report.wordmark.length}): ${report.wordmark.sort().join(', ')}`);
}
if (report.licensed.length) {
  console.log(`Skipped, non-CC0 licence (${report.licensed.length}): ${report.licensed.sort().join(', ')}`);
}
if (report.missing.length) {
  console.log(`Not in Simple Icons ${SIMPLE_ICONS_VERSION} (${report.missing.length}): ${report.missing.sort().join(', ')}`);
}
