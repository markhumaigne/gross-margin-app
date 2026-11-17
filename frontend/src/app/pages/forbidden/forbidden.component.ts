import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { homePath, ROLE_LABELS } from '../../domain/roles';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink, MatButtonModule],
  template: `
    <section class="section-card">
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⛔</div>
        <h1 class="forbidden-title">Access denied</h1>
        <p>Your role ({{ roleLabel() }}) cannot open this page.</p>
        <a mat-flat-button class="forbidden-action" [routerLink]="home()">Go to your workspace</a>
      </div>
    </section>
  `,
})
export class ForbiddenComponent {
  private readonly auth = inject(AuthService);
  readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : 'Signed out';
  });
  readonly home = computed(() => {
    const role = this.auth.role();
    return role ? homePath(role) : '/login';
  });
}
