import { AssetGridRecord } from '../../models/asset-view.models';
import { AssetGridCardComponent } from './asset-grid-card.component';

describe('AssetGridCardComponent', () => {
  let component: AssetGridCardComponent;

  beforeEach(() => {
    component = new AssetGridCardComponent();
    component.asset = {
      assetId: 101,
      assetName: 'Desktop 01',
      assetTypeId: 7,
      locationId: 1,
      productId: 5,
      description: null,
      remark: null,
      ipAddress: null,
      serialNumber: 'SN-101',
      barcode: 'ITA-101',
      status: 'In Storage',
      warrantyExpiryDate: null,
      assignedUserId: null,
      fileId: null,
      createdBy: 1,
      updatedBy: 1,
      createdAt: null,
      updatedAt: null,
      displayImage: 'https://example.com/resolved.png',
      images: [
        {
          imageId: 'second',
          order: 2,
          publicUrl: 'https://example.com/second.png',
        },
        {
          imageId: 'first',
          order: 1,
          publicUrl: 'https://example.com/first.png',
        },
      ],
      productName: 'Workstation',
      gridSpecs: [
        {
          fieldId: 7,
          fieldKey: 'ram',
          label: 'RAM',
          value: 32,
          displayValue: '32 GB',
        },
      ],
    } satisfies AssetGridRecord;
  });

  it('uses only the public display image for the asset card', () => {
    expect(component.imageUrl).toBe('https://example.com/resolved.png');

    component.onImageError();
    expect(component.imageUrl).toBeNull();
  });

  it('does not expose private album images when displayImage is missing', () => {
    component.asset = {
      ...component.asset,
      displayImage: null,
      images: [
        {
          imageId: 'file-path-only',
          order: 1,
          filePath: 'https://example.com/file-path-only.png',
        },
      ],
    };

    expect(component.imageUrl).toBeNull();
  });

  it('prefers displayValue and formats raw fallback values', () => {
    expect(component.formatSpecValue(component.asset.gridSpecs[0])).toBe(
      '32 GB',
    );
    expect(
      component.formatSpecValue({
        fieldId: 8,
        fieldKey: 'managed',
        label: 'Managed',
        value: true,
        displayValue: null,
      }),
    ).toBe('Yes');
    expect(
      component.formatSpecValue({
        fieldId: 9,
        fieldKey: 'owner',
        label: 'Owner',
        value: null,
        displayValue: null,
      }),
    ).toBe('—');
  });

  it('limits rendered specifications to five backend-ordered items', () => {
    component.asset = {
      ...component.asset,
      gridSpecs: Array.from({ length: 7 }, (_, index) => ({
        fieldId: index + 1,
        fieldKey: `field_${index + 1}`,
        label: `Field ${index + 1}`,
        value: index + 1,
        displayValue: null,
      })),
    };

    expect(component.displaySpecs.map((spec) => spec.fieldId)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('keeps the action menu click from reaching the page close handler', () => {
    const event = new MouseEvent('click');
    const stopPropagation = spyOn(event, 'stopPropagation');
    const emit = spyOn(component.menuToggle, 'emit');

    component.toggleMenu(event);

    expect(stopPropagation).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith({ assetId: 101, event });
  });
});
