import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  ASSET_LABEL_TEMPLATE_OPTIONS,
  AssetLabelItem,
  AssetLabelTemplate,
} from '../models/asset-label.models';
import { buildAssetLabelPrintDocument } from '../utils/asset-label.utils';
import { AssetLabelPreviewComponent } from './asset-label-preview.component';

const LABEL_PREFERENCE_KEY = 'axentra.asset-label.print-template.v2';

@Component({
  selector: 'app-print-asset-label-dialog',
  standalone: true,
  imports: [AssetLabelPreviewComponent, FormsModule],
  templateUrl: './print-asset-label-dialog.component.html',
  styleUrl: './print-asset-label-dialog.component.css',
})
export class PrintAssetLabelDialogComponent
  implements AfterViewInit, OnDestroy
{
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private overlayElement: HTMLElement | null = null;
  private previouslyFocusedElement: HTMLElement | null = null;

  @Input() assets: AssetLabelItem[] = [];
  @Input() bulk = false;

  @Output() closeDialog = new EventEmitter<void>();
  @Output() printReady = new EventEmitter<void>();

  readonly templates = ASSET_LABEL_TEMPLATE_OPTIONS;
  readonly isGenerating = signal(false);
  readonly errorMessage = signal('');

  selectedTemplate: AssetLabelTemplate = this.readTemplatePreference();
  quantity = 1;
  includeAssetName = true;

  get previewAsset(): AssetLabelItem | null {
    return this.assets[0] ?? null;
  }

  get selectedTemplateOption() {
    return (
      this.templates.find((option) => option.value === this.selectedTemplate) ??
      this.templates[0]
    );
  }

  get printableAssets(): AssetLabelItem[] {
    return this.assets.filter((asset) => asset.barcode.trim());
  }

  get missingBarcodeCount(): number {
    return this.assets.length - this.printableAssets.length;
  }

  ngAfterViewInit(): void {
    this.previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.moveOverlayToBody();
    window.setTimeout(() => {
      this.overlayElement
        ?.querySelector<HTMLElement>('[data-dialog-initial-focus]')
        ?.focus();
    });
  }

  ngOnDestroy(): void {
    this.overlayElement?.remove();
    this.overlayElement = null;
    this.previouslyFocusedElement?.focus();
  }

  setTemplate(template: AssetLabelTemplate): void {
    this.selectedTemplate = template;
    this.errorMessage.set('');
  }

  close(): void {
    if (!this.isGenerating()) {
      this.closeDialog.emit();
    }
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key !== 'Tab' || !this.overlayElement) {
      return;
    }

    const focusable = Array.from(
      this.overlayElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  print(): void {
    this.errorMessage.set('');
    const quantity = this.bulk ? 1 : Number(this.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100 ||
      this.printableAssets.length === 0
    ) {
      this.errorMessage.set(
        this.printableAssets.length === 0
          ? 'The selected asset has no barcode.'
          : 'Quantity must be a whole number from 1 to 100.',
      );
      return;
    }

    // Open directly from the button click. Delaying window.open causes browsers
    // to treat the print document as an unsolicited popup and block it.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.errorMessage.set(
        'The print window was blocked. Allow pop-ups for this site, then try again.',
      );
      return;
    }

    this.isGenerating.set(true);
    try {
      const documentHtml = buildAssetLabelPrintDocument(
        this.printableAssets,
        this.selectedTemplate,
        this.includeAssetName,
        quantity,
      );
      printWindow.document.open();
      printWindow.document.write(documentHtml);
      printWindow.document.close();
      this.saveTemplatePreference();

      window.setTimeout(() => {
        void this.openPrintDialogWhenReady(printWindow);
      }, 50);
    } catch {
      printWindow.close();
      this.errorMessage.set(
        'Unable to prepare labels. Check the barcodes and try again.',
      );
      this.isGenerating.set(false);
    }
  }

  private async openPrintDialogWhenReady(printWindow: Window): Promise<void> {
    try {
      await this.waitForPrintImages(printWindow.document);
      printWindow.focus();
      printWindow.print();
      this.printReady.emit();
    } catch {
      this.errorMessage.set(
        'The browser could not open the print dialog. Please try again.',
      );
      printWindow.close();
    } finally {
      this.isGenerating.set(false);
    }
  }

  private async waitForPrintImages(documentRef: Document): Promise<void> {
    const images = Array.from(documentRef.images);
    if (images.length === 0) {
      return;
    }

    const readyImages = images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      }

      try {
        await image.decode();
      } catch {
        // A failed logo must not leave the print action permanently loading.
      }
    });

    await Promise.race([
      Promise.all(readyImages),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  }

  private moveOverlayToBody(): void {
    const overlay = this.hostRef.nativeElement.firstElementChild;
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    this.overlayElement = overlay;
    if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
  }

  private readTemplatePreference(): AssetLabelTemplate {
    if (typeof window === 'undefined') {
      return 'legacy';
    }

    const stored = window.localStorage.getItem(LABEL_PREFERENCE_KEY);
    return stored === 'standard' || stored === 'compact' || stored === 'legacy'
      ? stored
      : 'legacy';
  }

  private saveTemplatePreference(): void {
    try {
      window.localStorage.setItem(
        LABEL_PREFERENCE_KEY,
        this.selectedTemplate,
      );
    } catch {
      // Printing remains available when storage is blocked.
    }
  }
}
