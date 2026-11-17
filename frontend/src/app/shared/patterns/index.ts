/**
 * Shared interaction/layout patterns (Requirement 5).
 *
 * Barrel of the presentation scaffolding feature areas adopt during migration
 * (task 12), plus the shared building blocks they compose with. All exports are
 * standalone, so a feature component imports only what it uses.
 *
 * - {@link AppPageShellComponent} — page shell: title + primary action at top,
 *   content below (Req 5.1).
 * - {@link AppTablePatternComponent} — table pattern: toolbar above, tabs
 *   within/above the toolbar, pagination below (Req 5.2).
 * - {@link AppFormFieldComponent} — form pattern: label + required indicator +
 *   adjacent help text, with inline validation messaging (Req 5.3, 5.4).
 * - {@link ConfirmDeleteModalComponent} — destructive-action confirm/cancel
 *   pattern (Req 5.5, 5.6).
 *
 * Composed building blocks are re-exported for convenience.
 */
export { AppPageShellComponent } from '../components/app-page-shell/app-page-shell.component';
export { AppTablePatternComponent } from '../components/app-table-pattern/app-table-pattern.component';
export { AppFormFieldComponent } from '../components/app-form-field/app-form-field.component';
export { ConfirmDeleteModalComponent } from '../components/confirm-delete-modal/confirm-delete-modal.component';

// Building blocks these patterns compose with.
export { AppButtonDirective } from '../components/app-button/app-button.directive';
export type { AppButtonVariant } from '../components/app-button/app-button.directive';
export { AppHelpTextDirective } from '../components/app-help-text/app-help-text.directive';
export { AppTooltipDirective } from '../components/app-tooltip/app-tooltip.directive';
