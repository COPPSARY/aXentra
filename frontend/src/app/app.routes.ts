import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { profileManagementGuard } from './core/auth/profile-management.guard';
import { superAdminGuard } from './core/auth/super-admin.guard';
import { locationGuard } from './core/location/location.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/pages/sign-in/sign-in.component').then((m) => m.SignInComponent)
  },
  {
    path: 'location/new',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () =>
      import(
        './features/location/pages/location-create/location-create.component'
      ).then((m) => m.LocationCreateComponent),
  },
  {
    path: 'location',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './features/location/pages/location-select/location-select.component'
      ).then((m) => m.LocationSelectComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, locationGuard],
    data: {
      allowWithoutLocationForSuperAdmin: true,
    },
    loadComponent: () =>
      import('./features/dashboard/pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
  },
  {
    path: 't/:barcode',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './features/assets/pages/asset-label-redirect.component'
      ).then((m) => m.AssetLabelRedirectComponent),
  },
  {
    path: 'assets/loans/new',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import(
        './features/assets/pages/create-asset-loan/create-asset-loan.component'
      ).then((m) => m.CreateAssetLoanComponent),
  },
  {
    path: 'assets/loans/:loanId/edit',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import(
        './features/assets/pages/asset-loan-detail/asset-loan-detail.component'
      ).then((m) => m.AssetLoanDetailComponent),
  },
  {
    path: 'assets/loans/:loanId',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import(
        './features/assets/pages/asset-loan-detail/asset-loan-detail.component'
      ).then((m) => m.AssetLoanDetailComponent),
  },
  {
    path: 'assets/loans',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/assets/pages/asset-loans/asset-loans.component').then(
        (m) => m.AssetLoansComponent,
      ),
  },
  {
    path: 'assets/types/:assetTypeId/new',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/assets/pages/create-asset/create-asset.component').then(
        (m) => m.CreateAssetComponent,
      ),
  },
  {
    path: 'assets/types/:assetTypeId/assets/:assetId/edit',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/assets/pages/create-asset/create-asset.component').then(
        (m) => m.CreateAssetComponent,
      ),
  },
  {
    path: 'assets/types/:assetTypeId/assets/:assetId',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/assets/pages/asset-details/asset-details.component').then(
        (m) => m.AssetDetailsComponent,
      ),
  },
  {
    path: 'assets/types/:assetTypeId',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/assets/pages/asset-type-assets/asset-type-assets.component').then(
        (m) => m.AssetTypeAssetsComponent,
      ),
  },
  {
    path: 'assets',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/assets/pages/assets/assets.component').then(
        (m) => m.AssetsComponent,
      ),
  },
  {
    path: 'custom',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/assets/pages/custom/custom.component').then(
        (m) => m.CustomComponent,
      ),
  },
  {
    path: 'files',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/files/pages/files/files.component').then(
        (m) => m.FilesComponent,
      ),
  },
  {
    path: 'more',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './shared/layout/mobile-tabbar/more-page.component'
      ).then((m) => m.MorePageComponent),
  },
  {
    path: 'licenses/new',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import(
        './features/licenses/pages/software-license-form/software-license-form.component'
      ).then((m) => m.SoftwareLicenseFormComponent),
  },
  {
    path: 'licenses/:licenseId/edit',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import(
        './features/licenses/pages/software-license-form/software-license-form.component'
      ).then((m) => m.SoftwareLicenseFormComponent),
  },
  {
    path: 'licenses/:licenseId',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import(
        './features/licenses/pages/software-license-detail/software-license-detail.component'
      ).then((m) => m.SoftwareLicenseDetailComponent),
  },
  {
    path: 'licenses',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import(
        './features/licenses/pages/software-license/software-license.component'
      ).then((m) => m.SoftwareLicenseComponent),
  },
  {
    path: 'users/profiles',
    canActivate: [authGuard, locationGuard, profileManagementGuard],
    loadComponent: () =>
      import(
        './features/users/pages/profile-management/profile-management.component'
      ).then((m) => m.ProfileManagementComponent),
  },
  {
    path: 'users/profiles/:profileId',
    canActivate: [authGuard, locationGuard, profileManagementGuard],
    loadComponent: () =>
      import(
        './features/users/pages/profile-detail/profile-detail.component'
      ).then((m) => m.ProfileDetailComponent),
  },
  {
    path: 'users/:userId',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () =>
      import('./features/users/pages/user-detail/user-detail.component').then(
        (m) => m.UserDetailComponent,
      ),
  },
  {
    path: 'users',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () =>
      import('./features/users/pages/user-management/user-management.component').then(
        (m) => m.UserManagementComponent,
      ),
  },
  {
    path: 'profile',
    canActivate: [authGuard, locationGuard],
    loadComponent: () =>
      import('./features/profile/pages/profile/profile.component').then(
        (m) => m.ProfileComponent,
      ),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/pages/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent)
  },
  {
    path: 'reset-password/:token',
    loadComponent: () =>
      import('./features/auth/pages/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
  },
  {
    path: 'public/loan/:token',
    loadComponent: () =>
      import(
        './features/public-loan/pages/public-loan-page/public-loan-page.component'
      ).then((m) => m.PublicLoanPageComponent),
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard'
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
