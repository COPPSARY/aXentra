import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppSelectComponent } from './app-select.component';

@Component({
  imports: [AppSelectComponent],
  template: `
    <div class="clipping-container" style="overflow-y: auto">
      <app-select
        ariaLabel="Product"
        [options]="[
          { label: 'All products', value: null },
          { label: 'Dell Vostro', value: 1 },
        ]"
      />
    </div>
    <button class="outside" type="button">Outside</button>
  `,
})
class SelectHostComponent {}

describe('AppSelectComponent', () => {
  let fixture: ComponentFixture<SelectHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SelectHostComponent],
    });

    fixture = TestBed.createComponent(SelectHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    document
      .querySelectorAll('body > .app-select-menu')
      .forEach((menu) => menu.remove());
  });

  it('removes a body-level overlay menu immediately when clicking outside', () => {
    const trigger = fixture.nativeElement.querySelector(
      '.app-select-trigger',
    ) as HTMLButtonElement;

    trigger.click();
    fixture.detectChanges();

    expect(document.querySelector('body > .app-select-menu')).not.toBeNull();

    const outside = fixture.nativeElement.querySelector(
      '.outside',
    ) as HTMLButtonElement;
    outside.click();

    expect(document.querySelector('body > .app-select-menu')).toBeNull();
  });

  it('removes a body-level overlay menu when its host is destroyed', () => {
    const trigger = fixture.nativeElement.querySelector(
      '.app-select-trigger',
    ) as HTMLButtonElement;

    trigger.click();
    fixture.detectChanges();

    expect(document.querySelector('body > .app-select-menu')).not.toBeNull();

    fixture.destroy();

    expect(document.querySelector('body > .app-select-menu')).toBeNull();
  });

  it('closes the overlay when scrolling moves its trigger out of view', () => {
    const clippingContainer = fixture.nativeElement.querySelector(
      '.clipping-container',
    ) as HTMLElement;
    const trigger = fixture.nativeElement.querySelector(
      '.app-select-trigger',
    ) as HTMLButtonElement;

    spyOn(clippingContainer, 'getBoundingClientRect').and.returnValue(
      new DOMRect(0, 0, 320, 100),
    );
    spyOn(trigger, 'getBoundingClientRect').and.returnValues(
      new DOMRect(0, 20, 300, 42),
      new DOMRect(0, 120, 300, 42),
    );

    trigger.click();
    fixture.detectChanges();

    expect(document.querySelector('body > .app-select-menu')).not.toBeNull();

    clippingContainer.dispatchEvent(new Event('scroll'));

    expect(document.querySelector('body > .app-select-menu')).toBeNull();
  });
});
