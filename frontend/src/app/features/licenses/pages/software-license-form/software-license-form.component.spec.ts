import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FilesApiService } from '../../../files/services/files-api.service';
import {
  SoftwareLicenseRecord,
  SoftwareLicensesApiService,
} from '../../services/software-licenses-api.service';
import { SoftwareLicenseFormComponent } from './software-license-form.component';

function configure(paramMap: Record<string, string>): void {
  TestBed.configureTestingModule({
    imports: [SoftwareLicenseFormComponent],
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

describe('SoftwareLicenseFormComponent', () => {
  let fixture: ComponentFixture<SoftwareLicenseFormComponent>;
  let component: SoftwareLicenseFormComponent;

  it('starts in create mode with an empty draft when no id is provided', () => {
    configure({});
    const files = TestBed.inject(FilesApiService);
    spyOn(files, 'listFiles').and.returnValue(of([]));

    fixture = TestBed.createComponent(SoftwareLicenseFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.mode()).toBe('create');
    expect(component.draft().softwareName).toBe('');
  });

  it('loads the license and enters edit mode when an id is provided', () => {
    configure({ licenseId: '7' });
    const api = TestBed.inject(SoftwareLicensesApiService);
    const files = TestBed.inject(FilesApiService);
    spyOn(files, 'listFiles').and.returnValue(of([]));
    spyOn(api, 'getSoftwareLicense').and.returnValue(
      of({
        softwareLicenseId: 7,
        softwareName: 'Photoshop',
        locationId: 2,
        status: 'Active',
        allocationType: 'single',
      } as SoftwareLicenseRecord),
    );

    fixture = TestBed.createComponent(SoftwareLicenseFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.mode()).toBe('edit');
    expect(component.draft().softwareName).toBe('Photoshop');
  });
});
