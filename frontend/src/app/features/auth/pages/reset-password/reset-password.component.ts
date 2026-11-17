import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, finalize, map, Subscription } from 'rxjs';

import { AuthShellComponent } from '../../../../shared/layout/auth-shell/auth-shell.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';

function passwordsMatchValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  if (!password || !confirmPassword) {
    return null;
  }

  return password === confirmPassword ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-reset-password',
  imports: [AppButtonDirective, ReactiveFormsModule, AuthShellComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css',
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly emailForm = this.formBuilder.group({
    email: this.formBuilder.control('', [
      Validators.required,
      Validators.email,
    ]),
  });

  readonly resetForm = this.formBuilder.group(
    {
      password: this.formBuilder.control('', [
        Validators.required,
        Validators.minLength(8),
      ]),
      confirmPassword: this.formBuilder.control('', [
        Validators.required,
        Validators.minLength(8),
      ]),
    },
    {
      validators: passwordsMatchValidator,
    },
  );

  submitted = false;
  isSubmitting = false;
  errorMessage = '';
  successMessage = '';
  resetToken = '';

  private tokenSubscription?: Subscription;

  get isTokenResetFlow(): boolean {
    return Boolean(this.resetToken);
  }

  ngOnInit(): void {
    this.tokenSubscription = combineLatest([
      this.route.paramMap.pipe(map((params) => params.get('token')?.trim() ?? '')),
      this.route.queryParamMap.pipe(
        map((params) => params.get('token')?.trim() ?? ''),
      ),
    ]).subscribe(([pathToken, queryToken]) => {
      this.resetToken = queryToken || pathToken;
      this.clearMessages();
      this.submitted = false;
    });
  }

  ngOnDestroy(): void {
    this.tokenSubscription?.unsubscribe();
  }

  submit(): void {
    if (this.isTokenResetFlow) {
      this.submitResetPassword();
      return;
    }

    this.submitForgotPassword();
  }

  private submitForgotPassword(): void {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    this.setSubmittingState(true);

    this.authService
      .forgotPassword(this.emailForm.getRawValue())
      .pipe(
        finalize(() => {
          this.setSubmittingState(false);
        }),
      )
      .subscribe({
        next: () => {
          this.submitted = true;
          this.successMessage =
            'Reset link sent successfully. Check your email.';
        },
        error: () => {
          this.errorMessage = 'Unable to send reset link. Please try again.';
        },
      });
  }

  private submitResetPassword(): void {
    if (!this.resetToken) {
      this.errorMessage = 'Reset token is missing. Please use the link from your email.';
      return;
    }

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.setSubmittingState(true);

    const payload = this.resetForm.getRawValue();

    this.authService
      .resetPassword({
        token: this.resetToken,
        password: payload.password,
        confirmPassword: payload.confirmPassword,
      })
      .pipe(
        finalize(() => {
          this.setSubmittingState(false);
        }),
      )
      .subscribe({
        next: () => {
          this.submitted = true;
          this.successMessage =
            'Password reset successfully. You can log in with your new password.';
          this.resetForm.reset();
        },
        error: () => {
          this.errorMessage =
            'Unable to reset password. The link may be invalid or expired.';
        },
      });
  }

  private setSubmittingState(value: boolean): void {
    this.isSubmitting = value;
    if (value) {
      this.clearMessages();
    }
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}
