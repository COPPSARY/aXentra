import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PublicLoanFooterComponent } from './public-loan-footer.component';

describe('PublicLoanFooterComponent', () => {
  let component: PublicLoanFooterComponent;
  let fixture: ComponentFixture<PublicLoanFooterComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicLoanFooterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicLoanFooterComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Requirement 6.3: footer displays the organization name
  it('renders the organization name within a semantic footer element', () => {
    const footer = element.querySelector('footer');

    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain('aXentra');
  });

  // Requirement 6.2: excludes navigation, sidebar, and topbar elements
  it('excludes navigation, sidebar, and topbar elements', () => {
    expect(element.querySelector('nav')).toBeNull();
    expect(element.querySelector('app-sidebar')).toBeNull();
    expect(element.querySelector('app-topbar')).toBeNull();
  });
});
