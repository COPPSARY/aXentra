import { TestBed } from '@angular/core/testing';

import { AssetLabelPreviewComponent } from './asset-label-preview.component';

describe('AssetLabelPreviewComponent', () => {
  it('exports the rendered label as a PNG blob', async () => {
    await TestBed.configureTestingModule({
      imports: [AssetLabelPreviewComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(AssetLabelPreviewComponent);
    fixture.componentInstance.assetName = 'Test Laptop';
    fixture.componentInstance.barcode = 'ITA-TEST-1234';
    fixture.detectChanges();
    await fixture.whenStable();

    const blob = await fixture.componentInstance.toPngBlob();

    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(100);
  });
});
