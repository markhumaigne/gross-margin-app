import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth.service';
import { PricingWorkspaceService } from '../core/pricing-workspace.service';
import { Permission, ROLE_LABELS } from '../../../../shared/domain/roles';

interface NavItem {
  path: string;
  label: string;
  icon: 'calculator' | 'price-tag' | 'users';
  permission: Permission;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/calculator',
    label: 'Bank rate calculator',
    icon: 'calculator',
    permission: 'calculator',
  },
  { path: '/price-books', label: 'Price books', icon: 'price-tag', permission: 'price-books' },
  { path: '/users', label: 'User accounts', icon: 'users', permission: 'users' },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule],
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly pricing = inject(PricingWorkspaceService);
  readonly user = this.auth.currentUser;
  readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });
  readonly navItems = computed(() => NAV_ITEMS.filter((item) => this.auth.can(item.permission)));
  /** Up to two initials for the account avatar, e.g. "Accounting Head" -> "AH". */
  readonly initials = computed(() => {
    const words = (this.user()?.displayName ?? '').trim().split(/\s+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('');
  });
  readonly label = signal('');
  readonly onCalculator = signal(false);

  constructor() {
    this.syncRoute();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.syncRoute());
  }

  /** Opening Price books always re-reads them, even when that page is already showing. */
  navigated(path: string) {
    if (path.startsWith('/price-books')) void this.pricing.reload();
  }

  signOut() {
    this.auth.logout();
    void this.router.navigateByUrl('/login').then(() => this.auth.discardKeptPages());
  }

  private syncRoute() {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    this.label.set((route.data['label'] as string | undefined) ?? '');
    this.onCalculator.set(this.router.url.split(/[?#]/)[0] === '/calculator');
  }
}
