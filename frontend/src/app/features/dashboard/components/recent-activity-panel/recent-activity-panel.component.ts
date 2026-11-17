import { Component, Input } from '@angular/core';
import {
  LucideHistory,
  LucideMapPin,
} from '@lucide/angular';

import { DashboardRecentActivityItem } from '../../models/dashboard.models';

type ActivityStatusTone = 'info' | 'neutral' | 'success' | 'warning';

@Component({
  selector: 'app-recent-activity-panel',
  imports: [LucideHistory, LucideMapPin],
  templateUrl: './recent-activity-panel.component.html',
  styleUrl: './recent-activity-panel.component.css',
})
export class RecentActivityPanelComponent {
  @Input({ required: true }) items: DashboardRecentActivityItem[] = [];
  @Input() title = 'Recent activity';
  @Input() subtitle = 'Latest changes in your current scope';

  actorName(item: DashboardRecentActivityItem): string {
    return item.actor?.name?.trim() || 'System';
  }

  actionLabel(item: DashboardRecentActivityItem): string {
    return item.action?.trim().toLowerCase() || 'updated';
  }

  typeLabel(item: DashboardRecentActivityItem): string {
    return item.type?.trim().replace(/[_-]+/g, ' ').toLowerCase() || 'record';
  }

  locationName(item: DashboardRecentActivityItem): string {
    return item.location?.name?.trim() || '';
  }

  timeLabel(item: DashboardRecentActivityItem): string {
    const relativeTime = item.relativeTime?.trim();
    if (relativeTime) {
      return relativeTime;
    }

    const timestamp = Date.parse(item.at);
    if (!Number.isFinite(timestamp)) {
      return 'Recently';
    }

    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
    }).format(timestamp);
  }

  absoluteTime(item: DashboardRecentActivityItem): string {
    const timestamp = Date.parse(item.at);
    if (!Number.isFinite(timestamp)) {
      return item.at;
    }

    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp);
  }

  statusTone(status: string): ActivityStatusTone {
    const normalizedStatus = status.trim().toLowerCase();

    if (
      normalizedStatus.includes('available') ||
      normalizedStatus.includes('storage') ||
      normalizedStatus.includes('complete') ||
      normalizedStatus.includes('returned')
    ) {
      return 'success';
    }

    if (
      normalizedStatus.includes('repair') ||
      normalizedStatus.includes('maintenance') ||
      normalizedStatus.includes('due')
    ) {
      return 'warning';
    }

    if (
      normalizedStatus.includes('loan') ||
      normalizedStatus.includes('assign') ||
      normalizedStatus.includes('active')
    ) {
      return 'info';
    }

    return 'neutral';
  }
}
