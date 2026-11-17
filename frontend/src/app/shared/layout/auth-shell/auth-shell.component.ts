import { Component } from '@angular/core';

@Component({
  selector: 'app-auth-shell',
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.css',
})
export class AuthShellComponent {
  readonly statuses = [
    { label: 'Available', count: 412, color: 'var(--viz-available)' },
    { label: 'On loan', count: 96, color: 'var(--viz-loaned)' },
    { label: 'In repair', count: 14, color: 'var(--viz-repair)' },
    { label: 'Damaged', count: 6, color: 'var(--viz-damaged)' },
  ];

  readonly total = this.statuses.reduce((sum, s) => sum + s.count, 0);

  readonly loans = [
    { asset: 'Dell Latitude 5440', who: 'Sokha Chea', due: 'Overdue 3d', late: true },
    { asset: 'Epson EB-X49 Projector', who: 'Room B-204', due: 'Due Fri', late: false },
    { asset: 'Logitech Rally Bar Mini', who: 'Vanna Pich', due: 'Due Mon', late: false },
  ];

  width(count: number): string {
    return `${(count / this.total) * 100}%`;
  }
}
