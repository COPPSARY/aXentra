import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  IScannerControls,
} from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { parseAssetLabelScan } from '../../utils/asset-label.utils';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

@Component({
  selector: 'app-barcode-scanner-dialog',
  standalone: true,
  imports: [AppButtonDirective, FormsModule],
  templateUrl: './barcode-scanner-dialog.component.html',
  styleUrl: './barcode-scanner-dialog.component.css',
})
export class BarcodeScannerDialogComponent implements AfterViewInit, OnDestroy {
  private static readonly SCAN_TIMEOUT_MS = 30_000;
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  @ViewChild('scannerVideo')
  private scannerVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('manualBarcodeInput')
  private manualBarcodeInput?: ElementRef<HTMLInputElement>;

  @Output() closeDialog = new EventEmitter<void>();
  @Output() barcodeScanned = new EventEmitter<string>();

  readonly manualBarcode = signal('');
  readonly isCameraActive = signal(false);
  readonly isRequestingCamera = signal(false);
  readonly isFrontCameraActive = signal(false);
  readonly cameraError = signal('');

  private mediaStream: MediaStream | null = null;
  private detector: BarcodeDetectorLike | null = null;
  private scanFrame: number | null = null;
  private scannerControls: IScannerControls | null = null;
  private zxingReader: BrowserMultiFormatReader | null = null;
  private hasTriedZxingFallback = false;
  private scanTimeoutId: number | null = null;
  private overlayElement: HTMLElement | null = null;
  private previouslyFocusedElement: HTMLElement | null = null;
  private hasAcceptedDetection = false;
  private readonly zxingFormats = [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.CODABAR,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ];
  private readonly preferredCameraConstraints: Array<
    MediaTrackConstraints | true
  > = [
    { facingMode: { exact: 'environment' } },
    { facingMode: { ideal: 'environment' } },
    true,
  ];
  private readonly zxingHints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, this.zxingFormats],
    [DecodeHintType.TRY_HARDER, true],
  ]);

  ngAfterViewInit(): void {
    this.previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.moveOverlayToBody();
    this.focusManualInput();
  }

  ngOnDestroy(): void {
    this.stopCamera();
    this.overlayElement?.remove();
    this.overlayElement = null;
    this.previouslyFocusedElement?.focus();
  }

  submitManualBarcode(): void {
    this.acceptScannedValue(this.manualBarcode());
  }

  updateManualBarcode(value: string): void {
    this.manualBarcode.set(value);
  }

  async startCamera(): Promise<void> {
    this.stopCamera();
    this.cameraError.set('');
    this.hasTriedZxingFallback = false;
    this.hasAcceptedDetection = false;
    this.isRequestingCamera.set(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      this.isRequestingCamera.set(false);
      this.cameraError.set('Camera access is not available.');
      this.focusManualInput();
      return;
    }

    if (await this.canUseZxing()) {
      await this.startZxingCamera();
      return;
    }

    const Detector = this.getBarcodeDetectorConstructor();
    if (Detector) {
      await this.startNativeCamera(Detector);
      return;
    }

    this.isRequestingCamera.set(false);
    this.cameraError.set(
      'Label scanning is not supported on this device. Enter the barcode below.',
    );
    this.focusManualInput();
  }

  stopCamera(): void {
    this.clearScanTimeout();
    this.scannerControls?.stop();
    this.scannerControls = null;
    this.zxingReader = null;

    if (this.scanFrame !== null) {
      window.cancelAnimationFrame(this.scanFrame);
      this.scanFrame = null;
    }

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.detector = null;
    this.isRequestingCamera.set(false);
    this.isCameraActive.set(false);
    this.isFrontCameraActive.set(false);

    const video = this.scannerVideo?.nativeElement;
    if (video) {
      video.srcObject = null;
      BrowserMultiFormatReader.cleanVideoSource(video);
    }

    this.focusManualInput();
  }

  cancel(): void {
    this.stopCamera();
    this.closeDialog.emit();
  }

  handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
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
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private async startNativeCamera(
    Detector: BarcodeDetectorConstructor,
  ): Promise<void> {
    try {
      this.detector = new Detector({
        formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code'],
      });
      this.mediaStream = await this.getPreferredCameraStream();
      this.updatePreviewMirroring(this.mediaStream);
      this.isRequestingCamera.set(false);
      this.isCameraActive.set(true);
      this.startScanTimeout();
      window.setTimeout(() => this.attachCameraStream());
    } catch {
      this.isRequestingCamera.set(false);
      this.cameraError.set(
        'Camera access was denied or unavailable. Enable camera access or enter the barcode below.',
      );
      this.stopCamera();
      this.focusManualInput();
    }
  }

  private async startZxingCamera(): Promise<void> {
    this.hasTriedZxingFallback = true;
    this.isRequestingCamera.set(false);
    this.isCameraActive.set(true);
    this.startScanTimeout();
    window.setTimeout(() => {
      void this.attachZxingScanner();
    });
  }

  private attachCameraStream(): void {
    const video = this.scannerVideo?.nativeElement;
    if (!video || !this.mediaStream) {
      return;
    }

    video.srcObject = this.mediaStream;
    void video.play();
    this.scheduleScan();
  }

  private async attachZxingScanner(): Promise<void> {
    const video = this.scannerVideo?.nativeElement;
    if (!video) {
      await this.fallbackFromZxing();
      return;
    }

    try {
      const reader = new BrowserMultiFormatReader(this.zxingHints, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 250,
        tryPlayVideoTimeout: 4000,
      });
      this.zxingReader = reader;
      this.scannerControls = await this.decodeFromPreferredConstraints(
        reader,
        video,
      );
    } catch {
      await this.fallbackFromZxing();
    }
  }

  private scheduleScan(): void {
    this.scanFrame = window.requestAnimationFrame(() => {
      void this.scanCameraFrame();
    });
  }

  private async scanCameraFrame(): Promise<void> {
    const video = this.scannerVideo?.nativeElement;
    if (!video || !this.detector || !this.mediaStream) {
      return;
    }

    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const results = await this.detector.detect(video);
        const scannedValue = results[0]?.rawValue || '';
        if (scannedValue) {
          this.acceptScannedValue(scannedValue);
          return;
        }
      }
    } catch {
      if (await this.switchToZxingFallback()) {
        return;
      }
    }

    this.scheduleScan();
  }

  private async canUseZxing(): Promise<boolean> {
    try {
      const supported = await BrowserMultiFormatReader.listVideoInputDevices();
      return supported.length > 0;
    } catch {
      return false;
    }
  }

  private async fallbackFromZxing(): Promise<void> {
    const Detector = this.getBarcodeDetectorConstructor();
    if (Detector) {
      this.stopCamera();
      await this.startNativeCamera(Detector);
      return;
    }

    this.cameraError.set('Unable to start camera.');
    this.stopCamera();
  }

  private getBarcodeDetectorConstructor(): BarcodeDetectorConstructor | null {
    const candidate = (window as unknown as { BarcodeDetector?: unknown })
      .BarcodeDetector;

    return typeof candidate === 'function'
      ? (candidate as BarcodeDetectorConstructor)
      : null;
  }

  private async switchToZxingFallback(): Promise<boolean> {
    if (this.hasTriedZxingFallback) {
      return false;
    }

    if (this.scanFrame !== null) {
      window.cancelAnimationFrame(this.scanFrame);
      this.scanFrame = null;
    }

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.detector = null;
    this.isFrontCameraActive.set(false);

    const video = this.scannerVideo?.nativeElement;
    if (video) {
      video.srcObject = null;
      BrowserMultiFormatReader.cleanVideoSource(video);
    }

    this.cameraError.set('');
    this.clearScanTimeout();
    await this.startZxingCamera();
    return true;
  }

  private async getPreferredCameraStream(): Promise<MediaStream> {
    let lastError: unknown;

    for (const videoConstraint of this.preferredCameraConstraints) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: false,
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Unable to access camera.');
  }

  private async decodeFromPreferredConstraints(
    reader: BrowserMultiFormatReader,
    video: HTMLVideoElement,
  ): Promise<IScannerControls> {
    let lastError: unknown;

    for (const videoConstraint of this.preferredCameraConstraints) {
      try {
        const controls = await reader.decodeFromConstraints(
          {
            video: videoConstraint,
            audio: false,
          },
          video,
          (result, error, controls) => {
            this.scannerControls = controls;

            if (result) {
              this.acceptScannedValue(result.getText());
            }
          },
        );
        this.updatePreviewMirroringFromVideo(video, videoConstraint);
        return controls;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Unable to access camera.');
  }

  private startScanTimeout(): void {
    this.clearScanTimeout();
    this.scanTimeoutId = window.setTimeout(() => {
      this.cameraError.set(
        'No label detected. Try again or enter the barcode.',
      );
      this.stopCamera();
    }, BarcodeScannerDialogComponent.SCAN_TIMEOUT_MS);
  }

  private clearScanTimeout(): void {
    if (this.scanTimeoutId !== null) {
      window.clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }
  }

  private updatePreviewMirroring(
    stream: MediaStream | null,
    requestedConstraint?: MediaTrackConstraints | true,
  ): void {
    this.isFrontCameraActive.set(
      this.shouldMirrorPreview(stream, requestedConstraint),
    );
  }

  private updatePreviewMirroringFromVideo(
    video: HTMLVideoElement,
    requestedConstraint?: MediaTrackConstraints | true,
  ): void {
    const stream =
      video.srcObject instanceof MediaStream ? video.srcObject : null;
    this.updatePreviewMirroring(stream, requestedConstraint);
  }

  private shouldMirrorPreview(
    stream: MediaStream | null,
    requestedConstraint?: MediaTrackConstraints | true,
  ): boolean {
    const track = stream?.getVideoTracks()[0];
    const facingMode = track?.getSettings().facingMode;

    if (facingMode === 'environment') {
      return false;
    }

    if (
      facingMode === 'user' ||
      facingMode === 'left' ||
      facingMode === 'right'
    ) {
      return true;
    }

    if (this.requestsEnvironmentCamera(requestedConstraint)) {
      return false;
    }

    const label = track?.label.toLowerCase() ?? '';
    if (/\b(back|rear|environment)\b/.test(label)) {
      return false;
    }

    return /\b(front|user|selfie|facetime)\b/.test(label);
  }

  private requestsEnvironmentCamera(
    constraint?: MediaTrackConstraints | true,
  ): boolean {
    if (!constraint || constraint === true) {
      return false;
    }

    const facingMode = constraint.facingMode;
    if (typeof facingMode === 'string') {
      return facingMode === 'environment';
    }

    if (Array.isArray(facingMode)) {
      return facingMode.includes('environment');
    }

    return (
      this.matchesFacingMode(facingMode?.exact, 'environment') ||
      this.matchesFacingMode(facingMode?.ideal, 'environment')
    );
  }

  private matchesFacingMode(
    value: string | string[] | undefined,
    expected: string,
  ): boolean {
    return Array.isArray(value) ? value.includes(expected) : value === expected;
  }

  private focusManualInput(): void {
    window.setTimeout(() => {
      const input = this.manualBarcodeInput?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  private acceptScannedValue(value: string): void {
    if (this.hasAcceptedDetection) {
      return;
    }

    const parsed = parseAssetLabelScan(value);
    if (parsed.kind === 'unsupported-url') {
      this.cameraError.set('This QR code is not an aXentra asset label.');
      return;
    }

    if (parsed.kind !== 'barcode') {
      this.cameraError.set('Enter or scan a valid barcode.');
      return;
    }

    this.hasAcceptedDetection = true;
    this.manualBarcode.set(parsed.barcode);
    this.stopCamera();
    this.barcodeScanned.emit(parsed.barcode);
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
