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
        <div class="empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="5" y="10.5" width="14" height="10" rx="2" />
            <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5" />
          </svg>
        </div>
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
