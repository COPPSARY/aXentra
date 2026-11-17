import { Component, Input } from '@angular/core';

let pageShellUid = 0;

/**
 * `app-page-shell` — shared page scaffold for every `Feature_Area` page.
 *
 * Renders the page title and its primary action control aligned together at the
 * top of the content area, with the content region below both, in the same
 * relative positions across all feature pages (Requirement 5.1).
 *
 * Content slots (projection):
 * - `[pageShellActions]` — the primary action control(s), aligned with the
 *   title at the top. Compose with the shared `appButton` directive.
 * - `[pageShellTitle]` — optional custom title markup, used instead of the
 *   `heading` input when richer title content is required.
 * - default `<ng-content>` — the page content region, rendered below the header.
 *
 * This component is presentation/layout only. It does not alter routing, form
 * submission, validation, or backend behavior.
 */
@Component({
  selector: 'app-page-shell',
  standalone: true,
  templateUrl: './app-page-shell.component.html',
  styleUrl: './app-page-shell.component.css',
})
export class AppPageShellComponent {
  /** Plain-text page title rendered at the top of the content area. */
  @Input() heading = '';

  /** Optional supporting description rendered beneath the title. */
  @Input() description = '';

  /** Stable id for the rendered title, exposed so pages can label regions. */
  @Input() headingId = `app-page-shell-title-${++pageShellUid}`;
}
