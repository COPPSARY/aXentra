import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';
import { toBlob } from 'html-to-image';

import { AssetLabelTemplate } from '../models/asset-label.models';
import {
  ASSET_LABEL_RENDER_CSS,
  buildAssetLabelMarkup,
} from '../utils/asset-label.utils';

@Component({
  selector: 'app-asset-label-preview',
  standalone: true,
  templateUrl: './asset-label-preview.component.html',
  styleUrl: './asset-label-preview.component.css',
})
export class AssetLabelPreviewComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() assetName = '';
  @Input() barcode = '';
  @Input() template: AssetLabelTemplate = 'standard';
  @Input() includeAssetName = true;

  @ViewChild('labelContainer')
  private labelContainer?: ElementRef<HTMLElement>;

  @ViewChild('previewViewport')
  private previewViewport?: ElementRef<HTMLElement>;

  readonly previewScale = signal(1);
  renderError = '';
  private resizeObserver?: ResizeObserver;

  private readonly templateDimensions: Record<
    AssetLabelTemplate,
    { widthMm: number; heightMm: number; maxScale: number }
  > = {
    standard: { widthMm: 70, heightMm: 30, maxScale: 1.7 },
    compact: { widthMm: 38, heightMm: 30, maxScale: 2 },
    legacy: { widthMm: 38, heightMm: 20, maxScale: 2 },
  };

  get normalizedBarcode(): string {
    return this.barcode.trim().toUpperCase();
  }

  get labelWidthMm(): number {
    return this.templateDimensions[this.template].widthMm;
  }

  get labelHeightMm(): number {
    return this.templateDimensions[this.template].heightMm;
  }

  ngAfterViewInit(): void {
    this.renderCodes();
    const viewport = this.previewViewport?.nativeElement;
    if (viewport) {
      this.resizeObserver = new ResizeObserver(() =>
        this.updatePreviewScale(),
      );
      this.resizeObserver.observe(viewport);
    }
    this.updatePreviewScale();
  }

  ngOnChanges(): void {
    queueMicrotask(() => {
      this.renderCodes();
      this.updatePreviewScale();
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  async toPngBlob(): Promise<Blob> {
    const label =
      this.labelContainer?.nativeElement.querySelector<HTMLElement>(
        '.asset-label-render',
      );
    if (!label) {
      throw new Error('The asset label is not ready.');
    }

    await this.waitForImages(label);
    const labelImage = await toBlob(label, {
      backgroundColor: '#ffffff',
      cacheBust: true,
      pixelRatio: 3,
      skipFonts: true,
    });
    if (!labelImage) {
      throw new Error('The label image could not be created.');
    }
    return labelImage;
  }

  private renderCodes(): void {
    const barcode = this.normalizedBarcode;
    if (!barcode) {
      return;
    }

    this.renderError = '';
    try {
      const container = this.labelContainer?.nativeElement;
      if (container) {
        container.innerHTML = `<style>${ASSET_LABEL_RENDER_CSS}</style>${buildAssetLabelMarkup(
          {
            assetId: 0,
            assetName: this.assetName,
            barcode,
          },
          this.template,
          this.includeAssetName,
        )}`;
      }
    } catch {
      this.renderError = 'Unable to render this asset label.';
      this.labelContainer?.nativeElement.replaceChildren();
    }
  }

  private updatePreviewScale(): void {
    const viewportWidth = this.previewViewport?.nativeElement.clientWidth ?? 0;
    if (viewportWidth <= 0) {
      return;
    }

    const dimensions = this.templateDimensions[this.template];
    const naturalWidth = dimensions.widthMm * (96 / 25.4);
    const fitScale = Math.max(0.1, (viewportWidth - 2) / naturalWidth);
    this.previewScale.set(
      Math.round(Math.min(dimensions.maxScale, fitScale) * 1000) / 1000,
    );
  }

  private async waitForImages(label: HTMLElement): Promise<void> {
    await Promise.all(
      Array.from(label.querySelectorAll('img')).map(async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          });
        }
        try {
          await image.decode();
        } catch {
          // The renderer provides the actionable failure if an image is unusable.
        }
      }),
    );
  }
}
