import { BrowserQRCodeSvgWriter } from '@zxing/browser';
import { EncodeHintType } from '@zxing/library';
import JsBarcode from 'jsbarcode';

import {
  AssetLabelItem,
  AssetLabelTemplate,
} from '../models/asset-label.models';

export const ASSET_LABEL_RENDER_CSS = `
  .asset-label-render {
    box-sizing: border-box;
    overflow: hidden;
    border: .25mm solid #111;
    background: #fff;
    color: #000;
    font-family: Arial, sans-serif;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .asset-label-standard {
    display: grid;
    width: 70mm;
    height: 30mm;
    grid-template-columns: minmax(0, 1fr) 18mm;
    grid-template-rows: minmax(0, 1fr) 8mm;
    gap: 1mm 2mm;
    padding: 2mm;
  }
  .asset-label-compact {
    display: grid;
    width: 38mm;
    height: 30mm;
    border: 0;
    place-items: center;
    padding: 0;
  }
  .asset-label-legacy {
    display: block;
    width: 38mm;
    height: 20mm;
    padding: .75mm;
  }
  .asset-label-brand-block {
    min-width: 0;
    overflow: hidden;
  }
  .asset-label-logo {
    display: block;
    width: auto;
    max-width: 15mm;
    font-size: 2.6mm;
    font-weight: 700;
    line-height: 3.1mm;
    white-space: nowrap;
  }
  .asset-label-name {
    max-width: 100%;
    margin-top: 1mm;
    overflow: hidden;
    font-size: 7pt;
    font-weight: 600;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .asset-label-eyebrow {
    margin-top: .8mm;
    color: #333;
    font-size: 5pt;
    font-weight: 700;
    letter-spacing: .03em;
    text-transform: uppercase;
  }
  .asset-label-tag {
    max-width: 100%;
    margin-top: .3mm;
    overflow: hidden;
    font: 700 6.25pt/1 Consolas, "Courier New", monospace;
    letter-spacing: -.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .asset-label-hint {
    margin-top: 1mm;
    color: #333;
    font-size: 5.5pt;
    font-weight: 600;
  }
  .asset-label-qr,
  .asset-label-barcode {
    display: grid;
    min-width: 0;
    place-items: center;
    background: #fff;
  }
  .asset-label-qr svg,
  .asset-label-barcode svg {
    display: block;
    max-width: 100%;
    max-height: 100%;
  }
  .asset-label-standard .asset-label-qr {
    width: 17mm;
    height: 17mm;
    justify-self: end;
  }
  .asset-label-standard .asset-label-qr svg,
  .asset-label-compact .asset-label-qr svg {
    width: 100%;
    height: 100%;
  }
  .asset-label-standard .asset-label-barcode {
    grid-column: 1 / -1;
  }
  .asset-label-standard .asset-label-barcode svg {
    width: 100%;
    height: 8mm;
  }
  .asset-label-compact .asset-label-qr {
    width: 30mm;
    height: 30mm;
  }
  .asset-label-legacy .asset-label-barcode {
    width: 100%;
    height: 100%;
  }
  .asset-label-legacy .asset-label-barcode svg {
    width: 100%;
    height: 100%;
  }
`;

const ASSET_LABEL_DIMENSIONS: Record<
  AssetLabelTemplate,
  { widthMm: number; heightMm: number }
> = {
  standard: { widthMm: 70, heightMm: 30 },
  compact: { widthMm: 38, heightMm: 30 },
  legacy: { widthMm: 38, heightMm: 20 },
};

export type AssetLabelScanResult =
  | {
      kind: 'barcode';
      barcode: string;
      source: 'raw' | 'trusted-url';
    }
  | { kind: 'empty' }
  | { kind: 'unsupported-url' };

const ASSET_LABEL_ROUTE_PATTERN = /^\/t\/([^/?#]+)\/?$/i;
const BARCODE_MAX_LENGTH = 160;

export function parseAssetLabelScan(
  value: string,
  trustedOrigins = getDefaultTrustedOrigins(),
): AssetLabelScanResult {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return { kind: 'empty' };
  }

  if (looksLikeUrl(trimmedValue)) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedValue);
    } catch {
      return { kind: 'unsupported-url' };
    }

    const trusted = trustedOrigins.some(
      (origin) => normalizeOrigin(origin) === parsedUrl.origin.toLowerCase(),
    );
    const routeMatch = parsedUrl.pathname.match(ASSET_LABEL_ROUTE_PATTERN);
    if (
      !trusted ||
      !routeMatch ||
      parsedUrl.search ||
      parsedUrl.hash ||
      (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:')
    ) {
      return { kind: 'unsupported-url' };
    }

    const decodedTag = safelyDecode(routeMatch[1] ?? '');
    const barcode = normalizeBarcode(decodedTag);
    return barcode
      ? { kind: 'barcode', barcode, source: 'trusted-url' }
      : { kind: 'unsupported-url' };
  }

  const barcode = normalizeBarcode(trimmedValue);
  return barcode
    ? { kind: 'barcode', barcode, source: 'raw' }
    : { kind: 'empty' };
}

export function buildAssetLabelUrl(barcode: string): string {
  const tag = normalizeBarcode(barcode);
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://assets.example.com';
  return `${origin}/t/${encodeURIComponent(tag)}`;
}

export function createAssetQrSvg(
  barcode: string,
  size = 180,
  errorCorrection: 'M' | 'Q' = 'Q',
  margin = 4,
): SVGSVGElement {
  const hints = new Map<EncodeHintType, unknown>([
    [EncodeHintType.ERROR_CORRECTION, errorCorrection],
    [EncodeHintType.MARGIN, margin],
    [EncodeHintType.CHARACTER_SET, 'UTF-8'],
  ]);
  const svg = new BrowserQRCodeSvgWriter().write(
    buildAssetLabelUrl(barcode),
    size,
    size,
    hints,
  );
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `QR code for asset ${barcode}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  return svg;
}

export function createAssetBarcodeSvg(
  barcode: string,
  options: {
    height?: number;
    width?: number;
    fontSize?: number;
    margin?: number;
  } = {},
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, barcode, {
    background: '#ffffff',
    displayValue: true,
    font: 'monospace',
    fontOptions: '600',
    fontSize: options.fontSize ?? 14,
    format: 'CODE128',
    height: options.height ?? 56,
    lineColor: '#000000',
    margin: options.margin ?? 10,
    width: options.width ?? 1.6,
  });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Code 128 barcode for asset ${barcode}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return svg;
}

export function buildAssetLabelPrintDocument(
  assets: AssetLabelItem[],
  template: AssetLabelTemplate,
  includeAssetName: boolean,
  quantity: number,
): string {
  const safeQuantity = Math.max(1, Math.min(100, Math.trunc(quantity)));
  const dimensions = ASSET_LABEL_DIMENSIONS[template];
  const labels = assets.flatMap((asset) =>
    Array.from({ length: safeQuantity }, () =>
      buildAssetLabelMarkup(asset, template, includeAssetName),
    ),
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>aXentra asset labels</title>
  <style>
    @page { size: ${dimensions.widthMm}mm ${dimensions.heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${dimensions.widthMm}mm; margin: 0; padding: 0; }
    body { color: #000; background: #fff; font-family: Arial, sans-serif; }
    .asset-label-sheet { display: block; width: ${dimensions.widthMm}mm; margin: 0; padding: 0; }
    .asset-label-render {
      break-after: page;
      break-inside: avoid;
      page-break-after: always;
      page-break-inside: avoid;
    }
    .asset-label-render:last-child { break-after: auto; page-break-after: auto; }
    ${ASSET_LABEL_RENDER_CSS}
  </style>
</head>
<body>
  <main class="asset-label-sheet" aria-label="Asset labels">${labels.join('')}</main>
</body>
</html>`;
}

export function buildAssetLabelMarkup(
  asset: AssetLabelItem,
  template: AssetLabelTemplate,
  includeAssetName: boolean,
): string {
  const tag = normalizeBarcode(asset.barcode);
  const name = includeAssetName ? escapeHtml(asset.assetName.trim()) : '';
  const logo = template === 'standard' ? buildAssetLabelLogoMarkup() : '';
  const qr =
    template === 'legacy'
      ? ''
      : serializeSvg(
          createAssetQrSvg(
            tag,
            180,
            template === 'standard' ? 'Q' : 'M',
            template === 'compact' ? 1 : 4,
          ),
        );
  const barcode =
    template === 'compact'
      ? ''
      : serializeSvg(
          createAssetBarcodeSvg(tag, {
            height: template === 'legacy' ? 48 : 38,
            width: template === 'legacy' ? 1.45 : 1.2,
            fontSize: 11,
            margin: 6,
          }),
        );

  if (template === 'compact') {
    return `<section class="asset-label-render asset-label-compact" aria-label="Asset label ${escapeHtml(tag)}">
      <div class="asset-label-qr">${qr}</div>
    </section>`;
  }

  if (template === 'legacy') {
    return `<section class="asset-label-render asset-label-legacy" aria-label="Asset label ${escapeHtml(tag)}">
      <div class="asset-label-barcode">${barcode}</div>
    </section>`;
  }

  return `<section class="asset-label-render asset-label-standard" aria-label="Asset label ${escapeHtml(tag)}">
    <div class="asset-label-brand-block">
      ${logo}
      ${name ? `<div class="asset-label-name">${name}</div>` : ''}
      <div class="asset-label-eyebrow">Barcode</div>
      <div class="asset-label-tag">${escapeHtml(tag)}</div>
    </div>
    <div class="asset-label-qr">${qr}</div>
    <div class="asset-label-barcode">${barcode}</div>
  </section>`;
}

function buildAssetLabelLogoMarkup(): string {
  return '<span class="asset-label-logo">aXentra</span>';
}

function normalizeBarcode(value: string): string {
  return value.trim().toUpperCase().slice(0, BARCODE_MAX_LENGTH);
}

function getDefaultTrustedOrigins(): string[] {
  return typeof window !== 'undefined' && window.location?.origin
    ? [window.location.origin]
    : [];
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) || value.startsWith('//');
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function serializeSvg(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
