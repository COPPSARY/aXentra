import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DashboardAttentionItem } from '../../models/dashboard.models';

type DueTone = 'danger' | 'warning' | 'neutral';

const VISIBLE_LIMIT = 6;

@Component({
  selector: 'app-needs-attention-panel',
  imports: [DatePipe, RouterLink],
  templateUrl: './needs-attention-panel.component.html',
  styleUrl: './needs-attention-panel.component.css',
})
export class NeedsAttentionPanelComponent {
  readonly items = input<DashboardAttentionItem[]>([]);
  readonly isLoading = input(false);

  readonly visibleItems = computed(() => this.items().slice(0, VISIBLE_LIMIT));
  readonly hiddenCount = computed(() =>
    Math.max(this.items().length - VISIBLE_LIMIT, 0),
  );
  readonly overdueCount = computed(
    () => this.items().filter((item) => item.daysRemaining < 0).length,
  );

  toneFor(item: DashboardAttentionItem): DueTone {
    if (item.daysRemaining < 0) {
      return 'danger';
    }

    return item.daysRemaining <= 14 ? 'warning' : 'neutral';
  }

  dueLabel(item: DashboardAttentionItem): string {
    const days = item.daysRemaining;

    if (days < 0) {
      const late = Math.abs(days);
      return `Overdue ${late} ${late === 1 ? 'day' : 'days'}`;
    }

    if (days === 0) {
      return 'Due today';
    }

    return `In ${days} ${days === 1 ? 'day' : 'days'}`;
  }

  kindLabel(item: DashboardAttentionItem): string {
    return item.kind === 'warranty' ? 'Warranty ends' : 'Loan return';
  }
}
