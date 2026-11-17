import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { AppButtonDirective } from '../../../shared/components/app-button/app-button.directive';

@Component({
  imports: [AppButtonDirective],
  selector: 'app-barcode-scan-result-modal',
  standalone: true,
  templateUrl: './barcode-scan-result-modal.component.html',
  styleUrl: './barcode-scan-result-modal.component.css',
})
export class BarcodeScanResultModalComponent
  implements AfterViewInit, OnDestroy
{
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private overlayElement: HTMLElement | null = null;

  @Input() assetName = '';
  @Input() barcode = '';
  @Input() assetStatus = '';
  @Input() locationName = '';
  @Input() restricted = false;

  @Output() closeDialog = new EventEmitter<void>();
  @Output() openAsset = new EventEmitter<void>();

  ngAfterViewInit(): void {
    this.moveOverlayToBody();
  }

  ngOnDestroy(): void {
    this.overlayElement?.remove();
    this.overlayElement = null;
  }

  get resolvedAssetName(): string {
    return this.assetName.trim() || 'Unnamed asset';
  }

  get resolvedLocationName(): string {
    return this.locationName.trim() || 'Unknown location';
  }

  get resolvedBarcode(): string {
    return this.barcode.trim().toUpperCase() || 'Barcode unavailable';
  }

  get resolvedAssetStatus(): string {
    return this.assetStatus.trim() || 'Status unavailable';
  }

  close(): void {
    this.closeDialog.emit();
  }

  open(): void {
    if (this.restricted) {
      return;
    }

    this.openAsset.emit();
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
}
