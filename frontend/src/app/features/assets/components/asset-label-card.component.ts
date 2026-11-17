import { Component, Input, ViewChild, signal } from '@angular/core';

import { AssetRecord } from '../models/asset-view.models';
import { AssetLabelItem } from '../models/asset-label.models';
import { AssetLabelPreviewComponent } from './asset-label-preview.component';
import { PrintAssetLabelDialogComponent } from './print-asset-label-dialog.component';

@Component({
  selector: 'app-asset-label-card',
  standalone: true,
  imports: [AssetLabelPreviewComponent, PrintAssetLabelDialogComponent],
  templateUrl: './asset-label-card.component.html',
  styleUrl: './asset-label-card.component.css',
})
export class AssetLabelCardComponent {
  @Input({ required: true }) asset!: AssetRecord;

  @ViewChild(AssetLabelPreviewComponent)
  private labelPreview?: AssetLabelPreviewComponent;

  readonly printDialogOpen = signal(false);
  readonly copied = signal(false);
  readonly copyErrorMessage = signal('');
  readonly isCopying = signal(false);
  private copiedResetTimer: number | undefined;

  get barcode(): string {
    return this.asset.barcode?.trim().toUpperCase() || '';
  }

  get labelItems(): AssetLabelItem[] {
    return [
      {
        assetId: this.asset.assetId,
        assetName: this.asset.assetName,
        barcode: this.barcode,
      },
    ];
  }

  openPrintDialog(): void {
    if (this.barcode) {
      this.printDialogOpen.set(true);
    }
  }

  closePrintDialog(): void {
    this.printDialogOpen.set(false);
  }

  async copyLabelImage(): Promise<void> {
    if (
      !this.barcode ||
      !this.labelPreview ||
      this.isCopying()
    ) {
      return;
    }

    this.isCopying.set(true);
    this.copied.set(false);
    this.copyErrorMessage.set('');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Image clipboard access is unavailable.');
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': this.labelPreview.toPngBlob(),
        }),
      ]);
      this.copied.set(true);
      if (this.copiedResetTimer !== undefined) {
        window.clearTimeout(this.copiedResetTimer);
      }
      this.copiedResetTimer = window.setTimeout(() => {
        this.copied.set(false);
        this.copiedResetTimer = undefined;
      }, 1600);
    } catch (error) {
      this.copied.set(false);
      this.copyErrorMessage.set(this.getCopyErrorMessage(error));
    } finally {
      this.isCopying.set(false);
    }
  }

  private getCopyErrorMessage(error: unknown): string {
    if (!window.isSecureContext) {
      return 'Image copying requires HTTPS or localhost.';
    }
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      return 'This browser does not support copying images. Use Chrome or Edge.';
    }
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return 'Clipboard access was denied. Allow clipboard permission and try again.';
    }
    return 'Could not copy the label image. Please try again.';
  }
}
