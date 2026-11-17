import { Component } from '@angular/core';

/**
 * Public_Footer for the public loan share page.
 *
 * Presentational component (no inputs) that renders the organization name and
 * non-sensitive supporting information. It contains no internal navigation and
 * exposes no sensitive data.
 *
 * Requirements: 6.3
 */
@Component({
  selector: 'app-public-loan-footer',
  standalone: true,
  templateUrl: './public-loan-footer.component.html',

  styleUrl: './public-loan-footer.component.css',
})
export class PublicLoanFooterComponent {
  /** Organization name shown in the footer. */
  readonly organizationName = 'aXentra';

  /** Current calendar year for the copyright line. */
  readonly currentYear = new Date().getFullYear();
}
