import { Component } from '@angular/core';

/**
 * `app-table-pattern` — shared data-table layout scaffold.
 *
 * Places the table toolbar above the table, the tabs within/above the toolbar,
 * and the pagination controls below the table, in the same positions across all
 * `Feature_Area`s that present data tables (Requirement 5.2).
 *
 * Content slots (projection):
 * - `[tablePatternTabs]` — tab controls, rendered within the toolbar row, above
 *   the table.
 * - `[tablePatternToolbar]` — toolbar controls (search, filters, actions),
 *   rendered on the same row as the tabs, above the table.
 * - default `<ng-content>` — the table itself.
 * - `[tablePatternPagination]` — pagination controls, rendered below the table.
 *
 * This component is presentation/layout only. It does not alter data flow,
 * sorting, filtering, or backend behavior.
 */
@Component({
  selector: 'app-table-pattern',
  standalone: true,
  templateUrl: './app-table-pattern.component.html',
  styleUrl: './app-table-pattern.component.css',
})
export class AppTablePatternComponent {}
