import { Routes } from '@angular/router';
import { authGuard, guestGuard, homeRedirectGuard, permissionGuard } from './core/guards';
import { ShellComponent } from './layout/shell.component';
import { LoginComponent } from './pages/login/login.component';
import { ForbiddenComponent } from './pages/forbidden/forbidden.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { UsersComponent } from './pages/users/users.component';
import { PriceBookListComponent } from './pages/price-books/price-book-list.component';
import { SalesReportComponent } from './pages/sales-report/sales-report.component';

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
        data: { permission: 'calculator', label: 'Bank rate calculator' },
        title: 'Ledger | Bank Rate Calculator',
      },
      {
        path: 'sales-report',
        component: SalesReportComponent,
        data: { permission: 'sales-report', label: 'Sales report by product' },
        title: 'Ledger | Sales Report by Product',
      },
      {
        path: 'price-books',
        component: PriceBookListComponent,
        data: { permission: 'price-books', label: 'Price books' },
        title: 'Ledger | Price Books',
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
