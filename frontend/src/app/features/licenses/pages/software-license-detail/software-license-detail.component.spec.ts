import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import {
  SoftwareLicenseRecord,
  SoftwareLicensesApiService,
} from '../../services/software-licenses-api.service';
import { SoftwareLicenseDetailComponent } from './software-license-detail.component';

function configure(paramMap: Record<string, string>): void {
  TestBed.configureTestingModule({
    imports: [SoftwareLicenseDetailComponent],
    providers: [
      provideHttpClient(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap(paramMap) },
        },
      },
    ],
  });
}

describe('SoftwareLicenseDetailComponent', () => {
  let fixture: ComponentFixture<SoftwareLicenseDetailComponent>;
  let component: SoftwareLicenseDetailComponent;

  it('loads and displays a license', () => {
    configure({ licenseId: '5' });
    const api = TestBed.inject(SoftwareLicensesApiService);
    spyOn(api, 'getSoftwareLicense').and.returnValue(
      of({
        softwareLicenseId: 5,
        softwareName: 'Office',
        locationId: 1,
        status: 'Active',
        allocationType: 'multi',
        allocationLimit: 10,
        available: 7,
      } as SoftwareLicenseRecord),
    );
    spyOn(api, 'listAssignments').and.returnValue(of([]));

    fixture = TestBed.createComponent(SoftwareLicenseDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.license()?.softwareName).toBe('Office');
    expect(component.isLoading()).toBeFalse();
    expect(component.seatsSummary()).toBe('3 / 10');
  });

  it('flags an invalid id as not found without calling the API', () => {
    configure({ licenseId: 'abc' });
    const api = TestBed.inject(SoftwareLicensesApiService);
    const spy = spyOn(api, 'getSoftwareLicense');

    fixture = TestBed.createComponent(SoftwareLicenseDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.notFound()).toBeTrue();
    expect(spy).not.toHaveBeenCalled();
  });

  it('surfaces a load error message', () => {
    configure({ licenseId: '9' });
    const api = TestBed.inject(SoftwareLicensesApiService);
    spyOn(api, 'getSoftwareLicense').and.returnValue(
      throwError(() => ({ error: { message: 'boom' } })),
    );
    spyOn(api, 'listAssignments').and.returnValue(of([]));

    fixture = TestBed.createComponent(SoftwareLicenseDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loadError()).toBe('boom');
  });
});
