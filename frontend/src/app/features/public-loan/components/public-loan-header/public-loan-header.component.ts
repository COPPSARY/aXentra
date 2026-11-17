import { Component, Input } from '@angular/core';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';

/**
 * Public_Header for the unauthenticated public loan page.
 *
 * Renders the application wordmark and, once a loan has loaded, a Print
 * action that produces the A4 handover copy. It deliberately excludes
 * internal navigation, the sidebar, and any authenticated-only elements so
 * the public page exposes no internal application surfaces.
 */
@Component({
  imports: [AppButtonDirective],
  selector: 'app-public-loan-header',
  standalone: true,
  templateUrl: './public-loan-header.component.html',
  styleUrl: './public-loan-header.component.css',
})
export class PublicLoanHeaderComponent {
  /** Show the Print action (only meaningful when a loan is loaded). */
  @Input() showPrint = false;

  print(): void {
    window.print();
  }
}
