import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { UserProfile } from '../../../../core/auth/auth.models';
import { AppLocation, LocationContextService } from '../../../../core/location/location-context.service';
import { AssetLoanRecord } from '../../../assets/models/asset-loan.models';
import { AssetLoansApiService } from '../../../assets/services/asset-loans-api.service';
import { ProfileDetailComponent } from './profile-detail.component';

function configure(paramMap: Record<string, string>): void {
  TestBed.configureTestingModule({
    imports: [ProfileDetailComponent],
    providers: [
      provideHttpClient(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(paramMap) } },
      },
    ],
  });
}

describe('ProfileDetailComponent', () => {
  let fixture: ComponentFixture<ProfileDetailComponent>;
  let component: ProfileDetailComponent;

  it('loads and displays a profile with its loan contracts', () => {
    configure({ profileId: '3' });
    const auth = TestBed.inject(AuthService);
    const locationContext = TestBed.inject(LocationContextService);
    const loansApi = TestBed.inject(AssetLoansApiService);

    spyOn(auth, 'getProfileById').and.returnValue(
      of({
        profileId: 3,
        fullName: 'Jane Doe',
        locationId: 1,
        phone: '012345678',
      } as UserProfile),
    );
    spyOn(locationContext, 'loadLocations').and.returnValue(
      of([{ locationId: 1, name: 'HQ' } as unknown as AppLocation]),
    );
    spyOn(loansApi, 'listAllAssetLoans').and.returnValue(
      of([
        {
          assetLoanId: 12,
          borrowerProfileId: 3,
          startLoanDate: '2026-01-01',
          endLoanDate: '2026-01-10',
          locationId: 1,
        } as unknown as AssetLoanRecord,
      ]),
    );

    fixture = TestBed.createComponent(ProfileDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.profile()?.fullName).toBe('Jane Doe');
    expect(component.loanContracts().length).toBe(1);
    expect(component.notFound()).toBeFalse();
  });

  it('surfaces an error message when loading fails', () => {
    configure({ profileId: '9' });
    const auth = TestBed.inject(AuthService);
    const locationContext = TestBed.inject(LocationContextService);

    spyOn(auth, 'getProfileById').and.returnValue(
      throwError(() => ({ error: { message: 'nope' } })),
    );
    spyOn(locationContext, 'loadLocations').and.returnValue(of([]));

    fixture = TestBed.createComponent(ProfileDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loadError()).toBe('nope');
  });
});
