import { Component, Input } from '@angular/core';

import type { PublicLoanError } from '../../models/public-loan.models';

/**
 * PublicLoanErrorComponent renders the Error_State for the Public_Loan_Page.
 *
 * It shows a friendly, human-readable message derived from `PublicLoanError`
 * (invalid link, not-found, load-failed, or network). It deliberately renders
 * NO loan data and NO loan-related user interface elements so that, when an
 * error occurs, nothing about the loan is exposed. The parent page keeps the
 * Public_Header branding around this component.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
@Component({
  selector: 'app-public-loan-error',
  standalone: true,
  templateUrl: './public-loan-error.component.html',
  styleUrl: './public-loan-error.component.css',
})
export class PublicLoanErrorComponent {
  /** The classified error to render a friendly message for. */
  @Input({ required: true }) error!: PublicLoanError;
}
