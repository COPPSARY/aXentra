import { Component } from '@angular/core';

/**
 * PublicLoanSkeletonComponent renders the Loading_State placeholder for the
 * Public_Loan_Page. It shows pulsing skeleton blocks whose structure mirrors
 * the loaded content (header block, detail rows, item list) so the layout does
 * not shift when real data arrives.
 *
 * Presentational component: no inputs, no injected dependencies.
 */
@Component({
  selector: 'app-public-loan-skeleton',
  imports: [],
  templateUrl: './public-loan-skeleton.component.html',
  styleUrl: './public-loan-skeleton.component.css',
})
export class PublicLoanSkeletonComponent {
  /** Static placeholder rows so the template can repeat detail/item blocks. */
  protected readonly detailRows = Array.from({ length: 5 });
  protected readonly itemRows = Array.from({ length: 3 });
}
