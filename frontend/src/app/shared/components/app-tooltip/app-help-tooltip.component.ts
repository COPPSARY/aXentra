import { Component, Input } from '@angular/core';
import { LucideCircleHelp } from '@lucide/angular';

import { AppTooltipDirective } from './app-tooltip.directive';

@Component({
  selector: 'app-help-tooltip',
  imports: [AppTooltipDirective, LucideCircleHelp],
  templateUrl: './app-help-tooltip.component.html',
  styleUrl: './app-help-tooltip.component.css',
})
export class AppHelpTooltipComponent {
  @Input({ required: true }) text = '';
  @Input() ariaLabel = 'More information';

  get hasText(): boolean {
    return this.text.trim().length > 0;
  }

  stopHostLabelActivation(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }
}
