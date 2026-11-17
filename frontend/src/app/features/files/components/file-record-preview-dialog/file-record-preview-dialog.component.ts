import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { environment } from '../../../../../environments/environment';
import {
  AppFileAlbumItem,
  AppFileRecord,
  FilesApiService,
} from '../../services/files-api.service';

type FilePreviewItem = {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number | null;
  publicUrl: string;
};

@Component({
  selector: 'app-file-record-preview-dialog',
  templateUrl: './file-record-preview-dialog.component.html',
  styleUrl: './file-record-preview-dialog.component.css',
})
export class FileRecordPreviewDialogComponent implements OnChanges {
  private readonly filesApiService = inject(FilesApiService);
  private readonly sanitizer = inject(DomSanitizer);

  @Input() open = false;
  @Input() fileId: number | null = null;
  @Output() closeDialog = new EventEmitter<void>();

  readonly isLoading = signal(false);
  readonly loadError = signal('');
  readonly record = signal<AppFileRecord | null>(null);
  readonly selectedIndex = signal(0);
  readonly items = computed<FilePreviewItem[]>(() =>
    this.buildPreviewItems(this.record()),
  );
  readonly selectedItem = computed<FilePreviewItem | null>(() => {
    const items = this.items();
    if (items.length === 0) {
      return null;
    }

    const index = Math.min(
      Math.max(this.selectedIndex(), 0),
      items.length - 1,
    );
    return items[index];
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['open'] || changes['fileId']) &&
      this.open &&
      this.isValidFileId(this.fileId)
    ) {
      this.loadRecord(this.fileId);
    }
  }

  @HostListener('document:keydown.escape')
  closeFromKeyboard(): void {
    if (this.open) {
      this.close();
    }
  }

  close(): void {
    this.closeDialog.emit();
  }

  selectItem(index: number): void {
    if (index >= 0 && index < this.items().length) {
      this.selectedIndex.set(index);
    }
  }

  recordLabel(): string {
    const record = this.record();
    return (
      record?.fileLabel?.trim() ||
      record?.fileName?.trim() ||
      (record ? `File #${record.fileId}` : 'File preview')
    );
  }

  isImage(item: FilePreviewItem): boolean {
    const type = item.fileType.toLowerCase();
    const name = item.fileName.toLowerCase();
    return (
      type.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|svg)$/.test(name)
    );
  }

  isPdf(item: FilePreviewItem): boolean {
    return (
      item.fileType.toLowerCase().includes('pdf') ||
      item.fileName.toLowerCase().endsWith('.pdf')
    );
  }

  previewUrl(item: FilePreviewItem): string | null {
    return this.normalizeFileUrl(item.publicUrl || item.filePath);
  }

  safePdfUrl(item: FilePreviewItem): SafeResourceUrl | null {
    const url = this.previewUrl(item);
    return url
      ? this.sanitizer.bypassSecurityTrustResourceUrl(
          `${url}#toolbar=0&navpanes=0&view=FitH`,
        )
      : null;
  }

  openOriginal(item: FilePreviewItem): void {
    const url = this.previewUrl(item);
    if (!url) {
      return;
    }

    const previewWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (previewWindow) {
      previewWindow.opener = null;
    }
  }

  formatFileSize(size: number | null): string {
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
      return 'Size unavailable';
    }

    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  private loadRecord(fileId: number): void {
    this.isLoading.set(true);
    this.loadError.set('');
    this.record.set(null);
    this.selectedIndex.set(0);
    const requestedFileId = fileId;

    this.filesApiService.getFile(fileId).subscribe({
      next: (record) => {
        if (!this.open || this.fileId !== requestedFileId) {
          return;
        }

        this.record.set(record);
        this.isLoading.set(false);
      },
      error: () => {
        if (!this.open || this.fileId !== requestedFileId) {
          return;
        }

        this.loadError.set('Unable to load this File Management record.');
        this.isLoading.set(false);
      },
    });
  }

  private buildPreviewItems(
    record: AppFileRecord | null,
  ): FilePreviewItem[] {
    if (!record) {
      return [];
    }

    const attachments = Array.isArray(record.images)
      ? [...record.images].sort(
          (left, right) =>
            (left.order ?? Number.MAX_SAFE_INTEGER) -
            (right.order ?? Number.MAX_SAFE_INTEGER),
        )
      : [];

    if (attachments.length > 0) {
      return attachments.map((item, index) =>
        this.toPreviewItem(item, index),
      );
    }

    if (!record.publicUrl?.trim() && !record.filePath?.trim()) {
      return [];
    }

    return [
      {
        id: `file-${record.fileId}`,
        fileName:
          record.fileName?.trim() ||
          record.fileLabel?.trim() ||
          `File #${record.fileId}`,
        filePath: record.filePath?.trim() || '',
        fileType: record.fileType?.trim() || '',
        fileSize: record.fileSize ?? null,
        publicUrl: record.publicUrl?.trim() || '',
      },
    ];
  }

  private toPreviewItem(
    item: AppFileAlbumItem,
    index: number,
  ): FilePreviewItem {
    return {
      id: String(item.imageId ?? `attachment-${index}`),
      fileName:
        item.fileName?.trim() ||
        item.filePath?.trim() ||
        `Attachment ${index + 1}`,
      filePath: item.filePath?.trim() || '',
      fileType: item.fileType?.trim() || '',
      fileSize: item.fileSize ?? null,
      publicUrl: item.publicUrl?.trim() || '',
    };
  }

  private normalizeFileUrl(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    const apiOrigin = new URL(environment.apiUrl).origin;
    if (normalized.startsWith('/')) {
      return `${apiOrigin}${normalized}`;
    }

    const relativePath = normalized.replace(/^\/+/, '');
    return relativePath.startsWith('api/')
      ? `${apiOrigin}/${relativePath}`
      : `${environment.apiUrl}/${relativePath}`;
  }

  private isValidFileId(value: number | null): value is number {
    return Number.isInteger(value) && (value ?? 0) > 0;
  }
}
