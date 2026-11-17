import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  forwardRef,
  inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  label: string;
  value: unknown;
  disabled?: boolean;
}

@Component({
  selector: 'app-select',
  templateUrl: './app-select.component.html',
  styleUrl: './app-select.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppSelectComponent),
      multi: true,
    },
  ],
})
export class AppSelectComponent
  implements ControlValueAccessor, AfterViewChecked, OnDestroy
{
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly defaultMenuMaxHeight = 292;
  private readonly menuOffset = 6;
  private readonly viewportPadding = 12;

  @Input() options: SelectOption[] = [];
  @Input() placeholder = 'Select value';
  @Input() invalid = false;
  @Input() ariaLabel = 'Select option';
  @Input() searchable = false;
  @Input() searchPlaceholder = 'Type to filter';
  @Input() menuPlacement: 'auto' | 'down' | 'up' = 'auto';

  protected isOpen = false;
  protected value: unknown = null;
  protected isDisabled = false;
  protected searchTerm = '';
  protected isSearchTyping = false;
  protected menuDirection: 'down' | 'up' = 'down';
  protected menuMaxHeight = this.defaultMenuMaxHeight;
  protected menuUsesOverlay = false;
  protected menuTop: number | null = null;
  protected menuBottom: number | null = null;
  protected menuLeft: number | null = null;
  protected menuWidth: number | null = null;
  private menuElement: HTMLElement | null = null;
  private clippingAncestor: HTMLElement | null = null;
  private readonly boundUpdateMenuPlacement = () => {
    if (this.isOpen) {
      this.updateMenuPlacement(true);
    }
  };

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (
      target &&
      (this.elementRef.nativeElement.contains(target) ||
        this.menuElement?.contains(target))
    ) {
      return;
    }

    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('window:resize')
  updateMenuOnResize(): void {
    if (this.isOpen) {
      this.updateMenuPlacement();
    }
  }

  @HostListener('window:scroll')
  updateMenuOnScroll(): void {
    if (this.isOpen) {
      this.updateMenuPlacement(true);
    }
  }

  writeValue(value: unknown): void {
    this.value = value;
    if (this.searchable) {
      this.searchTerm = '';
      this.isSearchTyping = false;
    }
  }

  registerOnChange(onChange: (value: unknown) => void): void {
    this.onChange = onChange;
  }

  registerOnTouched(onTouched: () => void): void {
    this.onTouched = onTouched;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    if (isDisabled) {
      this.close();
    }
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.isDisabled) {
      return;
    }

    this.setOpenState(!this.isOpen);
  }

  close(): void {
    if (this.isOpen) {
      this.setOpenState(false);
      this.onTouched();

      if (this.searchable) {
        this.searchTerm = '';
        this.isSearchTyping = false;
      }
    }
  }

  select(option: SelectOption): void {
    if (option.disabled || this.isDisabled) {
      return;
    }

    this.value = option.value;
    if (this.searchable) {
      this.searchTerm = '';
      this.isSearchTyping = false;
    }
    this.onChange(option.value);
    this.close();
  }

  handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.isDisabled) {
        this.setOpenState(!this.isOpen);
      }
    }
  }

  openSearch(): void {
    if (this.isDisabled) {
      return;
    }

    this.setOpenState(true);
  }

  handleSearchInput(event: Event): void {
    if (!this.searchable || this.isDisabled) {
      return;
    }

    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.searchTerm = value;
    this.isSearchTyping = value.trim().length > 0;
    this.setOpenState(true);
  }

  handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!this.isSearchTyping) {
        return;
      }
      const firstMatch = this.filteredOptions()[0];
      if (firstMatch) {
        this.select(firstMatch);
      }
    }
  }

  searchInputValue(): string {
    if (!this.searchable) {
      return '';
    }

    if (this.isSearchTyping) {
      return this.searchTerm;
    }

    return this.selectedOption()?.label ?? '';
  }

  searchInputPlaceholder(): string {
    if (!this.searchable) {
      return this.placeholder;
    }

    if (this.isSearchTyping) {
      return this.searchPlaceholder;
    }

    return this.selectedOption() ? '' : this.placeholder;
  }

  filteredOptions(): SelectOption[] {
    if (!this.searchable) {
      return this.options;
    }

    const query = this.isSearchTyping
      ? this.searchTerm.trim().toLowerCase()
      : '';
    if (!query) {
      return this.options;
    }

    return this.options.filter((option) =>
      option.label.toLowerCase().includes(query),
    );
  }

  selectedOption(): SelectOption | undefined {
    return this.options.find((option) => Object.is(option.value, this.value));
  }

  isSelected(option: SelectOption): boolean {
    return Object.is(option.value, this.value);
  }

  ngAfterViewChecked(): void {
    if (!this.isOpen) {
      return;
    }

    const menu = this.resolveMenuElement();
    if (!menu) {
      return;
    }

    this.menuElement = menu;
    if (this.menuUsesOverlay && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
  }

  ngOnDestroy(): void {
    this.detachClippingAncestorListener();
    this.menuElement?.remove();
    this.menuElement = null;
  }

  private setOpenState(nextState: boolean): void {
    if (!nextState) {
      // Overlay menus are moved outside this component's DOM tree. Remove the
      // detached node synchronously so closing a parent panel in the same click
      // cannot leave an orphaned menu on the page.
      this.removeDetachedMenu();
    }

    this.isOpen = nextState;

    if (this.isOpen) {
      this.updateMenuPlacement();
      return;
    }

    this.menuDirection = 'down';
    this.menuMaxHeight = this.defaultMenuMaxHeight;
    this.menuUsesOverlay = false;
    this.menuTop = null;
    this.menuBottom = null;
    this.menuLeft = null;
    this.menuWidth = null;
    this.menuElement = null;
    this.detachClippingAncestorListener();
  }

  private updateMenuPlacement(closeWhenTriggerHidden = false): void {
    const trigger = this.elementRef.nativeElement.querySelector(
      '.app-select-trigger',
    ) as HTMLElement | null;

    if (!trigger) {
      this.menuDirection = 'down';
      this.menuMaxHeight = this.defaultMenuMaxHeight;
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const clippingAncestor = this.findClippingAncestor(trigger);
    this.syncClippingAncestorListener(clippingAncestor);
    const bounds = this.getMenuBounds(clippingAncestor);

    if (
      closeWhenTriggerHidden &&
      !this.isTriggerVisibleWithinBounds(triggerRect, bounds)
    ) {
      this.close();
      return;
    }

    const availableBelow = Math.max(
      0,
      bounds.bottom - triggerRect.bottom - this.menuOffset,
    );
    const availableAbove = Math.max(
      0,
      triggerRect.top - bounds.top - this.menuOffset,
    );
    const desiredHeight = this.getDesiredMenuHeight();
    const shouldOpenUp =
      this.menuPlacement === 'up'
        ? true
        : this.menuPlacement === 'down'
          ? false
          : availableBelow < Math.min(desiredHeight, 180) &&
            availableAbove > availableBelow;

    this.menuDirection = shouldOpenUp ? 'up' : 'down';

    const availableHeight = shouldOpenUp ? availableAbove : availableBelow;
    this.menuMaxHeight = Math.min(
      this.defaultMenuMaxHeight,
      Math.max(1, Math.floor(availableHeight)),
    );

    this.menuUsesOverlay = clippingAncestor !== null;
    if (this.menuUsesOverlay) {
      const maxLeft = Math.max(
        this.viewportPadding,
        window.innerWidth - this.viewportPadding - triggerRect.width,
      );
      this.menuLeft = Math.min(
        Math.max(this.viewportPadding, Math.round(triggerRect.left)),
        Math.round(maxLeft),
      );
      this.menuWidth = Math.round(triggerRect.width);
      this.menuTop = shouldOpenUp
        ? null
        : Math.round(triggerRect.bottom + this.menuOffset);
      this.menuBottom = shouldOpenUp
        ? Math.round(window.innerHeight - triggerRect.top + this.menuOffset)
        : null;
      return;
    }

    this.menuTop = null;
    this.menuBottom = null;
    this.menuLeft = null;
    this.menuWidth = null;
  }

  private getDesiredMenuHeight(): number {
    const visibleOptionCount = Math.max(this.filteredOptions().length, 1);
    const estimatedHeight = visibleOptionCount * 40 + 12;

    return Math.min(this.defaultMenuMaxHeight, estimatedHeight);
  }

  private getMenuBounds(clippingAncestor: HTMLElement | null): {
    top: number;
    bottom: number;
  } {
    if (this.menuPlacement === 'up') {
      return {
        top: this.viewportPadding,
        bottom: window.innerHeight - this.viewportPadding,
      };
    }

    if (clippingAncestor) {
      const rect = clippingAncestor.getBoundingClientRect();
      return {
        top: Math.max(this.viewportPadding, rect.top),
        bottom: Math.min(window.innerHeight - this.viewportPadding, rect.bottom),
      };
    }

    return {
      top: this.viewportPadding,
      bottom: window.innerHeight - this.viewportPadding,
    };
  }

  private findClippingAncestor(element: HTMLElement): HTMLElement | null {
    let current = element.parentElement;

    while (current) {
      const styles = window.getComputedStyle(current);
      const overflow = styles.overflow;
      const horizontalOverflow = styles.overflowX;
      const verticalOverflow = styles.overflowY;
      const hasClippingOverflow =
        this.isClippingOverflowValue(overflow) ||
        this.isClippingOverflowValue(horizontalOverflow) ||
        this.isClippingOverflowValue(verticalOverflow);

      if (hasClippingOverflow) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  private isTriggerVisibleWithinBounds(
    triggerRect: DOMRect,
    bounds: { top: number; bottom: number },
  ): boolean {
    return (
      triggerRect.bottom > bounds.top &&
      triggerRect.top < bounds.bottom &&
      triggerRect.right > this.viewportPadding &&
      triggerRect.left < window.innerWidth - this.viewportPadding
    );
  }

  private isClippingOverflowValue(value: string): boolean {
    return (
      value === 'auto' ||
      value === 'scroll' ||
      value === 'hidden' ||
      value === 'clip'
    );
  }

  private syncClippingAncestorListener(nextAncestor: HTMLElement | null): void {
    if (this.clippingAncestor === nextAncestor) {
      return;
    }

    this.detachClippingAncestorListener();
    this.clippingAncestor = nextAncestor;
    this.clippingAncestor?.addEventListener(
      'scroll',
      this.boundUpdateMenuPlacement,
      { passive: true },
    );
  }

  private detachClippingAncestorListener(): void {
    this.clippingAncestor?.removeEventListener(
      'scroll',
      this.boundUpdateMenuPlacement,
    );
    this.clippingAncestor = null;
  }

  private removeDetachedMenu(): void {
    if (this.menuElement?.parentElement === document.body) {
      this.menuElement.remove();
    }
  }

  private resolveMenuElement(): HTMLElement | null {
    if (this.menuElement?.isConnected) {
      return this.menuElement;
    }

    return this.elementRef.nativeElement.querySelector(
      '.app-select-menu',
    ) as HTMLElement | null;
  }
}
