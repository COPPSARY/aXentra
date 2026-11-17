import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { LocationContextService } from '../../../core/location/location-context.service';
import { SnackbarService } from '../../services/snackbar.service';

/**
 * Workspace-style location switcher at the top of the sidebar.
 * The location scopes the whole app, so it lives with the navigation,
 * full width, instead of as a truncated control in the topbar.
 */
@Component({
  selector: 'app-sidebar-location-switcher',
  templateUrl: './sidebar-location-switcher.component.html',
  styleUrl: './sidebar-location-switcher.component.css',
})
export class SidebarLocationSwitcherComponent {
  private static readonly SEARCH_THRESHOLD = 6;

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly isOpen = signal(false);
  readonly query = signal('');

  readonly locations = this.locationContext.locations;
  readonly current = this.locationContext.selectedLocation;
  readonly showSearch = computed(
    () => this.locations().length > SidebarLocationSwitcherComponent.SEARCH_THRESHOLD,
  );
  readonly filtered = computed(() => {
    const term = this.query().trim().toLowerCase();
    const list = this.locations();
    if (!term) {
      return list;
    }
    return list.filter((location) =>
      `${location.name} ${location.address ?? ''}`.toLowerCase().includes(term),
    );
  });

  toggle(): void {
    this.isOpen.update((open) => !open);
    if (!this.isOpen()) {
      this.query.set('');
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.query.set('');
  }

  isCurrent(locationId: number): boolean {
    return this.locationContext.currentLocationId() === locationId;
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  select(locationId: number): void {
    if (this.isCurrent(locationId)) {
      this.close();
      return;
    }

    const next = this.locations().find((location) => location.locationId === locationId);
    if (!this.locationContext.selectLocation(locationId)) {
      return;
    }

    const message = next?.name?.trim()
      ? `Switched location to ${next.name.trim()}.`
      : 'Switched location.';
    this.close();

    if (this.router.url.startsWith('/location')) {
      this.snackbar.success(message);
      void this.router.navigateByUrl('/dashboard');
      return;
    }

    // Same behaviour as the topbar switcher: reload so every view rescopes.
    this.snackbar.successAfterReload(message);
    window.location.reload();
  }

  openDirectory(): void {
    this.close();
    void this.router.navigateByUrl('/location');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
