import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';
import { BrowserQRCodeSvgWriter } from '@zxing/browser';

import type { PublicLoanView } from '../../models/public-loan.models';

/**
 * PublicLoanContentComponent renders the Loaded_State of the Public_Loan_Page.
 *
 * It presents the privacy-safe `PublicLoanView`: the loan reference, effective
 * status, borrower name, and start/end dates are always shown. Optional fields
 * (return date, remark, last-updated timestamp) are rendered only when present
 * on the view. The item list is rendered when items exist; otherwise a
 * no-items empty-state message is shown. Present optional fields continue to
 * render regardless of whether items exist.
 *
 * A "Print" button triggers `window.print()`. It carries the `print:hidden`
 * utility so it is excluded from the printed output; the loan content still
 * renders even if printing is unavailable because the button is additive.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11,
 * 7.1, 7.2, 7.3, 7.4, 7.5, 8.2, 9.1, 9.2, 9.3, 9.4
 */
@Component({
  selector: 'app-public-loan-content',
  standalone: true,
  templateUrl: './public-loan-content.component.html',
  styleUrl: './public-loan-content.component.css',
})
export class PublicLoanContentComponent implements AfterViewInit {
  @ViewChild('qrCodeContainer')
  private qrCodeContainer?: ElementRef<HTMLDivElement>;

  /** The sanitized, presentation-ready loan view to render. */
  @Input({ required: true }) view!: PublicLoanView;

  /** The exact public share page encoded by the QR code. */
  readonly publicShareUrl = window.location.href;

  ngAfterViewInit(): void {
    const container = this.qrCodeContainer?.nativeElement;
    if (!container || !this.publicShareUrl) {
      return;
    }

    const qrCode = new BrowserQRCodeSvgWriter().write(
      this.publicShareUrl,
      136,
      136,
    );
    qrCode.setAttribute('width', '100%');
    qrCode.setAttribute('height', '100%');
    qrCode.style.display = 'block';
    qrCode.setAttribute('aria-hidden', 'true');
    qrCode.setAttribute('focusable', 'false');
    container.replaceChildren(qrCode);
  }

  /** Triggers the browser's print dialog for a print-friendly rendering. */
  print(): void {
    window.print();
  }
}
