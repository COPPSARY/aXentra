import { Component, inject } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { AuthShellComponent } from '../../../../shared/layout/auth-shell/auth-shell.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';

@Component({
  selector: 'app-sign-in',
  imports: [AppButtonDirective, ReactiveFormsModule, AuthShellComponent],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.css',
})
export class SignInComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly form = this.formBuilder.group({
    username: this.formBuilder.control('', [Validators.required]),
    password: this.formBuilder.control('', [Validators.required]),
    rememberMe: this.formBuilder.control(true),
  });

  isSubmitting = false;
  errorMessage = '';
  isPasswordVisible = false;
  isPasswordRevealPressed = false;

  constructor() {
    if (this.route.snapshot.queryParamMap.get('reason') === 'session-expired') {
      this.errorMessage = 'Your session expired. Please sign in again.';
      this.snackbar.warning('Your session expired. Please sign in again.');
    }
  }

  togglePasswordVisibility(): void {
    this.isPasswordVisible = !this.isPasswordVisible;
  }

  setPasswordRevealPressed(isPressed: boolean): void {
    this.isPasswordRevealPressed = isPressed;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const credentials = this.form.getRawValue();

    this.authService
      .login(credentials)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
        }),
      )
      .subscribe({
        next: (user) => {
          const role = user.role?.toLowerCase();
          const defaultReturnUrl =
            role === 'super_admin' || role === 'superadmin'
              ? '/dashboard'
              : '/location';
          const requestedReturnUrl =
            this.route.snapshot.queryParamMap.get('returnUrl');
          const returnUrl =
            (role === 'super_admin' || role === 'superadmin') &&
            requestedReturnUrl === '/location'
              ? '/dashboard'
              : requestedReturnUrl ?? defaultReturnUrl;
          void this.router.navigateByUrl(returnUrl);
        },
        error: () => {
          this.errorMessage = 'Invalid username or password.';
        },
      });
  }
}
