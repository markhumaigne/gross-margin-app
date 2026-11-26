import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { safeReturnUrl } from '../../core/guards';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly error = signal('');
  readonly signingIn = signal(false);
  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
  });
  async submit() {
    if (this.signingIn()) return;
    const { username, password } = this.form.getRawValue();
    this.signingIn.set(true);
    const result = await this.auth.login(username, password);
    this.signingIn.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    void this.router.navigateByUrl(safeReturnUrl(returnUrl, result.value.role));
  }
}
