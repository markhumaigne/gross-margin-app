import { Routes } from '@angular/router';
import { authGuard, guestGuard, homeRedirectGuard, permissionGuard } from './core/guards';
import { ShellComponent } from './layout/shell.component';
import { LoginComponent } from './pages/login/login.component';
import { ForbiddenComponent } from './pages/forbidden/forbidden.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { UsersComponent } from './pages/users/users.component';
import { PriceBookListComponent } from './pages/price-books/price-book-list.component';
import { PriceBookEditorComponent } from './pages/price-books/price-book-editor.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard],
    title: 'Ledger | Sign in',
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    canActivateChild: [permissionGuard],
    children: [
      { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], children: [] },
      {
        path: 'calculator',
        component: DashboardComponent,
        data: { permission: 'calculator', label: 'Bank rate calculator', keepAlive: true },
        title: 'Ledger | Bank Rate Calculator',
      },
      {
        path: 'sales-report',
        loadComponent: () =>
          import('./pages/sales-report/sales-report.component').then((m) => m.SalesReportComponent),
        data: { permission: 'sales-report', label: 'Sales report by product', keepAlive: true },
        title: 'Ledger | Sales Report by Product',
      },
      {
        path: 'price-books',
        component: PriceBookListComponent,
        data: { permission: 'price-books', label: 'Price books' },
        title: 'Ledger | Price Books',
      },
      {
        path: 'price-books/new',
        component: PriceBookEditorComponent,
        data: { permission: 'price-books', label: 'Price books', mode: 'create' },
        title: 'Ledger | New Price Book',
      },
      {
        path: 'price-books/:id',
        component: PriceBookEditorComponent,
        data: { permission: 'price-books', label: 'Price books', mode: 'view' },
        title: 'Ledger | Price Book',
      },
      {
        path: 'price-books/:id/edit',
        component: PriceBookEditorComponent,
        data: { permission: 'price-books', label: 'Price books', mode: 'edit' },
        title: 'Ledger | Edit Price Book',
      },
      {
        path: 'users',
        component: UsersComponent,
        data: { permission: 'users', label: 'User accounts' },
        title: 'Ledger | User Accounts',
      },
      {
        path: 'forbidden',
        component: ForbiddenComponent,
        data: { label: 'Access denied' },
        title: 'Ledger | Access denied',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
