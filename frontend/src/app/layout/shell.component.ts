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
import { Permission, ROLE_LABELS } from '../domain/roles';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  permission: Permission;
}

const NAV_ITEMS: readonly NavItem[] = [
  { path: '/calculator', label: 'Bank rate calculator', icon: '▦', permission: 'calculator' },
  { path: '/price-books', label: 'Price books', icon: '◫', permission: 'price-books' },
  { path: '/users', label: 'User accounts', icon: '◉', permission: 'users' },
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
  readonly user = this.auth.currentUser;
  readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });
  readonly navItems = computed(() => NAV_ITEMS.filter((item) => this.auth.can(item.permission)));
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
