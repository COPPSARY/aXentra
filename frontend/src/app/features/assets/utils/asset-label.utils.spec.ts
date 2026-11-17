import {
  buildAssetLabelMarkup,
  buildAssetLabelPrintDocument,
  parseAssetLabelScan,
} from './asset-label.utils';

describe('asset label scan parsing', () => {
  const trustedOrigins = [
    'https://assets.example.com',
    'http://localhost:4200',
  ];

  it('normalizes a raw barcode without treating it as a URL', () => {
    expect(parseAssetLabelScan(' ita-7pk2-m9qx ', trustedOrigins)).toEqual({
      kind: 'barcode',
      barcode: 'ITA-7PK2-M9QX',
      source: 'raw',
    });
  });

  it('extracts and normalizes a tag from a trusted asset URL', () => {
    expect(
      parseAssetLabelScan(
        'https://assets.example.com/t/ita-7pk2-m9qx',
        trustedOrigins,
      ),
    ).toEqual({
      kind: 'barcode',
      barcode: 'ITA-7PK2-M9QX',
      source: 'trusted-url',
    });
  });

  it('does not uppercase or open an arbitrary URL', () => {
    expect(
      parseAssetLabelScan(
        'https://malicious.example/t/ita-7pk2-m9qx',
        trustedOrigins,
      ),
    ).toEqual({ kind: 'unsupported-url' });
  });

  it('rejects trusted URLs outside the barcode label route', () => {
    expect(
      parseAssetLabelScan(
        'https://assets.example.com/assets/123',
        trustedOrigins,
      ),
    ).toEqual({ kind: 'unsupported-url' });
  });

  it('rejects query strings and fragments on label URLs', () => {
    expect(
      parseAssetLabelScan(
        'https://assets.example.com/t/ABC?redirect=https://malicious.example',
        trustedOrigins,
      ),
    ).toEqual({ kind: 'unsupported-url' });
  });

  it('returns an empty result for blank input', () => {
    expect(parseAssetLabelScan('   ', trustedOrigins)).toEqual({
      kind: 'empty',
    });
  });
});

describe('38 mm asset label printing', () => {
  const asset = {
    assetId: 7,
    assetName: 'Test laptop',
    barcode: 'ITA-TEST-1234',
  };

  it('creates an exact 38 by 20 mm barcode print page', () => {
    const printDocument = buildAssetLabelPrintDocument(
      [asset],
      'legacy',
      false,
      1,
    );

    expect(printDocument).toContain('@page { size: 38mm 20mm; margin: 0; }');
    expect(printDocument).toContain('html, body { width: 38mm;');
  });

  it('renders the compact template as one large QR code', () => {
    const printDocument = buildAssetLabelPrintDocument(
      [asset],
      'compact',
      false,
      1,
    );
    const markup = buildAssetLabelMarkup(asset, 'compact', false);

    expect(printDocument).toContain('@page { size: 38mm 30mm; margin: 0; }');
    expect(markup).toContain('class="asset-label-qr"');
    expect(markup).not.toContain('class="asset-label-barcode"');
    expect(markup).not.toContain('asset-label-logo');
    expect(markup).not.toContain('asset-label-tag');
  });

  it('renders the barcode template without a QR code', () => {
    const markup = buildAssetLabelMarkup(asset, 'legacy', false);

    expect(markup).toContain('class="asset-label-barcode"');
    expect(markup).not.toContain('class="asset-label-qr"');
  });
});
