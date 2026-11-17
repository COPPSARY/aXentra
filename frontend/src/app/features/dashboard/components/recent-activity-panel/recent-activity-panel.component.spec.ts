import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardRecentActivityItem } from '../../models/dashboard.models';
import { RecentActivityPanelComponent } from './recent-activity-panel.component';

describe('RecentActivityPanelComponent', () => {
  let fixture: ComponentFixture<RecentActivityPanelComponent>;

  const activity: DashboardRecentActivityItem = {
    type: 'asset',
    id: 2,
    label: 'Laptop-INV-0001',
    action: 'updated',
    status: 'Loaned',
    location: {
      id: 1,
      name: 'Battambang Branch',
    },
    actor: {
      id: 9,
      name: 'Ada Admin',
    },
    at: '2026-04-28T05:12:00.000Z',
    relativeTime: '1h ago',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentActivityPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RecentActivityPanelComponent);
  });

  it('renders the Swagger recent-activity response shape', () => {
    fixture.componentRef.setInput('items', [activity]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Laptop-INV-0001');
    expect(element.textContent).toContain('Ada Admin');
    expect(element.textContent).toContain('updated asset');
    expect(element.textContent).toContain('Battambang Branch');
    expect(element.textContent).toContain('Loaned');
    expect(element.textContent).toContain('1h ago');
    expect(element.querySelector('time')?.getAttribute('datetime')).toBe(
      activity.at,
    );
  });

  it('renders a helpful empty state when there are no activities', () => {
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No recent activity',
    );
  });

  it('maps statuses to semantic tones', () => {
    const component = fixture.componentInstance;

    expect(component.statusTone('In Storage')).toBe('success');
    expect(component.statusTone('In Repair')).toBe('warning');
    expect(component.statusTone('Loaned')).toBe('info');
    expect(component.statusTone('Archived')).toBe('neutral');
  });
});
