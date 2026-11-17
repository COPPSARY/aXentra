import { Component } from '@angular/core';


/**
 * Public_Header for the unauthenticated public loan page.
 *
 * Presentational component (no inputs) that renders the application logo. It
 * deliberately excludes internal navigation, the sidebar, and any
 * authenticated-only elements so the public page exposes no internal
 * application surfaces.
 */
@Component({
  selector: 'app-public-loan-header',
  standalone: true,
  templateUrl: './public-loan-header.component.html',
  styleUrl: './public-loan-header.component.css',
})
export class PublicLoanHeaderComponent {}
