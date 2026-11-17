import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-dashboard-hero',
  templateUrl: './dashboard-hero.component.html',
  styleUrl: './dashboard-hero.component.css',
})
export class DashboardHeroComponent {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
}
