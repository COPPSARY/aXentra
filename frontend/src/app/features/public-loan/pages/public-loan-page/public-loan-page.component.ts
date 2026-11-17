import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PublicLoanState } from '../../models/public-loan.models';
import { PublicLoanApiService } from '../../services/public-loan-api.service';
import { buildPublicLoanView } from '../../utils/public-loan-view.util';
import { mapPublicLoanError } from '../../utils/public-loan-error.util';
import { PublicLoanHeaderComponent } from '../../components/public-loan-header/public-loan-header.component';
import { PublicLoanFooterComponent } from '../../components/public-loan-footer/public-loan-footer.component';
import { PublicLoanSkeletonComponent } from '../../components/public-loan-skeleton/public-loan-skeleton.component';
import { PublicLoanContentComponent } from '../../components/public-loan-content/public-loan-content.component';
import { PublicLoanErrorComponent } from '../../components/public-loan-error/public-loan-error.component';

/**
 * PublicLoanPageComponent is the route component for the unauthenticated public
 * loan share page at `/public/loan/:token`.
 *
 * On init it reads and trims the `:token` route parameter. An empty or
 * malformed token transitions the page directly to the Error_State
 * (`invalid-link`) without issuing an API request (Requirement 1.6). Otherwise
 * it shows the Loading_State and calls `PublicLoanApiService.getPublicLoan`,
 * mapping a successful response to the Loaded_State via `buildPublicLoanView`
 * and any failure to the Error_State via `mapPublicLoanError`.
 *
 * The Public_Header renders in every state (including the error state) to
 * preserve branding (Requirement 5.5); the body switches between the skeleton,
 * loaded content, and error message; and the Public_Footer renders below.
 *
 * Requirements: 1.4, 1.6, 2.1, 2.3, 2.4, 5.5
 */
@Component({
  selector: 'app-public-loan-page',
  standalone: true,
  imports: [
    PublicLoanHeaderComponent,
    PublicLoanFooterComponent,
    PublicLoanSkeletonComponent,
    PublicLoanContentComponent,
    PublicLoanErrorComponent,
  ],
  templateUrl: './public-loan-page.component.html',
  styleUrl: './public-loan-page.component.css',
})
export class PublicLoanPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicLoanApiService);

  /** The current page state; starts in the Loading_State. */
  readonly state = signal<PublicLoanState>({ kind: 'loading' });

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token')?.trim() ?? '';

    if (!token) {
      this.state.set({
        kind: 'error',
        error: { kind: 'invalid-link', message: 'This shared link is invalid.' },
      });
      return;
    }

    this.state.set({ kind: 'loading' });

    this.api.getPublicLoan(token).subscribe({
      next: (data) => {
        this.state.set({ kind: 'loaded', view: buildPublicLoanView(data) });
      },
      error: (err) => {
        this.state.set({ kind: 'error', error: mapPublicLoanError(err) });
      },
    });
  }
}
