import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { safeReturnUrl } from '../../core/guards';
import { ROLE_LABELS } from '../../domain/roles';
import { SEED_USERS } from '../../mock-data/users';

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
  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
  });
  /** The fixed development accounts, shown so testers can sign in quickly. */
  readonly devAccounts = SEED_USERS.map((u) => ({
    username: u.username,
    password: u.password,
    role: ROLE_LABELS[u.role],
  }));

  use(account: { username: string; password: string }) {
    this.form.setValue({ username: account.username, password: account.password });
    this.error.set('');
  }

  submit() {
    const { username, password } = this.form.getRawValue();
    const result = this.auth.login(username, password);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    void this.router.navigateByUrl(safeReturnUrl(returnUrl, result.value.role));
  }
}
