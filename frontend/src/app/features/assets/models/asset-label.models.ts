export type AssetLabelTemplate = 'standard' | 'compact' | 'legacy';

export interface AssetLabelItem {
  assetId: number;
  assetName: string;
  barcode: string;
}

export interface AssetLabelTemplateOption {
  value: AssetLabelTemplate;
  label: string;
  size: string;
  description: string;
}

export const ASSET_LABEL_TEMPLATE_OPTIONS: AssetLabelTemplateOption[] = [
  {
    value: 'standard',
    label: 'Standard',
    size: '70 × 30 mm',
    description: 'QR code and barcode for most equipment.',
  },
  {
    value: 'compact',
    label: '38 mm QR code',
    size: '38 × 30 mm',
    description: 'Large centered QR code with no extra label content.',
  },
  {
    value: 'legacy',
    label: '38 mm barcode',
    size: '38 × 20 mm',
    description: 'Full-width barcode for 38 mm label printers.',
  },
];
